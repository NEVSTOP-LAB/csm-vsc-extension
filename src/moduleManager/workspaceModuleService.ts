import type { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import * as yaml from 'js-yaml';
import { CopyModuleUpdatePreview, CsmModuleEntry, LocalModuleConfig, LocalModuleConfigEntry, ModuleApplyMethod, ModuleUpdateResult } from './types';
import { GitService, IGitRunner } from './gitService';

const CONFIG_VERSION = '2';
const SECTION_ROOT = 'csmModules';

export const DEFAULT_LOCAL_MODULE_ROOT = 'csm';
export const LOCAL_MODULE_CONFIG_FILE = 'csm-modules.yaml';
export const LEGACY_LOCAL_MODULE_CONFIG_FILE = 'csm-modules.lvcsm';

interface ParsedConfigShape {
	version?: string;
	root?: string;
	modules: Record<string, LocalModuleConfigEntry>;
}

interface GitSubmoduleDefinition {
	name: string;
	path: string;
	url: string;
	branch?: string;
}

export interface GitIdentity {
	name?: string;
	email?: string;
}

export interface PublishLocalFolderOptions {
	folderPath: string;
	remoteUrl: string;
	authToken?: string;
	defaultBranch?: string;
	commitMessage?: string;
	authorName?: string;
	authorEmail?: string;
}

export interface PublishLocalFolderResult {
	branch: string;
	remoteName: string;
	remoteUrl: string;
	headRef: string;
	createdCommit: boolean;
}

function toPosixPath(value: string): string {
	return value.replace(/\\/g, '/');
}

function sanitizeModuleKeyPart(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, '');
}

export class WorkspaceModuleService {
	constructor(private readonly gitRunner: IGitRunner = new GitService()) { }

	public normalizeRootPath(value: string): string {
		const trimmed = value.trim();
		if (!trimmed) {
			throw new Error('A relative directory is required.');
		}

		const slashNormalized = trimmed.replace(/\\/g, '/');
		if (path.posix.isAbsolute(slashNormalized) || path.win32.isAbsolute(trimmed)) {
			throw new Error('Use a directory relative to the repository root.');
		}

		const normalized = path.posix.normalize(slashNormalized).replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
		if (!normalized || normalized === '.') {
			throw new Error('The directory cannot be the repository root.');
		}
		if (normalized.startsWith('..') || normalized.includes('/../')) {
			throw new Error('The directory must stay inside the repository root.');
		}

		return normalized;
	}

	public getModuleKey(entry: CsmModuleEntry): string {
		return `${sanitizeModuleKeyPart(entry.owner)}__${sanitizeModuleKeyPart(entry.name)}`;
	}

	public getTargetRelativePath(config: LocalModuleConfig, entry: CsmModuleEntry): string {
		return path.posix.join(config.root, entry.name);
	}

	public async resolveGitRepositoryRoot(workspacePath: string): Promise<string | undefined> {
		try {
			const stdout = await this.runGit(workspacePath, ['rev-parse', '--show-toplevel']);
			return stdout || undefined;
		} catch {
			return undefined;
		}
	}

	public async getGitIdentity(targetPath: string): Promise<GitIdentity> {
		if (!await this.gitRunner.isAvailable()) {
			throw new Error('git unavailable');
		}
		return {
			name: await this.getGitConfigValue(targetPath, 'user.name'),
			email: await this.getGitConfigValue(targetPath, 'user.email'),
		};
	}

