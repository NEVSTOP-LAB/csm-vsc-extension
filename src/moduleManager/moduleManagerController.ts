import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthService } from './authService';
import { GitHubModuleService } from './githubModuleService';
import { ModuleCacheStore } from './cacheStore';
import { CsmModuleEntry, LocalModuleConfig, LocalModuleConfigEntry, ModuleApplyMethod } from './types';
import { ModuleTreeItem } from './moduleTreeDataProvider';
import { ModuleSidebarViewProvider } from './moduleSidebarViewProvider';
import { IModuleViewProvider, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
import { ReadmeAssetCache } from './readmeAssetCache';
import { DEFAULT_LOCAL_MODULE_ROOT, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from './workspaceModuleService';
import { COMMAND_IDS, CONFIG_KEYS, CONFIG_SECTIONS, CONTEXT_KEYS, VIEW_IDS } from './constants';
import { Logger, getLogger, wrapCommand } from './logger';
import { getApplyMethodLabel, t } from './messages';
import { buildReadmePreviewHtml, getUnavailableReadmeMarkdown, loadReadmeMarkdown, type ReadmePreviewServiceDeps } from './readmePreviewService';
import { DEFAULT_MODULE_SORT_STATE, isModuleSortField, normalizeModuleSortState, sortModules } from './sort';
import { getUserFacingErrorMessage } from './userFacingErrors';

const LOCAL_MODULE_CONFIG_GLOB = `**/{${LOCAL_MODULE_CONFIG_FILE},${LEGACY_LOCAL_MODULE_CONFIG_FILE}}`;
const WORKSPACE_INIT_CONTEXT_KEY = CONTEXT_KEYS.canInitializeWorkspace;
const SIGNED_IN_CONTEXT_KEY = CONTEXT_KEYS.signedIn;
const HAS_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.hasSelection;
const LVPROJ_GLOB = '**/*.lvproj';

function getWorkspaceInitPrompt(rootPath: string): string {
	return t('workspaceInitPrompt', { rootPath });
}

interface PendingWorkspaceInitialization {
	workspaceFolder: vscode.WorkspaceFolder;
	repoRoot: string;
}

type WebviewModuleContext = {
	moduleKey?: string;
	moduleApplied?: boolean;
	moduleSelected?: boolean;
	webviewSection?: string;
	preventDefaultContextMenuItems?: boolean;
};

type ModuleManagerAuthService = Pick<AuthService, 'getSessionSilently' | 'getSessionInteractively'>
	& Partial<Pick<AuthService, 'verifyScopes'>>;

type ModuleManagerGithubService = Pick<GitHubModuleService, 'fetchModules' | 'fetchReadme'>;

/**
 * Optional dependencies for {@link ModuleManagerController}.
 *
 * Allowing tests (and future command-handler refactors) to inject mocks of the
 * underlying services replaces the prior pattern of overwriting `private`
 * fields via `as any` (review items 2.1 / 6.1).
 */
export interface ModuleManagerControllerDeps {
	authService?: ModuleManagerAuthService;
	githubService?: ModuleManagerGithubService;
	workspaceModuleService?: WorkspaceModuleService;
	viewProvider?: IModuleViewProvider;
	logger?: Logger;
}

export class ModuleManagerController {
	private readonly logger: Logger;
	private readonly authService: ModuleManagerAuthService;
	private readonly githubService: ModuleManagerGithubService;
	private readonly cacheStore: ModuleCacheStore;
	private readonly sidebarViewProvider: ModuleSidebarViewProvider = new ModuleSidebarViewProvider({
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
		onPreviewReadme: (entry, webview) => buildReadmePreviewHtml(entry, webview, this.getReadmeServiceDeps()),
		onApplySelection: (entry) => {
			void this.applyToWorkspaceCommand(entry);
		},
		onRemoveModule: (entry) => {
			void this.removeModuleCommand(entry);
		},
		onUpdateModule: (entry) => {
			void this.updateModuleCommand(entry);
		},
		onSelectionChange: (moduleKeys) => {
			this.setSelectedModuleKeys(moduleKeys);
		},
		onSortChange: (sortState) => {
			this.updateSortState(sortState);
		},
	});
	// IModuleViewProvider abstraction (review item 2.2). Tests can swap this out.
	private treeDataProvider: IModuleViewProvider;
	private readonly readmeAssetCache: ReadmeAssetCache;
	private readonly workspaceModuleService: WorkspaceModuleService;
	private readonly readmeCache: Record<string, string>;
	private availableModules: CsmModuleEntry[] = [];
	private currentSortState: ModuleSortState = DEFAULT_MODULE_SORT_STATE;
	private readonly appliedModuleKeys = new Set<string>();
	private readonly selectedModuleKeys = new Set<string>();
	private currentToken: string | undefined;
	private lastTokenVerifiedAt = 0;
	private static readonly TOKEN_VERIFY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

	constructor(private readonly context: vscode.ExtensionContext, deps: ModuleManagerControllerDeps = {}) {
		this.logger = deps.logger ?? getLogger();
		this.authService = deps.authService ?? new AuthService(this.logger);
		this.githubService = deps.githubService ?? new GitHubModuleService(this.logger);
		this.workspaceModuleService = deps.workspaceModuleService ?? new WorkspaceModuleService();
		this.treeDataProvider = deps.viewProvider ?? this.sidebarViewProvider;
		this.cacheStore = new ModuleCacheStore(context.globalState);
		this.readmeAssetCache = new ReadmeAssetCache(context.globalStorageUri);
		this.currentSortState = this.cacheStore.getModuleSortState();
		// Pull any legacy in-memory copy from GlobalState (for backward compat),
		// but do NOT persist new entries there going forward — the filesystem
		// asset cache is the single source of truth (review item 3.5).
		this.readmeCache = this.cacheStore.getReadmeCache();
		void this.cacheStore.clearReadmeCache();
	}

	private getReadmeServiceDeps(): ReadmePreviewServiceDeps {
		return {
			readmeCache: this.readmeCache,
			readmeAssetCache: this.readmeAssetCache,
			githubService: this.githubService,
			logger: this.logger,
			ensureToken: (interactive) => this.ensureToken(interactive),
		};
	}

	public register(subscriptions: vscode.Disposable[]): void {
		subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_IDS.moduleSidebar, this.sidebarViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}));

		subscriptions.push(
			vscode.commands.registerCommand(COMMAND_IDS.login, wrapCommand(COMMAND_IDS.login, () => this.loginCommand(), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.refresh, wrapCommand(COMMAND_IDS.refresh, () => this.refreshCommand(), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.initializeWorkspace, wrapCommand(COMMAND_IDS.initializeWorkspace, () => this.initializeWorkspaceCommand(), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.openReadme, wrapCommand(COMMAND_IDS.openReadme, (entry?: CsmModuleEntry | ModuleTreeItem) => this.openReadmeCommand(entry), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.applyToWorkspace, wrapCommand(COMMAND_IDS.applyToWorkspace, (entry?: CsmModuleEntry | ModuleTreeItem) => this.applyToWorkspaceCommand(entry), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.removeModule, wrapCommand(COMMAND_IDS.removeModule, (entry?: CsmModuleEntry | ModuleTreeItem) => this.removeModuleCommand(entry), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.updateModule, wrapCommand(COMMAND_IDS.updateModule, (entry?: CsmModuleEntry | ModuleTreeItem) => this.updateModuleCommand(entry), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextApplyModule, wrapCommand(COMMAND_IDS.contextApplyModule, (context?: WebviewModuleContext) => this.contextApplyModuleCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextOpenReadme, wrapCommand(COMMAND_IDS.contextOpenReadme, (context?: WebviewModuleContext) => this.contextOpenReadmeCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextRemoveModule, wrapCommand(COMMAND_IDS.contextRemoveModule, (context?: WebviewModuleContext) => this.contextRemoveModuleCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextUpdateModule, wrapCommand(COMMAND_IDS.contextUpdateModule, (context?: WebviewModuleContext) => this.contextUpdateModuleCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextSelectModule, wrapCommand(COMMAND_IDS.contextSelectModule, (context?: WebviewModuleContext) => this.contextSelectModuleCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.contextClearModuleSelection, wrapCommand(COMMAND_IDS.contextClearModuleSelection, (context?: WebviewModuleContext) => this.contextClearModuleSelectionCommand(context), this.logger)),
			vscode.commands.registerCommand(COMMAND_IDS.setSortOrder, wrapCommand(COMMAND_IDS.setSortOrder, (field?: ModuleSortField) => this.setSortOrderCommand(field), this.logger)),
		);

		const cached = this.cacheStore.getModuleSnapshot();
		const cachedModules = cached?.modules ?? [];
		const hasCachedModules = cachedModules.length > 0;
		const cachedIncludesPrivate = cachedModules.some((module) => module.visibility === 'private');
		const initiallyVisibleModules = cachedIncludesPrivate
			? cachedModules.filter((module) => module.visibility === 'public')
			: cachedModules;
		if (initiallyVisibleModules.length > 0) {
			this.availableModules = initiallyVisibleModules;
			this.applyModuleSort();
			this.treeDataProvider.setModules(this.availableModules);
		} else {
			this.treeDataProvider.setLoading(t('loadingModules'));
		}
		if (typeof this.treeDataProvider.setSortOrder === 'function') {
			this.treeDataProvider.setSortOrder(this.currentSortState);
		}
		void this.setAuthenticationState(false);
		void this.setApplySelectionContext(false);
		const sidebarWorkspaceRefresh = this.refreshSidebarWorkspaceState();
		void sidebarWorkspaceRefresh;

		const shouldRefreshNow = !hasCachedModules
			|| cachedIncludesPrivate
			|| this.cacheStore.isModuleSnapshotExpired(cached, this.getCacheTtlMinutes());
		if (shouldRefreshNow) {
			void this.loadModules({
				interactiveAuth: false,
				showSuccessMessage: false,
				showErrorMessage: false,
				preserveVisibleModules: initiallyVisibleModules.length > 0,
			});
		} else {
			void sidebarWorkspaceRefresh.then(() => this.refreshModulesForSignedInUsers());
		}

		void this.refreshWorkspaceInitializationState({ prompt: true });
	}

	public async applyToWorkspaceCommand(entry?: CsmModuleEntry | ModuleTreeItem, useOnlyEntry = false): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		const selectedEntries = useOnlyEntry
			? (resolvedEntry ? [resolvedEntry] : [])
			: this.getSelectedModules(resolvedEntry);
		if (selectedEntries.length === 0) {
			void vscode.window.showWarningMessage(t('selectModuleToApply'));
			return;
		}

		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeApply'));
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}

		let authToken = await this.ensureToken(false);
		if (!authToken && selectedEntries.some((moduleEntry) => moduleEntry.visibility === 'private')) {
			authToken = await this.ensureToken(true);
			if (!authToken) {
				void vscode.window.showWarningMessage(t('signInRequiredForPrivate'));
				return;
			}
		}

		const initialConfig = await this.resolveLocalModuleConfig(workspaceFolder, repoRoot);
		if (!initialConfig) {
			return;
		}
		let config: LocalModuleConfig = initialConfig;
		await this.refreshWorkspaceInitializationState({ prompt: false });

		const applyMethod = await this.promptApplyMethod(selectedEntries.length);
		if (!applyMethod) {
			return;
		}

		const duplicateTargets = this.findDuplicateTargetPaths(config, selectedEntries);
		if (duplicateTargets.length > 0) {
			void vscode.window.showErrorMessage(t('duplicateTargetPaths', { paths: duplicateTargets.join(', ') }));
			return;
		}

		const occupiedTargets = await this.findOccupiedTargetPaths(repoRoot, config, selectedEntries);
		if (occupiedTargets.length > 0) {
			const prefix = applyMethod === 'copy' ? t('copyTargetExists') : t('targetPathExists');
			void vscode.window.showWarningMessage(`${prefix}: ${occupiedTargets.join(', ')}`);
			return;
		}
		const applyMethodLabel = getApplyMethodLabel(applyMethod);

		const confirmation = await vscode.window.showWarningMessage(
			t('applyConfirmation', {
				count: selectedEntries.length,
				repository: path.basename(repoRoot),
				method: applyMethodLabel,
				root: config.root,
			}),
			{ modal: true },
			t('applyAction'),
		);
		if (confirmation !== t('applyAction')) {
			return;
		}

		let appliedCount = 0;
		const writeConfigSafely = async (latest: LocalModuleConfig): Promise<void> => {
			await this.workspaceModuleService.writeConfig(latest);
		};

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressApplying', { count: selectedEntries.length, method: applyMethodLabel }),
					cancellable: false,
				},
				async (progress) => {
					if (applyMethod === 'copy') {
						// Copy mode is independent per-module; run in parallel and collect results,
						// then atomically merge into config in one write (review item 2.4).
						const settled = await Promise.allSettled(
							selectedEntries.map(async (moduleEntry) => {
								const applied = await this.workspaceModuleService.applyModule(
									repoRoot,
									config,
									moduleEntry,
									applyMethod,
									authToken,
								);
								progress.report({
									increment: 100 / selectedEntries.length,
									message: `${moduleEntry.owner}/${moduleEntry.name}`,
								});
								return applied;
							}),
						);
						const successes: LocalModuleConfigEntry[] = [];
						const failures: string[] = [];
						for (let i = 0; i < settled.length; i += 1) {
							const result = settled[i];
							const moduleEntry = selectedEntries[i];
							if (result.status === 'fulfilled') {
								successes.push(result.value);
							} else {
								failures.push(`${moduleEntry.owner}/${moduleEntry.name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
							}
						}
						for (const applied of successes) {
							config = this.workspaceModuleService.withAppliedModule(config, applied);
						}
						appliedCount = successes.length;
						if (successes.length > 0) {
							await writeConfigSafely(config);
						}
						if (failures.length > 0) {
							throw new Error(failures.join('; '));
						}
					} else {
						// Submodule mode must run serially because git submodule add can race.
						for (const moduleEntry of selectedEntries) {
							const applied = await this.workspaceModuleService.applyModule(
								repoRoot,
								config,
								moduleEntry,
								applyMethod,
								authToken,
							);
							config = this.workspaceModuleService.withAppliedModule(config, applied);
							await writeConfigSafely(config);
							appliedCount += 1;
							progress.report({
								increment: 100 / selectedEntries.length,
								message: `${moduleEntry.owner}/${moduleEntry.name}`,
							});
						}
					}
				},
			);
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'apply');
			const prefix = appliedCount > 0
				? t('applyPartialFailure', { appliedCount, selectedCount: selectedEntries.length })
				: t('applyFailed');
			this.logger.error(`${prefix}: ${message}`);
			void vscode.window.showErrorMessage(`${prefix}: ${message}`);
			return;
		}

		void vscode.window.showInformationMessage(
			t('applySuccess', {
				count: selectedEntries.length,
				method: applyMethodLabel,
				configPath: path.relative(repoRoot, config.configPath).replace(/\\/g, '/'),
			}),
		);
		await this.refreshSidebarWorkspaceState();
	}

	public async removeModuleCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeRemove'));
			return;
		}
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, repoRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}
		const target = this.findAppliedEntryFor(config, resolvedEntry);
		if (!target) {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}
		const targetLabel = `${target.owner}/${target.name}`;
		const confirmation = await vscode.window.showWarningMessage(
			t('removeConfirmation', {
				module: targetLabel,
				repository: path.basename(repoRoot),
				targetPath: target.path,
			}),
			{ modal: true },
			t('removeAction'),
		);
		if (confirmation !== t('removeAction')) {
			return;
		}
		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressRemoving', { module: targetLabel }),
					cancellable: false,
				},
				async () => {
					await this.workspaceModuleService.removeModule(repoRoot, target);
					config = this.workspaceModuleService.withoutModule(config!, target.key);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'remove');
			this.logger.error(`Failed to remove module ${target.owner}/${target.name}: ${message}`);
			void vscode.window.showErrorMessage(t('removeFailed', { message }));
			return;
		}
		void vscode.window.showInformationMessage(t('removeSuccess', { module: targetLabel }));
		await this.refreshSidebarWorkspaceState();
	}

	public async updateModuleCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeUpdate'));
			return;
		}
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, repoRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}
		const target = this.findAppliedEntryFor(config, resolvedEntry);
		if (!target) {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}
		const moduleEntry = this.findAvailableModule(target.owner, target.name) ?? this.synthesizeModuleEntry(target);
		const authToken = await this.ensureToken(moduleEntry.visibility === 'private');
		const targetLabel = `${target.owner}/${target.name}`;
		try {
			let updated: LocalModuleConfigEntry | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressUpdating', { module: targetLabel }),
					cancellable: false,
				},
				async () => {
					updated = await this.workspaceModuleService.updateModule(repoRoot, target, moduleEntry, authToken);
					config = this.workspaceModuleService.withAppliedModule(config!, updated);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
			void vscode.window.showInformationMessage(t('updateSuccess', {
				module: targetLabel,
				ref: updated?.ref ?? t('latestRef'),
			}));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'update');
			this.logger.error(`Failed to update module ${target.owner}/${target.name}: ${message}`);
			void vscode.window.showErrorMessage(t('updateFailed', { message }));
			return;
		}
		await this.refreshSidebarWorkspaceState();
	}

	public setSortOrderCommand(field?: ModuleSortField): void {
		const nextField = isModuleSortField(field) ? field : DEFAULT_MODULE_SORT_STATE.field;
		this.updateSortState({ field: nextField });
	}

	private applyModuleSort(): void {
		this.availableModules = sortModules(this.availableModules, this.currentSortState, {
			appliedModuleKeys: this.appliedModuleKeys,
		});
	}

	private updateSortState(nextSortState: Partial<ModuleSortState>, persist = true): void {
		this.currentSortState = normalizeModuleSortState({
			...this.currentSortState,
			...nextSortState,
		});
		if (persist) {
			void this.cacheStore.setModuleSortState(this.currentSortState);
		}
		this.applyModuleSort();
		if (typeof this.treeDataProvider.setSortOrder === 'function') {
			this.treeDataProvider.setSortOrder(this.currentSortState);
		}
		this.treeDataProvider.setModules(this.availableModules);
	}

	private findAppliedEntryFor(config: LocalModuleConfig, entry: CsmModuleEntry | undefined): LocalModuleConfigEntry | undefined {
		const candidates = Object.values(config.modules);
		if (!entry) {
			return candidates.length === 1 ? candidates[0] : undefined;
		}
		return candidates.find((m) => m.owner === entry.owner && m.name === entry.name);
	}

	private findAvailableModule(owner: string, name: string): CsmModuleEntry | undefined {
		return this.availableModules.find((m) => m.owner === owner && m.name === name);
	}

	private synthesizeModuleEntry(entry: LocalModuleConfigEntry): CsmModuleEntry {
		return {
			id: 0,
			owner: entry.owner,
			name: entry.name,
			description: '',
			topics: [],
			visibility: 'public',
			defaultBranch: entry.branch || 'main',
			repoUrl: entry.source,
		};
	}

	public async initializeWorkspaceCommand(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
		const targetFolder = workspaceFolder ?? await this.resolveWorkspaceFolder();
		if (!targetFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeInitialize'));
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(targetFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}

		const existingConfigs = await this.findLocalModuleConfigFiles(targetFolder);
		if (existingConfigs.length > 0) {
			await this.setWorkspaceInitializationContext(false);
			const existingConfig = await this.resolveLocalModuleConfig(targetFolder, repoRoot);
			if (existingConfig) {
				void vscode.window.showInformationMessage(
					t('configAlreadyExists', { configPath: path.relative(repoRoot, existingConfig.configPath).replace(/\\/g, '/') }),
				);
			}
			await this.refreshSidebarWorkspaceState();
			return;
		}

		const defaultRoot = this.getConfiguredDefaultModuleRoot();
		const recoveredConfig = await this.workspaceModuleService.recoverConfigFromExistingSubmodules(repoRoot, defaultRoot);
		if (recoveredConfig) {
			void vscode.window.showInformationMessage(
				t('configInitializedFromSubmodules', { configPath: path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/') }),
			);
			await this.refreshSidebarWorkspaceState();
			await this.refreshWorkspaceInitializationState({ prompt: false });
			return;
		}

		await this.initializeLocalModuleConfig(repoRoot, getWorkspaceInitPrompt(defaultRoot));
		await this.refreshSidebarWorkspaceState();
		await this.refreshWorkspaceInitializationState({ prompt: false });
	}

	public async loginCommand(): Promise<void> {
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			void vscode.window.showWarningMessage(t('signInCancelled'));
			return;
		}
		this.currentToken = session.accessToken;
		this.lastTokenVerifiedAt = Date.now();
		await this.setAuthenticationState(true);
		void vscode.window.showInformationMessage(t('signedInAs', { account: session.account.label }));
		// Best-effort scope verification, logged when missing scopes are detected (7.5).
		if (typeof this.authService.verifyScopes === 'function') {
			void this.authService.verifyScopes(session.accessToken);
		}
		await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
	}

	private async ensureToken(interactive: boolean): Promise<string | undefined> {
		if (this.currentToken && this.isCachedTokenFresh()) {
			return this.currentToken;
		}
		// Re-validate cached token via a fresh silent session (which the editor will
		// invalidate if the underlying credentials were revoked).
		const silentSession = await this.authService.getSessionSilently();
		if (silentSession) {
			this.currentToken = silentSession.accessToken;
			this.lastTokenVerifiedAt = Date.now();
			await this.setAuthenticationState(true);
			return this.currentToken;
		}
		this.currentToken = undefined;
		this.lastTokenVerifiedAt = 0;
		await this.setAuthenticationState(false);
		if (!interactive) {
			return undefined;
		}
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			return undefined;
		}
		this.currentToken = session.accessToken;
		this.lastTokenVerifiedAt = Date.now();
		await this.setAuthenticationState(true);
		return this.currentToken;
	}

	private isCachedTokenFresh(): boolean {
		return this.lastTokenVerifiedAt > 0
			&& Date.now() - this.lastTokenVerifiedAt < ModuleManagerController.TOKEN_VERIFY_INTERVAL_MS;
	}

	private async refreshModulesForSignedInUsers(): Promise<void> {
		if (this.availableModules.some((module) => module.visibility === 'private')) {
			return;
		}
		const token = await this.ensureToken(false);
		if (!token) {
			return;
		}
		await this.loadModules({
			interactiveAuth: false,
			showSuccessMessage: false,
			showErrorMessage: false,
			preserveVisibleModules: this.availableModules.length > 0,
		});
	}

	public async refreshCommand(): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			t('refreshConfirmation'),
			{ modal: true },
			t('refreshAction'),
		);
		if (choice !== t('refreshAction')) {
			return;
		}
		await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
	}

	private async loadModules(options: {
		interactiveAuth: boolean;
		showSuccessMessage: boolean;
		showErrorMessage: boolean;
		preserveVisibleModules?: boolean;
	}): Promise<void> {
		const token = await this.ensureToken(options.interactiveAuth);
		if (typeof this.treeDataProvider.setOfflineMode === 'function') {
			this.treeDataProvider.setOfflineMode(false);
		}

		if (!options.preserveVisibleModules) {
			this.treeDataProvider.setLoading(t('refreshingModules'));
		}
		try {
			const previousEtag = this.cacheStore.getModuleEtag();
			const fetchResult = await this.githubService.fetchModules(token, { etag: previousEtag });
			if (fetchResult.notModified) {
				this.logger.info('Module list unchanged since last fetch (304 Not Modified).');
				this.applyModuleSort();
				this.treeDataProvider.setModules(this.availableModules);
				await this.refreshSidebarWorkspaceState();
				// Touch lastRefreshAt so TTL window resets even when we got 304.
				if (this.availableModules.length > 0) {
					await this.cacheStore.setModuleSnapshot(this.availableModules);
				}
				if (fetchResult.etag) {
					await this.cacheStore.setModuleEtag(fetchResult.etag);
				}
				if (options.showSuccessMessage) {
					void vscode.window.showInformationMessage(t('modulesUpToDate'));
				}
				return;
			}
			const modules = fetchResult.modules;
			this.availableModules = modules;
			this.applyModuleSort();
			this.setSelectedModuleKeys([...this.selectedModuleKeys]);
			// Parallelized README prefetch with bounded concurrency to avoid blocking on large lists.
			const refreshedReadme = await this.fetchReadmesParallel(modules, token, 5);
			Object.assign(this.readmeCache, refreshedReadme);
			await this.cacheStore.setModuleSnapshot(modules);
			// README content is persisted via the filesystem asset cache only (3.5).
			if (fetchResult.etag) {
				await this.cacheStore.setModuleEtag(fetchResult.etag);
			}
			this.treeDataProvider.setModules(this.availableModules);
			await this.refreshSidebarWorkspaceState();
			if (options.showSuccessMessage) {
				void vscode.window.showInformationMessage(t('modulesRefreshed', { count: modules.length }));
			}
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'refresh');
			this.logger.error(`Failed to refresh modules: ${message}`);
			this.treeDataProvider.setError(message);
			if (options.showErrorMessage) {
				void vscode.window.showErrorMessage(t('refreshFailed', { message }));
			}
		}
	}

	/**
	 * Fetch READMEs in parallel with a bounded concurrency limit to keep
	 * GitHub API usage reasonable while avoiding O(N) serial latency.
	 */
	private async fetchReadmesParallel(
		modules: CsmModuleEntry[],
		token: string | undefined,
		concurrency: number,
	): Promise<Record<string, string>> {
		const refreshed: Record<string, string> = {};
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < modules.length) {
				const index = cursor;
				cursor += 1;
				const moduleEntry = modules[index];
				if (!moduleEntry) {
					continue;
				}
				const key = `${moduleEntry.owner}/${moduleEntry.name}`;
				try {
					const markdown = await this.githubService.fetchReadme(moduleEntry.owner, moduleEntry.name, token);
					refreshed[key] = markdown;
					await this.readmeAssetCache.saveMarkdown(moduleEntry, markdown);
				} catch (error) {
					this.logger.warn(`Failed to fetch README for ${moduleEntry.owner}/${moduleEntry.name}: ${error instanceof Error ? error.message : String(error)}`);
					refreshed[key] = '';
				}
			}
		};
		const workerCount = Math.max(1, Math.min(concurrency, modules.length));
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
		return refreshed;
	}

	public async openReadmeCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		if (!resolvedEntry) {
			return;
		}
		const readme = await loadReadmeMarkdown(resolvedEntry, { warnOnMissingSession: true }, this.getReadmeServiceDeps());
		if (typeof readme === 'undefined') {
			return;
		}

		const markdownContent = readme || getUnavailableReadmeMarkdown();
		const panel = vscode.window.createWebviewPanel(
			'csmModulesReadme',
			t('readmePanelTitle', { name: resolvedEntry.name }),
			vscode.ViewColumn.Active,
			{
				enableFindWidget: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.readmeAssetCache.rootUri],
			},
		);
		panel.webview.html = await this.readmeAssetCache.renderMarkdown(resolvedEntry, markdownContent, panel.webview);
	}

	public async contextApplyModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.applyToWorkspaceCommand(entry, true);
	}

	public async contextOpenReadmeCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.openReadmeCommand(entry);
	}

	public async contextRemoveModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.removeModuleCommand(entry);
	}

	public async contextUpdateModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.updateModuleCommand(entry);
	}

	public contextSelectModuleCommand(context?: WebviewModuleContext): void {
		this.setContextModuleSelection(context, true);
	}

	public contextClearModuleSelectionCommand(context?: WebviewModuleContext): void {
		this.setContextModuleSelection(context, false);
	}

	private resolveContextModuleEntry(context?: WebviewModuleContext): CsmModuleEntry | undefined {
		if (!context?.moduleKey) {
			return undefined;
		}
		return this.findAvailableModuleByKey(context.moduleKey);
	}

	private setContextModuleSelection(context: WebviewModuleContext | undefined, selected: boolean): void {
		if (!context?.moduleKey) {
			return;
		}
		const nextSelection = new Set(this.selectedModuleKeys);
		if (selected) {
			nextSelection.add(context.moduleKey);
		} else {
			nextSelection.delete(context.moduleKey);
		}
		this.setSelectedModuleKeys([...nextSelection]);
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
		if (typeof this.treeDataProvider.setSelection === 'function') {
			this.treeDataProvider.setSelection([...this.selectedModuleKeys]);
		}
		void this.setApplySelectionContext(this.selectedModuleKeys.size > 0);
	}

	private async setAuthenticationState(signedIn: boolean): Promise<void> {
		this.treeDataProvider.setAuthenticated(signedIn);
		await vscode.commands.executeCommand('setContext', SIGNED_IN_CONTEXT_KEY, signedIn);
	}

	private async setApplySelectionContext(hasSelection: boolean): Promise<void> {
		await vscode.commands.executeCommand('setContext', HAS_SELECTION_CONTEXT_KEY, hasSelection);
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

	private findAvailableModuleByKey(moduleKey: string): CsmModuleEntry | undefined {
		return this.availableModules.find((entry) => this.getModuleKey(entry) === moduleKey);
	}

	private getModuleKey(entry: CsmModuleEntry): string {
		return ModuleSidebarViewProvider.getModuleKey(entry);
	}

	private async refreshSidebarWorkspaceState(): Promise<void> {
		const setContext = (context: SidebarWorkspaceContext): void => {
			this.appliedModuleKeys.clear();
			for (const moduleKey of context.appliedModuleKeys) {
				this.appliedModuleKeys.add(moduleKey);
			}
			if (this.currentSortState.field === 'applied') {
				this.applyModuleSort();
				this.treeDataProvider.setModules(this.availableModules);
			}
			if (typeof this.treeDataProvider.setWorkspaceContext === 'function') {
				this.treeDataProvider.setWorkspaceContext(context);
			}
		};
		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			setContext({ appliedModuleKeys: [] });
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			setContext({
				workspaceLabel: workspaceFolder.name,
				appliedModuleKeys: [],
			});
			return;
		}

		const config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, repoRoot);
		setContext({
			workspaceLabel: path.basename(repoRoot) || workspaceFolder.name,
			moduleRoot: config?.root,
			appliedModuleKeys: this.mapAppliedModuleKeys(config),
			staleModuleKeys: await this.computeStaleModuleKeys(repoRoot, config),
		});
	}

	/**
	 * Identify modules whose configured filesystem path is missing on disk
	 * (e.g. someone deleted the directory after applying the module). The UI
	 * surfaces these as "stale" so users know their config drifted (review item 7.6).
	 */
	private async computeStaleModuleKeys(repoRoot: string, config: LocalModuleConfig | undefined): Promise<string[]> {
		if (!config) {
			return [];
		}
		const stale: string[] = [];
		await Promise.all(Object.values(config.modules).map(async (module) => {
			const target = path.resolve(repoRoot, module.path);
			try {
				await fs.access(target);
			} catch {
				stale.push(`${module.owner}/${module.name}`);
			}
		}));
		return stale;
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
			{ placeHolder: t('selectRepositoryPlaceholder') },
		);
		return pick?.folder;
	}

	private async resolveLocalModuleConfig(
		workspaceFolder: vscode.WorkspaceFolder,
		repoRoot: string,
	): Promise<LocalModuleConfig | undefined> {
		const matches = await this.findLocalModuleConfigFiles(workspaceFolder);

		if (matches.length === 0) {
			const recoveredConfig = await this.workspaceModuleService.recoverConfigFromExistingSubmodules(repoRoot, this.getConfiguredDefaultModuleRoot());
			if (recoveredConfig) {
				await this.setWorkspaceInitializationContext(false);
				void vscode.window.showInformationMessage(
					t('configRecoveredFromSubmodules', { configPath: path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/') }),
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
				{ placeHolder: t('selectConfigToUpdatePlaceholder') },
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
		const matches = this.sortLocalModuleConfigMatches(await this.findLocalModuleConfigFiles(workspaceFolder));
		if (matches.length === 0) {
			return undefined;
		}

		try {
			return await this.workspaceModuleService.loadConfig(repoRoot, matches[0].fsPath);
		} catch (error) {
			this.logger.warn(`Failed to load local module config at ${matches[0].fsPath}: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private async initializeLocalModuleConfig(
		repoRoot: string,
		message = t('noLocalConfigFoundPrompt'),
	): Promise<LocalModuleConfig | undefined> {
		const defaultRoot = this.getConfiguredDefaultModuleRoot();
		const useDefaultRootLabel = t('useDefaultRoot', { root: defaultRoot });
		const chooseDirectoryLabel = t('chooseDirectory');
		const laterLabel = t('later');
		const choice = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			useDefaultRootLabel,
			chooseDirectoryLabel,
			laterLabel,
		);

		if (!choice || choice === laterLabel) {
			return undefined;
		}

		let rootPath = defaultRoot;
		if (choice === chooseDirectoryLabel) {
			const input = await vscode.window.showInputBox({
				prompt: t('directoryPrompt'),
				value: defaultRoot,
				validateInput: (value) => {
					try {
						this.workspaceModuleService.normalizeRootPath(value);
						return undefined;
					} catch (error) {
						return error instanceof Error ? error.message : t('invalidDirectory');
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
				t('configInitializedFromSubmodules', { configPath: path.relative(repoRoot, recoveredConfig.configPath).replace(/\\/g, '/') }),
			);
			return recoveredConfig;
		}

		const config = await this.workspaceModuleService.initializeConfig(repoRoot, rootPath);
		await this.setWorkspaceInitializationContext(false);
		void vscode.window.showInformationMessage(t('configInitializedAt', {
			configPath: path.relative(repoRoot, config.configPath).replace(/\\/g, '/'),
		}));
		return config;
	}

	private async refreshWorkspaceInitializationState(options: { prompt: boolean }): Promise<void> {
		const pending = await this.findPendingWorkspaceInitialization();
		await this.setWorkspaceInitializationContext(!!pending);

		if (!options.prompt || !pending) {
			return;
		}

		const choice = await vscode.window.showInformationMessage(
			getWorkspaceInitPrompt(this.getConfiguredDefaultModuleRoot()),
			t('initializeAction'),
			t('later'),
		);
		if (choice === t('initializeAction')) {
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

			if (!await this.hasLocalModuleRoot(repoRoot, this.getConfiguredDefaultModuleRoot())) {
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

	private async hasLocalModuleRoot(repoRoot: string, rootRelativePath: string): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(path.join(repoRoot, ...rootRelativePath.split('/'))));
			return true;
		} catch {
			return false;
		}
	}

	private getConfiguredDefaultModuleRoot(): string {
		const configuredRoot = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager).get<string>(
			CONFIG_KEYS.defaultModuleRoot,
			DEFAULT_LOCAL_MODULE_ROOT,
		);
		if (typeof configuredRoot !== 'string') {
			return DEFAULT_LOCAL_MODULE_ROOT;
		}
		try {
			return this.workspaceModuleService.normalizeRootPath(configuredRoot);
		} catch (error) {
			this.logger.warn(
				`Invalid csmModules.defaultModuleRoot setting (${configuredRoot}): ${error instanceof Error ? error.message : String(error)}`,
			);
			return DEFAULT_LOCAL_MODULE_ROOT;
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
		if (typeof this.treeDataProvider.setCanInitializeWorkspace === 'function') {
			this.treeDataProvider.setCanInitializeWorkspace(canInitializeWorkspace);
		}
		await vscode.commands.executeCommand('setContext', WORKSPACE_INIT_CONTEXT_KEY, canInitializeWorkspace);
	}

	private getCacheTtlMinutes(): number {
		const configuredTtl = vscode.workspace.getConfiguration(CONFIG_SECTIONS.cache).get<number>(CONFIG_KEYS.cacheTtlMinutes, 60);
		if (typeof configuredTtl !== 'number' || !Number.isFinite(configuredTtl)) {
			return 60;
		}
		return Math.max(1, Math.floor(configuredTtl));
	}

	private async promptApplyMethod(moduleCount: number): Promise<ModuleApplyMethod | undefined> {
		const pick = await vscode.window.showQuickPick(
			[
				{
					label: t('applyMethodSubmoduleLabel'),
					description: t('applyMethodSubmoduleDescription'),
					detail: t('applyMethodSubmoduleDetail', { count: moduleCount }),
					method: 'submodule' as const,
				},
				{
					label: t('applyMethodCopyLabel'),
					description: t('applyMethodCopyDescription'),
					detail: t('applyMethodCopyDetail', { count: moduleCount }),
					method: 'copy' as const,
				},
			],
			{ placeHolder: t('chooseApplyMethodPlaceholder') },
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
