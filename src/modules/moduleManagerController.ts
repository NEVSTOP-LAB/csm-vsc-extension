import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthService } from './authService';
import { GitHubModuleService, GitHubOrganizationProfile, GitHubUserProfile, mapRepoToModuleEntry } from './githubModuleService';
import { ModuleCacheStore } from './cacheStore';
import { CsmModuleEntry, GitHubRepoSummary, LocalManagedModuleEntry, LocalModuleConfig, LocalModuleConfigEntry, LocalUnmanagedFolderEntry, ModuleApplyMethod, ModuleAuthSnapshot, ModuleBranchInfo, ModuleCacheSnapshot, ModuleCommitInfo, ModuleReleaseInfo, ModuleTagInfo, ModuleUpdateResult, ModuleVersionCacheEntry, ModuleVersionSelection } from './types';
import { ModuleTreeItem } from './moduleTreeTypes';
import { ModuleSidebarViewProvider } from './moduleSidebarViewProvider';
import { IModuleViewProvider, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './types';
import { ReadmeAssetCache } from './readmeAssetCache';
import { DEFAULT_EXCLUDED_DIRECTORY_NAMES, DEFAULT_LOCAL_MODULE_ROOT, GitIdentity, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, UpdateModuleOptions, WorkspaceModuleService } from './workspaceModuleService';
import { COMMAND_IDS, CONFIG_KEYS, CONFIG_SECTIONS, CONTEXT_KEYS, GITHUB, VIEW_IDS } from './constants';
import { Logger, getLogger, wrapCommand } from './logger';
import { formatRelativeDate, getApplyMethodLabel, t } from '../i18n';
import { ModuleVersionService } from './versionService';
import { openBuiltinReadmePreview, type ReadmePreviewServiceDeps } from './readmePreviewService';
import { DEFAULT_MODULE_SORT_STATE, isModuleSortField, normalizeModuleSortState, sortModules } from './sort';
import { getUserFacingErrorMessage } from './userFacingErrors';
import { detectLabviewVersion, extractVersionFromTopics } from './labviewVersionDetector';

const LOCAL_MODULE_CONFIG_GLOB = `**/{${LOCAL_MODULE_CONFIG_FILE},${LEGACY_LOCAL_MODULE_CONFIG_FILE}}`;
const WORKSPACE_INIT_CONTEXT_KEY = CONTEXT_KEYS.canInitializeWorkspace;
const SIGNED_IN_CONTEXT_KEY = CONTEXT_KEYS.signedIn;
const HAS_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.hasSelection;
const HAS_APPLIED_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.selectionHasApplied;
const HAS_UNAPPLIED_SELECTION_CONTEXT_KEY = CONTEXT_KEYS.selectionHasUnapplied;
const LVPROJ_GLOB = '**/*.lvproj';
const DEFAULT_SHARED_MODULE_TOPICS = ['labview-csm', 'csm-modsets'] as const;
const ROOT_NAMESPACE_VALUE = '';
/** 版本来源列表每类最多展示的条数（issue #37） */
const VERSION_LIST_LIMIT = 20;

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
	moduleStarred?: boolean;
	signedIn?: boolean;
	canLinkRepository?: boolean;
	localLocked?: boolean;
	gitAvailable?: boolean;
	webviewSection?: string;
	workspaceCardKind?: string;
	localItemId?: string;
	localItemPath?: string;
	preventDefaultContextMenuItems?: boolean;
};

type ApplyMethodQuickPickItem = vscode.QuickPickItem & {
	method?: ModuleApplyMethod;
};

type RepositoryRootQuickPickItem = vscode.QuickPickItem & {
	root: LocalUnmanagedFolderEntry;
};

type NamespaceQuickPickItem = vscode.QuickPickItem & {
	namespacePath?: string;
	action?: 'manual';
};

type RepositoryVisibility = 'private' | 'public';

type RepositoryVisibilityQuickPickItem = vscode.QuickPickItem & {
	visibility: RepositoryVisibility;
};

/** 创建仓库时的归属：个人账号（user）或组织（org）。 */
type RepositoryOwner = {
	kind: 'user' | 'org';
	login: string;
};

type RepositoryOwnerQuickPickItem = vscode.QuickPickItem & {
	owner: RepositoryOwner;
};

/** 创建仓库时的归属候选：个人账号 + 有权限创建仓库的组织。 */
interface RepositoryOwnerCandidates {
	user: GitHubUserProfile;
	orgs: GitHubOrganizationProfile[];
}

type RefreshMode = 'online' | 'local';

type RefreshModeQuickPickItem = vscode.QuickPickItem & {
	mode: RefreshMode;
};

// ---------------------------------------------------------------------------
// 模块版本选择（issue #37）QuickPick item 类型
// ---------------------------------------------------------------------------

type VersionSourceKind = 'latest' | 'commits' | 'tags' | 'branches';

type VersionSourceQuickPickItem = vscode.QuickPickItem & {
	versionSource: VersionSourceKind;
};

type CommitQuickPickItem = vscode.QuickPickItem & {
	commit: ModuleCommitInfo;
};

type TagQuickPickItem = vscode.QuickPickItem & {
	tag: ModuleTagInfo;
};

type ReleaseQuickPickItem = vscode.QuickPickItem & {
	release: ModuleReleaseInfo;
};

type BranchQuickPickItem = vscode.QuickPickItem & {
	branch: ModuleBranchInfo;
};

/** 版本来源选择所需的模块基本信息（update 与 apply 复用，issue #37） */
interface VersionSelectionContext {
	owner: string;
	name: string;
	source: string;
	branch: string;
	moduleLabel: string;
}

/** 版本来源选择框顶部“使用默认/最新”项的文案 */
interface VersionLatestOption {
	label: string;
	detail: string;
}

type ModuleManagerAuthService = Pick<AuthService, 'getSessionSilently' | 'getSessionInteractively'>
	& Partial<Pick<AuthService, 'signOut' | 'verifyScopes'>>;

type ModuleManagerGithubService = Pick<GitHubModuleService, 'fetchModules' | 'fetchReadme'>
	& Partial<Pick<GitHubModuleService, 'isRepositoryStarred' | 'setRepositoryStarred' | 'createRepository' | 'detectRemoteLabviewVersion' | 'getCurrentUser' | 'getUserOrganizations' | 'getOrganizationMembership'>>;

type ModuleManagerVersionService = Pick<ModuleVersionService, 'listBranches' | 'listTags' | 'listReleases' | 'listCommits' | 'resolveCommitInfo'>;

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
	versionService?: ModuleManagerVersionService;
	workspaceModuleService?: WorkspaceModuleService;
	viewProvider?: IModuleViewProvider;
	logger?: Logger;
}

export class ModuleManagerController {
	private readonly logger: Logger;
	private readonly authService: ModuleManagerAuthService;
	private readonly githubService: ModuleManagerGithubService;
	private readonly versionService: ModuleManagerVersionService;
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
		onOpenRepository: (entry) => {
			void this.openRepositoryCommand(entry);
		},
		onPreviewReadme: (entry) => {
			void openBuiltinReadmePreview(entry, this.getReadmeServiceDeps());
		},
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
		onRecordLocalModule: (entry) => {
			void this.recordLocalModuleCommand(entry);
		},
		onRemoveLocalModuleRecord: (entry) => {
			void this.removeLocalModuleRecordCommand(entry);
		},
		onOpenLocalFolder: (entry) => {
			void this.openLocalFolderCommand(entry);
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
	/** 模块当前版本提交信息缓存（key=`owner/name`，issue #37） */
	private versionCache: Record<string, ModuleVersionCacheEntry> = {};
	private currentToken: string | undefined;
	private currentAccountId: string | undefined;
	private currentAccountLabel: string | undefined;
	private lastTokenVerifiedAt = 0;
	private recentNamespaceByWorkspace: Record<string, string>;
	private static readonly TOKEN_VERIFY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

	constructor(private readonly context: vscode.ExtensionContext, deps: ModuleManagerControllerDeps = {}) {
		this.logger = deps.logger ?? getLogger();
		this.authService = deps.authService ?? new AuthService(this.logger);
		this.githubService = deps.githubService ?? new GitHubModuleService(this.logger);
		this.versionService = deps.versionService ?? new ModuleVersionService(this.githubService as unknown as ConstructorParameters<typeof ModuleVersionService>[0], undefined, this.logger);
		this.workspaceModuleService = deps.workspaceModuleService ?? new WorkspaceModuleService();
		this.treeDataProvider = deps.viewProvider ?? this.sidebarViewProvider;
		this.cacheStore = new ModuleCacheStore(context.globalState);
		this.readmeAssetCache = new ReadmeAssetCache(context.globalStorageUri);
		this.currentSortState = this.cacheStore.getModuleSortState();
		this.recentNamespaceByWorkspace = this.cacheStore.getRecentNamespaceByWorkspace();
		this.versionCache = this.cacheStore.getModuleVersionCache();
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

	private registerCommand<T extends unknown[]>(
		subscriptions: vscode.Disposable[],
		commandId: string,
		handler: (...args: T) => Promise<void> | void,
	): void {
		subscriptions.push(
			vscode.commands.registerCommand(commandId, wrapCommand(commandId, handler, this.logger)),
		);
	}

	public register(subscriptions: vscode.Disposable[]): void {
		subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_IDS.moduleSidebar, this.sidebarViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}));

		this.registerCommand(subscriptions, COMMAND_IDS.login, () => this.loginCommand());
		this.registerCommand(subscriptions, COMMAND_IDS.logout, () => this.logoutCommand());
		this.registerCommand(subscriptions, COMMAND_IDS.refresh, () => this.refreshCommand());
		this.registerCommand(subscriptions, COMMAND_IDS.initializeWorkspace, () => this.initializeWorkspaceCommand());
		this.registerCommand(subscriptions, COMMAND_IDS.openReadme, (entry?: CsmModuleEntry | ModuleTreeItem) => this.openReadmeCommand(entry));
		this.registerCommand(subscriptions, COMMAND_IDS.applyToWorkspace, (entry?: CsmModuleEntry | ModuleTreeItem) => this.applyToWorkspaceCommand(entry));
		this.registerCommand(subscriptions, COMMAND_IDS.removeModule, (entry?: CsmModuleEntry | ModuleTreeItem) => this.removeModuleCommand(entry));
		this.registerCommand(subscriptions, COMMAND_IDS.updateModule, (entry?: CsmModuleEntry | ModuleTreeItem) => this.updateModuleCommand(entry));
		this.registerCommand(subscriptions, COMMAND_IDS.contextApplyModule, (context?: WebviewModuleContext) => this.contextApplyModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextOpenReadme, (context?: WebviewModuleContext) => this.contextOpenReadmeCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextRemoveModule, (context?: WebviewModuleContext) => this.contextRemoveModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextUpdateModule, (context?: WebviewModuleContext) => this.contextUpdateModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextSelectModule, (context?: WebviewModuleContext) => this.contextSelectModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextClearModuleSelection, (context?: WebviewModuleContext) => this.contextClearModuleSelectionCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextOpenFolder, (context?: WebviewModuleContext) => this.contextOpenFolderCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextOpenRepository, (context?: WebviewModuleContext) => this.contextOpenRepositoryCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextStarModule, (context?: WebviewModuleContext) => this.contextStarModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextUnstarModule, (context?: WebviewModuleContext) => this.contextUnstarModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextLockLocalModule, (context?: WebviewModuleContext) => this.contextLockLocalModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextUnlockLocalModule, (context?: WebviewModuleContext) => this.contextUnlockLocalModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextSwitchLocalModuleMethod, (context?: WebviewModuleContext) => this.contextSwitchLocalModuleMethodCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextLinkLocalRepository, (context?: WebviewModuleContext) => this.contextLinkLocalRepositoryCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextCreateLocalRepository, (context?: WebviewModuleContext) => this.contextCreateLocalRepositoryCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextRecordLocalModule, (context?: WebviewModuleContext) => this.contextRecordLocalModuleCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.contextRemoveLocalModuleRecord, (context?: WebviewModuleContext) => this.contextRemoveLocalModuleRecordCommand(context));
		this.registerCommand(subscriptions, COMMAND_IDS.setSortOrder, (field?: ModuleSortField) => this.setSortOrderCommand(field));