	public async publishLocalFolder(options: PublishLocalFolderOptions): Promise<PublishLocalFolderResult> {
		if (!await this.gitRunner.isAvailable()) {
			throw new Error('git unavailable');
		}

		const folderPath = path.resolve(options.folderPath);
		const stat = await fs.stat(folderPath);
		if (!stat.isDirectory()) {
			throw new Error(`Local folder is not a directory: ${folderPath}`);
		}

		const branch = options.defaultBranch?.trim() || 'main';
		const commitMessage = options.commitMessage?.trim() || `Initial publish of ${path.basename(folderPath)}`;
		const remoteUrl = options.remoteUrl.trim();
		const hasLocalRepository = await this.pathExists(path.join(folderPath, '.git'));

		if (!hasLocalRepository) {
			await this.runGit(folderPath, ['init']);
		}

		if (options.authorName?.trim()) {
			await this.runGit(folderPath, ['config', 'user.name', options.authorName.trim()]);
		}
		if (options.authorEmail?.trim()) {
			await this.runGit(folderPath, ['config', 'user.email', options.authorEmail.trim()]);
		}

		const existingOrigin = await this.getRemoteUrl(folderPath, 'origin');
		if (existingOrigin && this.normalizeRemoteUrl(existingOrigin) !== this.normalizeRemoteUrl(remoteUrl)) {
			throw new Error(`Local folder already has a different origin remote: ${existingOrigin}`);
		}
		if (!existingOrigin) {
			await this.runGit(folderPath, ['remote', 'add', 'origin', remoteUrl]);
		}

		await this.runGit(folderPath, ['add', '--all']);
		const hasCommit = await this.hasCommit(folderPath);
		const hasChanges = await this.hasWorkingTreeChanges(folderPath);
		if (!hasCommit && !hasChanges) {
			throw new Error('Local folder is empty. Add files before publishing.');
		}

		let createdCommit = false;
		if (!hasCommit || hasChanges) {
			await this.runGit(folderPath, ['commit', '-m', commitMessage]);
			createdCommit = true;
		}

		const currentBranch = await this.getCurrentBranch(folderPath);
		if (currentBranch !== branch) {
			await this.runGit(folderPath, ['branch', '-M', branch]);
		}

		await this.runGit(folderPath, ['push', '-u', 'origin', branch], options.authToken, remoteUrl);
		const headRef = (await this.runGit(folderPath, ['rev-parse', 'HEAD'])).trim();
		return {
			branch,
			remoteName: 'origin',
			remoteUrl,
			headRef,
			createdCommit,
		};
	}

	public async initializeConfig(repoRoot: string, rootRelativePath: string): Promise<LocalModuleConfig> {
		const root = this.normalizeRootPath(rootRelativePath);
		const configPath = this.getConfigPath(repoRoot, root);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		const config: LocalModuleConfig = {
			version: CONFIG_VERSION,
			root,
			configPath,
			modules: {},
		};
		await this.writeConfig(config);
		return config;
	}

	public async loadConfig(repoRoot: string, configPath: string): Promise<LocalModuleConfig> {
		const raw = await fs.readFile(configPath, 'utf8');
		const parsed = this.isLegacyConfigPath(configPath) ? this.parseLegacyConfig(raw) : this.parseYamlConfig(raw);
		const derivedRoot = toPosixPath(path.relative(repoRoot, path.dirname(configPath)));
		const root = parsed.root ? this.normalizeRootPath(parsed.root) : this.normalizeRootPath(derivedRoot || DEFAULT_LOCAL_MODULE_ROOT);
		return {
			version: CONFIG_VERSION,
			root,
			configPath: this.getConfigPath(repoRoot, root),
			modules: parsed.modules,
		};
	}

	public async recoverConfigFromExistingSubmodules(
		repoRoot: string,
		rootRelativePath = DEFAULT_LOCAL_MODULE_ROOT,
	): Promise<LocalModuleConfig | undefined> {
		const root = this.normalizeRootPath(rootRelativePath);
		const submodules = await this.readGitSubmodules(repoRoot);
		const relevantSubmodules = submodules
			.filter((submodule) => submodule.path === root || submodule.path.startsWith(`${root}/`))
			.sort((left, right) => left.path.localeCompare(right.path));
		if (relevantSubmodules.length === 0) {
			return undefined;
		}

		const config: LocalModuleConfig = {
			version: CONFIG_VERSION,
			root,
			configPath: this.getConfigPath(repoRoot, root),
			modules: {},
		};

		for (const submodule of relevantSubmodules) {
			const entry = await this.buildExistingSubmoduleEntry(repoRoot, submodule);
			config.modules[entry.key] = entry;
		}

		await this.writeConfig(config);
		return config;
	}

