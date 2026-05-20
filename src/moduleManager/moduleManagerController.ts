import * as vscode from 'vscode';
import * as path from 'path';
import { AuthService } from './authService';
import { GitHubModuleService } from './githubModuleService';
import { ModuleCacheStore } from './cacheStore';
import { CsmModuleEntry, LocalModuleConfig, ModuleApplyMethod } from './types';
import { ModuleTreeItem } from './moduleTreeDataProvider';
import { ModuleSidebarViewProvider } from './moduleSidebarViewProvider';
import { ReadmeAssetCache } from './readmeAssetCache';
import { DEFAULT_LOCAL_MODULE_ROOT, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from './workspaceModuleService';
import { COMMAND_IDS, CONFIG_KEYS, CONFIG_SECTION, CONTEXT_KEYS, VIEW_IDS } from './constants';

const LOCAL_MODULE_CONFIG_GLOB = `**/{${LOCAL_MODULE_CONFIG_FILE},${LEGACY_LOCAL_MODULE_CONFIG_FILE}}`;
const WORKSPACE_INIT_CONTEXT_KEY = CONTEXT_KEYS.canInitializeWorkspace;
const LVPROJ_GLOB = '**/*.lvproj';
const WORKSPACE_INIT_PROMPT = 'Detected csm/ and .lvproj files but no local CSM module config. Initialize CSM module management for this repository?';

interface PendingWorkspaceInitialization {
	workspaceFolder: vscode.WorkspaceFolder;
	repoRoot: string;
}

export class ModuleManagerController {
	private readonly authService = new AuthService();
	private readonly githubService = new GitHubModuleService();
	private readonly cacheStore: ModuleCacheStore;
	private readonly treeDataProvider = new ModuleSidebarViewProvider({
		onLogin: () => {
			void this.loginCommand();
		},
		onRefresh: () => {
			void this.refreshCommand();
		},
		onInitializeWorkspace: () => {
			void this.initializeWorkspaceCommand();
		},
		onOpenReadme: (entry) => {
			void this.openReadmeCommand(entry);
		},
		onApplySelection: (entry) => {
			void this.applyToWorkspaceCommand(entry);
		},
		onSelectionChange: (moduleKeys) => {
			this.setSelectedModuleKeys(moduleKeys);
		},
	});
	private readonly readmeAssetCache: ReadmeAssetCache;
	private readonly workspaceModuleService = new WorkspaceModuleService();
	private readonly readmeCache: Record<string, string>;
	private availableModules: CsmModuleEntry[] = [];
	private readonly selectedModuleKeys = new Set<string>();
	private currentToken: string | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.cacheStore = new ModuleCacheStore(context.globalState);
		this.readmeAssetCache = new ReadmeAssetCache(context.globalStorageUri);
		this.readmeCache = this.cacheStore.getReadmeCache();
	}

	public register(subscriptions: vscode.Disposable[]): void {
		if (this.treeDataProvider instanceof ModuleSidebarViewProvider) {
			subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_IDS.moduleSidebar, this.treeDataProvider, {
				webviewOptions: { retainContextWhenHidden: true },
			}));
		}

		subscriptions.push(
			vscode.commands.registerCommand(COMMAND_IDS.login, () => this.loginCommand()),
			vscode.commands.registerCommand(COMMAND_IDS.refresh, () => this.refreshCommand()),
			vscode.commands.registerCommand(COMMAND_IDS.initializeWorkspace, () => this.initializeWorkspaceCommand()),
			vscode.commands.registerCommand(COMMAND_IDS.openReadme, (entry?: CsmModuleEntry | ModuleTreeItem) => this.openReadmeCommand(entry)),
			vscode.commands.registerCommand(COMMAND_IDS.applyToWorkspace, (entry?: CsmModuleEntry | ModuleTreeItem) => this.applyToWorkspaceCommand(entry)),
		);

		const cached = this.cacheStore.getModuleSnapshot();
		const hasCachedModules = !!cached && cached.modules.length > 0;
		if (hasCachedModules) {
			this.availableModules = cached.modules;
			this.treeDataProvider.setModules(cached.modules);
		} else {
			this.treeDataProvider.setLoading('Sign in to GitHub to load modules.');
		}

		if (!hasCachedModules || this.cacheStore.isModuleSnapshotExpired(cached, this.getCacheTtlMinutes())) {
			void this.loadModules({
				interactiveAuth: false,
				showSuccessMessage: false,
				showErrorMessage: false,
				preserveVisibleModules: hasCachedModules,
			});
		}

		void this.refreshWorkspaceInitializationState({ prompt: true });
		void this.refreshSidebarWorkspaceState();
	}

	private async applyToWorkspaceCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const selectedEntries = this.getSelectedModules(this.resolveModuleEntry(entry));
		if (selectedEntries.length === 0) {
			void vscode.window.showWarningMessage('Select at least one module to apply to the current repository.');
			return;
		}

		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage('Open the target repository as a workspace folder before applying modules.');
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage('The current workspace folder is not a Git repository.');
			return;
		}

		let authToken = await this.ensureToken(false);
		if (!authToken && selectedEntries.some((moduleEntry) => moduleEntry.visibility === 'private')) {
			authToken = await this.ensureToken(true);
			if (!authToken) {
				void vscode.window.showWarningMessage('GitHub sign-in is required to apply private modules.');
				return;
			}
		}

		let config = await this.resolveLocalModuleConfig(workspaceFolder, repoRoot);
		if (!config) {
			return;
		}
		await this.refreshWorkspaceInitializationState({ prompt: false });

		const applyMethod = await this.promptApplyMethod(selectedEntries.length);
		if (!applyMethod) {
			return;
		}

		const duplicateTargets = this.findDuplicateTargetPaths(config, selectedEntries);
		if (duplicateTargets.length > 0) {
			void vscode.window.showErrorMessage(`Selected modules would map to the same target path: ${duplicateTargets.join(', ')}`);
			return;
		}

		const occupiedTargets = await this.findOccupiedTargetPaths(repoRoot, config, selectedEntries);
		if (occupiedTargets.length > 0) {
			const prefix = applyMethod === 'copy' ? 'Copy target already exists' : 'Target path already exists';
			void vscode.window.showWarningMessage(`${prefix}: ${occupiedTargets.join(', ')}`);
			return;
		}

		const confirmation = await vscode.window.showWarningMessage(
			`Apply ${selectedEntries.length} module(s) to ${path.basename(repoRoot)} using ${applyMethod} under ${config.root}/?`,
			{ modal: true },
			'Apply',
			'Cancel',
		);
		if (confirmation !== 'Apply') {
			return;
		}

		let appliedCount = 0;
		try {
			for (const moduleEntry of selectedEntries) {
				const appliedModule = await this.workspaceModuleService.applyModule(
					repoRoot,
					config,
					moduleEntry,
					applyMethod,
					authToken,
				);
				config = this.workspaceModuleService.withAppliedModule(config, appliedModule);
				await this.workspaceModuleService.writeConfig(config);
				appliedCount += 1;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			const prefix = appliedCount > 0
				? `Applied ${appliedCount}/${selectedEntries.length} module(s) before failure`
				: 'Failed to apply CSM modules';
			void vscode.window.showErrorMessage(`${prefix}: ${message}`);
			return;
		}

		void vscode.window.showInformationMessage(
			`Applied ${selectedEntries.length} module(s) via ${applyMethod}. Config: ${path.relative(repoRoot, config.configPath).replace(/\\/g, '/')}`,
		);
		await this.refreshSidebarWorkspaceState();
	}

	private async initializeWorkspaceCommand(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
		const targetFolder = workspaceFolder ?? await this.resolveWorkspaceFolder();
		if (!targetFolder) {
			void vscode.window.showWarningMessage('Open the target repository as a workspace folder before initializing CSM module management.');
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(targetFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage('The current workspace folder is not a Git repository.');
			return;
		}

		const existingConfigs = await this.findLocalModuleConfigFiles(targetFolder);
		if (existingConfigs.length > 0) {
			await this.setWorkspaceInitializationContext(false);
			const existingConfig = await this.resolveLocalModuleConfig(targetFolder, repoRoot);
			if (existingConfig) {
				void vscode.window.showInformationMessage(
					`Local CSM module config already exists at ${path.relative(repoRoot, existingConfig.configPath).replace(/\\/g, '/')}.`,
				);
			}
			await this.refreshSidebarWorkspaceState();
			return;
		}

		const recoveredConfig = await this.workspaceModuleService.recoverConfigFromExistingSubmodules(repoRoot, DEFAULT_LOCAL_MODULE_ROOT);
		if (recoveredConfig) {
			void vscode.window.showInformationMessage(
				`Initialized local CSM module config from existing submodules at ${path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/')}.`,
			);
			await this.refreshSidebarWorkspaceState();
			await this.refreshWorkspaceInitializationState({ prompt: false });
			return;
		}

		await this.initializeLocalModuleConfig(repoRoot, WORKSPACE_INIT_PROMPT);
		await this.refreshSidebarWorkspaceState();
		await this.refreshWorkspaceInitializationState({ prompt: false });
	}

	private async loginCommand(): Promise<void> {
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			void vscode.window.showWarningMessage('GitHub sign-in was cancelled.');
			return;
		}
		this.currentToken = session.accessToken;
		this.treeDataProvider.setAuthenticated(true);
		void vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
		await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
	}

	private async ensureToken(interactive: boolean): Promise<string | undefined> {
		if (this.currentToken) {
			return this.currentToken;
		}
		const silentSession = await this.authService.getSessionSilently();
		if (silentSession) {
			this.currentToken = silentSession.accessToken;
			this.treeDataProvider.setAuthenticated(true);
			return this.currentToken;
		}
		if (!interactive) {
			return undefined;
		}
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			return undefined;
		}
		this.currentToken = session.accessToken;
		return this.currentToken;
	}

	private async refreshCommand(): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			'Refresh CSM modules from GitHub?',
			{ modal: true },
			'Refresh',
			'Cancel',
		);
		if (choice !== 'Refresh') {
			return;
		}
		await this.loadModules({ interactiveAuth: true, showSuccessMessage: true, showErrorMessage: true });
	}

	private async loadModules(options: {
		interactiveAuth: boolean;
		showSuccessMessage: boolean;
		showErrorMessage: boolean;
		preserveVisibleModules?: boolean;
	}): Promise<void> {
		const token = await this.ensureToken(options.interactiveAuth);
		if (!token) {
			if (options.interactiveAuth) {
				this.treeDataProvider.setError('GitHub sign-in is required to refresh modules.');
				void vscode.window.showWarningMessage('Unable to refresh modules without a GitHub session.');
			}
			return;
		}
		this.treeDataProvider.setAuthenticated(true);

		if (!options.preserveVisibleModules) {
			this.treeDataProvider.setLoading('Refreshing modules from GitHub...');
		}
		try {
			const modules = await this.githubService.fetchModules(token);
			this.availableModules = modules;
			this.setSelectedModuleKeys([...this.selectedModuleKeys]);
			const refreshedReadme: Record<string, string> = {};
			for (const moduleEntry of modules) {
				const key = this.getReadmeCacheKey(moduleEntry);
				try {
					const markdown = await this.githubService.fetchReadme(moduleEntry.owner, moduleEntry.name, token);
					refreshedReadme[key] = markdown;
					await this.readmeAssetCache.saveMarkdown(moduleEntry, markdown);
				} catch {
					refreshedReadme[key] = '';
				}
			}
			Object.assign(this.readmeCache, refreshedReadme);
			await this.cacheStore.setModuleSnapshot(modules);
			await this.cacheStore.setReadmeCache(this.readmeCache);
			this.treeDataProvider.setModules(modules);
			await this.refreshSidebarWorkspaceState();
			if (options.showSuccessMessage) {
				void vscode.window.showInformationMessage(`Refreshed ${modules.length} module(s).`);
			}
		} catch (error) {
			this.treeDataProvider.setError('Failed to load modules from GitHub.');
			if (options.showErrorMessage) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				void vscode.window.showErrorMessage(`Failed to refresh CSM modules: ${message}`);
			}
		}
	}

	private async openReadmeCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		if (!resolvedEntry) {
			return;
		}
		const key = this.getReadmeCacheKey(resolvedEntry);
		let readme: string | undefined = this.readmeCache[key];
		if (!readme) {
			readme = await this.readmeAssetCache.readMarkdown(resolvedEntry);
			if (readme) {
				this.readmeCache[key] = readme;
			}
		}
		if (!readme) {
			const token = await this.ensureToken(false);
			if (!token) {
				void vscode.window.showWarningMessage('No cached README and no GitHub session available.');
				return;
			}
			try {
				readme = await this.githubService.fetchReadme(resolvedEntry.owner, resolvedEntry.name, token);
				this.readmeCache[key] = readme;
				await this.cacheStore.setReadmeCache(this.readmeCache);
				await this.readmeAssetCache.saveMarkdown(resolvedEntry, readme);
			} catch {
				readme = '';
			}
		}

		const markdownContent = readme || '# README not available\n\nUnable to load README from GitHub for this module.';
		const panel = vscode.window.createWebviewPanel(
			'csmModulesReadme',
			`README: ${resolvedEntry.name}`,
			vscode.ViewColumn.Active,
			{
				enableFindWidget: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.readmeAssetCache.rootUri],
			},
		);
		panel.webview.html = await this.readmeAssetCache.renderMarkdown(resolvedEntry, markdownContent, panel.webview);
	}

	private getReadmeCacheKey(entry: CsmModuleEntry): string {
		return `${entry.owner}/${entry.name}`;
	}

	private getSelectedModules(entry?: CsmModuleEntry): CsmModuleEntry[] {
		const selectedEntries = this.availableModules.filter((moduleEntry) => this.selectedModuleKeys.has(this.getModuleKey(moduleEntry)));
		if (entry) {
			const includesEntry = selectedEntries.some((selectedEntry) => this.sameModule(selectedEntry, entry));
			return includesEntry ? selectedEntries : [entry];
		}
		return selectedEntries;
	}

	private setSelectedModuleKeys(moduleKeys: string[]): void {
		const allowedKeys = new Set(this.availableModules.map((moduleEntry) => this.getModuleKey(moduleEntry)));
		this.selectedModuleKeys.clear();
		for (const moduleKey of moduleKeys) {
			if (allowedKeys.has(moduleKey)) {
				this.selectedModuleKeys.add(moduleKey);
			}
		}
		if (this.treeDataProvider instanceof ModuleSidebarViewProvider) {
			this.treeDataProvider.setSelection([...this.selectedModuleKeys]);
		}
	}

	private resolveModuleEntry(entry?: CsmModuleEntry | ModuleTreeItem): CsmModuleEntry | undefined {
		if (!entry) {
			return undefined;
		}
		if (entry instanceof ModuleTreeItem) {
			return entry.moduleEntry;
		}
		if (this.isModuleTreeItemLike(entry)) {
			return entry.moduleEntry;
		}
		return entry;
	}

	private isModuleTreeItemLike(entry: CsmModuleEntry | ModuleTreeItem): entry is ModuleTreeItem {
		return typeof entry === 'object' && entry !== null && 'moduleEntry' in entry;
	}

	private sameModule(left: CsmModuleEntry, right: CsmModuleEntry): boolean {
		return left.owner === right.owner && left.name === right.name;
	}

	private getModuleKey(entry: CsmModuleEntry): string {
		return ModuleSidebarViewProvider.getModuleKey(entry);
	}

	private async refreshSidebarWorkspaceState(): Promise<void> {
		if (!(this.treeDataProvider instanceof ModuleSidebarViewProvider)) {
			return;
		}

		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			this.treeDataProvider.setWorkspaceContext({ appliedModuleKeys: [] });
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			this.treeDataProvider.setWorkspaceContext({
				workspaceLabel: workspaceFolder.name,
				appliedModuleKeys: [],
			});
			return;
		}

		const config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, repoRoot);
		this.treeDataProvider.setWorkspaceContext({
			workspaceLabel: path.basename(repoRoot) || workspaceFolder.name,
			moduleRoot: config?.root,
			appliedModuleKeys: this.mapAppliedModuleKeys(config),
		});
	}

	private getPreferredWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return undefined;
		}
		if (folders.length === 1) {
			return folders[0];
		}

		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
			if (activeFolder) {
				return activeFolder;
			}
		}

		return folders[0];
	}

	private async resolveWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return undefined;
		}
		if (folders.length === 1) {
			return folders[0];
		}

		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
			if (activeFolder) {
				return activeFolder;
			}
		}

		const pick = await vscode.window.showQuickPick(
			folders.map((folder) => ({
				label: folder.name,
				description: folder.uri.fsPath,
				folder,
			})),
			{ placeHolder: 'Select the repository to receive the selected CSM modules.' },
		);
		return pick?.folder;
	}

	private async resolveLocalModuleConfig(
		workspaceFolder: vscode.WorkspaceFolder,
		repoRoot: string,
	): Promise<LocalModuleConfig | undefined> {
		const matches = await this.findLocalModuleConfigFiles(workspaceFolder);

		if (matches.length === 0) {
			const recoveredConfig = await this.workspaceModuleService.recoverConfigFromExistingSubmodules(repoRoot, DEFAULT_LOCAL_MODULE_ROOT);
			if (recoveredConfig) {
				await this.setWorkspaceInitializationContext(false);
				void vscode.window.showInformationMessage(
					`Recovered local CSM module config from existing submodules at ${path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/')}.`,
				);
				return recoveredConfig;
			}
			return this.initializeLocalModuleConfig(repoRoot);
		}

		const sortedMatches = this.sortLocalModuleConfigMatches(matches);

		if (
			sortedMatches.length === 2
			&& path.dirname(sortedMatches[0].fsPath) === path.dirname(sortedMatches[1].fsPath)
			&& path.basename(sortedMatches[0].fsPath).toLowerCase() === LOCAL_MODULE_CONFIG_FILE.toLowerCase()
			&& path.basename(sortedMatches[1].fsPath).toLowerCase() === LEGACY_LOCAL_MODULE_CONFIG_FILE.toLowerCase()
		) {
			return this.workspaceModuleService.loadConfig(repoRoot, sortedMatches[0].fsPath);
		}

		let configUri = sortedMatches[0];
		if (sortedMatches.length > 1) {
			const choice = await vscode.window.showQuickPick(
				sortedMatches.map((uri) => ({
					label: path.relative(repoRoot, uri.fsPath).replace(/\\/g, '/'),
					uri,
				})),
				{ placeHolder: 'Multiple CSM module configs were found. Select one to update.' },
			);
			if (!choice?.uri) {
				return undefined;
			}
			configUri = choice.uri;
		}

		await this.setWorkspaceInitializationContext(false);
		return this.workspaceModuleService.loadConfig(repoRoot, configUri.fsPath);
	}

	private async tryLoadSidebarLocalModuleConfig(
		workspaceFolder: vscode.WorkspaceFolder,
		repoRoot: string,
	): Promise<LocalModuleConfig | undefined> {
		const workspaceService = this.workspaceModuleService as Partial<WorkspaceModuleService>;
		if (typeof workspaceService.loadConfig !== 'function') {
			return undefined;
		}

		const matches = this.sortLocalModuleConfigMatches(await this.findLocalModuleConfigFiles(workspaceFolder));
		if (matches.length === 0) {
			return undefined;
		}

		try {
			return await workspaceService.loadConfig.call(this.workspaceModuleService, repoRoot, matches[0].fsPath);
		} catch {
			return undefined;
		}
	}

	private async initializeLocalModuleConfig(
		repoRoot: string,
		message = 'No local CSM module config was found. Initialize one for this repository?',
	): Promise<LocalModuleConfig | undefined> {
		const choice = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			`Use ${DEFAULT_LOCAL_MODULE_ROOT}/`,
			'Choose Directory',
			'Later',
		);

		if (!choice || choice === 'Later') {
			return undefined;
		}

		let rootPath = DEFAULT_LOCAL_MODULE_ROOT;
		if (choice === 'Choose Directory') {
			const input = await vscode.window.showInputBox({
				prompt: 'Enter a directory relative to the repository root for local CSM modules.',
				value: DEFAULT_LOCAL_MODULE_ROOT,
				validateInput: (value) => {
					try {
						this.workspaceModuleService.normalizeRootPath(value);
						return undefined;
					} catch (error) {
						return error instanceof Error ? error.message : 'Invalid directory.';
					}
				},
			});
			if (!input) {
				return undefined;
			}
			rootPath = this.workspaceModuleService.normalizeRootPath(input);
		}

		const recoveredConfig = await this.workspaceModuleService.recoverConfigFromExistingSubmodules(repoRoot, rootPath);
		if (recoveredConfig) {
			await this.setWorkspaceInitializationContext(false);
			void vscode.window.showInformationMessage(
				`Initialized local CSM module config from existing submodules at ${path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/')}.`,
			);
			return recoveredConfig;
		}

		const config = await this.workspaceModuleService.initializeConfig(repoRoot, rootPath);
		await this.setWorkspaceInitializationContext(false);
		void vscode.window.showInformationMessage(`Initialized local CSM module config at ${path.relative(repoRoot, config.configPath).replace(/\\/g, '/')}.`);
		return config;
	}

	private async refreshWorkspaceInitializationState(options: { prompt: boolean }): Promise<void> {
		const pending = await this.findPendingWorkspaceInitialization();
		await this.setWorkspaceInitializationContext(!!pending);

		if (!options.prompt || !pending) {
			return;
		}

		const choice = await vscode.window.showInformationMessage(
			WORKSPACE_INIT_PROMPT,
			'Initialize',
			'Later',
		);
		if (choice === 'Initialize') {
			await this.initializeWorkspaceCommand(pending.workspaceFolder);
		}
	}

	private async findPendingWorkspaceInitialization(): Promise<PendingWorkspaceInitialization | undefined> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		for (const workspaceFolder of folders) {
			const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
			if (!repoRoot) {
				continue;
			}

			const configMatches = await this.findLocalModuleConfigFiles(workspaceFolder);
			if (configMatches.length > 0) {
				continue;
			}

			if (!await this.hasLocalModuleRoot(repoRoot)) {
				continue;
			}

			if (!await this.hasLvprojFile(workspaceFolder)) {
				continue;
			}

			return { workspaceFolder, repoRoot };
		}

		return undefined;
	}

	private async findLocalModuleConfigFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
		return vscode.workspace.findFiles(
			new vscode.RelativePattern(workspaceFolder, LOCAL_MODULE_CONFIG_GLOB),
			'**/{.git,node_modules,out,dist,.vscode-test}/**',
			20,
		);
	}

	private sortLocalModuleConfigMatches(matches: vscode.Uri[]): vscode.Uri[] {
		return [...matches].sort((left, right) => {
			const leftIsYaml = path.basename(left.fsPath).toLowerCase() === LOCAL_MODULE_CONFIG_FILE.toLowerCase();
			const rightIsYaml = path.basename(right.fsPath).toLowerCase() === LOCAL_MODULE_CONFIG_FILE.toLowerCase();
			if (leftIsYaml !== rightIsYaml) {
				return leftIsYaml ? -1 : 1;
			}
			return left.fsPath.localeCompare(right.fsPath);
		});
	}

	private mapAppliedModuleKeys(config: LocalModuleConfig | undefined): string[] {
		if (!config) {
			return [];
		}

		const availableModulesByName = new Map<string, string>();
		const availableModulesBySource = new Map<string, string>();
		for (const moduleEntry of this.availableModules) {
			const moduleKey = this.getModuleKey(moduleEntry);
			availableModulesByName.set(`${moduleEntry.owner.toLowerCase()}/${moduleEntry.name.toLowerCase()}`, moduleKey);
			availableModulesBySource.set(this.normalizeModuleSource(moduleEntry.repoUrl), moduleKey);
		}

		const appliedModuleKeys = new Set<string>();
		for (const configEntry of Object.values(config.modules)) {
			const directMatch = availableModulesByName.get(`${configEntry.owner.toLowerCase()}/${configEntry.name.toLowerCase()}`);
			if (directMatch) {
				appliedModuleKeys.add(directMatch);
				continue;
			}

			const sourceMatch = availableModulesBySource.get(this.normalizeModuleSource(configEntry.source));
			if (sourceMatch) {
				appliedModuleKeys.add(sourceMatch);
			}
		}

		return [...appliedModuleKeys];
	}

	private normalizeModuleSource(source: string): string {
		return source.trim().replace(/\.git$/i, '').replace(/\/+$/g, '').toLowerCase();
	}

	private async hasLocalModuleRoot(repoRoot: string): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(path.join(repoRoot, DEFAULT_LOCAL_MODULE_ROOT)));
			return true;
		} catch {
			return false;
		}
	}

	private async hasLvprojFile(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
		const matches = await vscode.workspace.findFiles(
			new vscode.RelativePattern(workspaceFolder, LVPROJ_GLOB),
			'**/{.git,node_modules,out,dist,.vscode-test}/**',
			1,
		);
		return matches.length > 0;
	}

	private async setWorkspaceInitializationContext(canInitializeWorkspace: boolean): Promise<void> {
		if (this.treeDataProvider instanceof ModuleSidebarViewProvider) {
			this.treeDataProvider.setCanInitializeWorkspace(canInitializeWorkspace);
		}
		await vscode.commands.executeCommand('setContext', WORKSPACE_INIT_CONTEXT_KEY, canInitializeWorkspace);
	}

	private getCacheTtlMinutes(): number {
		const configuredTtl = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>(CONFIG_KEYS.cacheTtlMinutes, 60);
		if (typeof configuredTtl !== 'number' || !Number.isFinite(configuredTtl)) {
			return 60;
		}
		return Math.max(1, Math.floor(configuredTtl));
	}

	private async promptApplyMethod(moduleCount: number): Promise<ModuleApplyMethod | undefined> {
		const pick = await vscode.window.showQuickPick(
			[
				{
					label: 'submodule',
					description: 'Track each module as a Git submodule.',
					detail: `Runs git submodule add + git submodule update for ${moduleCount} selected module(s).`,
					method: 'submodule' as const,
				},
				{
					label: 'copy',
					description: 'Copy repository files without preserving .git metadata.',
					detail: `Clones then copies files into the local module directory for ${moduleCount} selected module(s).`,
					method: 'copy' as const,
				},
			],
			{ placeHolder: 'Choose how to apply the selected CSM modules.' },
		);
		return pick?.method;
	}

	private findDuplicateTargetPaths(config: LocalModuleConfig, entries: CsmModuleEntry[]): string[] {
		const seen = new Set<string>();
		const duplicates = new Set<string>();
		for (const entry of entries) {
			const targetPath = this.workspaceModuleService.getTargetRelativePath(config, entry);
			if (seen.has(targetPath)) {
				duplicates.add(targetPath);
				continue;
			}
			seen.add(targetPath);
		}
		return [...duplicates].sort((left, right) => left.localeCompare(right));
	}

	private async findOccupiedTargetPaths(
		repoRoot: string,
		config: LocalModuleConfig,
		entries: CsmModuleEntry[],
	): Promise<string[]> {
		const occupied: string[] = [];
		for (const entry of entries) {
			const targetPath = this.workspaceModuleService.getTargetRelativePath(config, entry);
			if (await this.workspaceModuleService.targetExists(repoRoot, targetPath)) {
				occupied.push(targetPath);
			}
		}
		return occupied.sort((left, right) => left.localeCompare(right));
	}
}