		// 延迟读取缓存快照，让 Webview 先渲染骨架屏，提升启动感知速度
		// 使用微任务而非 setTimeout，确保测试中 await Promise.resolve() 能 flush
		void Promise.resolve().then(() => {
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
			// 立即用缓存的工作区状态渲染本地区域，避免首次打开视图时慢一拍；
			// 后台 refreshSidebarWorkspaceState 完成后会用最新结果覆盖。
			const cachedWorkspace = this.cacheStore.getWorkspaceContextCache();
			if (cachedWorkspace && typeof this.treeDataProvider.setWorkspaceContext === 'function') {
				this.treeDataProvider.setWorkspaceContext(cachedWorkspace);
			}
		});
		void this.setSelectionContexts();
		// 后台刷新时在侧边栏标题显示同步状态
		if (typeof this.treeDataProvider.setViewDescription === 'function') {
			this.treeDataProvider.setViewDescription(t('loadingModules'));
		}
		const sidebarWorkspaceRefresh = this.refreshSidebarWorkspaceState();
		void sidebarWorkspaceRefresh.catch((error) => {
			const message = getUserFacingErrorMessage(error, 'config');
			this.logger.error(`Failed to refresh local workspace lock state during registration: ${message}`);
			void vscode.window.showErrorMessage(t('commandErrorPrefix', { message }));
		});

		const initRefresh = this.refreshWorkspaceInitializationState({ prompt: true });
		void initRefresh.catch((error) => {
			this.logger.error(`Failed to refresh workspace initialization state during registration: ${error instanceof Error ? error.message : String(error)}`);
		});
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

		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeApply'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot: applyRoot } = ctx;

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

		const targetNamespace = await this.promptApplyTargetNamespace(workspaceFolder, applyRoot, config);
		if (typeof targetNamespace === 'undefined') {
			return;
		}
		// 版本来源 / Release 选择（issue #37）：
		// - release 引入方式（仅单选）：弹 release 列表选具体 release 后下载附件
		// - submodule / copy 单选：版本来源选择（置顶“使用默认分支”，不再包含 release）
		// - 多选：不提供版本选择，沿用默认分支（现状）
		let versionSelection: ModuleVersionSelection | undefined;
		if (applyMethod === 'release') {
			versionSelection = await this.promptReleaseSelection(selectedEntries[0], authToken);
			if (!versionSelection) {
				return;
			}
		} else if (selectedEntries.length === 1) {
			const singleEntry = selectedEntries[0];
			const defaultBranch = singleEntry.defaultBranch || 'main';
			versionSelection = await this.promptVersionSelection(
				{
					owner: singleEntry.owner,
					name: singleEntry.name,
					source: singleEntry.repoUrl,
					branch: defaultBranch,
					moduleLabel: `${singleEntry.owner}/${singleEntry.name}`,
				},
				authToken,
				{
					label: t('applyUseDefaultBranchOption', { branch: defaultBranch }),
					detail: t('applyUseDefaultBranchDetail', { branch: defaultBranch }),
				},
			);
			// 取消版本选择：保持现状，使用默认分支继续应用
		}
		const explicitTargetPathsByModuleKey = new Map<string, string>();
		for (const moduleEntry of selectedEntries) {
			explicitTargetPathsByModuleKey.set(
				this.getModuleKey(moduleEntry),
				this.workspaceModuleService.getTargetRelativePath(config, moduleEntry, targetNamespace),
			);
		}

		const duplicateTargets = this.findDuplicateTargetPaths(config, selectedEntries, explicitTargetPathsByModuleKey);
		if (duplicateTargets.length > 0) {
			void vscode.window.showErrorMessage(t('duplicateTargetPaths', { paths: duplicateTargets.join(', ') }));
			return;
		}

		const occupiedTargets = await this.findOccupiedTargetPaths(applyRoot, config, selectedEntries, explicitTargetPathsByModuleKey);
		if (occupiedTargets.length > 0) {
			const prefix = applyMethod === 'copy' ? t('copyTargetExists') : t('targetPathExists');
			void vscode.window.showWarningMessage(`${prefix}: ${occupiedTargets.join(', ')}`);
			return;
		}
		const applyMethodLabel = getApplyMethodLabel(applyMethod);

