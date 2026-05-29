import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthService } from './authService';
import { GitHubModuleService, mapRepoToModuleEntry } from './githubModuleService';
import { ModuleCacheStore } from './cacheStore';
import { CopyModuleUpdatePreview, CsmModuleEntry, GitHubRepoSummary, LocalManagedModuleEntry, LocalModuleConfig, LocalModuleConfigEntry, LocalUnmanagedFolderEntry, ModuleApplyMethod, ModuleAuthSnapshot, ModuleCacheSnapshot, ModuleUpdateResult } from './types';
import { ModuleTreeItem } from './moduleTreeDataProvider';
import { ModuleSidebarViewProvider } from './moduleSidebarViewProvider';
import { IModuleViewProvider, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
import { ReadmeAssetCache } from './readmeAssetCache';
import { DEFAULT_LOCAL_MODULE_ROOT, GitIdentity, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from './workspaceModuleService';
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
const HAS_APPLIED_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.selectionHasApplied;
const HAS_UNAPPLIED_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.selectionHasUnapplied;
const LVPROJ_GLOB = '**/*.lvproj';
const DEFAULT_SHARED_MODULE_TOPICS = ['labview-csm', 'csm-modsets'] as const;

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

type ApplyMethodQuickPickItem = vscode.QuickPickItem & {
	method?: ModuleApplyMethod;
};

type RepositoryVisibility = 'private' | 'public';

type RepositoryVisibilityQuickPickItem = vscode.QuickPickItem & {
	visibility: RepositoryVisibility;
};

type ModuleManagerAuthService = Pick<AuthService, 'getSessionSilently' | 'getSessionInteractively'>
	& Partial<Pick<AuthService, 'signOut' | 'verifyScopes'>>;

type ModuleManagerGithubService = Pick<GitHubModuleService, 'fetchModules' | 'fetchReadme'>
	& Partial<Pick<GitHubModuleService, 'isRepositoryStarred' | 'setRepositoryStarred' | 'createRepository'>>;

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
		onToggleStar: (entry) => {
			void this.toggleStarCommand(entry);
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
		onToggleLocalModuleLock: (entry) => {
			void this.toggleLocalModuleLockCommand(entry);
		},
		onSwitchLocalModuleMethod: (entry) => {
			void this.switchLocalModuleMethodCommand(entry);
		},
		onCreateLocalRepository: (entry) => {
			void this.createLocalFolderRepositoryCommand(entry);
		},
		onLinkLocalRepository: (entry) => {
			void this.linkLocalFolderRepositoryCommand(entry);
		},
		onSelectionChange: (moduleKeys) => {
			this.setSelectedModuleKeys(moduleKeys);
		},
		onSortChange: (sortState) => {
			this.updateSortState(sortState);
		},
	}, {
		getLocalResourceRoots: () => [this.readmeAssetCache.rootUri],
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
	private currentAccountId: string | undefined;
	private currentAccountLabel: string | undefined;
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
			vscode.commands.registerCommand(COMMAND_IDS.logout, wrapCommand(COMMAND_IDS.logout, () => this.logoutCommand(), this.logger)),
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
		this.restoreCachedAuthentication(this.cacheStore.getAuthSnapshot());
		if (typeof this.treeDataProvider.setOfflineMode === 'function') {
			this.treeDataProvider.setOfflineMode(true);
		}
		this.updateLastRefreshDescription(cached);
		if (cached) {
			this.applyCachedModules(cached);
		} else {
			this.availableModules = [];
			this.setSelectedModuleKeys([]);
			this.treeDataProvider.setError(t('noCachedModulesBody'));
		}
		if (typeof this.treeDataProvider.setSortOrder === 'function') {
			this.treeDataProvider.setSortOrder(this.currentSortState);
		}
		void this.setSelectionContexts();
		const sidebarWorkspaceRefresh = this.refreshSidebarWorkspaceState();
		void sidebarWorkspaceRefresh;

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
		const applyRoot = repoRoot ?? workspaceFolder.uri.fsPath;

		let authToken = await this.ensureToken(false);
		if (!authToken && selectedEntries.some((moduleEntry) => moduleEntry.visibility === 'private')) {
			authToken = await this.ensureToken(true);
			if (!authToken) {
				void vscode.window.showWarningMessage(t('signInRequiredForPrivate'));
				return;
			}
		}

		const initialConfig = await this.resolveLocalModuleConfig(workspaceFolder, applyRoot);
		if (!initialConfig) {
			return;
		}
		let config: LocalModuleConfig = initialConfig;
		await this.refreshWorkspaceInitializationState({ prompt: false });

		const applyMethod = await this.promptApplyMethod(selectedEntries.length, { gitAvailable: !!repoRoot });
		if (!applyMethod) {
			return;
		}

		const duplicateTargets = this.findDuplicateTargetPaths(config, selectedEntries);
		if (duplicateTargets.length > 0) {
			void vscode.window.showErrorMessage(t('duplicateTargetPaths', { paths: duplicateTargets.join(', ') }));
			return;
		}

		const occupiedTargets = await this.findOccupiedTargetPaths(applyRoot, config, selectedEntries);
		if (occupiedTargets.length > 0) {
			const prefix = applyMethod === 'copy' ? t('copyTargetExists') : t('targetPathExists');
			void vscode.window.showWarningMessage(`${prefix}: ${occupiedTargets.join(', ')}`);
			return;
		}
		const applyMethodLabel = getApplyMethodLabel(applyMethod);

		const confirmation = await vscode.window.showWarningMessage(
			t('applyConfirmation', {
				count: selectedEntries.length,
				repository: path.basename(applyRoot),
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
		const appliedEntriesForAutoStar: CsmModuleEntry[] = [];
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
									applyRoot,
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
								appliedEntriesForAutoStar.push(moduleEntry);
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
								applyRoot,
								config,
								moduleEntry,
								applyMethod,
								authToken,
							);
							config = this.workspaceModuleService.withAppliedModule(config, applied);
							await writeConfigSafely(config);
							appliedCount += 1;
							appliedEntriesForAutoStar.push(moduleEntry);
							progress.report({
								increment: 100 / selectedEntries.length,
								message: `${moduleEntry.owner}/${moduleEntry.name}`,
							});
						}
					}
				},
			);
		} catch (error) {
			await this.autoStarImportedModules(appliedEntriesForAutoStar);
			const message = getUserFacingErrorMessage(error, 'apply');
			const prefix = appliedCount > 0
				? t('applyPartialFailure', { appliedCount, selectedCount: selectedEntries.length })
				: t('applyFailed');
			this.logger.error(`${prefix}: ${message}`);
			void vscode.window.showErrorMessage(`${prefix}: ${message}`);
			return;
		}

		await this.autoStarImportedModules(appliedEntriesForAutoStar);

		void vscode.window.showInformationMessage(
			t('applySuccess', {
				count: selectedEntries.length,
				method: applyMethodLabel,
				configPath: path.relative(applyRoot, config.configPath).replace(/\\/g, '/'),
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
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}
		let currentConfig = config;
		const targets = this.getRemovalTargets(currentConfig, resolvedEntry);
		if (targets.length === 0) {
			void vscode.window.showWarningMessage(resolvedEntry ? t('selectedModuleNotApplied') : t('selectModuleToRemove'));
			return;
		}
		if (targets.some((removable) => removable.method === 'submodule') && !repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}
		const target = targets[0];
		const targetLabel = `${target.owner}/${target.name}`;
		const repository = path.basename(workspaceRoot) || workspaceFolder.name;
		const confirmationMessage = targets.length === 1
			? t('removeConfirmation', {
				module: targetLabel,
				repository,
				targetPath: target.path,
			})
			: t('removeSelectionConfirmation', {
				count: targets.length,
				repository,
			});
		const confirmation = await vscode.window.showWarningMessage(
			confirmationMessage,
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
					title: targets.length === 1
						? t('progressRemoving', { module: targetLabel })
						: t('progressRemovingSelection', { count: targets.length }),
					cancellable: false,
				},
				async (progress) => {
					for (const removable of targets) {
						await this.workspaceModuleService.removeModule(workspaceRoot, removable, repoRoot);
						currentConfig = this.workspaceModuleService.withoutModule(currentConfig, removable.key);
						await this.workspaceModuleService.writeConfig(currentConfig);
						progress.report({
							increment: 100 / targets.length,
							message: `${removable.owner}/${removable.name}`,
						});
					}
				},
			);
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'remove');
			if (targets.length === 1) {
				this.logger.error(`Failed to remove module ${target.owner}/${target.name}: ${message}`);
			} else {
				this.logger.error(`Failed to remove ${targets.length} selected modules: ${message}`);
			}
			void vscode.window.showErrorMessage(t('removeFailed', { message }));
			return;
		}
		void vscode.window.showInformationMessage(
			targets.length === 1
				? t('removeSuccess', { module: targetLabel })
				: t('removeSelectionSuccess', { count: targets.length }),
		);
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
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}
		const target = this.findAppliedEntryFor(config, resolvedEntry);
		if (!target) {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}
		if (target.method === 'submodule' && !repoRoot) {
			void vscode.window.showErrorMessage(t('workspaceNotGitRepo'));
			return;
		}
		const moduleEntry = this.findAvailableModule(target.owner, target.name) ?? this.synthesizeModuleEntry(target);
		const authToken = await this.ensureToken(moduleEntry.visibility === 'private');
		const targetLabel = `${target.owner}/${target.name}`;
		try {
			let copyUpdatePreview: CopyModuleUpdatePreview | undefined;
			if (target.method === 'copy') {
				copyUpdatePreview = await this.workspaceModuleService.previewCopyModuleUpdate(workspaceRoot, target, moduleEntry, authToken);
				if (!copyUpdatePreview.needsUpdate) {
					void vscode.window.showInformationMessage(t('moduleAlreadyUpToDate', {
						module: targetLabel,
						branch: copyUpdatePreview.branch,
						ref: this.formatShortRef(copyUpdatePreview.latestRef),
					}));
					return;
				}

				const confirmation = await vscode.window.showWarningMessage(
					copyUpdatePreview.backupDirectory
						? t('copyUpdateConfirmation', {
							module: targetLabel,
							branch: copyUpdatePreview.branch,
							currentRef: this.formatShortRef(copyUpdatePreview.currentRef),
							latestRef: this.formatShortRef(copyUpdatePreview.latestRef),
							backupDirectory: copyUpdatePreview.backupDirectory,
						})
						: t('copyUpdateConfirmationWithoutBackup', {
							module: targetLabel,
							branch: copyUpdatePreview.branch,
							currentRef: this.formatShortRef(copyUpdatePreview.currentRef),
							latestRef: this.formatShortRef(copyUpdatePreview.latestRef),
						}),
					{ modal: true },
					t('updateAction'),
				);
				if (confirmation !== t('updateAction')) {
					return;
				}
			}

			let updateResult: ModuleUpdateResult | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressUpdating', { module: targetLabel }),
					cancellable: false,
				},
				async () => {
					updateResult = await this.workspaceModuleService.updateModule(
						workspaceRoot,
						target,
						moduleEntry,
						authToken,
						repoRoot,
						copyUpdatePreview?.latestRef,
					);
					config = this.workspaceModuleService.withAppliedModule(config!, updateResult.entry);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
			void vscode.window.showInformationMessage(
				updateResult?.backupPath
					? t('updateSuccessWithBackup', {
						module: targetLabel,
						ref: updateResult.entry.ref ?? t('latestRef'),
						backupPath: updateResult.backupPath,
					})
					: t('updateSuccess', {
						module: targetLabel,
						ref: updateResult?.entry.ref ?? t('latestRef'),
					}),
			);
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'update');
			this.logger.error(`Failed to update module ${target.owner}/${target.name}: ${message}`);
			void vscode.window.showErrorMessage(t('updateFailed', { message }));
			return;
		}
		await this.refreshSidebarWorkspaceState();
	}

	public async switchLocalModuleMethodCommand(entry: LocalManagedModuleEntry): Promise<void> {
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeSwitchMethod'));
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		if (!repoRoot) {
			void vscode.window.showWarningMessage(t('switchMethodRequiresGitRepo'));
			return;
		}

		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, repoRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}

		const target = this.findAppliedLocalManagedEntry(config, entry);
		if (!target) {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}

		const nextMethod: ModuleApplyMethod = target.method === 'copy' ? 'submodule' : 'copy';
		let authToken: string | undefined;
		if (nextMethod === 'submodule' && entry.visibility === 'private') {
			authToken = await this.ensureToken(true);
			if (!authToken) {
				void vscode.window.showWarningMessage(t('signInRequiredToSwitchPrivateModule'));
				return;
			}
		}

		const repository = path.basename(repoRoot) || workspaceFolder.name;
		const moduleLabel = `${target.owner}/${target.name}`;
		const currentMethodLabel = getApplyMethodLabel(target.method);
		const nextMethodLabel = getApplyMethodLabel(nextMethod);
		const confirmation = await vscode.window.showWarningMessage(
			t('switchMethodConfirmation', {
				module: moduleLabel,
				repository,
				currentMethod: currentMethodLabel,
				targetMethod: nextMethodLabel,
				targetPath: target.path,
			}),
			{ modal: true },
			t('switchMethodAction'),
		);
		if (confirmation !== t('switchMethodAction')) {
			return;
		}

		try {
			let switchedEntry: LocalModuleConfigEntry | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressSwitchingMethod', { module: moduleLabel, method: nextMethodLabel }),
					cancellable: false,
				},
				async () => {
					switchedEntry = await this.workspaceModuleService.switchModuleMethod(repoRoot, target, nextMethod, authToken, repoRoot);
					config = this.workspaceModuleService.withAppliedModule(config!, switchedEntry);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
			void vscode.window.showInformationMessage(t('switchMethodSuccess', { module: moduleLabel, method: nextMethodLabel }));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'update');
			this.logger.error(`Failed to switch module ${target.owner}/${target.name} to ${nextMethod}: ${message}`);
			void vscode.window.showErrorMessage(t('switchMethodFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	public async toggleLocalModuleLockCommand(entry: LocalManagedModuleEntry): Promise<void> {
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeToggleLock'));
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}

		const target = this.findAppliedLocalManagedEntry(config, entry);
		if (!target) {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}

		const nextLocked = !this.isLocalModuleLocked(target);
		const moduleLabel = `${target.owner}/${target.name}`;
		if (!nextLocked) {
			const repository = path.basename(workspaceRoot) || workspaceFolder.name;
			const confirmation = await vscode.window.showWarningMessage(
				t('unlockConfirmation', {
					module: moduleLabel,
					repository,
					targetPath: target.path,
				}),
				{ modal: true },
				t('unlockAction'),
			);
			if (confirmation !== t('unlockAction')) {
				return;
			}
		}

		try {
			let updatedEntry: LocalModuleConfigEntry | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressChangingLock', { module: moduleLabel }),
					cancellable: false,
				},
				async () => {
					updatedEntry = await this.setLocalModuleLockState(workspaceRoot, target, nextLocked);
					config = this.workspaceModuleService.withAppliedModule(config!, updatedEntry);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
			void vscode.window.showInformationMessage(nextLocked
				? t('lockSuccess', { module: moduleLabel })
				: t('unlockSuccess', { module: moduleLabel }));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'config');
			this.logger.error(`Failed to change lock state for ${target.owner}/${target.name}: ${message}`);
			void vscode.window.showErrorMessage(t('toggleLockFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	public async createLocalFolderRepositoryCommand(folder: LocalUnmanagedFolderEntry): Promise<void> {
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeCreateRepository'));
			return;
		}
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		const folderAbsolutePath = path.resolve(workspaceRoot, folder.path);
		try {
			const stat = await fs.stat(folderAbsolutePath);
			if (!stat.isDirectory()) {
				void vscode.window.showWarningMessage(t('localFolderMissing', { folder: folder.path }));
				return;
			}
		} catch {
			void vscode.window.showWarningMessage(t('localFolderMissing', { folder: folder.path }));
			return;
		}

		const token = await this.ensureToken(true);
		if (!token || typeof this.githubService.createRepository !== 'function') {
			void vscode.window.showWarningMessage(t('signInRequiredForCreateRepository'));
			return;
		}

		const repositoryConfig = await this.promptRepositoryCreation(folder.name);
		if (!repositoryConfig) {
			return;
		}

		const confirmation = await vscode.window.showWarningMessage(
			t('createRepositoryConfirmation', {
				visibility: repositoryConfig.visibility === 'private' ? t('createRepositoryPrivateLabel') : t('createRepositoryPublicLabel'),
				name: repositoryConfig.name,
				folder: folder.path,
				topics: repositoryConfig.topics.join(', '),
			}),
			{ modal: true },
			t('createRepositoryAction'),
		);
		if (confirmation !== t('createRepositoryAction')) {
			return;
		}

		const gitIdentity = await this.promptPublishGitIdentity(folderAbsolutePath);
		if (!gitIdentity) {
			return;
		}

		let repositoryCreated = false;
		try {
			let repositoryName: string | undefined;
			let createdRepository: GitHubRepoSummary | undefined;
			let publishedHeadRef: string | undefined;
			let publishedBranch: string | undefined;
			let localStateSyncFailed = false;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('createRepositoryProgress', { name: repositoryConfig.name }),
					cancellable: false,
				},
				async () => {
					const repository = await this.githubService.createRepository!(token, {
						name: repositoryConfig.name,
						description: repositoryConfig.description,
						private: repositoryConfig.visibility === 'private',
						topics: repositoryConfig.topics,
					});
					createdRepository = repository;
					repositoryName = repository.full_name || repository.name;
					repositoryCreated = true;
					const publishedFolder = await this.workspaceModuleService.publishLocalFolder({
						folderPath: folderAbsolutePath,
						remoteUrl: this.toGitRemoteUrl(repository.html_url),
						authToken: token,
						defaultBranch: repository.default_branch || 'main',
						commitMessage: `Initial publish of ${folder.name}`,
						authorName: gitIdentity.name,
						authorEmail: gitIdentity.email,
					});
					publishedHeadRef = publishedFolder.headRef;
					publishedBranch = publishedFolder.branch;
				},
			);
			if (createdRepository && publishedHeadRef) {
				try {
					await this.syncPublishedLocalFolderState(workspaceFolder, workspaceRoot, repoRoot, folder, createdRepository, publishedHeadRef, publishedBranch, token);
					await this.refreshSidebarWorkspaceState();
				} catch (error) {
					localStateSyncFailed = true;
					const message = getUserFacingErrorMessage(error, 'config');
					const repositoryLabel = repositoryName ?? repositoryConfig.name;
					this.logger.error(`Created and published GitHub repository ${repositoryLabel}, but failed to sync local workspace state for ${folder.path}: ${message}`);
					void vscode.window.showWarningMessage(t('createRepositoryLocalStateSyncFailed', {
						repository: repositoryLabel,
						folder: folder.path,
						message,
					}));
				}
			}
			if (!localStateSyncFailed) {
				void vscode.window.showInformationMessage(t('createRepositoryPublishSuccess', { repository: repositoryName ?? repositoryConfig.name }));
			}
			await this.loadModules({
				interactiveAuth: false,
				showSuccessMessage: false,
				showErrorMessage: false,
				preserveVisibleModules: true,
			});
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'createRepo');
			this.logger.error(`Failed to create or publish GitHub repository for ${folder.path}: ${message}`);
			void vscode.window.showErrorMessage(
				repositoryCreated
					? t('createRepositoryPublishFailed', { folder: folder.path, message })
					: t('createRepositoryFailed', { message }),
			);
		}
	}

	public async linkLocalFolderRepositoryCommand(folder: LocalUnmanagedFolderEntry): Promise<void> {
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeLinkRepository'));
			return;
		}
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		const folderAbsolutePath = path.resolve(workspaceRoot, folder.path);
		try {
			const stat = await fs.stat(folderAbsolutePath);
			if (!stat.isDirectory()) {
				void vscode.window.showWarningMessage(t('localFolderMissing', { folder: folder.path }));
				return;
			}
		} catch {
			void vscode.window.showWarningMessage(t('localFolderMissing', { folder: folder.path }));
			return;
		}

		if (this.availableModules.length === 0) {
			await this.loadModules({
				interactiveAuth: false,
				showSuccessMessage: false,
				showErrorMessage: true,
				preserveVisibleModules: true,
			});
		}
		if (this.availableModules.length === 0) {
			void vscode.window.showWarningMessage(t('noRepositoriesAvailableToLink'));
			return;
		}

		const selection = await this.promptRepositoryLink(folder);
		if (!selection) {
			return;
		}

		let authToken = await this.ensureToken(false);
		if (!authToken && selection.visibility === 'private') {
			authToken = await this.ensureToken(true);
			if (!authToken) {
				void vscode.window.showWarningMessage(t('signInRequiredToLinkPrivateModule'));
				return;
			}
		}

		const repositoryLabel = path.basename(workspaceRoot) || workspaceFolder.name;
		const moduleLabel = `${selection.owner}/${selection.name}`;
		const confirmation = await vscode.window.showWarningMessage(
			t('linkRepositoryConfirmation', {
				folder: folder.path,
				module: moduleLabel,
				repository: repositoryLabel,
			}),
			{ modal: true },
			t('linkRepositoryAction'),
		);
		if (confirmation !== t('linkRepositoryAction')) {
			return;
		}

		try {
			let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot)
				?? await this.initializePublishedFolderConfig(workspaceRoot, folder);
			const targetPath = this.workspaceModuleService.normalizeRootPath(folder.path);
			const moduleKey = this.workspaceModuleService.getModuleKey(selection);
			const existing = config.modules[moduleKey];
			if (existing && this.workspaceModuleService.normalizeRootPath(existing.path) !== targetPath) {
				void vscode.window.showWarningMessage(t('linkRepositoryAlreadyManagedAt', {
					module: moduleLabel,
					path: existing.path,
				}));
				return;
			}

			const branch = selection.defaultBranch || 'main';
			let linkedEntry: LocalModuleConfigEntry | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('linkRepositoryProgress', { folder: folder.path, module: moduleLabel }),
					cancellable: false,
				},
				async () => {
					const ref = await this.workspaceModuleService.resolveRemoteBranchRef(workspaceRoot, selection.repoUrl, branch, authToken);
					linkedEntry = await this.setLocalModuleLockState(workspaceRoot, {
						key: moduleKey,
						name: selection.name,
						owner: selection.owner,
						source: selection.repoUrl,
						method: 'copy',
						path: targetPath,
						ref,
						branch,
						locked: true,
					}, true);
					config = this.workspaceModuleService.withAppliedModule(config, linkedEntry);
					await this.workspaceModuleService.writeConfig(config);
				},
			);
			void vscode.window.showInformationMessage(t('linkRepositorySuccess', { folder: folder.path, module: moduleLabel }));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'config');
			this.logger.error(`Failed to link local folder ${folder.path} to an online repository: ${message}`);
			void vscode.window.showErrorMessage(t('linkRepositoryFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	private async syncPublishedLocalFolderState(
		workspaceFolder: vscode.WorkspaceFolder,
		workspaceRoot: string,
		repoRoot: string | undefined,
		folder: LocalUnmanagedFolderEntry,
		repository: GitHubRepoSummary,
		headRef: string,
		branch: string | undefined,
		authToken: string,
	): Promise<void> {
		const config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot)
			?? await this.initializePublishedFolderConfig(workspaceRoot, folder);
		const moduleEntry = mapRepoToModuleEntry(repository);
		const targetPath = this.workspaceModuleService.normalizeRootPath(folder.path);
		let nextMethod: ModuleApplyMethod = 'copy';
		let nextRef = headRef;
		let nextBranch = branch || moduleEntry.defaultBranch || 'main';
		if (repoRoot) {
			const converted = await this.workspaceModuleService.convertPublishedFolderToSubmodule({
				repoRoot,
				targetRelativePath: targetPath,
				remoteUrl: this.toGitRemoteUrl(repository.html_url),
				branch: nextBranch,
				authToken,
			});
			nextMethod = 'submodule';
			nextRef = converted.headRef;
			nextBranch = converted.branch;
		}
		const nextEntry: LocalModuleConfigEntry = {
			key: this.workspaceModuleService.getModuleKey(moduleEntry),
			name: moduleEntry.name,
			owner: moduleEntry.owner,
			source: moduleEntry.repoUrl,
			method: nextMethod,
			path: targetPath,
			ref: nextRef,
			branch: nextBranch,
			locked: true,
		};
		const lockedEntry = await this.setLocalModuleLockState(workspaceRoot, nextEntry, true);
		const nextConfig = this.workspaceModuleService.withAppliedModule(config, lockedEntry);
		await this.workspaceModuleService.writeConfig(nextConfig);
	}

	private async initializePublishedFolderConfig(
		workspaceRoot: string,
		folder: LocalUnmanagedFolderEntry,
	): Promise<LocalModuleConfig> {
		const normalizedFolderPath = this.workspaceModuleService.normalizeRootPath(folder.path);
		const inferredRoot = path.posix.dirname(normalizedFolderPath);
		const configRoot = inferredRoot === '.'
			? this.getConfiguredDefaultModuleRoot()
			: this.workspaceModuleService.normalizeRootPath(inferredRoot);
		const config = await this.workspaceModuleService.initializeConfig(workspaceRoot, configRoot);
		await this.setWorkspaceInitializationContext(false);
		return config;
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

	private findAppliedLocalManagedEntry(config: LocalModuleConfig, entry: LocalManagedModuleEntry): LocalModuleConfigEntry | undefined {
		return config.modules[entry.id]
			?? Object.values(config.modules).find((module) => module.key === entry.id)
			?? Object.values(config.modules).find((module) => module.owner === entry.owner && module.name === entry.name && module.path === entry.path);
	}

	private isLocalModuleLocked(entry: Pick<LocalManagedModuleEntry | LocalModuleConfigEntry, 'locked'>): boolean {
		return entry.locked !== false;
	}

	private async setLocalModuleLockState(
		workspaceRoot: string,
		entry: LocalModuleConfigEntry,
		locked: boolean,
	): Promise<LocalModuleConfigEntry> {
		const maybeWorkspaceModuleService = this.workspaceModuleService as Partial<WorkspaceModuleService>;
		if (typeof maybeWorkspaceModuleService.setModuleLocked === 'function') {
			return maybeWorkspaceModuleService.setModuleLocked.call(this.workspaceModuleService, workspaceRoot, entry, locked);
		}
		return {
			...entry,
			locked,
		};
	}

	private async syncWorkspaceModuleLockStates(workspaceRoot: string, config: LocalModuleConfig | undefined): Promise<void> {
		if (!config) {
			return;
		}
		const maybeWorkspaceModuleService = this.workspaceModuleService as Partial<WorkspaceModuleService>;
		if (typeof maybeWorkspaceModuleService.syncModuleLockStates !== 'function') {
			return;
		}
		await maybeWorkspaceModuleService.syncModuleLockStates.call(this.workspaceModuleService, workspaceRoot, Object.values(config.modules));
	}

	private getRemovalTargets(config: LocalModuleConfig, entry?: CsmModuleEntry): LocalModuleConfigEntry[] {
		if (entry) {
			const target = this.findAppliedEntryFor(config, entry);
			return target ? [target] : [];
		}

		const selectedEntries = this.getSelectedModules();
		if (selectedEntries.length > 0) {
			const removableEntries: LocalModuleConfigEntry[] = [];
			const seenKeys = new Set<string>();
			for (const selectedEntry of selectedEntries) {
				const target = this.findAppliedEntryFor(config, selectedEntry);
				if (target && !seenKeys.has(target.key)) {
					seenKeys.add(target.key);
					removableEntries.push(target);
				}
			}
			return removableEntries;
		}

		const fallback = this.findAppliedEntryFor(config, undefined);
		return fallback ? [fallback] : [];
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
		await this.storeAuthenticatedSession(session);
		void vscode.window.showInformationMessage(t('signedInAs', { account: session.account.label }));
		// Best-effort scope verification, logged when missing scopes are detected (7.5).
		if (typeof this.authService.verifyScopes === 'function') {
			void this.authService.verifyScopes(session.accessToken);
		}
		this.applyCachedModules(this.cacheStore.getModuleSnapshot());
		await this.loadModules({
			interactiveAuth: false,
			showSuccessMessage: false,
			showErrorMessage: true,
			preserveVisibleModules: this.availableModules.length > 0,
		});
	}

	public async logoutCommand(): Promise<void> {
		const cachedAuth = this.cacheStore.getAuthSnapshot();
		const accountLabel = this.currentAccountLabel ?? cachedAuth?.accountLabel;
		if (!accountLabel) {
			await this.clearAuthenticatedSession();
			await this.applyPublicCachedModules();
			return;
		}

		if (typeof this.authService.signOut !== 'function') {
			this.logger.error('Failed to sign out of GitHub: sign-out handler is unavailable.');
			void vscode.window.showErrorMessage(t('signOutFailed', { message: 'Sign-out is unavailable.' }));
			return;
		}

		try {
			await this.authService.signOut(accountLabel);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to sign out of GitHub: ${message}`);
			void vscode.window.showErrorMessage(t('signOutFailed', { message }));
			return;
		}

		const session = await this.authService.getSessionSilently();
		if (session?.account.label === accountLabel) {
			await this.storeAuthenticatedSession(session);
			void vscode.window.showWarningMessage(t('signOutCancelled'));
			return;
		}

		if (session) {
			await this.storeAuthenticatedSession(session);
			void vscode.window.showInformationMessage(t('signedInAs', { account: session.account.label }));
		} else {
			await this.clearAuthenticatedSession();
			void vscode.window.showInformationMessage(t('signedOut'));
		}

		if (this.currentAccountId) {
			this.applyCachedModules(this.cacheStore.getModuleSnapshot());
			return;
		}
		await this.applyPublicCachedModules();
	}

	private async ensureToken(interactive: boolean): Promise<string | undefined> {
		if (this.currentToken && this.currentAccountId && this.isCachedTokenFresh()) {
			return this.currentToken;
		}
		// Re-validate cached token via a fresh silent session (which the editor will
		// invalidate if the underlying credentials were revoked).
		const silentSession = await this.authService.getSessionSilently();
		if (silentSession) {
			await this.storeAuthenticatedSession(silentSession);
			return this.currentToken;
		}
		await this.clearAuthenticatedSession();
		if (!interactive) {
			return undefined;
		}
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			return undefined;
		}
		await this.storeAuthenticatedSession(session);
		return this.currentToken;
	}

	private isCachedTokenFresh(): boolean {
		return this.lastTokenVerifiedAt > 0
			&& Date.now() - this.lastTokenVerifiedAt < ModuleManagerController.TOKEN_VERIFY_INTERVAL_MS;
	}

	/**
	 * Refreshes the GitHub module catalog and then recomputes the unified sidebar's
	 * local workspace state and initialization prompt, even if the remote refresh fails.
	 */
	public async refreshCommand(): Promise<void> {
		try {
			await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
		} finally {
			try {
				await this.refreshSidebarWorkspaceState();
			} catch (error) {
				this.logger.warn(`Failed to refresh sidebar workspace state after module refresh: ${error instanceof Error ? error.message : String(error)}`);
			}
			try {
				await this.refreshWorkspaceInitializationState({ prompt: false });
			} catch (error) {
				this.logger.warn(`Failed to refresh workspace initialization state after module refresh: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private async toggleStarCommand(entry: CsmModuleEntry): Promise<void> {
		if (typeof entry.starred !== 'boolean') {
			return;
		}
		const moduleLabel = `${entry.owner}/${entry.name}`;
		const nextStarred = !entry.starred;
		if (!nextStarred) {
			const confirmation = await vscode.window.showWarningMessage(
				t('unstarConfirmation', { name: moduleLabel }),
				{ modal: true },
				t('unstarAction'),
			);
			if (confirmation !== t('unstarAction')) {
				return;
			}
		}
		const token = await this.ensureToken(true);
		if (!token || typeof this.githubService.setRepositoryStarred !== 'function') {
			return;
		}
		try {
			await this.githubService.setRepositoryStarred(entry.owner, entry.name, token, nextStarred);
			this.updateAvailableModuleStarStates(new Map([[this.getModuleKey(entry), nextStarred]]));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'refresh');
			this.logger.error(`Failed to update star for ${moduleLabel}: ${message}`);
			void vscode.window.showErrorMessage(t('starUpdateFailed', { name: moduleLabel, message }));
		}
	}

	private async autoStarImportedModules(entries: CsmModuleEntry[]): Promise<void> {
		if (entries.length === 0 || typeof this.githubService.setRepositoryStarred !== 'function') {
			return;
		}
		const token = await this.ensureToken(false);
		if (!token) {
			return;
		}
		const updates = new Map<string, boolean>();
		const seen = new Set<string>();
		for (const entry of entries) {
			const key = this.getModuleKey(entry);
			if (seen.has(key) || entry.starred === true) {
				continue;
			}
			seen.add(key);
			try {
				await this.githubService.setRepositoryStarred(entry.owner, entry.name, token, true);
				updates.set(key, true);
			} catch (error) {
				this.logger.warn(`Failed to auto-star ${entry.owner}/${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this.updateAvailableModuleStarStates(updates);
	}

	private async hydrateStarStates(modules: CsmModuleEntry[], token: string | undefined): Promise<CsmModuleEntry[]> {
		if (modules.length === 0 || !token || typeof this.githubService.isRepositoryStarred !== 'function') {
			return modules;
		}
		const starStates = await this.fetchStarStatesParallel(modules, token, 8);
		return modules.map((moduleEntry) => ({
			...moduleEntry,
			starred: starStates.get(this.getModuleKey(moduleEntry)),
		}));
	}

	private async fetchStarStatesParallel(
		modules: CsmModuleEntry[],
		token: string,
		concurrency: number,
	): Promise<Map<string, boolean>> {
		const starredStates = new Map<string, boolean>();
		const isRepositoryStarred = this.githubService.isRepositoryStarred?.bind(this.githubService);
		if (!isRepositoryStarred) {
			return starredStates;
		}
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < modules.length) {
				const index = cursor;
				cursor += 1;
				const moduleEntry = modules[index];
				if (!moduleEntry) {
					continue;
				}
				try {
					const starred = await isRepositoryStarred(moduleEntry.owner, moduleEntry.name, token);
					starredStates.set(this.getModuleKey(moduleEntry), starred);
				} catch (error) {
					this.logger.warn(`Failed to fetch star state for ${moduleEntry.owner}/${moduleEntry.name}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		};
		const workerCount = Math.max(1, Math.min(concurrency, modules.length));
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
		return starredStates;
	}

	private updateAvailableModuleStarStates(updates: ReadonlyMap<string, boolean>): void {
		if (updates.size === 0) {
			return;
		}
		let changed = false;
		this.availableModules = this.availableModules.map((moduleEntry) => {
			const nextStarred = updates.get(this.getModuleKey(moduleEntry));
			if (typeof nextStarred !== 'boolean' || moduleEntry.starred === nextStarred) {
				return moduleEntry;
			}
			changed = true;
			return {
				...moduleEntry,
				starred: nextStarred,
			};
		});
		if (!changed) {
			return;
		}
		this.applyModuleSort();
		this.treeDataProvider.setModules(this.availableModules);
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
			const cachedSnapshot = this.cacheStore.getModuleSnapshot();
			const previousEtag = this.cacheStore.getModuleEtag();
			const fetchResult = await this.githubService.fetchModules(token, { etag: previousEtag });
			if (fetchResult.notModified) {
				this.logger.info('Module list unchanged since last fetch (304 Not Modified).');
				const cachedModules = cachedSnapshot?.modules ?? this.availableModules;
				const modulesWithStarState = await this.hydrateStarStates(cachedModules, token);
				const nextSnapshot = await this.cacheStore.setModuleSnapshot(modulesWithStarState, {
					refreshAccountId: token ? this.currentAccountId : undefined,
					refreshAccountLabel: token ? this.currentAccountLabel : undefined,
				});
				this.applyCachedModules(nextSnapshot);
				await this.refreshSidebarWorkspaceState();
				if (fetchResult.etag) {
					await this.cacheStore.setModuleEtag(fetchResult.etag);
				}
				if (options.showSuccessMessage) {
					void vscode.window.showInformationMessage(t('modulesUpToDate'));
				}
				return;
			}
			const modules = fetchResult.modules;
			const [modulesWithStarState, refreshedReadme] = await Promise.all([
				this.hydrateStarStates(modules, token),
				this.fetchReadmesParallel(modules, token, 5),
			]);
			this.availableModules = modulesWithStarState;
			// Parallelized README prefetch with bounded concurrency to avoid blocking on large lists.
			Object.assign(this.readmeCache, refreshedReadme);
			const nextSnapshot = await this.cacheStore.setModuleSnapshot(modulesWithStarState, {
				refreshAccountId: token ? this.currentAccountId : undefined,
				refreshAccountLabel: token ? this.currentAccountLabel : undefined,
			});
			// README content is persisted via the filesystem asset cache only (3.5).
			if (fetchResult.etag) {
				await this.cacheStore.setModuleEtag(fetchResult.etag);
			}
			this.applyCachedModules(nextSnapshot);
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
		void this.setSelectionContexts();
	}

	private restoreCachedAuthentication(snapshot: ModuleAuthSnapshot | undefined): void {
		this.currentToken = undefined;
		this.currentAccountId = snapshot?.accountId;
		this.currentAccountLabel = snapshot?.accountLabel;
		this.lastTokenVerifiedAt = 0;
		void this.setAuthenticationState(!!snapshot, snapshot?.accountLabel);
	}

	private async storeAuthenticatedSession(session: Pick<vscode.AuthenticationSession, 'accessToken' | 'account'>): Promise<void> {
		this.currentToken = session.accessToken;
		this.currentAccountId = session.account.id;
		this.currentAccountLabel = session.account.label;
		this.lastTokenVerifiedAt = Date.now();
		await this.cacheStore.setAuthSnapshot({
			accountId: session.account.id,
			accountLabel: session.account.label,
		});
		await this.setAuthenticationState(true, session.account.label);
	}

	private async clearAuthenticatedSession(): Promise<void> {
		this.currentToken = undefined;
		this.currentAccountId = undefined;
		this.currentAccountLabel = undefined;
		this.lastTokenVerifiedAt = 0;
		await this.cacheStore.clearAuthSnapshot();
		await this.setAuthenticationState(false);
	}

	private shouldRevealPrivateCache(snapshot: ModuleCacheSnapshot | undefined): boolean {
		if (!snapshot?.refreshAccountId) {
			return false;
		}
		const knownAccountId = this.currentAccountId ?? this.cacheStore.getAuthSnapshot()?.accountId;
		return typeof knownAccountId === 'string' && knownAccountId === snapshot.refreshAccountId;
	}

	private getVisibleModulesFromSnapshot(snapshot: ModuleCacheSnapshot | undefined): CsmModuleEntry[] {
		const modules = snapshot?.modules ?? [];
		if (!modules.some((module) => module.visibility === 'private')) {
			return modules;
		}
		return this.shouldRevealPrivateCache(snapshot)
			? modules
			: modules.filter((module) => module.visibility === 'public');
	}

	private applyCachedModules(snapshot: ModuleCacheSnapshot | undefined): void {
		this.updateLastRefreshDescription(snapshot);
		this.availableModules = this.getVisibleModulesFromSnapshot(snapshot);
		this.applyModuleSort();
		this.setSelectedModuleKeys([...this.selectedModuleKeys]);
		this.treeDataProvider.setModules(this.availableModules);
	}

	private async applyPublicCachedModules(): Promise<void> {
		const snapshot = this.cacheStore.getModuleSnapshot();
		if (!snapshot) {
			if (typeof this.treeDataProvider.setOfflineMode === 'function') {
				this.treeDataProvider.setOfflineMode(true);
			}
			this.availableModules = [];
			this.setSelectedModuleKeys([]);
			this.updateLastRefreshDescription(undefined);
			this.treeDataProvider.setError(t('noCachedModulesBody'));
			return;
		}
		const publicModules = snapshot.modules.filter((module) => module.visibility === 'public');
		const nextSnapshot = await this.cacheStore.setModuleSnapshot(publicModules, {
			lastRefreshAt: snapshot.lastRefreshAt,
		});
		await this.cacheStore.setModuleEtag(undefined);
		if (typeof this.treeDataProvider.setOfflineMode === 'function') {
			this.treeDataProvider.setOfflineMode(true);
		}
		this.applyCachedModules(nextSnapshot);
	}

	private updateLastRefreshDescription(snapshot: ModuleCacheSnapshot | undefined): void {
		if (typeof this.treeDataProvider.setViewDescription !== 'function') {
			return;
		}
		this.treeDataProvider.setViewDescription(this.getLastRefreshDescription(snapshot?.lastRefreshAt));
	}

	private getLastRefreshDescription(lastRefreshAt: string | undefined): string {
		if (!lastRefreshAt) {
			return t('lastRefreshNever');
		}
		const timestamp = Date.parse(lastRefreshAt);
		if (Number.isNaN(timestamp)) {
			return t('lastRefreshNever');
		}
		return t('lastRefreshDescription', {
			relative: this.formatRelativeTime(timestamp),
		});
	}

	private formatRelativeTime(timestamp: number): string {
		const diffMs = timestamp - Date.now();
		const absoluteMs = Math.abs(diffMs);
		const locale = vscode.env?.language && vscode.env.language.trim().length > 0 ? vscode.env.language : 'en';
		const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		if (absoluteMs < 60 * 1000) {
			return formatter.format(0, 'minute');
		}
		if (absoluteMs < 60 * 60 * 1000) {
			return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
		}
		if (absoluteMs < 24 * 60 * 60 * 1000) {
			return formatter.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
		}
		return formatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day');
	}

	private async setAuthenticationState(signedIn: boolean, accountLabel?: string): Promise<void> {
		if (!signedIn) {
			this.currentAccountLabel = undefined;
		} else if (accountLabel) {
			this.currentAccountLabel = accountLabel;
		}
		this.treeDataProvider.setAuthenticated(signedIn, this.currentAccountLabel);
		await vscode.commands.executeCommand('setContext', SIGNED_IN_CONTEXT_KEY, signedIn);
	}

	private async setSelectionContexts(): Promise<void> {
		const hasSelection = this.selectedModuleKeys.size > 0;
		let hasAppliedSelection = false;
		let hasUnappliedSelection = false;

		for (const moduleKey of this.selectedModuleKeys) {
			if (this.appliedModuleKeys.has(moduleKey)) {
				hasAppliedSelection = true;
			} else {
				hasUnappliedSelection = true;
			}
			if (hasAppliedSelection && hasUnappliedSelection) {
				break;
			}
		}

		await Promise.all([
			vscode.commands.executeCommand('setContext', HAS_SELECTION_CONTEXT_KEY, hasSelection),
			vscode.commands.executeCommand('setContext', HAS_APPLIED_SELECTION_CONTEXT_KEY, hasAppliedSelection),
			vscode.commands.executeCommand('setContext', HAS_UNAPPLIED_SELECTION_CONTEXT_KEY, hasUnappliedSelection),
		]);
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

	private formatShortRef(ref: string | undefined): string {
		if (!ref) {
			return t('latestRef');
		}
		return ref.length > 10 ? ref.slice(0, 7) : ref;
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
			void this.setSelectionContexts();
		};
		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			setContext({ appliedModuleKeys: [] });
			return;
		}

		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;

		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (config && repoRoot) {
			try {
				const { config: syncedConfig, addedCount } = await this.workspaceModuleService.syncSubmoduleEntriesToConfig(repoRoot, config);
				if (addedCount > 0) {
					config = syncedConfig;
					void vscode.window.showInformationMessage(
						t('submodulesAutoSyncedToConfig', {
							count: String(addedCount),
							configPath: path.relative(repoRoot, syncedConfig.configPath).replace(/\\/g, '/'),
						}),
					);
				}
			} catch (error) {
				this.logger.warn(`Failed to auto-sync submodule entries to config: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		if (config) {
			try {
				await this.syncWorkspaceModuleLockStates(workspaceRoot, config);
			} catch (error) {
				this.logger.warn(`Failed to sync local module lock state: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const moduleRoot = await this.resolveSidebarModuleRoot(workspaceRoot, config);
		const staleModuleKeys = await this.computeStaleModuleKeys(workspaceRoot, config);
		setContext({
			workspaceLabel: path.basename(workspaceRoot) || workspaceFolder.name,
			moduleRoot,
			gitAvailable: !!repoRoot,
			appliedModuleKeys: this.mapAppliedModuleKeys(config),
			staleModuleKeys,
			managedModules: this.mapManagedModules(config, staleModuleKeys),
			unmanagedFolders: moduleRoot ? await this.mapUnmanagedFolders(workspaceRoot, moduleRoot, config) : [],
		});
	}

	private async resolveSidebarModuleRoot(workspaceRoot: string, config: LocalModuleConfig | undefined): Promise<string | undefined> {
		if (config?.root) {
			return config.root;
		}
		const defaultRoot = this.getConfiguredDefaultModuleRoot();
		return await this.hasLocalModuleRoot(workspaceRoot, defaultRoot) ? defaultRoot : undefined;
	}

	private mapManagedModules(config: LocalModuleConfig | undefined, staleModuleKeys: string[]): LocalManagedModuleEntry[] {
		if (!config) {
			return [];
		}

		const staleSet = new Set(staleModuleKeys);
		const availableModulesBySource = new Map<string, CsmModuleEntry>();
		for (const moduleEntry of this.availableModules) {
			availableModulesBySource.set(this.normalizeModuleSource(moduleEntry.repoUrl), moduleEntry);
		}

		return Object.values(config.modules)
			.sort((left, right) => left.path.localeCompare(right.path))
			.map((configEntry) => {
				const availableModule = this.findAvailableModule(configEntry.owner, configEntry.name)
					?? availableModulesBySource.get(this.normalizeModuleSource(configEntry.source));
				const moduleEntry = availableModule ?? this.synthesizeModuleEntry(configEntry);
				return {
					id: configEntry.key,
					kind: 'managed',
					owner: configEntry.owner,
					name: configEntry.name,
					path: configEntry.path,
					source: configEntry.source,
					method: configEntry.method,
					branch: configEntry.branch,
					ref: configEntry.ref,
					locked: this.isLocalModuleLocked(configEntry),
					repoUrl: moduleEntry.repoUrl,
					description: moduleEntry.description,
					visibility: moduleEntry.visibility,
					topics: moduleEntry.topics,
					moduleEntry,
					moduleKey: availableModule ? this.getModuleKey(availableModule) : undefined,
					stale: staleSet.has(`${configEntry.owner}/${configEntry.name}`),
				};
			});
	}

	private async mapUnmanagedFolders(
		workspaceRoot: string,
		moduleRoot: string,
		config: LocalModuleConfig | undefined,
	): Promise<LocalUnmanagedFolderEntry[]> {
		const managedPaths = new Set(
			Object.values(config?.modules ?? {}).map((entry) => entry.path.replace(/\\/g, '/').toLowerCase()),
		);
		const directories = await this.workspaceModuleService.listModuleDirectories(workspaceRoot, moduleRoot);
		return directories
			.map((directoryName) => {
				const relativePath = path.posix.join(moduleRoot, directoryName);
				return {
					id: relativePath,
					kind: 'unmanaged' as const,
					name: directoryName,
					path: relativePath,
				};
			})
			.filter((entry) => !managedPaths.has(entry.path.toLowerCase()));
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

	private async promptPublishGitIdentity(folderAbsolutePath: string): Promise<Required<GitIdentity> | undefined> {
		const currentIdentity = await this.workspaceModuleService.getGitIdentity(folderAbsolutePath);
		const currentName = currentIdentity.name?.trim();
		const currentEmail = currentIdentity.email?.trim();
		const name = currentName || await vscode.window.showInputBox({
			prompt: t('publishCommitAuthorNamePrompt'),
			ignoreFocusOut: true,
			validateInput: (value) => value.trim().length > 0 ? undefined : t('publishCommitAuthorNameRequired'),
		});
		if (typeof name === 'undefined') {
			return undefined;
		}

		const email = currentEmail || await vscode.window.showInputBox({
			prompt: t('publishCommitAuthorEmailPrompt'),
			ignoreFocusOut: true,
			validateInput: (value) => this.validateGitUserEmail(value),
		});
		if (typeof email === 'undefined') {
			return undefined;
		}

		return {
			name: name.trim(),
			email: email.trim(),
		};
	}

	private validateGitUserEmail(value: string): string | undefined {
		const trimmed = value.trim();
		if (!trimmed) {
			return t('publishCommitAuthorEmailRequired');
		}
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
			? undefined
			: t('publishCommitAuthorEmailInvalid');
	}

	private toGitRemoteUrl(repositoryUrl: string): string {
		const trimmed = repositoryUrl.trim().replace(/\.git$/i, '').replace(/\/+$/g, '');
		return `${trimmed}.git`;
	}

	private async promptRepositoryCreation(folderName: string): Promise<{
		name: string;
		description: string;
		visibility: RepositoryVisibility;
		topics: string[];
	} | undefined> {
		const name = await vscode.window.showInputBox({
			prompt: t('createRepositoryNamePrompt', { folder: folderName }),
			value: folderName,
			validateInput: (value) => this.validateRepositoryName(value),
		});
		if (typeof name === 'undefined') {
			return undefined;
		}

		const description = await vscode.window.showInputBox({
			prompt: t('createRepositoryDescriptionPrompt'),
			value: '',
		});
		if (typeof description === 'undefined') {
			return undefined;
		}

		const visibilityPick = await vscode.window.showQuickPick<RepositoryVisibilityQuickPickItem>([
			{
				label: t('createRepositoryPrivateLabel'),
				description: t('createRepositoryPrivateDescription'),
				picked: true,
				visibility: 'private',
			},
			{
				label: t('createRepositoryPublicLabel'),
				description: t('createRepositoryPublicDescription'),
				visibility: 'public',
			},
		], {
			placeHolder: t('createRepositoryVisibilityPlaceholder'),
		});
		if (!visibilityPick) {
			return undefined;
		}

		const topicsInput = await vscode.window.showInputBox({
			prompt: t('createRepositoryTopicsPrompt'),
			value: DEFAULT_SHARED_MODULE_TOPICS.join(', '),
		});
		if (typeof topicsInput === 'undefined') {
			return undefined;
		}

		return {
			name: name.trim(),
			description: description.trim(),
			visibility: visibilityPick.visibility,
			topics: this.normalizeRepositoryTopics(topicsInput),
		};
	}

	private async promptRepositoryLink(folder: LocalUnmanagedFolderEntry): Promise<CsmModuleEntry | undefined> {
		const folderName = folder.name.trim().toLowerCase();
		const items = [...this.availableModules]
			.sort((left, right) => {
				const leftPreferred = left.name.trim().toLowerCase() === folderName ? 0 : 1;
				const rightPreferred = right.name.trim().toLowerCase() === folderName ? 0 : 1;
				if (leftPreferred !== rightPreferred) {
					return leftPreferred - rightPreferred;
				}
				return `${left.owner}/${left.name}`.localeCompare(`${right.owner}/${right.name}`);
			})
			.map((moduleEntry) => ({
				label: `${moduleEntry.owner}/${moduleEntry.name}`,
				description: moduleEntry.visibility === 'private' ? t('createRepositoryPrivateLabel') : t('createRepositoryPublicLabel'),
				detail: moduleEntry.description?.trim() || moduleEntry.repoUrl,
				moduleEntry,
			}));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: t('selectRepositoryToLinkPlaceholder', { folder: folder.path }),
			matchOnDescription: true,
			matchOnDetail: true,
		});
		return pick?.moduleEntry;
	}

	private normalizeRepositoryTopics(value: string): string[] {
		const normalized = value
			.split(/[\s,]+/)
			.map((segment) => segment.trim().toLowerCase())
			.filter((segment) => segment.length > 0);
		const topics = normalized.length > 0 ? normalized : [...DEFAULT_SHARED_MODULE_TOPICS];
		const deduped: string[] = [];
		const seen = new Set<string>();
		for (const topic of topics) {
			if (seen.has(topic)) {
				continue;
			}
			seen.add(topic);
			deduped.push(topic);
		}
		return deduped;
	}

	private validateRepositoryName(value: string): string | undefined {
		const trimmed = value.trim();
		if (!trimmed) {
			return t('createRepositoryNameRequired');
		}
		if (trimmed.length > 100) {
			return t('createRepositoryNameTooLong');
		}
		if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
			return t('createRepositoryNameInvalid');
		}
		return undefined;
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

	private async promptApplyMethod(
		moduleCount: number,
		options: { gitAvailable: boolean },
	): Promise<ModuleApplyMethod | undefined> {
		const items: ApplyMethodQuickPickItem[] = options.gitAvailable
			? [
				{
					label: t('applyMethodSubmoduleLabel'),
					description: t('applyMethodSubmoduleDescription'),
					detail: t('applyMethodSubmoduleDetail', { count: moduleCount }),
					method: 'submodule',
				},
				{
					label: t('applyMethodCopyLabel'),
					description: t('applyMethodCopyDescription'),
					detail: t('applyMethodCopyDetail', { count: moduleCount }),
					method: 'copy',
				},
			]
			: [
				{
					label: t('applyMethodSubmoduleUnavailableLabel'),
					kind: vscode.QuickPickItemKind.Separator,
				},
				{
					label: t('applyMethodCopyLabel'),
					description: t('applyMethodCopyDescription'),
					detail: t('applyMethodCopyDetail', { count: moduleCount }),
					method: 'copy',
				},
			];

		const pick = await vscode.window.showQuickPick(
			items,
			{
				placeHolder: t('chooseApplyMethodPlaceholder'),
				prompt: options.gitAvailable ? undefined : t('applyMethodSubmoduleUnavailablePrompt'),
			},
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
