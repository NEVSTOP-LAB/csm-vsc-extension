import type { Dirent } from 'fs';
import * as fs from 'fs/promises';
import { getTempRoot } from '../common/tempPaths';
import * as path from 'path';
import JSZip from 'jszip';
import * as tar from 'tar';
import { CopyModuleUpdatePreview, CsmModuleEntry, LocalModuleConfig, LocalModuleConfigEntry, ModuleApplyMethod, ModuleReleaseAssetInfo, ModuleUpdateResult, ModuleVersionSelection } from './types';
import { t } from './messages';
import { GitService, IGitRunner } from './gitService';
import {
	isEntryLocked,
	getConfigPath,
	initializeConfig as configInitializeConfig,
	loadConfig as configLoadConfig,
	writeConfig as configWriteConfig,
	withAppliedModule as configWithAppliedModule,
	withoutModule as configWithoutModule,
	normalizeRootPath as configNormalizeRootPath,
	CONFIG_VERSION,
	DEFAULT_LOCAL_MODULE_ROOT,
	LOCAL_MODULE_CONFIG_FILE,
	LEGACY_LOCAL_MODULE_CONFIG_FILE,
} from './configService';

export { DEFAULT_LOCAL_MODULE_ROOT, LOCAL_MODULE_CONFIG_FILE, LEGACY_LOCAL_MODULE_CONFIG_FILE } from './configService';

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

/**
 * 更新模块选项（issue #37）：携带用户选择的版本来源（最新 / 提交 / 标签 / Release）。
 */
export interface UpdateModuleOptions {
	authToken?: string;
	repoRoot?: string;
	/** 目标版本选择；`kind === 'latest'` 保持原有"更新到分支最新"行为 */
	selection: ModuleVersionSelection;
	/** 更新到最新时的分支 HEAD 提示（避免额外一次 rev-parse） */
	latestRefHint?: string;
}

export interface ModuleDirectoryScanOptions {
	maxDepth?: number;
	includeReadmeWeakSignal?: boolean;
	excludedDirectoryNames?: string[];
	/**
	 * 相对模块根目录的路径，扫描时整体跳过（不报告为候选、不深入其子目录）。
	 * 用于已管理模块目录，避免继续向下扫描其内部内容。
	 */
	excludedRelativePaths?: string[];
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

/** GitHub 自动生成的源码附件名（防御性过滤，正常已在 versionService 排除） */
const SOURCE_CODE_ASSET_PATTERN = /source\s*code/i;

/** 附件文件名去扩展名：module-v1.0.zip → module-v1.0；module.tar.gz → module */
function stripAssetExtension(name: string): string {
	return name
		.replace(/\.tar\.gz$/i, '')
		.replace(/\.tgz$/i, '')
		.replace(/\.zip$/i, '')
		.replace(/\.(tar|gz|7z|rar)$/i, '')
		.replace(/[^a-zA-Z0-9_.\- ]+/g, '_')
		.trim();
}

export const DEFAULT_SCAN_MAX_DEPTH = 3;
export const DEFAULT_EXCLUDED_DIRECTORY_NAMES = ['.git', 'node_modules', 'dist', 'build', 'out', 'tmp', 'docs', 'images'];
const DOCUMENT_OR_IMAGE_FILE_PATTERN = /^(readme(\..*)?|license(\..*)?|changelog(\..*)?|notice(\..*)?|copying(\..*)?|authors(\..*)?|contributing(\..*)?|.*\.(md|txt|rst|png|jpe?g|gif|bmp|webp|svg))$/i;
/**
 * 以空格、连字符、下划线或点开头的文件夹，肯定不是子模块（issue #77）：
 * 既不会被报告为候选模块，也不会继续递归深入检查。
 */
const SPECIAL_CHARACTER_PREFIXED_DIRECTORY_PATTERN = /^[ \-_.]/;
/**
 * 标记"本文件夹就是一个模块"的 LabVIEW 特殊文件（issue #77）。
 * 一旦目录内存在这些文件，该目录即为模块根，无需再向下搜索其内部内容。
 */
const MODULE_SIGNAL_FILE_PATTERN = /\.(vi|vit|ctl|ctt|lvlib|lvproj|lvclass)$/i;

function isSpecialCharacterPrefixedDirectoryName(name: string): boolean {
	return SPECIAL_CHARACTER_PREFIXED_DIRECTORY_PATTERN.test(name);
}

export class WorkspaceModuleService {
	constructor(private readonly gitRunner: IGitRunner = new GitService()) { }

	public normalizeRootPath(value: string): string {
		return configNormalizeRootPath(value);
	}

	public getModuleKey(entry: CsmModuleEntry): string {
		return `${sanitizeModuleKeyPart(entry.owner)}__${sanitizeModuleKeyPart(entry.name)}`;
	}

	public normalizeNamespacePath(value: string): string {
		const trimmed = value.trim();
		if (!trimmed) {
			return '';
		}

		const slashNormalized = trimmed.replace(/\\/g, '/');
		if (path.posix.isAbsolute(slashNormalized) || path.win32.isAbsolute(trimmed)) {
			throw new Error('Use a namespace path relative to the module root.');
		}

		const normalized = path.posix.normalize(slashNormalized).replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
		if (normalized === '.') {
			return '';
		}
		if (!normalized || normalized.startsWith('..') || normalized.includes('/../')) {
			throw new Error('The namespace path must stay inside the module root.');
		}

		return normalized;
	}