		// 单选且选择了具体版本时，确认框展示目标版本（issue #37）
		const versionLabel = versionSelection && versionSelection.kind !== 'latest'
			? versionSelection.label
			: undefined;
		const confirmation = await vscode.window.showWarningMessage(
			versionLabel
				? t('applyConfirmationWithVersion', {
					count: selectedEntries.length,
					repository: path.basename(applyRoot),
					method: applyMethodLabel,
					root: config.root,
					version: versionLabel,
				})
				: t('applyConfirmation', {
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
								const explicitTargetPath = explicitTargetPathsByModuleKey.get(this.getModuleKey(moduleEntry));
								try {
									const applied = await this.workspaceModuleService.applyModule(
										applyRoot,
										config,
										moduleEntry,
										applyMethod,
										authToken,
										(msg) => progress.report({ message: msg }),
										explicitTargetPath,
										versionSelection && versionSelection.kind !== 'latest' ? versionSelection : undefined,
									);
									return applied;
								} finally {
									progress.report({
										increment: 100 / selectedEntries.length,
										message: `${moduleEntry.owner}/${moduleEntry.name}`,
									});
								}
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
							const explicitTargetPath = explicitTargetPathsByModuleKey.get(this.getModuleKey(moduleEntry));
							const applied = await this.workspaceModuleService.applyModule(
								applyRoot,
								config,
								moduleEntry,
								applyMethod,
								authToken,
								(msg) => progress.report({ message: msg }),
								explicitTargetPath,
								versionSelection && versionSelection.kind !== 'latest' ? versionSelection : undefined,
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

		// 单选指定版本时，应用成功后缓存提交信息，便于侧边栏展示当前版本（issue #37）
		if (versionSelection && versionSelection.kind !== 'latest' && appliedCount > 0) {
			const singleEntry = selectedEntries[0];
			const appliedEntry = Object.values(config.modules).find(
				(module) => module.owner === singleEntry.owner && module.name === singleEntry.name,
			);
			if (appliedEntry) {
				await this.cacheModuleVersionInfo(appliedEntry, singleEntry, versionSelection, authToken);
			}
		}

		void vscode.window.showInformationMessage(
			t('applySuccess', {
				count: selectedEntries.length,
				method: applyMethodLabel,
				configPath: path.relative(applyRoot, config.configPath).replace(/\\/g, '/'),
			}),
		);
		// 应用成功后清除勾选状态：残留选择会让已应用模块仍显示为选中，
		// 且会连带影响下一次批量应用（把已应用模块再次纳入目标集合）。
		this.setSelectedModuleKeys([]);
		await this.refreshSidebarWorkspaceState();
	}

	public async removeModuleCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeRemove'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;
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
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeUpdate'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;
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
			// 第一步：选择版本来源
			// 第一步：选择版本来源 / Release（issue #37）
			// - release 引入方式：弹 release 列表选具体 release
			// - submodule / copy：版本来源选择（不再包含 release）
			let selection: ModuleVersionSelection | undefined;
			if (target.method === 'release') {
				selection = await this.promptReleaseSelection(moduleEntry, authToken);
			} else {
				const branch = target.branch || moduleEntry.defaultBranch || 'main';
				selection = await this.promptVersionSelection(
					{
						owner: target.owner,
						name: target.name,
						source: target.source,
						branch,
						moduleLabel: `${target.owner}/${target.name}`,
					},
					authToken,
					{
						label: t('updateToLatestOption', { branch }),
						detail: t('updateToLatestDetail', { branch }),
					},
				);
			}
			if (!selection) {
				return;
			}

			// 更新到最新：解析分支 HEAD 并复用原有"已是最新"提示
			let backupDirectory: string | undefined;
			if (selection.kind === 'latest') {
				if (target.method === 'copy') {
					const preview = await this.workspaceModuleService.previewCopyModuleUpdate(workspaceRoot, target, moduleEntry, authToken);
					if (!preview.needsUpdate) {
						void vscode.window.showInformationMessage(t('moduleAlreadyUpToDate', {
							module: targetLabel,
							branch: preview.branch,
							ref: this.formatShortRef(preview.latestRef),
						}));
						return;
					}
					selection.ref = preview.latestRef;
					selection.label = `${this.formatShortSha(preview.latestRef)} · ${t('latestRef')}`;
					backupDirectory = preview.backupDirectory;
				} else {
					const latestRef = await this.workspaceModuleService.resolveRemoteBranchRef(workspaceRoot, target.source, selection.branch, authToken);
					selection.ref = latestRef;
					selection.label = `${this.formatShortSha(latestRef)} · ${t('latestRef')}`;
				}
			}

			// 确认对话框：当前版本 → 目标版本 + 备份提示
			const confirmed = await this.confirmVersionUpdate(target, selection, targetLabel, backupDirectory);
			if (!confirmed) {
				return;
			}

			let updateResult: ModuleUpdateResult | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressUpdating', { module: targetLabel }),
					cancellable: false,
				},
				async () => {
					const options: UpdateModuleOptions = { authToken, repoRoot, selection };
					updateResult = await this.workspaceModuleService.updateModule(
						workspaceRoot,
						target,
						moduleEntry,
						options,
					);
					config = this.workspaceModuleService.withAppliedModule(config!, updateResult.entry);
					await this.workspaceModuleService.writeConfig(config);
					await this.cacheModuleVersionInfo(updateResult.entry, moduleEntry, selection, authToken);
				},
			);
			const versionLabel = this.formatTargetVersionLabel(updateResult!.entry, selection);
			void vscode.window.showInformationMessage(
				updateResult!.backupPath
					? t('updateSuccessVersionWithBackup', {
						module: targetLabel,
						version: versionLabel,
						backupPath: updateResult!.backupPath,
					})
					: t('updateSuccessVersion', {
						module: targetLabel,
						version: versionLabel,
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

	// ----------------------------------------------------------------------
	// 模块版本选择（issue #37）
	// ----------------------------------------------------------------------

	/**
	 * 第一步：选择版本来源（最新/使用默认分支 / 提交记录 / 标签 / 分支）。
	 * release 已作为独立引入方式，不再出现在版本来源中。
	 * 选择具体来源后进入第二步选择具体版本；分支来源会再进入该分支的提交列表。
	 */
	private async promptVersionSelection(
		context: VersionSelectionContext,
		authToken: string | undefined,
		latestOption: VersionLatestOption,
	): Promise<ModuleVersionSelection | undefined> {
		const { owner, name, branch, moduleLabel } = context;
		const repoUrl = context.source;
		const sourceItems: VersionSourceQuickPickItem[] = [
			{
				label: latestOption.label,
				detail: latestOption.detail,
				versionSource: 'latest',
				alwaysShow: true,
			},
			{
				label: t('versionSourceCommits'),
				detail: t('versionSourceCommitsDetail', { count: VERSION_LIST_LIMIT, branch }),
				versionSource: 'commits',
			},
			{
				label: t('versionSourceTags'),
				detail: t('versionSourceTagsDetail', { count: VERSION_LIST_LIMIT }),
				versionSource: 'tags',
			},
			{
				label: t('versionSourceBranches'),
				detail: t('versionSourceBranchesDetail'),
				versionSource: 'branches',
			},
		];
		const pickedSource = await vscode.window.showQuickPick(sourceItems, {
			placeHolder: t('versionSourcePlaceholder', { module: moduleLabel }),
			ignoreFocusOut: true,
		});
		if (!pickedSource) {
			return undefined;
		}

		switch (pickedSource.versionSource) {
			case 'latest':
				return { kind: 'latest', branch, label: latestOption.label };
			case 'commits': {
				const commits = await this.versionService.listCommits(owner, name, branch, repoUrl, authToken);
				return this.pickCommit(commits, branch);
			}
			case 'tags': {
				const tags = await this.versionService.listTags(owner, name, repoUrl, authToken);
				return this.pickTag(tags, branch);
			}
			case 'branches': {
				const branches = await this.versionService.listBranches(owner, name, repoUrl, authToken);
				const pickedBranch = await this.pickBranch(branches);
				if (!pickedBranch) {
					return undefined;
				}
				const commits = await this.versionService.listCommits(owner, name, pickedBranch.name, repoUrl, authToken);
				return this.pickCommit(commits, pickedBranch.name);
			}
			default:
				return undefined;
		}
	}

	private async pickCommit(commits: ModuleCommitInfo[], branch: string): Promise<ModuleVersionSelection | undefined> {
		if (commits.length === 0) {
			void vscode.window.showInformationMessage(t('versionListEmpty', { kind: t('versionKindCommits') }));
			return undefined;
		}
		const items: CommitQuickPickItem[] = commits.map((commit) => ({
			label: this.formatCommitItemLabel(commit),
			description: commit.sha,
			commit,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: t('versionCommitsPlaceholder'),
			ignoreFocusOut: true,
		});
		if (!picked) {
			return undefined;
		}
		return {
			kind: 'commit',
			versionRef: picked.commit.sha,
			ref: picked.commit.sha,
			branch,
			label: picked.label,
			commitInfo: picked.commit.message,
			commitDate: picked.commit.date,
		};
	}

	private async pickTag(tags: ModuleTagInfo[], branch: string): Promise<ModuleVersionSelection | undefined> {
		if (tags.length === 0) {
			void vscode.window.showInformationMessage(t('versionListEmpty', { kind: t('versionKindTags') }));
			return undefined;
		}
		const items: TagQuickPickItem[] = tags.map((tag) => ({
			label: `${tag.name} · ${this.formatShortSha(tag.sha)}${tag.date ? ` · ${formatRelativeDate(tag.date)}` : ''}`,
			description: tag.sha,
			tag,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: t('versionTagsPlaceholder'),
			ignoreFocusOut: true,
		});
		if (!picked) {
			return undefined;
		}
		return {
			kind: 'tag',
			versionRef: picked.tag.name,
			// 注解标签的 sha 可能是 tag 对象 SHA；更新时 git 会按 tag 名解析，无需保证为提交 SHA
			ref: picked.tag.sha,
			branch,
			label: picked.label,
		};
	}

	/**
	 * release 引入方式：弹 release 列表选具体一个（含当前/最新），再下载其附件。
	 */
	private async promptReleaseSelection(
		moduleEntry: CsmModuleEntry,
		authToken: string | undefined,
	): Promise<ModuleVersionSelection | undefined> {
		const releases = await this.versionService.listReleases(moduleEntry.owner, moduleEntry.name, authToken);
		const branch = moduleEntry.defaultBranch || 'main';
		return this.pickRelease(releases, branch);
	}

	private async pickRelease(releases: ModuleReleaseInfo[], branch: string): Promise<ModuleVersionSelection | undefined> {
		if (releases.length === 0) {
			void vscode.window.showInformationMessage(t('versionListEmpty', { kind: t('versionKindReleases') }));
			return undefined;
		}
		const items: ReleaseQuickPickItem[] = releases.map((release) => ({
			label: `${release.name} · ${release.tagName}${release.publishedAt ? ` · ${formatRelativeDate(release.publishedAt)}` : ''}`,
			description: release.tagName,
			release,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: t('versionReleasesPlaceholder'),
			ignoreFocusOut: true,
		});
		if (!picked) {
			return undefined;
		}
		const assets = picked.release.assets ?? [];
		if (assets.length === 0) {
			void vscode.window.showWarningMessage(t('releaseHasNoAssets', { release: picked.release.name }));
			return undefined;
		}
		return {
			kind: 'release',
			versionRef: picked.release.tagName,
			releaseName: picked.release.name,
			releaseAssets: assets,
			branch,
			// 确认框/成功提示/侧边栏显示 tag 名（issue #37）；列表本身仍显示「标题 · tag · 时间」
			label: picked.release.tagName,
		};
	}

	private async pickBranch(branches: ModuleBranchInfo[]): Promise<ModuleBranchInfo | undefined> {
		if (branches.length === 0) {
			void vscode.window.showInformationMessage(t('versionListEmpty', { kind: t('versionKindBranches') }));
			return undefined;
		}
		const items: BranchQuickPickItem[] = branches.map((branch) => ({
			label: branch.name,
			description: this.formatShortSha(branch.sha),
			branch,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: t('versionBranchesPlaceholder'),
			ignoreFocusOut: true,
		});
		return picked?.branch;
	}

	/**
	 * 更新确认对话框：显示 当前版本 → 目标版本 + 备份提示（issue #37）。
	 */
	private async confirmVersionUpdate(
		target: LocalModuleConfigEntry,
		selection: ModuleVersionSelection,
		targetLabel: string,
		backupDirectory?: string,
	): Promise<boolean> {
		const current = this.formatCurrentVersionLabel(target);
		const message = target.method === 'submodule'
			? t('versionUpdateSubmoduleConfirmation', { module: targetLabel, current, target: selection.label })
			: backupDirectory
				? t('versionUpdateConfirmationWithBackup', { module: targetLabel, current, target: selection.label, backupDirectory })
				: t('versionUpdateConfirmationWithoutBackup', { module: targetLabel, current, target: selection.label });
		const confirmation = await vscode.window.showWarningMessage(
			message,
			{ modal: true },
			t('updateAction'),
		);
		return confirmation === t('updateAction');
	}

	/**
	 * 生成更新成功提示中的目标版本标签：
	 * tag / release 优先显示来源名称，否则显示 短SHA · 提交信息 · 相对日期。
	 */
	private formatTargetVersionLabel(entry: LocalModuleConfigEntry, selection: ModuleVersionSelection): string {
		if (entry.versionKind === 'release') {
			// 显示 release 的 tag 名（不用标题）
			return entry.versionRef || selection.label || entry.releaseName || t('versionUnknown');
		}
		if (entry.versionKind === 'tag') {
			return entry.versionRef || selection.label || this.formatShortSha(entry.ref) || t('versionUnknown');
		}
		const relative = formatRelativeDate(selection.commitDate);
		const parts = [this.formatShortSha(entry.ref) || t('versionUnknown')];
		if (selection.commitInfo) {
			parts.push(this.truncateCommitMessage(selection.commitInfo));
		}
		if (relative) {
			parts.push(relative);
		}
		return parts.join(' · ');
	}

	/**
	 * 构建当前版本展示文本（确认对话框与侧边栏共用）：
	 * tag / release 优先显示来源名称，否则读本地缓存显示 短SHA · 提交信息 · 相对日期。
	 */
	private formatCurrentVersionLabel(target: LocalModuleConfigEntry): string {
		if (target.versionKind === 'release') {
			// 显示 release 的 tag 名（不用标题）
			return target.versionRef || target.releaseName || t('versionUnknown');
		}
		if (target.versionKind === 'tag' && target.versionRef) {
			return target.versionRef;
		}
		const cacheEntry = this.versionCache[`${target.owner}/${target.name}`];
		const ref = this.formatShortSha(target.ref);
		if (cacheEntry && cacheEntry.ref === target.ref && cacheEntry.commitInfo) {
			const parts = [ref, this.truncateCommitMessage(cacheEntry.commitInfo)];
			const relative = formatRelativeDate(cacheEntry.date);
			if (relative) {
				parts.push(relative);
			}
			return parts.join(' · ');
		}
		return ref || t('versionUnknown');
	}

	/**
	 * 更新成功后把目标版本提交信息写入本地缓存（key=`owner/name`，issue #37），
	 * 供侧边栏展示当前版本时读取，避免每次在线查询。
	 */
	private async cacheModuleVersionInfo(
		updatedEntry: LocalModuleConfigEntry,
		moduleEntry: CsmModuleEntry,
		selection: ModuleVersionSelection,
		authToken: string | undefined,
	): Promise<void> {
		try {
			// Release 附件方式没有对应的提交 SHA，跳过提交信息缓存（侧边栏用 releaseName 展示）
			if (selection.kind === 'release') {
				return;
			}
			const cacheKey = `${updatedEntry.owner}/${updatedEntry.name}`;
			let commitInfo = selection.commitInfo;
			let date = selection.commitDate;
			// 最新 / 标签 / Release 来源在列表阶段没有提交信息，更新后尽力解析一次
			if (!commitInfo) {
				const resolved = await this.versionService.resolveCommitInfo(
					updatedEntry.owner,
					updatedEntry.name,
					updatedEntry.ref,
					updatedEntry.source,
					selection.branch || moduleEntry.defaultBranch || 'main',
					authToken,
				);
				commitInfo = resolved.commitInfo;
				date = resolved.date ?? date;
			}
			this.versionCache = {
				...this.versionCache,
				[cacheKey]: {
					ref: updatedEntry.ref,
					commitInfo,
					date,
				},
			};
			await this.cacheStore.setModuleVersionCache(this.versionCache);
		} catch (error) {
			this.logger.warn(`Failed to cache module version info for ${updatedEntry.owner}/${updatedEntry.name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private formatCommitItemLabel(commit: ModuleCommitInfo): string {
		const relative = formatRelativeDate(commit.date);
		const parts = [this.formatShortSha(commit.sha), this.truncateCommitMessage(commit.message)];
		if (relative) {
			parts.push(relative);
		}
		return parts.join(' · ');
	}

	private truncateCommitMessage(message: string): string {
		const singleLine = message.split(/\r?\n/)[0]?.trim() ?? '';
		if (singleLine.length <= 60) {
			return singleLine;
		}
		return `${singleLine.slice(0, 57)}...`;
	}

	private formatShortSha(sha: string | undefined): string {
		if (!sha) {
			return '';
		}
		return sha.length > 10 ? sha.slice(0, 7) : sha;
	}

	public async switchLocalModuleMethodCommand(entry: LocalManagedModuleEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeSwitchMethod'));
			return;
		}
		// 本地模块（method: local）无 GitHub 源，不支持切换引入方式
		if (entry.method === 'local') {
			return;
		}
		const { workspaceFolder, repoRoot } = ctx;
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

		// 三选一选择器：submodule / copy / GitHub Release（当前方式标识）
		const nextMethod = await this.promptSwitchMethod(target.method);
		if (!nextMethod || nextMethod === target.method) {
			return;
		}

		let authToken: string | undefined;
		let releaseSelection: ModuleVersionSelection | undefined;
		if (nextMethod === 'release') {
			// 切到 release：弹 release 列表选具体一个
			authToken = await this.ensureToken(entry.visibility === 'private');
			releaseSelection = await this.promptReleaseSelection(entry.moduleEntry, authToken);
			if (!releaseSelection) {
				return;
			}
		} else if (nextMethod === 'submodule' && entry.visibility === 'private') {
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

		// 从 copy/submodule 切到 release 会整体替换目录（无 zip 备份提示）；copy → submodule 保留 zip 备份提示
		const isCopyToSubmodule = target.method === 'copy' && nextMethod === 'submodule';
		const backupDir = isCopyToSubmodule ? path.join(repoRoot, '.csm-module-backups') : '';
		const confirmationMessage = isCopyToSubmodule
			? t('switchMethodConfirmationWithBackup', {
				module: moduleLabel,
				repository,
				currentMethod: currentMethodLabel,
				targetMethod: nextMethodLabel,
				targetPath: target.path,
				backupDirectory: backupDir,
			})
			: t('switchMethodConfirmation', {
				module: moduleLabel,
				repository,
				currentMethod: currentMethodLabel,
				targetMethod: nextMethodLabel,
				targetPath: target.path,
			});

		const confirmation = await vscode.window.showWarningMessage(
			confirmationMessage,
			{ modal: true },
			t('switchMethodAction'),
		);
		if (confirmation !== t('switchMethodAction')) {
			return;
		}

		try {
			let switchResult: ModuleUpdateResult | undefined;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t('progressSwitchingMethod', { module: moduleLabel, method: nextMethodLabel }),
					cancellable: false,
				},
				async () => {
					switchResult = await this.workspaceModuleService.switchModuleMethod(
						repoRoot,
						target,
						nextMethod,
						authToken,
						repoRoot,
						releaseSelection,
					);
					config = this.workspaceModuleService.withAppliedModule(config!, switchResult.entry);
					await this.workspaceModuleService.writeConfig(config);
				},
			);

			if (switchResult?.backupPath) {
				void vscode.window.showInformationMessage(t('switchMethodSuccessWithBackup', {
					module: moduleLabel,
					method: nextMethodLabel,
					backupPath: switchResult.backupPath,
				}));
			} else {
				void vscode.window.showInformationMessage(t('switchMethodSuccess', { module: moduleLabel, method: nextMethodLabel }));
			}
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'update');
			this.logger.error(`Failed to switch module ${target.owner}/${target.name} to ${nextMethod}: ${message}`);
			void vscode.window.showErrorMessage(t('switchMethodFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	private async promptSwitchMethod(current: ModuleApplyMethod): Promise<ModuleApplyMethod | undefined> {
		const options: Array<{ method: ModuleApplyMethod; label: string; description: string }> = [
			{ method: 'submodule', label: t('applyMethodSubmoduleLabel'), description: t('applyMethodSubmoduleDescription') },
			{ method: 'copy', label: t('applyMethodCopyLabel'), description: t('applyMethodCopyDescription') },
			{ method: 'release', label: t('applyMethodReleaseLabel'), description: t('applyMethodReleaseDescription') },
		];
		const items: Array<ApplyMethodQuickPickItem & { picked?: boolean }> = options.map((option) => ({
			label: option.label,
			description: option.description,
			method: option.method,
			picked: option.method === current,
		}));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: t('switchMethodPlaceholder'),
		});
		return pick?.method;
	}

	public async toggleLocalModuleLockCommand(entry: LocalManagedModuleEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeToggleLock'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;
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
		const moduleLabel = target.owner ? `${target.owner}/${target.name}` : target.name;
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

	/**
	 * 把未管理文件夹记录为「本地模块」（method: local，无 GitHub 源）。
	 * 仅在配置中登记路径，不改变目录内容；记录后该目录不再作为未管理文件夹展示。
	 * 深层目录（如 csm/patha/pathb/module）会先选择以哪一级目录作为模块目录。
	 */
	public async recordLocalModuleCommand(folder: LocalUnmanagedFolderEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeRecordLocalModule'));
			return;
		}
		const { workspaceFolder, workspaceRoot } = ctx;

		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			const initialized = await this.initializeLocalModuleConfig(workspaceRoot, t('recordLocalModuleNeedsInit'));
			if (!initialized) {
				return;
			}
			config = initialized;
		}

		// 深层目录时先询问以哪一级目录作为模块目录（当前模块 vs 各级祖先目录）
		const targetFolder = await this.promptLocalModuleDirectorySelection(
			folder,
			config.root,
			config,
			workspaceRoot,
		);
		if (!targetFolder) {
			return;
		}
		if (config && this.containsManagedModuleUnder(config, targetFolder.path)) {
			void vscode.window.showWarningMessage(t('recordLocalModuleContainsManagedModules', { folder: targetFolder.path }));
			return;
		}

		const folderAbsolutePath = path.resolve(workspaceRoot, targetFolder.path);
		try {
			const stat = await fs.stat(folderAbsolutePath);
			if (!stat.isDirectory()) {
				void vscode.window.showWarningMessage(t('localFolderMissing', { folder: targetFolder.path }));
				return;
			}
		} catch {
			void vscode.window.showWarningMessage(t('localFolderMissing', { folder: targetFolder.path }));
			return;
		}

		// 检查目标路径是否已被记录（无论已管理还是本地模块）
		const targetPath = this.workspaceModuleService.normalizeRootPath(targetFolder.path);
		const existingEntry = Object.values(config.modules).find(
			(entry) => this.workspaceModuleService.normalizeRootPath(entry.path) === targetPath,
		);
		if (existingEntry) {
			void vscode.window.showWarningMessage(t('recordLocalModuleConflict', { path: targetFolder.path }));
			return;
		}

		const key = targetFolder.name;
		if (config.modules[key]) {
			void vscode.window.showWarningMessage(t('recordLocalModuleConflict', { path: targetFolder.path }));
			return;
		}

		const entry: LocalModuleConfigEntry = {
			key,
			name: targetFolder.name,
			owner: '',
			source: '',
			method: 'local',
			path: targetPath,
			ref: '',
			branch: '',
			locked: false,
		};
		try {
			config = this.workspaceModuleService.withAppliedModule(config, entry);
			await this.workspaceModuleService.writeConfig(config);
			void vscode.window.showInformationMessage(t('recordLocalModuleSuccess', { name: targetFolder.name }));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'config');
			this.logger.error(`Failed to record local module ${targetFolder.path}: ${message}`);
			void vscode.window.showErrorMessage(t('recordLocalModuleFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	/**
	 * 移除本地模块的记录（method: local）。仅删除配置记录，目录内容保留，
	 * 移除后该目录恢复为未管理文件夹。
	 */
	public async removeLocalModuleRecordCommand(entry: LocalManagedModuleEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeRemoveLocalModuleRecord'));
			return;
		}
		const { workspaceFolder, workspaceRoot } = ctx;
		let config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			void vscode.window.showWarningMessage(t('noWorkspaceConfig'));
			return;
		}

		const target = this.findAppliedLocalManagedEntry(config, entry);
		if (!target || target.method !== 'local') {
			void vscode.window.showWarningMessage(t('selectedModuleNotApplied'));
			return;
		}

		const confirmation = await vscode.window.showWarningMessage(
			t('removeLocalModuleRecordConfirmation', { name: target.name }),
			{ modal: true },
			t('removeLocalModuleRecord'),
		);
		if (confirmation !== t('removeLocalModuleRecord')) {
			return;
		}

		try {
			config = this.workspaceModuleService.withoutModule(config, target.key);
			await this.workspaceModuleService.writeConfig(config);
			void vscode.window.showInformationMessage(t('removeLocalModuleRecordSuccess', { name: target.name }));
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'config');
			this.logger.error(`Failed to remove local module record ${target.path}: ${message}`);
			void vscode.window.showErrorMessage(t('removeLocalModuleRecordFailed', { message }));
			return;
		}

		await this.refreshSidebarWorkspaceState();
	}

	public async createLocalFolderRepositoryCommand(folder: LocalUnmanagedFolderEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeCreateRepository'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;

		// 深层目录时先询问以哪一级目录作为新 GitHub 仓库的根（当前模块 vs 各级祖先目录）
		const sidebarConfig = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		const moduleRoot = sidebarConfig?.root ?? this.getConfiguredDefaultModuleRoot();
		const targetFolder = await this.promptRepositoryRootSelection(folder, moduleRoot, sidebarConfig, workspaceRoot);
		if (!targetFolder) {
			return;
		}
		if (sidebarConfig && this.containsManagedModuleUnder(sidebarConfig, targetFolder.path)) {
			void vscode.window.showWarningMessage(t('createRepositoryRootContainsManagedModules', { folder: targetFolder.path }));
			return;
		}

		const folderAbsolutePath = path.resolve(workspaceRoot, targetFolder.path);
		try {
			const stat = await fs.stat(folderAbsolutePath);
			if (!stat.isDirectory()) {
				void vscode.window.showWarningMessage(t('localFolderMissing', { folder: targetFolder.path }));
				return;
			}
		} catch {
			void vscode.window.showWarningMessage(t('localFolderMissing', { folder: targetFolder.path }));
			return;
		}

		const token = await this.ensureToken(true);
		if (!token || typeof this.githubService.createRepository !== 'function') {
			void vscode.window.showWarningMessage(t('signInRequiredForCreateRepository'));
			return;
		}

		// 查询创建仓库的归属候选（个人账号 + 有权限的组织）；获取失败时中断创建流程
		let ownerCandidates: RepositoryOwnerCandidates;
		try {
			ownerCandidates = await this.fetchRepositoryOwnerCandidates(token);
		} catch (error) {
			const message = getUserFacingErrorMessage(error, 'createRepo');
			this.logger.error(`Failed to fetch repository owner candidates: ${message}`);
			void vscode.window.showErrorMessage(t('createRepositoryOwnerFetchFailed', { message }));
			return;
		}

		const repositoryConfig = await this.promptRepositoryCreation(targetFolder.name, ownerCandidates);
		if (!repositoryConfig) {
			return;
		}

		const confirmation = await vscode.window.showWarningMessage(
			t('createRepositoryConfirmation', {
				visibility: repositoryConfig.visibility === 'private' ? t('createRepositoryPrivateLabel') : t('createRepositoryPublicLabel'),
				owner: repositoryConfig.owner.login,
				name: repositoryConfig.name,
				folder: targetFolder.path,
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
						owner: repositoryConfig.owner.kind === 'org' ? repositoryConfig.owner.login : undefined,
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
						commitMessage: t('publishInitialCommitMessage', { folder: targetFolder.name }),
						authorName: gitIdentity.name,
						authorEmail: gitIdentity.email,
					});
					publishedHeadRef = publishedFolder.headRef;
					publishedBranch = publishedFolder.branch;
				},
			);
			if (createdRepository && publishedHeadRef) {
				try {
					await this.syncPublishedLocalFolderState(workspaceFolder, workspaceRoot, repoRoot, targetFolder, createdRepository, publishedHeadRef, publishedBranch, token);
					await this.refreshSidebarWorkspaceState();
				} catch (error) {
					localStateSyncFailed = true;
					const message = getUserFacingErrorMessage(error, 'config');
					const repositoryLabel = repositoryName ?? repositoryConfig.name;
					this.logger.error(`Created and published GitHub repository ${repositoryLabel}, but failed to sync local workspace state for ${targetFolder.path}: ${message}`);
					void vscode.window.showWarningMessage(t('createRepositoryLocalStateSyncFailed', {
						repository: repositoryLabel,
						folder: targetFolder.path,
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
			this.logger.error(`Failed to create or publish GitHub repository for ${targetFolder.path}: ${message}`);
			void vscode.window.showErrorMessage(
				repositoryCreated
					? t('createRepositoryPublishFailed', { folder: targetFolder.path, message })
					: t('createRepositoryFailed', { message }),
			);
		}
	}

	public async linkLocalFolderRepositoryCommand(folder: LocalUnmanagedFolderEntry): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			void vscode.window.showWarningMessage(t('openWorkspaceBeforeLinkRepository'));
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;
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
			const existingEntryAtPath = Object.values(config.modules).find(
				(entry) => this.workspaceModuleService.normalizeRootPath(entry.path) === targetPath,
			);
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
					const existingGitModule = repoRoot
						? await this.workspaceModuleService.getExistingSubmoduleConfigEntry(repoRoot, targetPath)
						: undefined;
					const resolvedBranch = existingGitModule?.branch || branch;
					const ref = existingGitModule?.ref
						?? await this.workspaceModuleService.resolveRemoteBranchRef(workspaceRoot, selection.repoUrl, resolvedBranch, authToken);
					const linkedMethod: ModuleApplyMethod = existingGitModule?.method ?? 'copy';
					const locked = existingEntryAtPath ? this.isLocalModuleLocked(existingEntryAtPath) : true;
					if (existingEntryAtPath && existingEntryAtPath.key !== moduleKey) {
						config = this.workspaceModuleService.withoutModule(config, existingEntryAtPath.key);
					}
					linkedEntry = await this.setLocalModuleLockState(workspaceRoot, {
						key: moduleKey,
						name: selection.name,
						owner: selection.owner,
						source: existingGitModule?.source ?? selection.repoUrl,
						method: linkedMethod,
						path: targetPath,
						ref,
						branch: resolvedBranch,
						locked,
					}, locked);
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
		// 本地模块（method: local）创建 GitHub 仓库成功后升级为已管理：先移除原 local 记录
		const existingLocalAtPath = Object.values(config.modules).find(
			(entry) => entry.method === 'local' && this.workspaceModuleService.normalizeRootPath(entry.path) === targetPath,
		);
		let nextConfig = config;
		if (existingLocalAtPath) {
			nextConfig = this.workspaceModuleService.withoutModule(nextConfig, existingLocalAtPath.key);
		}
		nextConfig = this.workspaceModuleService.withAppliedModule(nextConfig, lockedEntry);
		await this.workspaceModuleService.writeConfig(nextConfig);
	}

	private async initializePublishedFolderConfig(
		workspaceRoot: string,
		folder: LocalUnmanagedFolderEntry,
	): Promise<LocalModuleConfig> {
		const defaultRoot = this.getConfiguredDefaultModuleRoot();
		const normalizedFolderPath = this.workspaceModuleService.normalizeRootPath(folder.path);
		const inferredRoot = path.posix.dirname(normalizedFolderPath);
		const configRoot = inferredRoot && inferredRoot !== '.' && inferredRoot !== '/'
			? this.workspaceModuleService.normalizeRootPath(inferredRoot)
			: this.workspaceModuleService.normalizeRootPath(defaultRoot);
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
		return this.workspaceModuleService.setModuleLocked(workspaceRoot, entry, locked);
	}

	private async syncWorkspaceModuleLockStates(workspaceRoot: string, config: LocalModuleConfig | undefined): Promise<void> {
		if (!config) {
			return;
		}
		await this.workspaceModuleService.syncModuleLockStates(workspaceRoot, Object.values(config.modules));
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
			void vscode.window.showErrorMessage(t('signOutFailed', { message: t('signOutUnavailable') }));
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
	 * 刷新入口（issue #76）：让用户选择是刷新在线模块目录缓存，还是重新搜索本地模块。
	 * 两种模式完成后都会重算本地工作区状态与初始化提示。
	 */
	public async refreshCommand(): Promise<void> {
		const pick = await vscode.window.showQuickPick<RefreshModeQuickPickItem>(
			[
				{
					label: t('refreshOnlineCatalogLabel'),
					detail: t('refreshOnlineCatalogDetail'),
					mode: 'online',
				},
				{
					label: t('refreshLocalModulesLabel'),
					detail: t('refreshLocalModulesDetail'),
					mode: 'local',
				},
			],
			{ placeHolder: t('refreshModePickPlaceholder') },
		);
		if (!pick) {
			return;
		}
		if (pick.mode === 'local') {
			await this.refreshLocalModulesWithFeedback();
			return;
		}
		await this.refreshOnlineCatalog();
	}

	/**
	 * 从 GitHub 刷新在线模块目录并更新本地缓存，随后重算本地工作区状态。
	 */
	private async refreshOnlineCatalog(): Promise<void> {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: t('outputChannelName') },
			async (progress) => {
				progress.report({ message: t('fetchingCatalog') });
				try {
					await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
				} finally {
					await this.refreshLocalModulesOnly();
				}
			},
		);
	}

	/**
	 * 用户主动选择"重新搜索本地模块"：显示进度提示，并在完成后反馈扫描结果。
	 */
	private async refreshLocalModulesWithFeedback(): Promise<void> {
		const unmanagedCount = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: t('outputChannelName') },
			async (progress) => {
				progress.report({ message: t('rescanningLocalModules') });
				return this.refreshLocalModulesOnly();
			},
		);
		const message = unmanagedCount > 0
			? t('localModulesRescanned', { count: String(unmanagedCount) })
			: t('localModulesRescannedNone');
		void vscode.window.showInformationMessage(message);
	}

	/**
	 * 重新搜索本地模块目录（更新未管理模块列表），并重算工作区初始化提示。
	 * 返回当前发现的未管理模块数量；作为在线刷新完成后的静默补充步骤时不产生任何 UI 提示。
	 */
	private async refreshLocalModulesOnly(): Promise<number> {
		let unmanagedCount = 0;
		try {
			unmanagedCount = await this.refreshSidebarWorkspaceState();
		} catch (error) {
			this.logger.warn(`Failed to refresh sidebar workspace state after module refresh: ${error instanceof Error ? error.message : String(error)}`);
		}
		try {
			await this.refreshWorkspaceInitializationState({ prompt: false });
		} catch (error) {
			this.logger.warn(`Failed to refresh workspace initialization state after module refresh: ${error instanceof Error ? error.message : String(error)}`);
		}
		return unmanagedCount;
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
		if (typeof this.githubService.setRepositoryStarred !== 'function') {
			return;
		}

		const config = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager);
		const autoStarModuleRepo = config.get<boolean>(CONFIG_KEYS.autoStarModuleRepo, true);
		const autoStarCsmCore = config.get<boolean>(CONFIG_KEYS.autoStarCsmCore, true);

		// 如果没有需要 star 的操作，提前返回
		if (!autoStarModuleRepo && !autoStarCsmCore) {
			return;
		}

		const token = await this.ensureToken(false);
		if (!token) {
			return;
		}

		// Star 已应用的模块仓库
		if (autoStarModuleRepo && entries.length > 0) {
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

		// Star CSM Core 框架仓库
		if (autoStarCsmCore) {
			const { owner, name } = GITHUB.csmCoreRepo;
			try {
				const alreadyStarred = typeof this.githubService.isRepositoryStarred === 'function'
					? await this.githubService.isRepositoryStarred(owner, name, token)
					: false;
				if (!alreadyStarred) {
					await this.githubService.setRepositoryStarred(owner, name, token, true);
				}
			} catch (error) {
				this.logger.warn(`Failed to auto-star CSM Core (${owner}/${name}): ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private async hydrateStarStates(modules: CsmModuleEntry[], token: string | undefined, onProgress?: (done: number, total: number) => void): Promise<CsmModuleEntry[]> {
		if (modules.length === 0 || !token || typeof this.githubService.isRepositoryStarred !== 'function') {
			onProgress?.(modules.length, modules.length);
			return modules;
		}
		const starStates = await this.fetchStarStatesParallel(modules, token, 8, onProgress);
		return modules.map((moduleEntry) => ({
			...moduleEntry,
			starred: starStates.get(this.getModuleKey(moduleEntry)),
		}));
	}

	private async fetchStarStatesParallel(
		modules: CsmModuleEntry[],
		token: string,
		concurrency: number,
		onProgress?: (done: number, total: number) => void,
	): Promise<Map<string, boolean>> {
		const starredStates = new Map<string, boolean>();
		const isRepositoryStarred = this.githubService.isRepositoryStarred?.bind(this.githubService);
		if (!isRepositoryStarred) {
			return starredStates;
		}
		let cursor = 0;
		let completed = 0;
		const total = modules.length;
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
				completed += 1;
				onProgress?.(completed, total);
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
		// 阶段 1：显示骨架屏，让用户立刻感知到刷新正在进行
		if (!options.preserveVisibleModules) {
			this.treeDataProvider.setLoading(t('fetchingCatalog'), true);
		}

		const token = await this.ensureToken(options.interactiveAuth);
		if (typeof this.treeDataProvider.setOfflineMode === 'function') {
			this.treeDataProvider.setOfflineMode(false);
		}

		// 阶段 2：检查 GitHub 更新
		if (!options.preserveVisibleModules) {
			this.treeDataProvider.setLoading(t('checkingUpdates'));
		}

		try {
			const cachedSnapshot = this.cacheStore.getModuleSnapshot();
			const previousEtag = this.cacheStore.getModuleEtag();
			const fetchResult = await this.githubService.fetchModules(token, {
				etag: previousEtag,
				onProgress: (fetched, total) => {
					if (!options.preserveVisibleModules) {
						this.treeDataProvider.setLoading(t('fetchingCatalogProgress', { fetched, total }));
					}
				},
			});

			if (fetchResult.notModified) {
				// 304 Not Modified：使用缓存数据，仅在必要时补充 star 状态
				this.logger.info('Module list unchanged since last fetch (304 Not Modified).');
				const cachedModules = cachedSnapshot?.modules ?? this.availableModules;

				// 检查缓存中是否已有足够的 star 状态
				const cachedStarCount = cachedModules.filter(m => typeof m.starred === 'boolean').length;
				const needsStarHydration = !!token && cachedStarCount < cachedModules.length;

				if (needsStarHydration && !options.preserveVisibleModules) {
					this.treeDataProvider.setLoading(t('loadingStarStatus'));
				}

				const modulesWithStarState = needsStarHydration
					? await this.hydrateStarStates(cachedModules, token)
					: cachedModules;

				const nextSnapshot = await this.cacheStore.setModuleSnapshot(modulesWithStarState, {
					refreshAccountId: token ? this.currentAccountId : undefined,
					refreshAccountLabel: token ? this.currentAccountLabel : undefined,
				});
				this.applyCachedModules(nextSnapshot);
				await this.refreshSidebarWorkspaceState();
				// 后台补全已应用模块的版本提交信息（写入缓存，避免之后每次在线查询）
				void this.backfillAppliedModuleVersionInfos(token);
				if (fetchResult.etag) {
					await this.cacheStore.setModuleEtag(fetchResult.etag);
				}
				if (options.showSuccessMessage) {
					void vscode.window.showInformationMessage(t('modulesUpToDate'));
				}
				return;
			}

			// 新数据到达：立即预览渲染模块卡片，让用户看到内容
			const modules = fetchResult.modules;
			if (!options.preserveVisibleModules && typeof this.treeDataProvider.setModulesPreview === 'function') {
				this.treeDataProvider.setModulesPreview(this.filterModules(modules));
			}

			// 阶段 3：并行补充 star 状态和 README 预加载
			if (!options.preserveVisibleModules) {
				this.treeDataProvider.setLoading(t('loadingDetailsProgress', { done: 0, total: modules.length * 2 }));
			}

			const detailProgress = { stars: 0, readmes: 0 };
			const updateDetailProgress = () => {
				if (!options.preserveVisibleModules) {
					this.treeDataProvider.setLoading(
						t('loadingDetailsProgress', { done: detailProgress.stars + detailProgress.readmes, total: modules.length * 2 }),
					);
				}
			};

			const [modulesWithStarState, refreshedReadme] = await Promise.all([
				this.hydrateStarStates(modules, token, (done) => {
					detailProgress.stars = done;
					updateDetailProgress();
				}),
				this.fetchReadmesParallel(modules, token, 5, (done) => {
					detailProgress.readmes = done;
					updateDetailProgress();
				}),
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
			// 后台检测未应用到本地的模块的远程 LabVIEW 版本
			void this.detectRemoteVersionsBackground(token);
			// 后台补全已应用模块的版本提交信息（写入缓存，避免之后每次在线查询）
			void this.backfillAppliedModuleVersionInfos(token);
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
	 * 后台检测远程仓库的 LabVIEW 开发版本，优先处理未应用到本地的模块。
	 * 检测结果缓存至 cacheStore，检测完成后刷新侧边栏。
	 */
	private async detectRemoteVersionsBackground(token: string | undefined): Promise<void> {
		const lvCache = this.cacheStore.getLvVersionCache();
		// 筛选需要检测的模块：不在本地已应用列表中，且缓存中尚无版本
		const needsDetection = this.availableModules.filter((m) => {
			const moduleKey = this.getModuleKey(m);
			return !this.appliedModuleKeys.has(moduleKey) && !lvCache[moduleKey] && !m.labviewVersion;
		});

		if (needsDetection.length === 0) {
			return;
		}

		// 限流：每次最多检测 10 个模块，避免大量 API 请求
		const detectLimit = 10;
		const toDetect = needsDetection.slice(0, detectLimit);

		let cacheChanged = false;
		const detectRemote = this.githubService.detectRemoteLabviewVersion?.bind(this.githubService);
		if (!detectRemote) {
			return;
		}

		await Promise.all(
			toDetect.map(async (entry) => {
				const version = await detectRemote(
					entry.owner,
					entry.name,
					entry.defaultBranch,
					token,
				);
				if (version) {
					const moduleKey = this.getModuleKey(entry);
					lvCache[moduleKey] = version;
					cacheChanged = true;
				}
			}),
		);

		if (cacheChanged) {
			await this.cacheStore.setLvVersionCache(lvCache);
			// 重新合并远程版本到 availableModules 并刷新 UI
			this.availableModules = this.availableModules.map((m) => {
				const moduleKey = this.getModuleKey(m);
				const cachedVersion = lvCache[moduleKey];
				if (!m.labviewVersion && cachedVersion) {
					return { ...m, labviewVersion: cachedVersion };
				}
				return m;
			});
			this.applyModuleSort();
			this.treeDataProvider.setModules(this.availableModules);
		}
	}

	/**
	 * 后台补全本地已应用模块的版本提交信息（commitInfo/date）并写入缓存（issue #37）。
	 * 仅在用户主动刷新在线目录时触发（避免启动时联网）；限流防止大量 API 请求。
	 * 补全后重算本地工作区状态，让已应用卡片展示完整的 短SHA · 提交信息 · 相对日期。
	 */
	private async backfillAppliedModuleVersionInfos(token: string | undefined): Promise<void> {
		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			return;
		}
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		const workspaceRoot = repoRoot ?? workspaceFolder.uri.fsPath;
		const config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			return;
		}

		// 需要补全的模块：versionCache 中缺少与当前 ref 匹配的提交信息。
		// release / tag 来源直接展示名称，无需提交信息。
		const needsBackfill = Object.values(config.modules).filter((entry) => {
			if (entry.versionKind === 'release') {
				return false;
			}
			if (entry.versionKind === 'tag' && entry.versionRef) {
				return false;
			}
			const cacheEntry = this.versionCache[`${entry.owner}/${entry.name}`];
			return !(cacheEntry && cacheEntry.ref === entry.ref && cacheEntry.commitInfo);
		});
		if (needsBackfill.length === 0) {
			return;
		}

		// 限流：每次最多补全 5 个模块，避免大量 API 请求
		const toBackfill = needsBackfill.slice(0, 5);
		let cacheChanged = false;

		await Promise.all(
			toBackfill.map(async (entry) => {
				try {
					const moduleEntry = this.findAvailableModule(entry.owner, entry.name)
						?? this.synthesizeModuleEntry(entry);
					const resolved = await this.versionService.resolveCommitInfo(
						entry.owner,
						entry.name,
						entry.ref,
						entry.source,
						entry.branch || moduleEntry.defaultBranch || 'main',
						token,
					);
					if (resolved.commitInfo || resolved.date) {
						this.versionCache = {
							...this.versionCache,
							[`${entry.owner}/${entry.name}`]: {
								ref: entry.ref,
								commitInfo: resolved.commitInfo,
								date: resolved.date,
							},
						};
						cacheChanged = true;
					}
				} catch (error) {
					this.logger.warn(`Failed to backfill version info for ${entry.owner}/${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}),
		);

		if (cacheChanged) {
			await this.cacheStore.setModuleVersionCache(this.versionCache);
			// 重新计算本地工作区状态，让已应用卡片读取到新的提交信息
			await this.refreshSidebarWorkspaceState();
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
		onProgress?: (done: number, total: number) => void,
	): Promise<Record<string, string>> {
		const refreshed: Record<string, string> = {};
		let cursor = 0;
		let completed = 0;
		const total = modules.length;
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
				completed += 1;
				onProgress?.(completed, total);
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
		await openBuiltinReadmePreview(resolvedEntry, this.getReadmeServiceDeps());
	}

	public async openRepositoryCommand(entry?: CsmModuleEntry | ModuleTreeItem): Promise<void> {
		const resolvedEntry = this.resolveModuleEntry(entry);
		if (!resolvedEntry?.repoUrl) {
			return;
		}

		await vscode.env.openExternal(vscode.Uri.parse(resolvedEntry.repoUrl));
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

	public async contextOpenFolderCommand(context?: WebviewModuleContext): Promise<void> {
		if (!context?.localItemPath && !context?.localItemId) {
			return;
		}
		await this.openLocalFolderByPath(context.localItemPath ?? context.localItemId!);
	}

	public async contextOpenRepositoryCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.openRepositoryCommand(entry);
	}

	public async contextStarModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.toggleStarCommand(entry);
	}

	public async contextUnstarModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = this.resolveContextModuleEntry(context);
		if (!entry) {
			return;
		}
		await this.toggleStarCommand(entry);
	}

	public async contextLockLocalModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = await this.resolveContextLocalManagedEntry(context);
		if (!entry) {
			return;
		}
		await this.toggleLocalModuleLockCommand(entry);
	}

	public async contextUnlockLocalModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = await this.resolveContextLocalManagedEntry(context);
		if (!entry) {
			return;
		}
		await this.toggleLocalModuleLockCommand(entry);
	}

	public async contextSwitchLocalModuleMethodCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = await this.resolveContextLocalManagedEntry(context);
		if (!entry) {
			return;
		}
		await this.switchLocalModuleMethodCommand(entry);
	}

	public async contextLinkLocalRepositoryCommand(context?: WebviewModuleContext): Promise<void> {
		const folder = await this.resolveContextLocalUnmanagedEntry(context);
		if (!folder) {
			return;
		}
		await this.linkLocalFolderRepositoryCommand(folder);
	}

	public async contextCreateLocalRepositoryCommand(context?: WebviewModuleContext): Promise<void> {
		const folder = await this.resolveContextLocalUnmanagedEntry(context);
		if (!folder) {
			return;
		}
		await this.createLocalFolderRepositoryCommand(folder);
	}

	public async contextRecordLocalModuleCommand(context?: WebviewModuleContext): Promise<void> {
		const folder = await this.resolveContextLocalUnmanagedEntry(context);
		if (!folder) {
			return;
		}
		await this.recordLocalModuleCommand(folder);
	}

	public async contextRemoveLocalModuleRecordCommand(context?: WebviewModuleContext): Promise<void> {
		const entry = await this.resolveContextLocalManagedEntry(context);
		if (!entry) {
			return;
		}
		await this.removeLocalModuleRecordCommand(entry);
	}

	public async openLocalFolderCommand(entry: LocalManagedModuleEntry | LocalUnmanagedFolderEntry): Promise<void> {
		await this.openLocalFolderByPath(entry.path);
	}

	private async openLocalFolderByPath(relativePath: string): Promise<void> {
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			return;
		}
		const { workspaceFolder, repoRoot, workspaceRoot } = ctx;
		const folderPath = path.join(workspaceRoot, relativePath);
		const folderUri = vscode.Uri.file(folderPath);
		await vscode.commands.executeCommand('revealFileInOS', folderUri);
	}

	private resolveContextModuleEntry(context?: WebviewModuleContext): CsmModuleEntry | undefined {
		if (!context?.moduleKey) {
			return undefined;
		}
		return this.findAvailableModuleByKey(context.moduleKey);
	}

	/**
	 * 从右键菜单的 data-vscode-context 解析本地已管理模块条目。
	 * 通过 localItemId 匹配配置项，并复用在线模块数据构造完整条目。
	 */
	private async resolveContextLocalManagedEntry(context?: WebviewModuleContext): Promise<LocalManagedModuleEntry | undefined> {
		if (!context?.localItemId) {
			return undefined;
		}
		const ctx = await this.resolveWorkspaceContext();
		if (!ctx) {
			return undefined;
		}
		const { workspaceFolder, workspaceRoot } = ctx;
		const config = await this.tryLoadSidebarLocalModuleConfig(workspaceFolder, workspaceRoot);
		if (!config) {
			return undefined;
		}
		const configEntry = config.modules[context.localItemId]
			?? Object.values(config.modules).find((module) => module.key === context.localItemId);
		if (!configEntry) {
			return undefined;
		}
		// 本地模块（method: local）：无 GitHub 源，直接构造 kind:'local' 条目
		if (configEntry.method === 'local') {
			return {
				id: configEntry.key,
				kind: 'local',
				owner: '',
				name: configEntry.name,
				path: configEntry.path,
				source: '',
				method: 'local',
				branch: '',
				ref: '',
				locked: configEntry.locked !== false,
				repoUrl: '',
				description: '',
				visibility: 'public',
				topics: [],
				moduleEntry: this.synthesizeModuleEntry(configEntry),
				stale: false,
				labviewVersion: configEntry.labviewVersion,
			};
		}
		const moduleEntry = this.findAvailableModule(configEntry.owner, configEntry.name)
			?? this.synthesizeModuleEntry(configEntry);
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
			versionKind: configEntry.versionKind,
			versionRef: configEntry.versionRef,
			releaseName: configEntry.releaseName,
			locked: configEntry.locked !== false,
			repoUrl: moduleEntry.repoUrl,
			description: moduleEntry.description,
			visibility: moduleEntry.visibility,
			topics: moduleEntry.topics,
			moduleEntry,
			moduleKey: this.getModuleKey(moduleEntry),
			stale: false,
		};
	}

	/**
	 * 从右键菜单的 data-vscode-context 解析本地未管理文件夹条目。
	 * 名称由路径最后一段推导，供创建/关联仓库流程展示使用。
	 */
	private async resolveContextLocalUnmanagedEntry(context?: WebviewModuleContext): Promise<LocalUnmanagedFolderEntry | undefined> {
		const folderPath = context?.localItemPath ?? context?.localItemId;
		if (!folderPath || !context) {
			return undefined;
		}
		return {
			id: context.localItemId ?? folderPath,
			kind: 'unmanaged',
			name: folderPath.split('/').pop() ?? folderPath,
			path: folderPath,
		};
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

	/**
	 * 根据 csmModules.hiddenOwners 配置排除指定 owner 的仓库。
	 * 配置默认值为空数组（不排除任何 owner），大小写不敏感匹配。
	 */
	private filterByOwners(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		const hiddenOwners = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager)
			.get<readonly string[]>(CONFIG_KEYS.hiddenOwners, []);
		if (hiddenOwners.length === 0) {
			return modules;
		}
		const owners = new Set(hiddenOwners.map((o) => o.trim().toLowerCase()).filter(Boolean));
		if (owners.size === 0) {
			return modules;
		}
		return modules.filter((m) => !owners.has(m.owner.toLowerCase()));
	}

	/**
	 * 根据 csmModules.filterTopics 配置排除含有指定 topic 的仓库。
	 * 配置默认值为空数组（不排除任何 topic），大小写不敏感匹配。
	 */
	private filterByTopics(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		const filterTopics = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager)
			.get<readonly string[]>(CONFIG_KEYS.filterTopics, []);
		if (filterTopics.length === 0) {
			return modules;
		}
		const topics = new Set(filterTopics.map((t) => t.trim().toLowerCase()).filter(Boolean));
		if (topics.size === 0) {
			return modules;
		}
		return modules.filter((m) => !(m.topics ?? []).some((t) => topics.has(t.toLowerCase())));
	}

	/**
	 * 统一的模块过滤流水线。各过滤器独立且皆为纯排除/去重，顺序不影响结果。
	 * - filterByOwners：排除指定 owner
	 * - filterByTopics：排除含有指定 topic 的仓库
	 * - handleForkedModules：处理 fork 仓库
	 * - filterArchivedModules：隐藏已归档仓库
	 */
	private filterModules(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		return this.filterArchivedModules(
			this.handleForkedModules(
				this.filterByTopics(
					this.filterByOwners(modules),
				),
			),
		);
	}

	/**
	 * 根据 csmModules.hideArchivedRepos 配置过滤已归档模块。
	 * 配置默认值为 true（隐藏已归档仓库），用户可关闭以显示全部。
	 */
	private filterArchivedModules(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		const hideArchived = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager).get<boolean>(CONFIG_KEYS.hideArchivedRepos, true);
		return hideArchived ? modules.filter((m) => !m.archived) : modules;
	}

	/**
	 * 根据 csmModules.forkedReposHandling 配置处理 fork 仓库。
	 * - 'exclude'：隐藏所有 fork（默认）
	 * - 'latest'：同名仓库仅保留 pushedAt 最新的版本
	 * - 'include'：全部显示
	 */
	private handleForkedModules(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		const handling = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager)
			.get<string>(CONFIG_KEYS.forkedReposHandling, 'exclude');
		switch (handling) {
			case 'exclude':
				return modules.filter((m) => !m.fork);
			case 'latest': {
				// 按 name 分组，每组取 pushedAt 最新者（undefined 视为最早）
				const byName = new Map<string, CsmModuleEntry[]>();
				for (const m of modules) {
					const group = byName.get(m.name) ?? [];
					group.push(m);
					byName.set(m.name, group);
				}
				return [...byName.values()].map((group) =>
					group.reduce((best, current) => {
						const bestTime = best.pushedAt ? Date.parse(best.pushedAt) : 0;
						const curTime = current.pushedAt ? Date.parse(current.pushedAt) : 0;
						return curTime > bestTime ? current : best;
					})
				);
			}
			case 'include':
			default:
				return modules;
		}
	}

	private getVisibleModulesFromSnapshot(snapshot: ModuleCacheSnapshot | undefined): CsmModuleEntry[] {
		const modules = snapshot?.modules ?? [];
		const result = !modules.some((module) => module.visibility === 'private')
			? modules
			: this.shouldRevealPrivateCache(snapshot)
				? modules
				: modules.filter((module) => module.visibility === 'public');
		const visibleModules = this.filterModules(result);
		// 合并远程 LV 版本缓存
		const lvCache = this.cacheStore.getLvVersionCache();
		return visibleModules.map((m) => {
			const moduleKey = this.getModuleKey(m);
			const cachedVersion = lvCache[moduleKey];
			// 优先使用 GitHub topics 提取的版本，回退到远程缓存
			let labviewVersion: string | undefined;
			if (m.labviewVersion) {
				labviewVersion = m.labviewVersion;
			} else if (cachedVersion) {
				labviewVersion = cachedVersion;
			} else if (m.topics?.length > 0) {
				labviewVersion = extractVersionFromTopics(m.topics);
			}
			if (labviewVersion === m.labviewVersion) {
				return m;
			}
			return { ...m, labviewVersion };
		});
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

	/**
	 * 重算侧边栏本地工作区状态，并返回当前发现的未管理模块数量。
	 */
	private async refreshSidebarWorkspaceState(): Promise<number> {
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
			// 仅缓存完整刷新结果（含 workspaceLabel），供下次打开视图立即渲染
			if (context.workspaceLabel) {
				void this.cacheStore.setWorkspaceContextCache(context);
			}
			void this.setSelectionContexts();
		};
		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			setContext({ appliedModuleKeys: [] });
			return 0;
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
				this.logger.warn(`Failed to synchronize local module lock states: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const moduleRoot = await this.resolveSidebarModuleRoot(workspaceRoot, config);
		const staleModuleKeys = await this.computeStaleModuleKeys(workspaceRoot, config);
		const { entries: managedModules, configChanged } = await this.mapManagedModules(config, staleModuleKeys, workspaceRoot);

		// 检测工作区根目录的 LabVIEW 版本
		const workspaceVersionResult = await detectLabviewVersion(workspaceRoot);

		// 如果版本检测有变化，写回配置持久化
		if (configChanged && config) {
			try {
				await this.workspaceModuleService.writeConfig(config);
			} catch (error) {
				this.logger.warn(`Failed to persist LabVIEW version changes: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		const unmanagedFolders = moduleRoot ? await this.mapUnmanagedFolders(workspaceRoot, moduleRoot, config) : [];
		setContext({
			workspaceLabel: path.basename(workspaceRoot) || workspaceFolder.name,
			moduleRoot,
			gitAvailable: !!repoRoot,
			appliedModuleKeys: this.mapAppliedModuleKeys(config),
			staleModuleKeys,
			managedModules,
			unmanagedFolders,
			workspaceLabviewVersion: workspaceVersionResult?.display,
		});
		return unmanagedFolders.length;
	}

	private async resolveSidebarModuleRoot(workspaceRoot: string, config: LocalModuleConfig | undefined): Promise<string | undefined> {
		if (config?.root) {
			return config.root;
		}
		const defaultRoot = this.getConfiguredDefaultModuleRoot();
		return await this.hasLocalModuleRoot(workspaceRoot, defaultRoot) ? defaultRoot : undefined;
	}

	private async mapManagedModules(config: LocalModuleConfig | undefined, staleModuleKeys: string[], workspaceRoot: string): Promise<{ entries: LocalManagedModuleEntry[]; configChanged: boolean }> {
		if (!config) {
			return { entries: [], configChanged: false };
		}

		const staleSet = new Set(staleModuleKeys);
		const availableModulesBySource = new Map<string, CsmModuleEntry>();
		for (const moduleEntry of this.availableModules) {
			availableModulesBySource.set(this.normalizeModuleSource(moduleEntry.repoUrl), moduleEntry);
		}

		const entries: LocalManagedModuleEntry[] = Object.values(config.modules)
			.sort((left, right) => left.path.localeCompare(right.path))
			.map((configEntry) => {
				// 本地模块（method: local）：无 GitHub 源，不查在线目录
				if (configEntry.method === 'local') {
					const result: LocalManagedModuleEntry = {
						id: configEntry.key,
						kind: 'local',
						owner: '',
						name: configEntry.name,
						path: configEntry.path,
						source: '',
						method: 'local',
						branch: '',
						ref: '',
						locked: this.isLocalModuleLocked(configEntry),
						repoUrl: '',
						description: '',
						visibility: 'public',
						topics: [],
						moduleEntry: this.synthesizeModuleEntry(configEntry),
						stale: staleSet.has(configEntry.path),
						labviewVersion: configEntry.labviewVersion,
					};
					return result;
				}
				const availableModule = this.findAvailableModule(configEntry.owner, configEntry.name)
					?? availableModulesBySource.get(this.normalizeModuleSource(configEntry.source))
					// GitHub 仓库转移：config 保留转移前旧 owner/source，仓库名相同即视为同一仓库
					?? this.findAvailableModuleByRepoName(configEntry.name);
				const moduleEntry = availableModule ?? this.synthesizeModuleEntry(configEntry);
				const versionCacheEntry = this.versionCache[`${configEntry.owner}/${configEntry.name}`];
				const cacheMatchesRef = Boolean(versionCacheEntry && versionCacheEntry.ref === configEntry.ref);
				const result: LocalManagedModuleEntry = {
					id: configEntry.key,
					kind: 'managed',
					owner: configEntry.owner,
					name: configEntry.name,
					path: configEntry.path,
					source: configEntry.source,
					method: configEntry.method,
					branch: configEntry.branch,
					ref: configEntry.ref,
					// 版本来源信息（issue #37），旧配置缺省视为 commit
					versionKind: configEntry.versionKind,
					versionRef: configEntry.versionRef,
					releaseName: configEntry.releaseName,
					commitInfo: cacheMatchesRef ? versionCacheEntry.commitInfo : undefined,
					commitDate: cacheMatchesRef ? versionCacheEntry.date : undefined,
					locked: this.isLocalModuleLocked(configEntry),
					repoUrl: moduleEntry.repoUrl,
					description: moduleEntry.description,
					visibility: moduleEntry.visibility,
					topics: moduleEntry.topics,
					moduleEntry,
					moduleKey: availableModule ? this.getModuleKey(availableModule) : undefined,
					stale: staleSet.has(`${configEntry.owner}/${configEntry.name}`),
					// 优先使用已保存的版本
					labviewVersion: configEntry.labviewVersion,
				};
				return result;
			});

		// 刷新时重新检测所有模块的 LabVIEW 版本，并写回配置
		let configChanged = false;
		await Promise.all(
			entries.map(async (entry) => {
				const absPath = path.resolve(workspaceRoot, entry.path);
				const versionResult = await detectLabviewVersion(absPath);
				const newVersion = versionResult?.display;
				if (newVersion !== entry.labviewVersion) {
					entry.labviewVersion = newVersion;
					const configEntry = config.modules[entry.id];
					if (configEntry) {
						configEntry.labviewVersion = newVersion;
						configChanged = true;
					}
				}
			}),
		);

		return { entries, configChanged };
	}

	private async mapUnmanagedFolders(
		workspaceRoot: string,
		moduleRoot: string,
		config: LocalModuleConfig | undefined,
	): Promise<LocalUnmanagedFolderEntry[]> {
		const managedEntries = Object.values(config?.modules ?? {});
		const managedPaths = new Set(
			managedEntries.map((entry) => entry.path.replace(/\\/g, '/').toLowerCase()),
		);
		const directories = await this.listModuleDirectoriesForNamespaceScan(workspaceRoot, moduleRoot, {
			...this.getModuleDirectoryScanOptions(),
			excludedRelativePaths: this.toManagedRelativePaths(managedEntries, moduleRoot),
		});
		const entries: LocalUnmanagedFolderEntry[] = directories
			.map((relativePathFromRoot) => {
				const relativePath = path.posix.join(moduleRoot, relativePathFromRoot);
				const normalizedRelativePathFromRoot = this.normalizeNamespacePathValue(relativePathFromRoot);
				const folderName = path.posix.basename(normalizedRelativePathFromRoot || relativePathFromRoot);
				const result: LocalUnmanagedFolderEntry = {
					id: relativePath,
					kind: 'unmanaged',
					name: folderName,
					path: relativePath,
				};
				return result;
			})
			.filter((entry) => !managedPaths.has(entry.path.toLowerCase()));

		// 并行检测各未管理文件夹的 LabVIEW 版本
		await Promise.all(
			entries.map(async (entry) => {
				const absPath = path.resolve(workspaceRoot, entry.path);
				const versionResult = await detectLabviewVersion(absPath);
				if (versionResult) {
					entry.labviewVersion = versionResult.display;
				}
			}),
		);

		return entries;
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
				// 本地模块（method: local）无 owner/name，按路径判定 stale
				stale.push(module.method === 'local' ? module.path : `${module.owner}/${module.name}`);
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

	private async resolveWorkspaceContext(): Promise<{
		workspaceFolder: vscode.WorkspaceFolder;
		repoRoot: string | undefined;
		workspaceRoot: string;
	} | undefined> {
		const workspaceFolder = await this.resolveWorkspaceFolder();
		if (!workspaceFolder) { return undefined; }
		const repoRoot = await this.workspaceModuleService.resolveGitRepositoryRoot(workspaceFolder.uri.fsPath);
		return { workspaceFolder, repoRoot, workspaceRoot: repoRoot ?? workspaceFolder.uri.fsPath };
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
						return error instanceof Error ? getUserFacingErrorMessage(error, 'config') : t('invalidDirectory');
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
			// 本地模块（method: local）无 GitHub 源，不属于在线模块
			if (configEntry.method === 'local') {
				continue;
			}
			const directMatch = availableModulesByName.get(`${configEntry.owner.toLowerCase()}/${configEntry.name.toLowerCase()}`);
			if (directMatch) {
				appliedModuleKeys.add(directMatch);
				continue;
			}

			const sourceMatch = availableModulesBySource.get(this.normalizeModuleSource(configEntry.source));
			if (sourceMatch) {
				appliedModuleKeys.add(sourceMatch);
				continue;
			}

			// GitHub 仓库转移：config 保留转移前旧 owner/source，仓库名相同即视为同一仓库
			// （要求在线列表中该名称唯一，避免同名仓库误配）
			const transferredMatch = this.findAvailableModuleByRepoName(configEntry.name);
			if (transferredMatch) {
				appliedModuleKeys.add(this.getModuleKey(transferredMatch));
			}
		}

		return [...appliedModuleKeys];
	}

	private normalizeModuleSource(source: string): string {
		const trimmed = source.trim().replace(/\.git$/i, '').replace(/\/+$/g, '');
		// SSH 格式（git@github.com:owner/name）规范化为 https 形式，与在线模块 repoUrl 可比
		const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
		return (sshMatch ? `https://${sshMatch[1]}/${sshMatch[2]}` : trimmed).toLowerCase();
	}

	/**
	 * 按仓库名查找在线模块（大小写不敏感）。GitHub 仓库转移只改 owner、不改仓库名，
	 * 用于匹配本地 config 中保留的转移前旧地址；仅当该名称在在线列表中唯一时返回，
	 * 避免同名仓库误配。
	 */
	private findAvailableModuleByRepoName(name: string): CsmModuleEntry | undefined {
		const normalized = name.toLowerCase();
		const matches = this.availableModules.filter((m) => m.name.toLowerCase() === normalized);
		return matches.length === 1 ? matches[0] : undefined;
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

	/**
	 * 当未管理模块位于 moduleRoot 更深层级时（如 csm/DMM/NI），先询问用户以哪一级
	 * 目录作为目标目录：当前模块自身，或其各级祖先目录（如 DMM）。模块直接位于
	 * moduleRoot 下时无需询问。创建 GitHub 仓库与记录本地模块两处复用。
	 */
	private async promptDirectoryLevelSelection(
		folder: LocalUnmanagedFolderEntry,
		moduleRoot: string,
		config: LocalModuleConfig | undefined,
		workspaceRoot: string,
		labels: {
			placeholder: string;
			currentModuleDetail: string;
			ancestorDetail: (count: string) => string;
		},
	): Promise<LocalUnmanagedFolderEntry | undefined> {
		const normalizedModuleRoot = this.workspaceModuleService.normalizeRootPath(moduleRoot);
		const normalizedFolderPath = this.workspaceModuleService.normalizeRootPath(folder.path);
		const rootPrefix = `${normalizedModuleRoot}/`;
		if (!(normalizedFolderPath === normalizedModuleRoot || normalizedFolderPath.startsWith(rootPrefix))) {
			return folder;
		}
		const relativeToModuleRoot = normalizedFolderPath === normalizedModuleRoot
			? ''
			: normalizedFolderPath.slice(rootPrefix.length);
		const segments = relativeToModuleRoot.split('/').filter((segment) => segment.length > 0);
		if (segments.length <= 1) {
			// 模块直接位于 moduleRoot 下，无需询问
			return folder;
		}

		const managedEntries = Object.values(config?.modules ?? {});
		const scanOptions = this.getModuleDirectoryScanOptions();
		const items: RepositoryRootQuickPickItem[] = [
			{
				label: folder.name,
				description: folder.path,
				detail: labels.currentModuleDetail,
				picked: true,
				root: folder,
			},
		];

		// 祖先目录候选：从深到浅（csm/DMM/Group/NI → Group、DMM）
		for (let depth = segments.length - 1; depth >= 1; depth -= 1) {
			const ancestorSegments = segments.slice(0, depth);
			const ancestorPath = path.posix.join(normalizedModuleRoot, ...ancestorSegments);
			let childModuleCount = 0;
			try {
				const discovered = await this.listModuleDirectoriesForNamespaceScan(
					workspaceRoot,
					ancestorPath,
					{
						...scanOptions,
						excludedRelativePaths: this.toManagedRelativePaths(managedEntries, ancestorPath),
					},
				);
				childModuleCount = discovered.length;
			} catch (error) {
				this.logger.warn(
					`Failed to count module folders under ${ancestorPath} for directory level selection: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			items.push({
				label: ancestorSegments[ancestorSegments.length - 1],
				description: ancestorPath,
				detail: labels.ancestorDetail(String(childModuleCount)),
				root: {
					id: ancestorPath,
					kind: 'unmanaged',
					name: ancestorSegments[ancestorSegments.length - 1],
					path: ancestorPath,
				},
			});
		}

		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: labels.placeholder,
		});
		return pick?.root;
	}

	/** 创建 GitHub 仓库时的目录层级选择（文案为建仓场景）。 */
	private async promptRepositoryRootSelection(
		folder: LocalUnmanagedFolderEntry,
		moduleRoot: string,
		config: LocalModuleConfig | undefined,
		workspaceRoot: string,
	): Promise<LocalUnmanagedFolderEntry | undefined> {
		return this.promptDirectoryLevelSelection(folder, moduleRoot, config, workspaceRoot, {
			placeholder: t('createRepositoryRootSelectionPlaceholder'),
			currentModuleDetail: t('createRepositoryRootCurrentModuleDetail'),
			ancestorDetail: (count) => t('createRepositoryRootAncestorDetail', { count }),
		});
	}

	/** 记录本地模块时的目录层级选择（文案为记录场景）。 */
	private async promptLocalModuleDirectorySelection(
		folder: LocalUnmanagedFolderEntry,
		moduleRoot: string,
		config: LocalModuleConfig | undefined,
		workspaceRoot: string,
	): Promise<LocalUnmanagedFolderEntry | undefined> {
		return this.promptDirectoryLevelSelection(folder, moduleRoot, config, workspaceRoot, {
			placeholder: t('recordLocalModuleDirectorySelectionPlaceholder'),
			currentModuleDetail: t('recordLocalModuleCurrentModuleDetail'),
			ancestorDetail: (count) => t('recordLocalModuleAncestorDetail', { count }),
		});
	}

	/** 判断目标根目录（严格子路径）下是否包含已管理的 CSM 模块。 */
	private containsManagedModuleUnder(config: LocalModuleConfig, rootPath: string): boolean {
		const normalizedRoot = this.workspaceModuleService.normalizeRootPath(rootPath);
		const rootPrefix = `${normalizedRoot}/`;
		return Object.values(config.modules).some((entry) => {
			const normalizedEntryPath = this.workspaceModuleService.normalizeRootPath(entry.path);
			return normalizedEntryPath.startsWith(rootPrefix);
		});
	}

	private async promptRepositoryCreation(
		folderName: string,
		ownerCandidates: RepositoryOwnerCandidates,
	): Promise<{
		owner: RepositoryOwner;
		name: string;
		description: string;
		visibility: RepositoryVisibility;
		topics: string[];
	} | undefined> {
		// 第一步：选择创建仓库的归属（个人账号 / 有权限的组织）；无组织候选时默认个人账号
		let owner: RepositoryOwner = { kind: 'user', login: ownerCandidates.user.login };
		if (ownerCandidates.orgs.length > 0) {
			const ownerPick = await this.promptRepositoryOwner(ownerCandidates);
			if (!ownerPick) {
				return undefined;
			}
			owner = ownerPick.owner;
		}

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
			owner,
			name: name.trim(),
			description: description.trim(),
			visibility: visibilityPick.visibility,
			topics: this.normalizeRepositoryTopics(topicsInput),
		};
	}

	/** 选择创建仓库的归属：单个 QuickPick 同时列出个人账号与所有有权限的组织。 */
	private async promptRepositoryOwner(candidates: RepositoryOwnerCandidates): Promise<RepositoryOwnerQuickPickItem | undefined> {
		const items: RepositoryOwnerQuickPickItem[] = [
			{
				label: `@${candidates.user.login}`,
				description: t('createRepositoryOwnerUserDescription'),
				picked: true,
				owner: { kind: 'user', login: candidates.user.login },
			},
			...candidates.orgs.map((org): RepositoryOwnerQuickPickItem => ({
				label: org.login,
				description: org.name ? `${org.name} · ${t('createRepositoryOwnerOrgDescription')}` : t('createRepositoryOwnerOrgDescription'),
				owner: { kind: 'org', login: org.login },
			})),
		];
		return vscode.window.showQuickPick(items, {
			placeHolder: t('createRepositoryOwnerPlaceholder'),
		});
	}

	/**
	 * 获取创建仓库的归属候选：个人账号 + 有权限创建仓库的组织。
	 *
	 * 组织的判定：逐个查询用户在组织中的成员关系，仅 `state=active`（含 admin 与 member）
	 * 的组织视为可选；单个组织查询失败只记录日志并跳过，不影响其余组织。
	 * 用户信息或组织列表获取失败时向上抛错，由调用方中断创建流程。
	 */
	private async fetchRepositoryOwnerCandidates(token: string): Promise<RepositoryOwnerCandidates> {
		const user = await this.githubService.getCurrentUser!(token);
		const organizations = await this.githubService.getUserOrganizations!(token);
		const orgs: GitHubOrganizationProfile[] = [];
		for (const org of organizations) {
			try {
				const membership = await this.githubService.getOrganizationMembership!(token, org.login, user.login);
				if (membership?.state === 'active') {
					orgs.push(org);
				}
			} catch (error) {
				this.logger.warn(
					`Failed to check membership for organization ${org.login}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		return { user, orgs };
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

	private normalizeNamespacePathValue(value: string): string {
		const service = this.workspaceModuleService as WorkspaceModuleService & { normalizeNamespacePath?: (value: string) => string };
		if (typeof service.normalizeNamespacePath === 'function') {
			return service.normalizeNamespacePath(value);
		}
		const trimmed = value.trim();
		if (!trimmed) {
			return '';
		}
		const slashNormalized = trimmed.replace(/\\/g, '/');
		const normalized = slashNormalized.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
		return normalized === '.' ? '' : normalized;
	}

	private async listModuleDirectoriesForNamespaceScan(
		workspaceRoot: string,
		moduleRoot: string,
		options: { maxDepth?: number; includeReadmeWeakSignal?: boolean; excludedDirectoryNames?: string[]; excludedRelativePaths?: string[] } = {},
	): Promise<string[]> {
		const service = this.workspaceModuleService as WorkspaceModuleService & { listModuleDirectories?: (repoRoot: string, rootRelativePath: string, scanOptions?: { maxDepth?: number; includeReadmeWeakSignal?: boolean; excludedDirectoryNames?: string[]; excludedRelativePaths?: string[] }) => Promise<string[]> };
		if (typeof service.listModuleDirectories === 'function') {
			return service.listModuleDirectories(workspaceRoot, moduleRoot, options);
		}
		return [];
	}

	private getModuleDirectoryScanOptions(): { maxDepth: number; includeReadmeWeakSignal: boolean; excludedDirectoryNames: string[] } {
		const configuration = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager);
		const configuredDepth = configuration.get<number>(CONFIG_KEYS.moduleScanMaxDepth, 3);
		const maxDepth = Math.max(1, Math.floor(Number.isFinite(configuredDepth) ? configuredDepth : 3));
		const includeReadmeWeakSignal = configuration.get<boolean>(CONFIG_KEYS.moduleScanIncludeReadmeWeakSignal, true);
		const configuredExcluded = configuration.get<string[]>(CONFIG_KEYS.moduleScanExcludedDirectories, DEFAULT_EXCLUDED_DIRECTORY_NAMES);
		const excludedDirectoryNames = Array.isArray(configuredExcluded)
			? configuredExcluded.map((name) => String(name).trim()).filter((name) => name.length > 0)
			: [];
		return {
			maxDepth,
			includeReadmeWeakSignal,
			excludedDirectoryNames,
		};
	}

	private toManagedRelativePaths(entries: Array<{ path: string }>, moduleRoot: string): string[] {
		const rootPrefix = `${moduleRoot}/`;
		const relativePaths: string[] = [];
		for (const entry of entries) {
			const normalized = entry.path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
			if (normalized === moduleRoot) {
				continue;
			}
			if (!normalized.startsWith(rootPrefix)) {
				continue;
			}
			relativePaths.push(normalized.slice(rootPrefix.length));
		}
		return relativePaths;
	}

	private getWorkspaceRecentNamespaceKey(workspaceFolder: vscode.WorkspaceFolder): string {
		return workspaceFolder.uri.fsPath.toLowerCase();
	}

	private getRecentNamespaceForWorkspace(workspaceFolder: vscode.WorkspaceFolder): string {
		const key = this.getWorkspaceRecentNamespaceKey(workspaceFolder);
		const stored = this.recentNamespaceByWorkspace[key];
		if (!stored) {
			return ROOT_NAMESPACE_VALUE;
		}
		try {
			return this.normalizeNamespacePathValue(stored);
		} catch {
			return ROOT_NAMESPACE_VALUE;
		}
	}

	private async setRecentNamespaceForWorkspace(workspaceFolder: vscode.WorkspaceFolder, namespacePath: string): Promise<void> {
		const key = this.getWorkspaceRecentNamespaceKey(workspaceFolder);
		this.recentNamespaceByWorkspace = {
			...this.recentNamespaceByWorkspace,
			[key]: namespacePath,
		};
		await this.cacheStore.setRecentNamespaceByWorkspace(this.recentNamespaceByWorkspace);
	}

	private collectNamespaceCandidates(config: LocalModuleConfig): string[] {
		const namespaceSet = new Set<string>();
		namespaceSet.add(ROOT_NAMESPACE_VALUE);

		const collectFromPath = (fullPath: string): void => {
			let normalized: string;
			try {
				normalized = this.workspaceModuleService.normalizeRootPath(fullPath);
			} catch {
				return;
			}
			if (!(normalized === config.root || normalized.startsWith(`${config.root}/`))) {
				return;
			}
			const relativeToRoot = normalized === config.root ? '' : normalized.slice(config.root.length + 1);
			if (!relativeToRoot) {
				return;
			}
			const segments = relativeToRoot.split('/').filter((segment) => segment.length > 0);
			for (let depth = 1; depth < segments.length; depth += 1) {
				namespaceSet.add(segments.slice(0, depth).join('/'));
			}
		};

		for (const managed of Object.values(config.modules)) {
			collectFromPath(managed.path);
		}

		return [...namespaceSet].sort((left, right) => left.localeCompare(right));
	}

	private async promptApplyTargetNamespace(
		workspaceFolder: vscode.WorkspaceFolder,
		workspaceRoot: string,
		config: LocalModuleConfig,
	): Promise<string | undefined> {
		const managedAndUnmanagedNamespace = new Set(this.collectNamespaceCandidates(config));
		const managedEntries = Object.values(config.modules);
		const managedPaths = new Set(
			managedEntries.map((entry) => entry.path.replace(/\\/g, '/').toLowerCase()),
		);
		const scanCandidates = await this.listModuleDirectoriesForNamespaceScan(
			workspaceRoot,
			config.root,
			{
				...this.getModuleDirectoryScanOptions(),
				excludedRelativePaths: this.toManagedRelativePaths(managedEntries, config.root),
			},
		);
		for (const relativePathFromRoot of scanCandidates) {
			const fullPath = path.posix.join(config.root, relativePathFromRoot);
			if (managedPaths.has(fullPath.toLowerCase())) {
				continue;
			}
			const relativeToRoot = relativePathFromRoot;
			if (!relativeToRoot) {
				continue;
			}
			const segments = relativeToRoot.split('/').filter((segment) => segment.length > 0);
			for (let depth = 1; depth < segments.length; depth += 1) {
				managedAndUnmanagedNamespace.add(segments.slice(0, depth).join('/'));
			}
		}

		const sortedNamespaces = [...managedAndUnmanagedNamespace].sort((left, right) => left.localeCompare(right));
		const recentNamespace = this.getRecentNamespaceForWorkspace(workspaceFolder);
		const nonRootNamespaces = sortedNamespaces.filter((namespacePath) => namespacePath.length > 0);
		if (nonRootNamespaces.length === 0 && recentNamespace === ROOT_NAMESPACE_VALUE) {
			return ROOT_NAMESPACE_VALUE;
		}
		const rootOptionLabel = t('applyNamespaceRootOption', { root: config.root });
		const items: NamespaceQuickPickItem[] = [
			{
				label: rootOptionLabel,
				detail: t('applyNamespaceRootDetail', { root: config.root }),
				namespacePath: ROOT_NAMESPACE_VALUE,
				picked: recentNamespace === ROOT_NAMESPACE_VALUE,
			},
			...sortedNamespaces
				.filter((namespacePath) => namespacePath.length > 0)
				.map((namespacePath) => ({
					label: namespacePath,
					detail: t('applyNamespacePathDetail', { path: path.posix.join(config.root, namespacePath) }),
					namespacePath,
					picked: recentNamespace === namespacePath,
				})),
			{
				label: t('applyNamespaceManualInput'),
				detail: t('applyNamespaceManualInputDetail'),
				action: 'manual',
			},
		];

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: t('applyNamespacePlaceholder'),
			matchOnDetail: true,
		});
		if (!picked) {
			return undefined;
		}

		let chosenNamespace = picked.namespacePath ?? ROOT_NAMESPACE_VALUE;
		if (picked.action === 'manual') {
			const input = await vscode.window.showInputBox({
				prompt: t('applyNamespaceInputPrompt', { root: config.root }),
				placeHolder: t('applyNamespaceInputPlaceholder'),
				validateInput: (value) => {
					try {
						this.normalizeNamespacePathValue(value);
						return undefined;
					} catch (error) {
						return error instanceof Error ? getUserFacingErrorMessage(error, 'apply') : t('invalidDirectory');
					}
				},
			});
			if (typeof input === 'undefined') {
				return undefined;
			}
			chosenNamespace = this.normalizeNamespacePathValue(input);

			const targetDirectory = chosenNamespace
				? path.posix.join(config.root, chosenNamespace)
				: config.root;
			const exists = await this.workspaceModuleService.targetExists(workspaceRoot, targetDirectory);
			if (!exists) {
				const confirmation = await vscode.window.showWarningMessage(
					t('applyNamespaceCreateConfirm', { path: targetDirectory }),
					{ modal: true },
					t('applyNamespaceCreateAction'),
				);
				if (confirmation !== t('applyNamespaceCreateAction')) {
					return undefined;
				}
				await fs.mkdir(path.join(workspaceRoot, ...targetDirectory.split('/')), { recursive: true });
				void vscode.window.showInformationMessage(t('applyNamespaceTip', { path: targetDirectory }));
			}
		}

		await this.setRecentNamespaceForWorkspace(workspaceFolder, chosenNamespace);
		return chosenNamespace;
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
		// release 引入方式仅在单选时提供（多选批量应用暂不支持每个模块分别选 release）
		const allowRelease = moduleCount === 1;
		const releaseItem: ApplyMethodQuickPickItem = {
			label: t('applyMethodReleaseLabel'),
			description: t('applyMethodReleaseDescription'),
			detail: t('applyMethodReleaseDetail'),
			method: 'release',
		};
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
				...(allowRelease ? [releaseItem] : []),
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
				...(allowRelease ? [releaseItem] : []),
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

	private findDuplicateTargetPaths(
		config: LocalModuleConfig,
		entries: CsmModuleEntry[],
		explicitTargetPathsByModuleKey?: Map<string, string>,
	): string[] {
		const seen = new Set<string>();
		const duplicates = new Set<string>();
		for (const entry of entries) {
			const targetPath = explicitTargetPathsByModuleKey?.get(this.getModuleKey(entry))
				?? this.workspaceModuleService.getTargetRelativePath(config, entry);
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
		explicitTargetPathsByModuleKey?: Map<string, string>,
	): Promise<string[]> {
		const occupied: string[] = [];
		for (const entry of entries) {
			const targetPath = explicitTargetPathsByModuleKey?.get(this.getModuleKey(entry))
				?? this.workspaceModuleService.getTargetRelativePath(config, entry);
			if (await this.workspaceModuleService.targetExists(repoRoot, targetPath)) {
				occupied.push(targetPath);
			}
		}
		return occupied.sort((left, right) => left.localeCompare(right));
	}
}