	public withAppliedModule(config: LocalModuleConfig, entry: LocalModuleConfigEntry): LocalModuleConfig {
		return {
			...config,
			modules: {
				...config.modules,
				[entry.key]: entry,
			},
		};
	}

	/** Drop a module from the in-memory config (review item 7.1). */
	public withoutModule(config: LocalModuleConfig, moduleKey: string): LocalModuleConfig {
		const { [moduleKey]: _omitted, ...rest } = config.modules;
		return { ...config, modules: rest };
	}

	/**
	 * Remove a module from the workspace: for submodules, deinit the git state and
	 * erase any stale `.git/modules/<path>` cache; for copies, just delete the local
	 * directory. Both paths rely on the caller to confirm the destructive action.
	 *
	 * Review item 7.1 — implements `csmModules.removeModule` end-to-end.
	 */
	public async removeModule(workspaceRoot: string, entry: LocalModuleConfigEntry, repoRoot?: string): Promise<void> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		if (entry.method === 'submodule') {
			const gitRoot = repoRoot ?? workspaceRoot;
			try {
				await this.runGit(gitRoot, ['submodule', 'deinit', '-f', '--', targetRelativePath]);
			} catch {
				// already deinitialized; continue
			}
			try {
				await this.runGit(gitRoot, ['rm', '-rf', '--', targetRelativePath]);
			} catch {
				// fall through to manual removal
			}
			const submoduleGitDir = path.join(gitRoot, '.git', 'modules', ...targetRelativePath.split('/'));
			try {
				await fs.rm(submoduleGitDir, { recursive: true, force: true });
			} catch {
				// best effort
			}
		}
		try {
			await fs.rm(targetAbsolute, { recursive: true, force: true });
		} catch {
			// best effort: directory may not exist
		}
	}

	/**
	 * Update an applied module to the latest commit on its tracked branch.
	 *
	 * For submodules, runs `git submodule update --remote`. For copies, recreates the
	 * working tree from a fresh shallow clone (review item 7.2).
	 */
	public async previewCopyModuleUpdate(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		moduleEntry: CsmModuleEntry,
		authToken?: string,
	): Promise<CopyModuleUpdatePreview> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const branch = entry.branch || moduleEntry.defaultBranch || 'main';
		const latestRef = await this.resolveRemoteBranchRef(workspaceRoot, entry.source, branch, authToken);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		const backupDirectory = await this.pathExists(targetAbsolute)
			? this.getBackupDirectory(workspaceRoot)
			: undefined;
		return {
			currentRef: this.normalizeRef(entry.ref),
			latestRef,
			branch,
			needsUpdate: this.normalizeRef(entry.ref) !== latestRef,
			backupDirectory,
		};
	}

	public async updateModule(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		moduleEntry: CsmModuleEntry,
		authToken?: string,
		repoRoot?: string,
		latestRefHint?: string,
	): Promise<ModuleUpdateResult> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);

		if (entry.method === 'submodule') {
			const gitRoot = repoRoot ?? workspaceRoot;
			await this.runGit(gitRoot, ['submodule', 'update', '--remote', '--', targetRelativePath], authToken, entry.source);
			const head = await this.runGit(targetAbsolute, ['rev-parse', 'HEAD']);
			return {
				entry: { ...entry, ref: head },
			};
		}

		// copy mode: clone the latest branch tip, back up the existing folder, then rewrite it.
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-update-'));
		try {
			const branch = entry.branch || moduleEntry.defaultBranch || 'main';
			await this.runGit(tmpDir, ['clone', '--depth', '1', '--branch', branch, entry.source, 'src'], authToken, entry.source);
			const cloneRoot = path.join(tmpDir, 'src');
			const head = (await this.runGit(cloneRoot, ['rev-parse', 'HEAD'])) || latestRefHint || this.normalizeRef(entry.ref);
			const backupPath = await this.backupModuleDirectoryAsZip(workspaceRoot, entry);
			await fs.rm(targetAbsolute, { recursive: true, force: true });
			await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
			await fs.cp(cloneRoot, targetAbsolute, { recursive: true });
			await fs.rm(path.join(targetAbsolute, '.git'), { recursive: true, force: true });
			return {
				entry: { ...entry, ref: head, branch },
				backupPath,
			};
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	}

	public async targetExists(repoRoot: string, targetRelativePath: string): Promise<boolean> {
		try {
			await fs.stat(this.toAbsoluteTargetPath(repoRoot, targetRelativePath));
			return true;
		} catch {
			return false;
		}
	}

	public async listModuleDirectories(repoRoot: string, rootRelativePath: string): Promise<string[]> {
		const root = this.normalizeRootPath(rootRelativePath);
		const rootAbsolute = this.toAbsoluteTargetPath(repoRoot, root);
		let entries: Dirent[];
		try {
			entries = await fs.readdir(rootAbsolute, { withFileTypes: true });
		} catch (error) {
			if (this.isMissingPathError(error)) {
				return [];
			}
			throw error;
		}
		return entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
			.map((entry) => entry.name)
			.sort((left, right) => left.localeCompare(right));
	}

	public async applyModule(
		repoRoot: string,
		config: LocalModuleConfig,
		entry: CsmModuleEntry,
		method: ModuleApplyMethod,
		authToken?: string,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = this.getTargetRelativePath(config, entry);
		const targetPath = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		if (await this.targetExists(repoRoot, targetRelativePath)) {
			if (method === 'copy') {
				throw new Error(`Copy target already exists: ${targetRelativePath}`);
			}
			throw new Error(`Target path already exists: ${targetRelativePath}`);
		}

		return method === 'submodule'
			? this.applyModuleAsSubmodule(repoRoot, entry, targetRelativePath, targetPath, authToken)
			: this.applyModuleAsCopy(repoRoot, entry, targetRelativePath, targetPath, authToken);
	}

	public async writeConfig(config: LocalModuleConfig): Promise<void> {
		await fs.mkdir(path.dirname(config.configPath), { recursive: true });
		await fs.writeFile(config.configPath, this.serializeConfig(config), 'utf8');
	}

	private getConfigPath(repoRoot: string, rootRelativePath: string): string {
		return path.join(repoRoot, ...rootRelativePath.split('/'), LOCAL_MODULE_CONFIG_FILE);
	}

	private isLegacyConfigPath(configPath: string): boolean {
		return path.basename(configPath).toLowerCase() === LEGACY_LOCAL_MODULE_CONFIG_FILE.toLowerCase();
	}

	private isMissingPathError(error: unknown): boolean {
		return typeof error === 'object'
			&& error !== null
			&& 'code' in error
			&& String((error as { code?: unknown }).code) === 'ENOENT';
	}

	private toAbsoluteTargetPath(repoRoot: string, targetRelativePath: string): string {
		const repoRootAbsolute = path.resolve(repoRoot);
		const safeRelativePath = this.normalizeRootPath(targetRelativePath);
		const targetAbsolute = path.resolve(repoRootAbsolute, ...safeRelativePath.split('/'));
		const relativeFromRoot = path.relative(repoRootAbsolute, targetAbsolute);
		if (!relativeFromRoot || relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
			throw new Error('Target path must stay inside the repository root.');
		}
		return targetAbsolute;
	}

	private async buildExistingSubmoduleEntry(
		repoRoot: string,
		submodule: GitSubmoduleDefinition,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = this.normalizeRootPath(submodule.path);
		const repoInfo = this.parseRepositoryCoordinates(submodule.url, path.posix.basename(targetRelativePath));
		const ref = await this.resolveExistingSubmoduleRef(repoRoot, targetRelativePath);
		const branch = submodule.branch
			?? await this.resolveExistingSubmoduleBranch(this.toAbsoluteTargetPath(repoRoot, targetRelativePath))
			?? 'main';
		return {
			key: `${sanitizeModuleKeyPart(repoInfo.owner || 'local')}__${sanitizeModuleKeyPart(repoInfo.name)}`,
			name: repoInfo.name,
			owner: repoInfo.owner,
			source: submodule.url,
			method: 'submodule',
			path: targetRelativePath,
			ref,
			branch,
		};
	}

	private async applyModuleAsSubmodule(
		repoRoot: string,
		entry: CsmModuleEntry,
		targetRelativePath: string,
		targetPath: string,
		authToken?: string,
	): Promise<LocalModuleConfigEntry> {
		const branch = entry.defaultBranch || 'main';
		await this.runGit(
			repoRoot,
			['submodule', 'add', '-b', branch, entry.repoUrl, targetRelativePath],
			authToken,
			entry.repoUrl,
		);
		await this.runGit(
			repoRoot,
			['submodule', 'update', '--init', '--recursive', targetRelativePath],
			authToken,
			entry.repoUrl,
		);
		const ref = await this.runGit(targetPath, ['rev-parse', 'HEAD']);
		return this.createConfigEntry(entry, 'submodule', targetRelativePath, ref, branch);
	}

	private async applyModuleAsCopy(
		repoRoot: string,
		entry: CsmModuleEntry,
		targetRelativePath: string,
		targetPath: string,
		authToken?: string,
	): Promise<LocalModuleConfigEntry> {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-module-'));
		const checkoutPath = path.join(tempRoot, 'checkout');
		const branch = entry.defaultBranch || 'main';
		try {
			const cloneArgs = ['clone', '--depth', '1'];
			if (entry.defaultBranch) {
				cloneArgs.push('--branch', entry.defaultBranch);
			}
			cloneArgs.push(entry.repoUrl, checkoutPath);
			await this.runGit(repoRoot, cloneArgs, authToken, entry.repoUrl);
			const ref = await this.runGit(checkoutPath, ['rev-parse', 'HEAD']);
			await fs.mkdir(path.dirname(targetPath), { recursive: true });
			await this.copyDirectory(checkoutPath, targetPath);
			return this.createConfigEntry(entry, 'copy', targetRelativePath, ref, branch);
		} catch (error) {
			await fs.rm(targetPath, { recursive: true, force: true });
			throw error;
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private parseRepositoryCoordinates(repoUrl: string, fallbackName: string): { owner: string; name: string } {
		if (repoUrl.startsWith('.') || path.isAbsolute(repoUrl) || /^[a-zA-Z]:[\\/]/.test(repoUrl)) {
			return {
				owner: '',
				name: fallbackName,
			};
		}

		try {
			const url = new URL(repoUrl);
			if (url.protocol === 'file:') {
				return {
					owner: '',
					name: fallbackName,
				};
			}
			const segments = stripGitSuffix(url.pathname).split('/').filter(Boolean);
			if (segments.length >= 2) {
				return {
					owner: segments[segments.length - 2] ?? '',
					name: segments[segments.length - 1] ?? fallbackName,
				};
			}
		} catch {
			const match = repoUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
			if (match) {
				return {
					owner: match[1] ?? '',
					name: stripGitSuffix(match[2] ?? fallbackName),
				};
			}
		}

		return {
			owner: '',
			name: fallbackName,
		};
	}

	private createConfigEntry(
		entry: CsmModuleEntry,
		method: ModuleApplyMethod,
		targetRelativePath: string,
		ref: string,
		branch: string,
	): LocalModuleConfigEntry {
		return {
			key: this.getModuleKey(entry),
			name: entry.name,
			owner: entry.owner,
			source: entry.repoUrl,
			method,
			path: targetRelativePath,
			ref,
			branch,
		};
	}

	private async runGit(cwd: string, args: string[], authToken?: string, repoUrl?: string): Promise<string> {
		return this.gitRunner.exec({ cwd, args, authToken, repoUrl });
	}

	private async resolveExistingSubmoduleRef(repoRoot: string, targetRelativePath: string): Promise<string> {
		const targetPath = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		try {
			return await this.runGit(targetPath, ['rev-parse', 'HEAD']);
		} catch {
			const treeEntry = await this.runGit(repoRoot, ['ls-tree', 'HEAD', targetRelativePath]);
			const match = treeEntry.match(/\b([0-9a-f]{40})\b/i);
			if (!match?.[1]) {
				throw new Error(`Unable to determine the locked revision for ${targetRelativePath}.`);
			}
			return match[1];
		}
	}

	private async resolveExistingSubmoduleBranch(targetPath: string): Promise<string | undefined> {
		try {
			const remoteHead = await this.runGit(targetPath, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']);
			if (remoteHead.startsWith('origin/')) {
				return remoteHead.slice('origin/'.length);
			}
			if (remoteHead) {
				return remoteHead;
			}
		} catch {
			// Fall back to the current local branch.
		}

		try {
			const currentBranch = await this.runGit(targetPath, ['branch', '--show-current']);
			return currentBranch || undefined;
		} catch {
			return undefined;
		}
	}

	private async readGitSubmodules(repoRoot: string): Promise<GitSubmoduleDefinition[]> {
		const gitmodulesPath = path.join(repoRoot, '.gitmodules');
		let raw: string;
		try {
			raw = await fs.readFile(gitmodulesPath, 'utf8');
		} catch {
			return [];
		}

		const submodules: GitSubmoduleDefinition[] = [];
		let current: Partial<GitSubmoduleDefinition> | undefined;
		for (const rawLine of raw.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#') || line.startsWith(';')) {
				continue;
			}
			const sectionMatch = line.match(/^\[submodule\s+"(.+)"\]$/);
			if (sectionMatch) {
				if (current?.name && current.path && current.url) {
					submodules.push({
						name: current.name,
						path: current.path,
						url: current.url,
						branch: current.branch,
					});
				}
				current = { name: sectionMatch[1] };
				continue;
			}

			if (!current) {
				continue;
			}

			const separator = line.indexOf('=');
			if (separator <= 0) {
				continue;
			}
			const key = line.slice(0, separator).trim();
			const value = line.slice(separator + 1).trim();
			if (key === 'path') {
				current.path = toPosixPath(value);
			} else if (key === 'url') {
				current.url = value;
			} else if (key === 'branch') {
				current.branch = value;
			}
		}

		if (current?.name && current.path && current.url) {
			submodules.push({
				name: current.name,
				path: current.path,
				url: current.url,
				branch: current.branch,
			});
		}

		return submodules;
	}

	private async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
		await fs.mkdir(targetDir, { recursive: true });
		const entries = await fs.readdir(sourceDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === '.git') {
				continue;
			}
			const sourcePath = path.join(sourceDir, entry.name);
			const targetPath = path.join(targetDir, entry.name);
			if (entry.isDirectory()) {
				await this.copyDirectory(sourcePath, targetPath);
				continue;
			}
			if (entry.isSymbolicLink()) {
				const linkTarget = await fs.readlink(sourcePath);
				await fs.symlink(linkTarget, targetPath);
				continue;
			}
			await fs.copyFile(sourcePath, targetPath);
		}
	}

	private normalizeRef(value: string | undefined): string {
		return value?.trim() ?? '';
	}

	private getBackupDirectory(workspaceRoot: string): string {
		return path.join(workspaceRoot, '.csm-module-backups');
	}

	private async pathExists(targetPath: string): Promise<boolean> {
		try {
			await fs.lstat(targetPath);
			return true;
		} catch {
			return false;
		}
	}

	private async getGitConfigValue(cwd: string, key: string): Promise<string | undefined> {
		try {
			const value = await this.runGit(cwd, ['config', key]);
			return value.trim() || undefined;
		} catch {
			return undefined;
		}
	}

	private async getRemoteUrl(cwd: string, remoteName: string): Promise<string | undefined> {
		try {
			const value = await this.runGit(cwd, ['remote', 'get-url', remoteName]);
			return value.trim() || undefined;
		} catch {
			return undefined;
		}
	}

	private async hasCommit(cwd: string): Promise<boolean> {
		try {
			await this.runGit(cwd, ['rev-parse', '--verify', 'HEAD']);
			return true;
		} catch {
			return false;
		}
	}

	private async hasWorkingTreeChanges(cwd: string): Promise<boolean> {
		const status = await this.runGit(cwd, ['status', '--porcelain']);
		return status.trim().length > 0;
	}

	private async getCurrentBranch(cwd: string): Promise<string> {
		try {
			return await this.runGit(cwd, ['branch', '--show-current']);
		} catch {
			return '';
		}
	}

	private normalizeRemoteUrl(remoteUrl: string): string {
		return stripGitSuffix(remoteUrl).replace(/\/+$|\/+$/g, '').toLowerCase();
	}

	private async resolveRemoteBranchRef(cwd: string, repoUrl: string, branch: string, authToken?: string): Promise<string> {
		const stdout = await this.runGit(cwd, ['ls-remote', repoUrl, `refs/heads/${branch}`], authToken, repoUrl);
		const match = stdout.match(/^([0-9a-f]{40})\s+/im);
		if (!match?.[1]) {
			throw new Error(`Unable to determine the latest revision for branch ${branch}.`);
		}
		return match[1];
	}

	private async backupModuleDirectoryAsZip(workspaceRoot: string, entry: LocalModuleConfigEntry): Promise<string | undefined> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		if (!await this.pathExists(targetAbsolute)) {
			return undefined;
		}

		const backupDirectory = this.getBackupDirectory(workspaceRoot);
		await fs.mkdir(backupDirectory, { recursive: true });
		const backupFileName = `${sanitizeModuleKeyPart(entry.owner || 'local')}__${sanitizeModuleKeyPart(entry.name)}-${this.createBackupTimestamp()}.zip`;
		const backupPath = path.join(backupDirectory, backupFileName);
		const zip = new JSZip();
		await this.addDirectoryToZip(zip, targetAbsolute, path.posix.basename(targetRelativePath));
		const buffer = await zip.generateAsync({
			type: 'nodebuffer',
			compression: 'DEFLATE',
			compressionOptions: { level: 9 },
		});
		await fs.writeFile(backupPath, buffer);
		return backupPath;
	}

	private async addDirectoryToZip(zip: JSZip, sourceDir: string, zipDir: string): Promise<void> {
		const entries = await fs.readdir(sourceDir, { withFileTypes: true });
		for (const entry of entries) {
			const sourcePath = path.join(sourceDir, entry.name);
			const zipPath = path.posix.join(zipDir, entry.name);
			if (entry.isDirectory()) {
				await this.addDirectoryToZip(zip, sourcePath, zipPath);
				continue;
			}
			if (entry.isSymbolicLink()) {
				zip.file(`${zipPath}.symlink`, await fs.readlink(sourcePath));
				continue;
			}
			zip.file(zipPath, await fs.readFile(sourcePath));
		}
	}

	private createBackupTimestamp(): string {
		return new Date().toISOString().replace(/[:.]/g, '-');
	}

	private parseLegacyConfig(raw: string): ParsedConfigShape {
		const modules: Record<string, LocalModuleConfigEntry> = {};
		let currentSection = '';
		let root: string | undefined;
		let version: string | undefined;
		let currentModule: Partial<LocalModuleConfigEntry> | undefined;

		for (const rawLine of raw.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#') || line.startsWith(';')) {
				continue;
			}
			const sectionMatch = line.match(/^\[(.+)\]$/);
			if (sectionMatch) {
				if (currentModule?.key) {
					modules[currentModule.key] = this.finalizeModuleSection(currentModule);
				}
				currentSection = sectionMatch[1] ?? '';
				currentModule = currentSection.startsWith('module.') ? { key: currentSection.slice('module.'.length) } : undefined;
				continue;
			}

			const separator = line.indexOf('=');
			if (separator <= 0) {
				continue;
			}
			const key = line.slice(0, separator).trim();
			const value = line.slice(separator + 1).trim();

			if (currentSection === SECTION_ROOT) {
				if (key === 'root') {
					root = value;
				} else if (key === 'version') {
					version = value;
				}
				continue;
			}

			if (currentModule) {
				(currentModule as Record<string, string>)[key] = value;
			}
		}

		if (currentModule?.key) {
			modules[currentModule.key] = this.finalizeModuleSection(currentModule);
		}

		return { version, root, modules };
	}

	private parseYamlConfig(raw: string): ParsedConfigShape {
		let parsed: unknown;
		try {
			parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
		} catch (error) {
			throw new Error(`Failed to parse YAML config: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!parsed || typeof parsed !== 'object') {
			return { modules: {} };
		}

		const obj = parsed as Record<string, unknown>;
		const version = typeof obj.version === 'string' ? obj.version : (obj.version !== undefined && obj.version !== null ? String(obj.version) : undefined);
		const root = typeof obj.root === 'string' ? obj.root : undefined;
		const modules: Record<string, LocalModuleConfigEntry> = {};

		const modulesRaw = obj.modules;
		if (modulesRaw && typeof modulesRaw === 'object' && !Array.isArray(modulesRaw)) {
			for (const [key, value] of Object.entries(modulesRaw as Record<string, unknown>)) {
				if (!value || typeof value !== 'object' || Array.isArray(value)) {
					continue;
				}
				const entry = value as Record<string, unknown>;
				modules[key] = this.finalizeModuleSection({
					key,
					name: typeof entry.name === 'string' ? entry.name : undefined,
					owner: typeof entry.owner === 'string' ? entry.owner : undefined,
					source: typeof entry.source === 'string' ? entry.source : undefined,
					method: entry.method === 'copy' ? 'copy' : 'submodule',
					path: typeof entry.path === 'string' ? entry.path : undefined,
					ref: typeof entry.ref === 'string' ? entry.ref : undefined,
					branch: typeof entry.branch === 'string' ? entry.branch : undefined,
				});
			}
		}

		return { version, root, modules };
	}

	private finalizeModuleSection(module: Partial<LocalModuleConfigEntry>): LocalModuleConfigEntry {
		return {
			key: module.key ?? '',
			name: module.name ?? '',
			owner: module.owner ?? '',
			source: module.source ?? '',
			method: module.method === 'copy' ? 'copy' : 'submodule',
			path: module.path ?? '',
			ref: module.ref ?? '',
			branch: module.branch ?? '',
		};
	}

	private serializeConfig(config: LocalModuleConfig): string {
		const moduleEntries: Record<string, Omit<LocalModuleConfigEntry, 'key'>> = {};
		for (const key of Object.keys(config.modules).sort((left, right) => left.localeCompare(right))) {
			const module = config.modules[key];
			moduleEntries[key] = {
				name: module.name,
				owner: module.owner,
				source: module.source,
				method: module.method,
				path: module.path,
				ref: module.ref,
				branch: module.branch,
			};
		}
		const document = {
			version: config.version || CONFIG_VERSION,
			root: config.root,
			modules: moduleEntries,
		};
		return yaml.dump(document, {
			schema: yaml.JSON_SCHEMA,
			lineWidth: 120,
			noRefs: true,
			sortKeys: false,
			quotingType: '"',
			forceQuotes: true,
		});
	}
}