	public getTargetRelativePath(config: LocalModuleConfig, entry: CsmModuleEntry, namespaceRelativePath?: string): string {
		const namespace = typeof namespaceRelativePath === 'string'
			? this.normalizeNamespacePath(namespaceRelativePath)
			: '';
		return namespace
			? path.posix.join(config.root, namespace, entry.name)
			: path.posix.join(config.root, entry.name);
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

	public async convertPublishedFolderToSubmodule(options: {
		repoRoot: string;
		targetRelativePath: string;
		remoteUrl: string;
		branch?: string;
		authToken?: string;
	}): Promise<{ branch: string; headRef: string }> {
		if (!await this.gitRunner.isAvailable()) {
			throw new Error('git unavailable');
		}

		const repoRoot = path.resolve(options.repoRoot);
		const targetRelativePath = this.normalizeRootPath(options.targetRelativePath);
		const targetPath = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		const stat = await fs.stat(targetPath);
		if (!stat.isDirectory()) {
			throw new Error(`Published folder is not a directory: ${targetRelativePath}`);
		}

		const branch = options.branch?.trim() || 'main';
		const remoteUrl = options.remoteUrl.trim();
		await this.runGit(repoRoot, ['rm', '-r', '--cached', '--ignore-unmatch', '--', targetRelativePath]);
		await this.runGit(
			repoRoot,
			['submodule', 'add', '-f', '-b', branch, remoteUrl, targetRelativePath],
			options.authToken,
			remoteUrl,
		);
		await this.runGit(repoRoot, ['submodule', 'absorbgitdirs', '--', targetRelativePath]);
		await this.runGit(repoRoot, ['submodule', 'update', '--init', '--recursive', targetRelativePath], options.authToken, remoteUrl);
		const headRef = (await this.runGit(targetPath, ['rev-parse', 'HEAD'])).trim();
		return {
			branch,
			headRef,
		};
	}

	public async switchModuleMethod(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		nextMethod: ModuleApplyMethod,
		authToken?: string,
		repoRoot?: string,
		/** 切到 release 时所需的具体 release 选择 */
		versionSelection?: ModuleVersionSelection,
	): Promise<ModuleUpdateResult> {
		const normalizedEntry = this.normalizeConfigEntry(entry);
		if (normalizedEntry.method === nextMethod) {
			return { entry: normalizedEntry };
		}

		let switchedEntry: LocalModuleConfigEntry;
		if (nextMethod === 'release') {
			// copy / submodule → release：下载所选 release 附件替换
			if (!versionSelection || versionSelection.kind !== 'release') {
				throw new Error('A release must be selected to switch to release mode.');
			}
			switchedEntry = await this.convertToRelease(workspaceRoot, normalizedEntry, versionSelection, authToken, repoRoot);
		} else if (normalizedEntry.method === 'release') {
			// release → copy / submodule
			if (nextMethod === 'copy') {
				switchedEntry = await this.convertReleaseToCopy(workspaceRoot, normalizedEntry, authToken);
			} else {
				if (!repoRoot) {
					throw new Error('Git repository root is required to convert a release module to submodule mode.');
				}
				switchedEntry = await this.convertReleaseToSubmodule(repoRoot, normalizedEntry, authToken);
			}
		} else if (nextMethod === 'copy') {
			// submodule → copy（保留现有快照）
			if (!repoRoot) {
				throw new Error('Git repository root is required to convert a submodule to copy mode.');
			}
			switchedEntry = await this.convertSubmoduleToCopy(workspaceRoot, normalizedEntry, repoRoot);
		} else {
			// copy → submodule
			if (!repoRoot) {
				throw new Error('Git repository root is required to convert a copied module to submodule mode.');
			}
			const result = await this.convertCopyToSubmodule(repoRoot, normalizedEntry, authToken);
			switchedEntry = result.entry;
		}

		if (isEntryLocked(normalizedEntry)) {
			await this.ensureSwitchTargetExists(workspaceRoot, switchedEntry);
			await this.applyEntryLockState(workspaceRoot, switchedEntry);
		}
		return { entry: switchedEntry };
	}

	public async initializeConfig(repoRoot: string, rootRelativePath: string): Promise<LocalModuleConfig> {
		return configInitializeConfig(repoRoot, rootRelativePath);
	}

	public async loadConfig(repoRoot: string, configPath: string): Promise<LocalModuleConfig> {
		return configLoadConfig(repoRoot, configPath);
	}

	public async recoverConfigFromExistingSubmodules(
		repoRoot: string,
		rootRelativePath = DEFAULT_LOCAL_MODULE_ROOT,
	): Promise<LocalModuleConfig | undefined> {
		const root = this.normalizeRootPath(rootRelativePath);
		const existingEntries = await this.findExistingGitModuleEntries(repoRoot, root);
		if (existingEntries.length === 0) {
			return undefined;
		}

		const config: LocalModuleConfig = {
			version: CONFIG_VERSION,
			root,
			configPath: getConfigPath(repoRoot, root),
			modules: {},
		};

		for (const entry of existingEntries) {
			await this.applyEntryLockState(repoRoot, entry);
			config.modules[entry.key] = entry;
		}

		await this.writeConfig(config);
		return config;
	}

	/**
	 * Scan the module root for existing git-managed module directories that are not yet
	 * recorded in the yaml config. This includes real git submodules as well as nested
	 * git repositories copied into the module root. For each newly discovered entry,
	 * build a config entry and persist the updated yaml.
	 */
	public async syncSubmoduleEntriesToConfig(
		repoRoot: string,
		config: LocalModuleConfig,
	): Promise<{ config: LocalModuleConfig; addedCount: number }> {
		const root = config.root;
		const existingEntries = await this.findExistingGitModuleEntries(repoRoot, root);
		const managedPaths = new Set(
			Object.values(config.modules).map((entry) => entry.path.replace(/\\/g, '/').toLowerCase()),
		);
		const untracked = existingEntries.filter((entry) => !managedPaths.has(entry.path.toLowerCase()));

		if (untracked.length === 0) {
			return { config, addedCount: 0 };
		}

		let updatedConfig = config;
		for (const entry of untracked) {
			await this.applyEntryLockState(repoRoot, entry);
			updatedConfig = this.withAppliedModule(updatedConfig, entry);
		}

		await this.writeConfig(updatedConfig);
		return { config: updatedConfig, addedCount: untracked.length };
	}

	public async getExistingSubmoduleConfigEntry(
		repoRoot: string,
		targetRelativePath: string,
	): Promise<LocalModuleConfigEntry | undefined> {
		const normalizedTargetPath = this.normalizeRootPath(targetRelativePath);
		const submodule = (await this.readGitSubmodules(repoRoot)).find(
			(candidate) => this.normalizeRootPath(candidate.path) === normalizedTargetPath,
		);
		if (!submodule) {
			return this.adoptExistingNestedGitRepositoryAsSubmodule(repoRoot, normalizedTargetPath);
		}

		return this.buildExistingSubmoduleEntry(repoRoot, submodule);
	}

	public withAppliedModule(config: LocalModuleConfig, entry: LocalModuleConfigEntry): LocalModuleConfig {
		return configWithAppliedModule(config, entry);
	}

	public async writeConfig(config: LocalModuleConfig): Promise<void> {
		return configWriteConfig(config);
	}

	public async setModuleLocked(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		locked: boolean,
	): Promise<LocalModuleConfigEntry> {
		const nextEntry = this.normalizeConfigEntry({
			...entry,
			locked,
		});
		await this.applyEntryLockState(workspaceRoot, nextEntry);
		return nextEntry;
	}

	public async syncModuleLockStates(workspaceRoot: string, entries: LocalModuleConfigEntry[]): Promise<void> {
		for (const entry of entries) {
			await this.applyEntryLockState(workspaceRoot, this.normalizeConfigEntry(entry));
		}
	}

	/** Drop a module from the in-memory config (review item 7.1). */
	public withoutModule(config: LocalModuleConfig, moduleKey: string): LocalModuleConfig {
		return configWithoutModule(config, moduleKey);
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
		if (await this.pathExists(targetAbsolute)) {
			await this.updatePathLockState(targetAbsolute, false);
		}
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

	/**
	 * 更新选项（issue #37）：携带用户选择的版本来源（最新 / 提交 / 标签 / Release）。
	 */
	public async updateModule(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		moduleEntry: CsmModuleEntry,
		options: UpdateModuleOptions,
	): Promise<ModuleUpdateResult> {
		const { authToken, repoRoot, selection } = options;
		const normalizedEntry = this.normalizeConfigEntry(entry);
		const targetRelativePath = this.normalizeRootPath(normalizedEntry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		const wasLocked = isEntryLocked(normalizedEntry);
		if (wasLocked && await this.pathExists(targetAbsolute)) {
			await this.updatePathLockState(targetAbsolute, false);
		}

		try {
			if (normalizedEntry.method === 'submodule') {
				const gitRoot = repoRoot ?? workspaceRoot;
				await this.runGit(gitRoot, ['submodule', 'update', '--init', '--', targetRelativePath], authToken, normalizedEntry.source);
				await this.runGit(targetAbsolute, ['fetch', '--tags', 'origin'], authToken, normalizedEntry.source);
				const checkoutRef = this.getSubmoduleCheckoutRef(selection);
				await this.runGit(targetAbsolute, ['checkout', checkoutRef], authToken, normalizedEntry.source);
				const head = await this.runGit(targetAbsolute, ['rev-parse', 'HEAD']);
				return {
					entry: this.normalizeConfigEntry(this.withVersionInfo({
						...normalizedEntry,
						ref: head,
						branch: selection.branch,
					}, selection)),
				};
			}

			const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-update-'));
			try {
				// Release：下载其附件并整体替换模块目录（不做 zip 备份，issue #37）
				if (selection.kind === 'release') {
					const assets = selection.releaseAssets ?? [];
					if (assets.length === 0) {
						throw new Error('The release has no downloadable assets.');
					}
					await this.downloadReleaseAssets(assets, authToken, tmpDir);
					await fs.rm(targetAbsolute, { recursive: true, force: true });
					await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
					await this.placeReleaseAssets(tmpDir, assets, targetAbsolute);
					return {
						entry: this.normalizeConfigEntry(this.withVersionInfo({
							...normalizedEntry,
							ref: '',
							branch: selection.branch,
						}, selection)),
					};
				}
				const cloneRoot = await this.cloneModuleVersion(
					tmpDir,
					selection,
					normalizedEntry.source,
					selection.branch || normalizedEntry.branch || moduleEntry.defaultBranch || 'main',
					authToken,
				);
				const head = (await this.runGit(cloneRoot, ['rev-parse', 'HEAD']))
					|| selection.ref
					|| options.latestRefHint
					|| this.normalizeRef(normalizedEntry.ref);
				const backupPath = await this.backupModuleDirectoryAsZip(workspaceRoot, normalizedEntry);
				await fs.rm(targetAbsolute, { recursive: true, force: true });
				await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
				await fs.cp(cloneRoot, targetAbsolute, { recursive: true });
				await fs.rm(path.join(targetAbsolute, '.git'), { recursive: true, force: true });
				return {
					entry: this.normalizeConfigEntry(this.withVersionInfo({
						...normalizedEntry,
						ref: head,
						branch: selection.branch,
					}, selection)),
					backupPath,
				};
			} finally {
				await fs.rm(tmpDir, { recursive: true, force: true });
			}
		} finally {
			if (wasLocked && await this.pathExists(targetAbsolute)) {
				await this.updatePathLockState(targetAbsolute, true);
			}
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

	public async listModuleDirectories(
		repoRoot: string,
		rootRelativePath: string,
		options: ModuleDirectoryScanOptions = {},
	): Promise<string[]> {
		const root = this.normalizeRootPath(rootRelativePath);
		const rootAbsolute = this.toAbsoluteTargetPath(repoRoot, root);
		const maxDepth = Math.max(1, Math.floor(options.maxDepth ?? DEFAULT_SCAN_MAX_DEPTH));
		const includeReadmeWeakSignal = options.includeReadmeWeakSignal !== false;
		const excludedDirectoryNames = new Set(
			(options.excludedDirectoryNames ?? DEFAULT_EXCLUDED_DIRECTORY_NAMES)
				.map((name) => name.trim().toLowerCase())
				.filter((name) => name.length > 0),
		);
		const excludedRelativePaths = new Set(
			(options.excludedRelativePaths ?? [])
				.map((value) => value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase())
				.filter((value) => value.length > 0),
		);
		let entries: Dirent[];
		try {
			entries = await fs.readdir(rootAbsolute, { withFileTypes: true });
		} catch (error) {
			if (this.isMissingPathError(error)) {
				return [];
			}
			throw error;
		}

		const discovered = new Set<string>();
		const walk = async (relativePathFromRoot: string, depth: number): Promise<void> => {
			const relativePathKey = relativePathFromRoot.replace(/\\/g, '/').toLowerCase();
			if (relativePathKey && excludedRelativePaths.has(relativePathKey)) {
				return;
			}
			const absolutePath = this.toAbsoluteTargetPath(repoRoot, path.posix.join(root, relativePathFromRoot));
			let children: Dirent[];
			try {
				children = await fs.readdir(absolutePath, { withFileTypes: true });
			} catch (error) {
				if (this.isMissingPathError(error)) {
					return;
				}
				throw error;
			}

			if (this.isModuleCandidateDirectory(children, includeReadmeWeakSignal)) {
				discovered.add(relativePathFromRoot);
				// 本目录已确认是一个模块，其内部内容不属于其他模块，无需再向下搜索（issue #77）。
				return;
			}

			if (depth >= maxDepth) {
				return;
			}

			const nextDirectories = children.filter((entry) => {
				if (!entry.isDirectory()) {
					return false;
				}
				if (isSpecialCharacterPrefixedDirectoryName(entry.name)) {
					return false;
				}
				return !excludedDirectoryNames.has(entry.name.toLowerCase());
			});

			for (const child of nextDirectories) {
				await walk(path.posix.join(relativePathFromRoot, child.name), depth + 1);
			}
		};

		const topDirectories = entries.filter((entry) => {
			if (!entry.isDirectory()) {
				return false;
			}
			if (isSpecialCharacterPrefixedDirectoryName(entry.name)) {
				return false;
			}
			if (excludedRelativePaths.has(entry.name.toLowerCase())) {
				return false;
			}
			return !excludedDirectoryNames.has(entry.name.toLowerCase());
		});

		for (const entry of topDirectories) {
			await walk(entry.name, 1);
		}

		return [...discovered].sort((left, right) => left.localeCompare(right));
	}

	public async applyModule(
		repoRoot: string,
		config: LocalModuleConfig,
		entry: CsmModuleEntry,
		method: ModuleApplyMethod,
		authToken?: string,
		onProgress?: (message: string) => void,
		explicitTargetRelativePath?: string,
		/** 指定版本来源（issue #37）：`latest` 或缺省时使用默认分支（现状） */
		versionSelection?: ModuleVersionSelection,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = explicitTargetRelativePath
			? this.normalizeRootPath(explicitTargetRelativePath)
			: this.getTargetRelativePath(config, entry);
		const targetPath = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		if (await this.targetExists(repoRoot, targetRelativePath)) {
			if (method === 'copy') {
				throw new Error(`Copy target already exists: ${targetRelativePath}`);
			}
			throw new Error(`Target path already exists: ${targetRelativePath}`);
		}

		const appliedEntry = method === 'submodule'
			? this.applyModuleAsSubmodule(repoRoot, entry, targetRelativePath, targetPath, authToken, onProgress, versionSelection)
			: this.applyModuleAsCopy(repoRoot, method, entry, targetRelativePath, targetPath, authToken, onProgress, versionSelection);
		const lockedEntry = this.normalizeConfigEntry(await appliedEntry);
		await this.applyEntryLockState(repoRoot, lockedEntry);
		return lockedEntry;
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
			locked: true,
		};
	}

	private async adoptExistingNestedGitRepositoryAsSubmodule(
		repoRoot: string,
		targetRelativePath: string,
	): Promise<LocalModuleConfigEntry | undefined> {
		const normalizedTargetPath = this.normalizeRootPath(targetRelativePath);
		const targetPath = this.toAbsoluteTargetPath(repoRoot, normalizedTargetPath);
		const nestedRepoRoot = await this.resolveGitRepositoryRoot(targetPath);
		if (!nestedRepoRoot) {
			return undefined;
		}
		// path.resolve 标准化路径（处理 .. 和 .），toPosixPath 将反斜杠统一为正斜杠。
		// Windows 上 git 返回的路径盘符可能为大写（如 D:/...），Node.js 用小写（如 d:\...），
		// 因此需要做大小写不敏感的比较。
		const normalizedNested = toPosixPath(path.resolve(nestedRepoRoot));
		const normalizedTarget = toPosixPath(path.resolve(targetPath));
		const pathsEqual = process.platform === 'win32'
			? normalizedNested.toLowerCase() === normalizedTarget.toLowerCase()
			: normalizedNested === normalizedTarget;
		if (!pathsEqual) {
			return undefined;
		}

		const remoteUrl = await this.getRemoteUrl(targetPath, 'origin');
		if (!remoteUrl) {
			return undefined;
		}

		const expectedRef = (await this.runGit(targetPath, ['rev-parse', 'HEAD'])).trim();
		const branch = (await this.resolveExistingSubmoduleBranch(targetPath) ?? 'main').trim() || 'main';
		await this.runGit(repoRoot, ['rm', '-r', '--cached', '--ignore-unmatch', '--', normalizedTargetPath]);
		await this.runGit(repoRoot, ['submodule', 'add', '-f', '-b', branch, remoteUrl, normalizedTargetPath], undefined, remoteUrl);
		await this.runGit(repoRoot, ['submodule', 'absorbgitdirs', '--', normalizedTargetPath]);
		const currentRef = (await this.runGit(targetPath, ['rev-parse', 'HEAD'])).trim();
		if (expectedRef && currentRef !== expectedRef) {
			await this.runGit(targetPath, ['checkout', expectedRef]);
		}
		return this.buildExistingSubmoduleEntry(repoRoot, {
			name: path.posix.basename(normalizedTargetPath),
			path: normalizedTargetPath,
			url: remoteUrl,
			branch,
		});
	}

	private async findExistingGitModuleEntries(
		repoRoot: string,
		rootRelativePath: string,
	): Promise<LocalModuleConfigEntry[]> {
		const root = this.normalizeRootPath(rootRelativePath);
		const entriesByPath = new Map<string, LocalModuleConfigEntry>();
		const submodules = (await this.readGitSubmodules(repoRoot))
			.filter((submodule) => submodule.path === root || submodule.path.startsWith(`${root}/`))
			.sort((left, right) => left.path.localeCompare(right.path));

		for (const submodule of submodules) {
			const entry = await this.buildExistingSubmoduleEntry(repoRoot, submodule);
			entriesByPath.set(entry.path.toLowerCase(), entry);
		}

		const directoryNames = await this.listModuleDirectories(repoRoot, root);
		for (const directoryName of directoryNames) {
			const targetRelativePath = path.posix.join(root, directoryName);
			const normalizedTargetPath = this.normalizeRootPath(targetRelativePath);
			if (entriesByPath.has(normalizedTargetPath.toLowerCase())) {
				continue;
			}

			const entry = await this.adoptExistingNestedGitRepositoryAsSubmodule(repoRoot, normalizedTargetPath);
			if (entry) {
				entriesByPath.set(entry.path.toLowerCase(), entry);
			}
		}

		return [...entriesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
	}

	private async applyModuleAsSubmodule(
		repoRoot: string,
		entry: CsmModuleEntry,
		targetRelativePath: string,
		targetPath: string,
		authToken?: string,
		onProgress?: (message: string) => void,
		versionSelection?: ModuleVersionSelection,
	): Promise<LocalModuleConfigEntry> {
		const defaultBranch = entry.defaultBranch || 'main';
		// commit 来源记录所选分支；tag / release / 默认分支 记录默认分支
		const branch = versionSelection && versionSelection.kind === 'commit' && versionSelection.branch
			? versionSelection.branch
			: defaultBranch;
		onProgress?.(t('applyingSubmoduleAdding', { repo: `${entry.owner}/${entry.name}` }));
		// `-c protocol.file.allow=always`：允许从本地路径（file transport）添加 submodule，
		// 否则 git 2.38+ 会以 "transport 'file' not allowed" 拒绝（对 https 远程无影响）。
		await this.runGit(
			repoRoot,
			['-c', 'protocol.file.allow=always', 'submodule', 'add', '-b', branch, entry.repoUrl, targetRelativePath],
			authToken,
			entry.repoUrl,
		);
		onProgress?.(t('applyingSubmoduleInit', { repo: `${entry.owner}/${entry.name}` }));
		await this.runGit(
			repoRoot,
			['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive', targetRelativePath],
			authToken,
			entry.repoUrl,
		);
		let ref = await this.runGit(targetPath, ['rev-parse', 'HEAD']);
		// 指定版本（非“使用默认分支”）：fetch + checkout 到目标提交/tag（detached HEAD）
		if (versionSelection && versionSelection.kind !== 'latest') {
			await this.runGit(targetPath, ['fetch', '--tags', 'origin'], authToken, entry.repoUrl);
			const checkoutRef = this.getSubmoduleCheckoutRef(versionSelection);
			await this.runGit(targetPath, ['checkout', checkoutRef], authToken, entry.repoUrl);
			ref = await this.runGit(targetPath, ['rev-parse', 'HEAD']);
		}
		return this.createConfigEntry(entry, 'submodule', targetRelativePath, ref, branch, versionSelection);
	}

	private async applyModuleAsCopy(
		_repoRoot: string,
		method: ModuleApplyMethod,
		entry: CsmModuleEntry,
		targetRelativePath: string,
		targetPath: string,
		authToken?: string,
		onProgress?: (message: string) => void,
		versionSelection?: ModuleVersionSelection,
	): Promise<LocalModuleConfigEntry> {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-module-'));
		const defaultBranch = entry.defaultBranch || 'main';
		// commit 来源记录所选分支；tag / release / 默认分支 记录默认分支
		const branch = versionSelection && versionSelection.kind === 'commit' && versionSelection.branch
			? versionSelection.branch
			: defaultBranch;
		try {
			// Release：下载其附件并放置到模块目录（不做 git clone，issue #37）
			if (versionSelection && versionSelection.kind === 'release') {
				const assets = versionSelection.releaseAssets ?? [];
				if (assets.length === 0) {
					throw new Error('The release has no downloadable assets.');
				}
				onProgress?.(t('applyingReleaseDownloading', { repo: `${entry.owner}/${entry.name}` }));
				await this.downloadReleaseAssets(assets, authToken, tempRoot, (msg) => onProgress?.(msg));
				onProgress?.(t('applyingCopyFiles', { repo: `${entry.owner}/${entry.name}` }));
				await fs.mkdir(path.dirname(targetPath), { recursive: true });
				await this.placeReleaseAssets(tempRoot, assets, targetPath);
				return this.createConfigEntry(entry, method, targetRelativePath, '', branch, versionSelection);
			}
			onProgress?.(t('applyingCopyCloning', { repo: `${entry.owner}/${entry.name}` }));
			let cloneRoot: string;
			if (versionSelection && versionSelection.kind !== 'latest') {
				cloneRoot = await this.cloneModuleVersion(tempRoot, versionSelection, entry.repoUrl, defaultBranch, authToken);
			} else {
				// 现状：浅克隆默认分支
				const cloneArgs = ['clone', '--depth', '1'];
				if (defaultBranch) {
					cloneArgs.push('--branch', defaultBranch);
				}
				cloneArgs.push(entry.repoUrl, 'src');
				await this.runGit(tempRoot, cloneArgs, authToken, entry.repoUrl);
				cloneRoot = path.join(tempRoot, 'src');
			}
			const ref = await this.runGit(cloneRoot, ['rev-parse', 'HEAD']);
			onProgress?.(t('applyingCopyFiles', { repo: `${entry.owner}/${entry.name}` }));
			await fs.mkdir(path.dirname(targetPath), { recursive: true });
			await this.copyDirectory(cloneRoot, targetPath);
			return this.createConfigEntry(entry, method, targetRelativePath, ref, branch, versionSelection);
		} catch (error) {
			await fs.rm(targetPath, { recursive: true, force: true });
			throw error;
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private isModuleCandidateDirectory(entries: Dirent[], includeReadmeWeakSignal: boolean): boolean {
		const hasStrongSignal = entries.some((entry) => {
			if (entry.name === '.git') {
				return true;
			}
			if (!entry.isFile()) {
				return false;
			}
			return /^DEV ENVIRONMENT/i.test(entry.name) || MODULE_SIGNAL_FILE_PATTERN.test(entry.name);
		});
		if (hasStrongSignal) {
			return true;
		}

		if (!includeReadmeWeakSignal) {
			return false;
		}

		const hasReadme = entries.some((entry) => entry.isFile() && /^readme(\..*)?$/i.test(entry.name));
		if (!hasReadme) {
			return false;
		}

		const hasNonDocumentationFile = entries.some((entry) => {
			if (!entry.isFile()) {
				return false;
			}
			return !DOCUMENT_OR_IMAGE_FILE_PATTERN.test(entry.name);
		});
		return hasNonDocumentationFile;
	}

	private async convertSubmoduleToCopy(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		repoRoot: string,
	): Promise<LocalModuleConfigEntry> {
		const normalizedEntry = this.normalizeConfigEntry(entry);
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetPath = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-copy-'));
		const snapshotPath = path.join(tempRoot, 'snapshot');
		try {
			await this.copyDirectory(targetPath, snapshotPath);
			await this.removeModule(workspaceRoot, normalizedEntry, repoRoot);
			await fs.mkdir(path.dirname(targetPath), { recursive: true });
			await this.copyDirectory(snapshotPath, targetPath);
			return this.normalizeConfigEntry({
				...normalizedEntry,
				method: 'copy',
			});
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private async convertCopyToSubmodule(
		repoRoot: string,
		entry: LocalModuleConfigEntry,
		authToken?: string,
	): Promise<ModuleUpdateResult> {
		const normalizedEntry = this.normalizeConfigEntry(entry);
		if (!await this.gitRunner.isAvailable()) {
			throw new Error('git unavailable');
		}

		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetPath = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		const branch = normalizedEntry.branch?.trim() || 'main';
		const expectedRef = this.normalizeRef(normalizedEntry.ref);
		const tempRoot = await fs.mkdtemp(path.join(path.dirname(targetPath), '.csm-switch-submodule-'));
		const checkoutPath = path.join(tempRoot, 'checkout');
		const backupPath = path.join(
			path.dirname(targetPath),
			`.csm-switch-backup-${path.basename(targetPath)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		);
		let cleanupBackup = false;

		// Create a zip backup before destructively replacing the local copy directory.
		const zipBackupPath = await this.backupModuleDirectoryAsZip(repoRoot, normalizedEntry);

		try {
			await this.runGit(tempRoot, ['clone', '--branch', branch, normalizedEntry.source, checkoutPath], authToken, normalizedEntry.source);
			if (expectedRef) {
				await this.runGit(checkoutPath, ['checkout', expectedRef]);
			}
			await fs.rename(targetPath, backupPath);
			cleanupBackup = true;
			await fs.rename(checkoutPath, targetPath);
			await this.runGit(repoRoot, ['rm', '-r', '--cached', '--ignore-unmatch', '--', targetRelativePath]);
			await this.runGit(
				repoRoot,
				['submodule', 'add', '-f', '-b', branch, normalizedEntry.source, targetRelativePath],
				authToken,
				normalizedEntry.source,
			);
			await this.runGit(repoRoot, ['submodule', 'absorbgitdirs', '--', targetRelativePath]);
			const ref = (await this.runGit(targetPath, ['rev-parse', 'HEAD'])).trim();
			return {
				entry: this.normalizeConfigEntry({
					...normalizedEntry,
					method: 'submodule',
					ref,
					branch,
				}),
				backupPath: zipBackupPath,
			};
		} catch (error) {
			if (cleanupBackup) {
				try {
					await fs.rm(targetPath, { recursive: true, force: true });
				} catch {
					// best effort
				}
				try {
					await fs.rename(backupPath, targetPath);
					cleanupBackup = false;
				} catch {
					cleanupBackup = false;
				}
			}
			throw error;
		} finally {
			if (cleanupBackup) {
				await fs.rm(backupPath, { recursive: true, force: true });
			}
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	/** copy / submodule → release：下载所选 release 附件替换模块目录（issue #37）。 */
	private async convertToRelease(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		selection: ModuleVersionSelection,
		authToken?: string,
		repoRoot?: string,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		const assets = selection.releaseAssets ?? [];
		if (assets.length === 0) {
			throw new Error('The release has no downloadable assets.');
		}
		if (entry.method === 'submodule' && repoRoot) {
			await this.removeModule(workspaceRoot, entry, repoRoot);
		} else if (await this.pathExists(targetAbsolute)) {
			await this.updatePathLockState(targetAbsolute, false);
			await fs.rm(targetAbsolute, { recursive: true, force: true });
		}
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-release-'));
		try {
			await this.downloadReleaseAssets(assets, authToken, tmpDir);
			await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
			await this.placeReleaseAssets(tmpDir, assets, targetAbsolute);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
		const branch = entry.branch || 'main';
		return this.normalizeConfigEntry(this.withVersionInfo({
			...entry,
			method: 'release',
			ref: '',
			branch,
		}, selection));
	}

	/** release → copy：重新克隆默认分支替换模块目录。 */
	private async convertReleaseToCopy(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		authToken?: string,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		const branch = entry.branch || 'main';
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-copy-'));
		try {
			if (await this.pathExists(targetAbsolute)) {
				await this.updatePathLockState(targetAbsolute, false);
				await fs.rm(targetAbsolute, { recursive: true, force: true });
			}
			const cloneArgs = ['clone', '--depth', '1'];
			if (branch) {
				cloneArgs.push('--branch', branch);
			}
			cloneArgs.push(entry.source, 'src');
			await this.runGit(tempRoot, cloneArgs, authToken, entry.source);
			const cloneRoot = path.join(tempRoot, 'src');
			const ref = (await this.runGit(cloneRoot, ['rev-parse', 'HEAD'])).trim();
			await fs.mkdir(path.dirname(targetAbsolute), { recursive: true });
			await this.copyDirectory(cloneRoot, targetAbsolute);
			return this.normalizeConfigEntry({
				...entry,
				method: 'copy',
				ref,
				branch,
				versionKind: 'branch',
				versionRef: branch,
				releaseName: undefined,
			});
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	/** release → submodule：submodule add 默认分支后检出当前 release 的 tag（detached HEAD）。 */
	private async convertReleaseToSubmodule(
		repoRoot: string,
		entry: LocalModuleConfigEntry,
		authToken?: string,
	): Promise<LocalModuleConfigEntry> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(repoRoot, targetRelativePath);
		const branch = entry.branch || 'main';
		const releaseTag = entry.versionRef;
		if (await this.pathExists(targetAbsolute)) {
			await this.updatePathLockState(targetAbsolute, false);
			await fs.rm(targetAbsolute, { recursive: true, force: true });
		}
		await this.runGit(
			repoRoot,
			['-c', 'protocol.file.allow=always', 'submodule', 'add', '-b', branch, entry.source, targetRelativePath],
			authToken,
			entry.source,
		);
		await this.runGit(
			repoRoot,
			['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive', targetRelativePath],
			authToken,
			entry.source,
		);
		await this.runGit(targetAbsolute, ['fetch', '--tags', 'origin'], authToken, entry.source);
		if (releaseTag) {
			await this.runGit(targetAbsolute, ['checkout', releaseTag], authToken, entry.source);
		}
		const ref = (await this.runGit(targetAbsolute, ['rev-parse', 'HEAD'])).trim();
		return this.normalizeConfigEntry({
			...entry,
			method: 'submodule',
			ref,
			branch,
		});
	}

	private async ensureSwitchTargetExists(workspaceRoot: string, entry: LocalModuleConfigEntry): Promise<void> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetPath = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		let stat;
		try {
			stat = await fs.stat(targetPath);
		} catch {
			throw new Error(`Converted module target is missing after switching to ${entry.method} mode: ${entry.path}`);
		}
		if (!stat.isDirectory()) {
			throw new Error(`Converted module target is not a directory after switching to ${entry.method} mode: ${entry.path}`);
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
		versionSelection?: ModuleVersionSelection,
	): LocalModuleConfigEntry {
		const configEntry: LocalModuleConfigEntry = {
			key: this.getModuleKey(entry),
			name: entry.name,
			owner: entry.owner,
			source: entry.repoUrl,
			method,
			path: targetRelativePath,
			ref,
			branch,
			locked: true,
		};
		return versionSelection ? this.withVersionInfo(configEntry, versionSelection) : configEntry;
	}


	private normalizeConfigEntry(entry: LocalModuleConfigEntry): LocalModuleConfigEntry {
		return {
			...entry,
			locked: isEntryLocked(entry),
		};
	}

	private async applyEntryLockState(workspaceRoot: string, entry: LocalModuleConfigEntry): Promise<void> {
		const targetRelativePath = this.normalizeRootPath(entry.path);
		const targetAbsolute = this.toAbsoluteTargetPath(workspaceRoot, targetRelativePath);
		if (!await this.pathExists(targetAbsolute)) {
			return;
		}
		const failures = await this.updatePathLockState(targetAbsolute, isEntryLocked(entry));
		if (failures.length > 0) {
			const preview = failures.slice(0, 3).join('; ');
			const remainder = failures.length > 3 ? `; ... (+${failures.length - 3} more)` : '';
			throw new Error(`Failed to update lock state for ${failures.length} path(s): ${preview}${remainder}`);
		}
	}

	private async updatePathLockState(targetPath: string, locked: boolean): Promise<string[]> {
		let stat;
		try {
			stat = await fs.lstat(targetPath);
		} catch (error) {
			return this.isPathMissingError(error) ? [] : [this.formatPathLockError(targetPath, error)];
		}
		if (stat.isSymbolicLink()) {
			return [];
		}
		const failures: string[] = [];
		if (stat.isDirectory()) {
			let childNames: string[] = [];
			try {
				childNames = await fs.readdir(targetPath);
			} catch (error) {
				if (!this.isPathMissingError(error)) {
					failures.push(this.formatPathLockError(targetPath, error));
				}
			}
			for (const childName of childNames) {
				failures.push(...await this.updatePathLockState(path.join(targetPath, childName), locked));
			}
		}
		const currentMode = stat.mode & 0o777;
		const nextMode = this.getLockMode(currentMode, stat.isDirectory(), locked);
		if (currentMode === nextMode) {
			return failures;
		}
		try {
			await fs.chmod(targetPath, nextMode);
		} catch (error) {
			if (!this.isPathMissingError(error)) {
				failures.push(this.formatPathLockError(targetPath, error));
			}
		}
		return failures;
	}

	private isPathMissingError(error: unknown): boolean {
		return typeof error === 'object'
			&& error !== null
			&& 'code' in error
			&& (error as NodeJS.ErrnoException).code === 'ENOENT';
	}

	private formatPathLockError(targetPath: string, error: unknown): string {
		return `${targetPath}: ${error instanceof Error ? error.message : String(error)}`;
	}

	private getLockMode(currentMode: number, isDirectory: boolean, locked: boolean): number {
		const permissionBits = currentMode & 0o777;
		if (process.platform === 'win32') {
			return locked ? (permissionBits & ~0o222) : (permissionBits | 0o200);
		}
		const executeBits = isDirectory ? 0o111 : (permissionBits & 0o111);
		if (locked) {
			return (isDirectory ? 0o555 : 0o444) | executeBits;
		}
		return (isDirectory ? 0o755 : 0o644) | executeBits;
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

	/**
	 * 计算 submodule 更新时的 checkout 目标（issue #37）：
	 * - latest：`origin/<branch>`（detached HEAD，等价于原 `submodule update --remote`）
	 * - tag / release：按 tag 名 checkout
	 * - commit：按提交 SHA checkout
	 */
	private getSubmoduleCheckoutRef(selection: ModuleVersionSelection): string {
		if (selection.kind === 'latest') {
			return `origin/${selection.branch}`;
		}
		if (selection.kind === 'tag' || selection.kind === 'release') {
			if (!selection.versionRef) {
				throw new Error(`Missing tag reference for ${selection.kind} update.`);
			}
			return selection.versionRef;
		}
		if (!selection.ref) {
			throw new Error('Missing commit reference for commit update.');
		}
		return selection.ref;
	}

	/**
	 * 在临时目录拉取目标版本，返回 checkout 根目录（issue #37）：
	 * - latest：`git clone --depth 1 --branch <defaultBranch>`（维持现状）
	 * - tag / release：`git clone --depth 1 --branch <tag> --single-branch`
	 * - commit：`git init` + `git fetch --depth 1 origin <sha>` + `git checkout FETCH_HEAD`
	 */
	private async cloneModuleVersion(
		tmpDir: string,
		selection: ModuleVersionSelection,
		source: string,
		defaultBranch: string,
		authToken?: string,
	): Promise<string> {
		if (selection.kind === 'latest') {
			await this.runGit(tmpDir, ['clone', '--depth', '1', '--branch', defaultBranch, source, 'src'], authToken, source);
			return path.join(tmpDir, 'src');
		}
		if (selection.kind === 'tag' || selection.kind === 'release') {
			const tagName = selection.versionRef;
			if (!tagName) {
				throw new Error(`Missing tag reference for ${selection.kind} update.`);
			}
			await this.runGit(tmpDir, ['clone', '--depth', '1', '--branch', tagName, '--single-branch', source, 'src'], authToken, source);
			return path.join(tmpDir, 'src');
		}
		// commit 类型（含 branch → 具体提交）
		const sha = selection.ref;
		if (!sha) {
			throw new Error('Missing commit reference for commit update.');
		}
		const checkoutPath = path.join(tmpDir, 'src');
		await fs.mkdir(checkoutPath, { recursive: true });
		await this.runGit(checkoutPath, ['init', '-q'], authToken, source);
		await this.runGit(checkoutPath, ['remote', 'add', 'origin', source], authToken, source);
		await this.runGit(checkoutPath, ['fetch', '--depth', '1', 'origin', sha], authToken, source);
		await this.runGit(checkoutPath, ['checkout', 'FETCH_HEAD'], authToken, source);
		return checkoutPath;
	}

	/**
	 * 将版本选择写入配置条目（issue #37）：
	 * - latest → versionKind=`branch`、versionRef=分支名
	 * - 其余 → versionKind=选择来源类型、versionRef=来源引用（commit 为提交 SHA）
	 */
	private withVersionInfo(entry: LocalModuleConfigEntry, selection: ModuleVersionSelection): LocalModuleConfigEntry {
		const next: LocalModuleConfigEntry = { ...entry };
		if (selection.kind === 'latest') {
			next.versionKind = 'branch';
			next.versionRef = selection.branch;
		} else {
			next.versionKind = selection.kind;
			next.versionRef = selection.versionRef ?? (selection.kind === 'commit' ? entry.ref : undefined);
		}
		if (selection.kind === 'release' && selection.releaseName) {
			next.releaseName = selection.releaseName;
		}
		return next;
	}

	// ---------------------------------------------------------------------
	// GitHub Release 附件（issue #37）：下载 → 解压/复制 → 放置
	// ---------------------------------------------------------------------

	/**
	 * 下载 release 附件到指定目录（私有仓库复用登录 token）。
	 * 文件名统一做安全化处理，避免空格/特殊字符导致路径问题。
	 */
	private async downloadReleaseAssets(
		assets: ModuleReleaseAssetInfo[],
		token: string | undefined,
		destinationDir: string,
		onProgress?: (message: string) => void,
	): Promise<void> {
		await fs.mkdir(destinationDir, { recursive: true });
		for (const asset of assets) {
			onProgress?.(`${asset.name}`);
			const response = await fetch(asset.browserDownloadUrl, {
				headers: token ? { Authorization: `Bearer ${token}` } : undefined,
			});
			if (!response.ok) {
				throw new Error(`Failed to download release asset ${asset.name}: HTTP ${response.status}`);
			}
			const buffer = Buffer.from(await response.arrayBuffer());
			const safeName = this.sanitizeDownloadFileName(asset.name);
			await fs.writeFile(path.join(destinationDir, safeName), buffer);
		}
	}

	/**
	 * 将下载好的附件放置到模块目录：
	 * - 单个附件：内容直接放模块根（zip/tar.gz 解压并剥离顶层单目录）
	 * - 多个附件：每个附件放 `模块目录/<附件名去扩展名>/`（内部同样剥离顶层单目录）
	 */
	private async placeReleaseAssets(
		downloadDir: string,
		assets: ModuleReleaseAssetInfo[],
		targetPath: string,
	): Promise<void> {
		const effectiveAssets = assets.filter((asset) => !SOURCE_CODE_ASSET_PATTERN.test(asset.name));
		if (effectiveAssets.length === 0) {
			throw new Error('The release has no downloadable assets.');
		}
		await fs.mkdir(targetPath, { recursive: true });
		if (effectiveAssets.length === 1) {
			const asset = effectiveAssets[0];
			await this.placeSingleAsset(path.join(downloadDir, this.sanitizeDownloadFileName(asset.name)), targetPath);
			return;
		}
		for (const asset of effectiveAssets) {
			const subDirName = stripAssetExtension(asset.name) || 'asset';
			const subDir = path.join(targetPath, subDirName);
			await fs.mkdir(subDir, { recursive: true });
			await this.placeSingleAsset(path.join(downloadDir, this.sanitizeDownloadFileName(asset.name)), subDir);
		}
	}

	/**
	 * 放置单个附件到目标目录：
	 * - zip：JSZip 解压 → 剥离顶层单目录后拷贝内容
	 * - tar.gz / tgz：tar 解压 → 剥离顶层单目录后拷贝内容
	 * - 其它格式：直接复制到目标目录
	 */
	private async placeSingleAsset(downloadedPath: string, targetDir: string): Promise<void> {
		let stat;
		try {
			stat = await fs.stat(downloadedPath);
		} catch {
			throw new Error(`Downloaded release asset is missing: ${path.basename(downloadedPath)}`);
		}
		if (stat.isDirectory()) {
			await this.copyDirectory(downloadedPath, targetDir);
			return;
		}
		if (/\.zip$/i.test(downloadedPath)) {
			const staging = await fs.mkdtemp(path.join(getTempRoot(), 'csm-release-zip-'));
			try {
				await this.extractZip(downloadedPath, staging);
				await this.copyStagingWithTopLevelStrip(staging, targetDir);
			} finally {
				await fs.rm(staging, { recursive: true, force: true });
			}
			return;
		}
		if (/\.(tar\.gz|tgz)$/i.test(downloadedPath)) {
			const staging = await fs.mkdtemp(path.join(getTempRoot(), 'csm-release-tar-'));
			try {
				await tar.x({ file: downloadedPath, cwd: staging });
				await this.copyStagingWithTopLevelStrip(staging, targetDir);
			} finally {
				await fs.rm(staging, { recursive: true, force: true });
			}
			return;
		}
		// 其它格式：直接复制
		await fs.copyFile(downloadedPath, path.join(targetDir, path.basename(downloadedPath)));
	}

	/** 解压 zip 到 staging 目录（防护路径穿越）。 */
	private async extractZip(zipPath: string, stagingDir: string): Promise<void> {
		const data = await fs.readFile(zipPath);
		const zip = await JSZip.loadAsync(data);
		for (const entry of Object.values(zip.files)) {
			const relativePath = path.posix.normalize(entry.name.replace(/\\/g, '/')).replace(/^\/+/, '');
			if (!relativePath || relativePath === '..' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
				continue;
			}
			const entryPath = path.join(stagingDir, relativePath);
			if (entry.dir) {
				await fs.mkdir(entryPath, { recursive: true });
				continue;
			}
			await fs.mkdir(path.dirname(entryPath), { recursive: true });
			const content = await entry.async('nodebuffer');
			await fs.writeFile(entryPath, content);
		}
	}

	/** 解压结果：若顶层只有一个目录则剥离之，再把内容拷贝到目标目录。 */
	private async copyStagingWithTopLevelStrip(stagingDir: string, targetDir: string): Promise<void> {
		let entries: string[] = [];
		try {
			entries = await fs.readdir(stagingDir);
		} catch {
			return;
		}
		if (entries.length === 1) {
			const onlyEntry = path.join(stagingDir, entries[0]!);
			const stat = await fs.stat(onlyEntry);
			if (stat.isDirectory()) {
				await this.copyDirectory(onlyEntry, targetDir);
				return;
			}
		}
		await this.copyDirectory(stagingDir, targetDir);
	}

	private sanitizeDownloadFileName(name: string): string {
		return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
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

	public async resolveRemoteBranchRef(cwd: string, repoUrl: string, branch: string, authToken?: string): Promise<string> {
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
}