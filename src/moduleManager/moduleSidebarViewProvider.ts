import * as vscode from 'vscode';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from './types';
import { ViewState } from './moduleTreeTypes';
import { IModuleViewProvider, ModuleListScope, ModuleSortDirection, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
import { DEFAULT_MODULE_SORT_STATE, isModuleSortDirection, isModuleSortField, normalizeModuleSortState } from './sort';
import { t } from './messages';
import { renderModuleSidebarHtml } from './moduleSidebarHtml';
import { getModuleKey } from './utils';

interface ModuleSidebarActions {
	onLogin: () => void;
	onRefresh: () => void;
	onInitializeWorkspace: () => void;
	onToggleStar: (entry: CsmModuleEntry) => void;
	onOpenReadme: (entry: CsmModuleEntry) => void;
	onOpenRepository?: (entry: CsmModuleEntry) => void;
	onPreviewReadme?: (entry: CsmModuleEntry) => void;
	onApplySelection: (entry?: CsmModuleEntry) => void;
	onRemoveModule: (entry: CsmModuleEntry) => void;
	onUpdateModule: (entry: CsmModuleEntry) => void;
	onToggleLocalModuleLock?: (entry: LocalManagedModuleEntry) => void;
	onSwitchLocalModuleMethod?: (entry: LocalManagedModuleEntry) => void;
	onCreateLocalRepository?: (entry: LocalUnmanagedFolderEntry) => void;
	onLinkLocalRepository?: (entry: LocalUnmanagedFolderEntry) => void;
	onOpenLocalFolder?: (entry: LocalManagedModuleEntry | LocalUnmanagedFolderEntry) => void;
	onSelectionChange: (moduleKeys: string[]) => void;
	onSortChange: (sortState: Partial<ModuleSortState>) => void;
}

interface ModuleSidebarViewProviderOptions {
	getLocalResourceRoots?: () => readonly vscode.Uri[];
}

type WebviewMessage = {
	type: 'login' | 'refresh' | 'initializeWorkspace' | 'applySelected' | 'toggleStar' | 'openReadme' | 'openRepository' | 'togglePreview' | 'applyOne' | 'toggleSelection' | 'setFilterQuery' | 'clearFilter' | 'setIncludeApplied' | 'setScope' | 'dismissIntroTip' | 'removeModule' | 'updateModule' | 'setSortField' | 'setSortDirection' | 'showMore' | 'openLocalReadme' | 'openLocalFolder' | 'removeLocalModule' | 'updateLocalModule' | 'toggleLocalModuleLock' | 'switchLocalModuleMethod' | 'createLocalRepository' | 'linkLocalRepository';
	moduleKey?: string;
	localItemId?: string;
	selected?: boolean;
	query?: string;
	includeApplied?: boolean;
	scope?: ModuleListScope;
	sortField?: ModuleSortField;
	sortDirection?: ModuleSortDirection;
};

export class ModuleSidebarViewProvider implements vscode.WebviewViewProvider, IModuleViewProvider {
	private view: vscode.WebviewView | undefined;
	private viewTitle = t('availableModulesViewTitle');
	private viewDescription: string | undefined;
	private modules: CsmModuleEntry[] = [];
	private state: ViewState = 'loading';
	private message = t('loadingModules');
	private signedIn = false;
	private signedInAccountLabel: string | undefined;
	private canInitializeWorkspace = false;
	private readonly selectedModuleKeys = new Set<string>();
	private readonly appliedModuleKeys = new Set<string>();
	private localManagedModules: LocalManagedModuleEntry[] = [];
	private localUnmanagedFolders: LocalUnmanagedFolderEntry[] = [];
	private gitAvailable = false;
	private readonly localManagedModulesById = new Map<string, LocalManagedModuleEntry>();
	private readonly localUnmanagedFoldersById = new Map<string, LocalUnmanagedFolderEntry>();
	private workspaceLabel: string | undefined;
	private moduleRoot: string | undefined;
	private workspaceLabviewVersion: string | undefined;
	private filterQuery = '';
	private includeAppliedModules = false;
	private scope: ModuleListScope = 'all';
	private introTipVisible = true;
	private offlineMode = false;
	private sortState: ModuleSortState = DEFAULT_MODULE_SORT_STATE;
	private readonly staleModuleKeys = new Set<string>();
	private static readonly INITIAL_RENDER_LIMIT = 100;
	private renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;

	constructor(
		private readonly actions: ModuleSidebarActions,
		private readonly options: ModuleSidebarViewProviderOptions = {},
	) { }

	public static getModuleKey(entry: CsmModuleEntry): string {
		return getModuleKey(entry);
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;
		webviewView.title = this.viewTitle;
		webviewView.description = this.viewDescription;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: this.options.getLocalResourceRoots?.(),
		};
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			void this.handleMessage(message);
		});
		this.render();
	}

	public setAuthenticated(signedIn: boolean, accountLabel?: string): void {
		this.signedIn = signedIn;
		this.signedInAccountLabel = signedIn ? accountLabel : undefined;
		this.updateViewTitle();
		this.render();
	}

	public setLoading(message = t('loadingModules'), forceSkeleton = false): void {
		this.state = 'loading';
		this.message = message;
		if (forceSkeleton) {
			this.modules = [];
			this.renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;
		}
		this.render();
	}

	public setError(message: string): void {
		this.state = 'error';
		this.message = message;
		this.render();
	}

	public setModules(modules: CsmModuleEntry[]): void {
		this.modules = modules;
		this.renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;
		if (modules.length === 0) {
			this.state = 'empty';
			this.message = t('noRepositoriesFound');
		} else {
			this.state = 'ready';
		}
		this.pruneSelection();
		this.render();
	}

	/**
	 * 预览渲染模块卡片，但不改变 loading 状态——用于后台数据仍在加载时
	 * 提前展示已获取到的模块列表，让用户感知到进度。
	 */
	public setModulesPreview(modules: CsmModuleEntry[]): void {
		this.modules = modules;
		this.renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;
		this.pruneSelection();
		this.render();
	}

	public setSelection(moduleKeys: string[]): void {
		this.selectedModuleKeys.clear();
		for (const key of moduleKeys) {
			if (this.findEntry(key)) {
				this.selectedModuleKeys.add(key);
			}
		}
		this.render();
	}

	public setCanInitializeWorkspace(canInitializeWorkspace: boolean): void {
		this.canInitializeWorkspace = canInitializeWorkspace;
		this.render();
	}

	public setViewDescription(description?: string): void {
		this.viewDescription = description;
		if (this.view) {
			this.view.description = description;
		}
	}

	private updateViewTitle(): void {
		this.viewTitle = this.signedIn && this.signedInAccountLabel
			? t('signedInAsTitle', { account: this.signedInAccountLabel })
			: t('availableModulesViewTitle');
		if (this.view) {
			this.view.title = this.viewTitle;
		}
	}

	public setWorkspaceContext(context: SidebarWorkspaceContext): void {
		this.workspaceLabel = context.workspaceLabel;
		this.moduleRoot = context.moduleRoot;
		this.workspaceLabviewVersion = context.workspaceLabviewVersion;
		this.gitAvailable = context.gitAvailable === true;
		this.localManagedModules = context.managedModules ?? [];
		this.localUnmanagedFolders = context.unmanagedFolders ?? [];
		this.rebuildMap(this.localManagedModulesById, this.localManagedModules, (e) => e.id);
		this.rebuildMap(this.localUnmanagedFoldersById, this.localUnmanagedFolders, (e) => e.id);
		this.rebuildSet(this.appliedModuleKeys, context.appliedModuleKeys, (k) => this.findEntry(k) !== undefined);
		this.rebuildSet(this.staleModuleKeys, context.staleModuleKeys ?? []);
		this.render();
	}

	private rebuildMap<K, V>(map: Map<K, V>, items: V[], keyFn: (item: V) => K): void {
		map.clear();
		for (const item of items) {
			map.set(keyFn(item), item);
		}
	}

	private rebuildSet<T>(set: Set<T>, items: Iterable<T>, filter?: (item: T) => boolean): void {
		set.clear();
		for (const item of items) {
			if (!filter || filter(item)) {
				set.add(item);
			}
		}
	}

	public setOfflineMode(offline: boolean): void {
		this.offlineMode = offline;
		this.render();
	}

	public setSortOrder(sortState: ModuleSortState): void {
		this.sortState = normalizeModuleSortState(sortState);
		this.render();
	}

	// 消息类型 → 处理函数的声明式映射（替代 switch-case）
	private readonly messageHandlers: Record<string, (msg: WebviewMessage) => void> = {
		login: () => this.actions.onLogin(),
		refresh: () => this.actions.onRefresh(),
		initializeWorkspace: () => this.actions.onInitializeWorkspace(),
		applySelected: () => this.actions.onApplySelection(),
		setFilterQuery: (msg) => { this.filterQuery = typeof msg.query === 'string' ? msg.query.slice(0, 120) : ''; },
		clearFilter: () => { this.filterQuery = ''; },
		setIncludeApplied: (msg) => { this.includeAppliedModules = msg.includeApplied === true; this.render(); },
		setScope: (msg) => {
			if (msg.scope === 'all' || msg.scope === 'workspace' || msg.scope === 'catalog') {
				this.scope = msg.scope;
				this.render();
			}
		},
		setSortField: (msg) => {
			if (isModuleSortField(msg.sortField)) {
				this.actions.onSortChange({ field: msg.sortField });
			}
		},
		setSortDirection: (msg) => {
			if (isModuleSortDirection(msg.sortDirection)) {
				this.actions.onSortChange({ direction: msg.sortDirection });
			}
		},
		dismissIntroTip: () => { this.introTipVisible = false; this.render(); },
		showMore: () => { this.renderLimit += ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT; this.render(); },

		// moduleKey 查找 → 动作分发
		toggleStar: (msg) => this.withModuleEntry(msg, (e) => this.actions.onToggleStar(e)),
		openReadme: (msg) => this.withModuleEntry(msg, (e) => this.actions.onOpenReadme(e)),
		openRepository: (msg) => this.withModuleEntry(msg, (e) => this.actions.onOpenRepository?.(e)),
		togglePreview: (msg) => this.withModuleEntry(msg, (e) => this.actions.onOpenReadme(e)),
		applyOne: (msg) => this.withModuleEntry(msg, (e) => this.actions.onApplySelection(e)),
		removeModule: (msg) => this.withModuleEntry(msg, (e) => this.actions.onRemoveModule(e)),
		updateModule: (msg) => this.withModuleEntry(msg, (e) => this.actions.onUpdateModule(e)),

		// 选择状态
		toggleSelection: (msg) => {
			if (!msg.moduleKey) { return; }
			if (msg.selected) {
				this.selectedModuleKeys.add(msg.moduleKey);
			} else {
				this.selectedModuleKeys.delete(msg.moduleKey);
			}
			this.pruneSelection();
			this.render();
			this.actions.onSelectionChange([...this.selectedModuleKeys]);
		},

		// localItemId 查找 → 动作分发
		openLocalReadme: (msg) => this.withLocalManagedEntry(msg, (e) => this.actions.onOpenReadme(e.moduleEntry)),
		removeLocalModule: (msg) => this.withLocalManagedEntry(msg, (e) => this.actions.onRemoveModule(e.moduleEntry)),
		updateLocalModule: (msg) => this.withLocalManagedEntry(msg, (e) => this.actions.onUpdateModule(e.moduleEntry)),
		toggleLocalModuleLock: (msg) => this.withLocalManagedEntry(msg, (e) => this.actions.onToggleLocalModuleLock?.(e)),
		switchLocalModuleMethod: (msg) => this.withLocalManagedEntry(msg, (e) => this.actions.onSwitchLocalModuleMethod?.(e)),
		createLocalRepository: (msg) => this.withLocalUnmanagedEntry(msg, (e) => this.actions.onCreateLocalRepository?.(e)),
		linkLocalRepository: (msg) => this.withLocalUnmanagedEntry(msg, (e) => this.actions.onLinkLocalRepository?.(e)),

		openLocalFolder: (msg) => {
			const managed = msg.localItemId ? this.localManagedModulesById.get(msg.localItemId) : undefined;
			const unmanaged = msg.localItemId ? this.localUnmanagedFoldersById.get(msg.localItemId) : undefined;
			const folderEntry = managed ?? unmanaged;
			if (folderEntry) { this.actions.onOpenLocalFolder?.(folderEntry); }
		},
	};

	private withModuleEntry(msg: WebviewMessage, action: (entry: CsmModuleEntry) => void): void {
		const entry = msg.moduleKey ? this.findEntry(msg.moduleKey) : undefined;
		if (entry) { action(entry); }
	}

	private withLocalManagedEntry(msg: WebviewMessage, action: (entry: LocalManagedModuleEntry) => void): void {
		const entry = msg.localItemId ? this.localManagedModulesById.get(msg.localItemId) : undefined;
		if (entry) { action(entry); }
	}

	private withLocalUnmanagedEntry(msg: WebviewMessage, action: (entry: LocalUnmanagedFolderEntry) => void): void {
		const entry = msg.localItemId ? this.localUnmanagedFoldersById.get(msg.localItemId) : undefined;
		if (entry) { action(entry); }
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!this.isWebviewMessage(message)) { return; }

		const handler = Object.prototype.hasOwnProperty.call(this.messageHandlers, message.type)
			? this.messageHandlers[message.type]
			: undefined;

		if (typeof handler === 'function') {
			handler(message);
		}
	}

	private isWebviewMessage(message: unknown): message is WebviewMessage {
		return typeof message === 'object' && message !== null && 'type' in message;
	}

	private findEntry(moduleKey: string): CsmModuleEntry | undefined {
		return this.modules.find((entry) => getModuleKey(entry) === moduleKey);
	}

	private pruneSelection(): void {
		const availableKeys = new Set(this.modules.map((entry) => getModuleKey(entry)));
		for (const key of [...this.selectedModuleKeys]) {
			if (!availableKeys.has(key)) {
				this.selectedModuleKeys.delete(key);
			}
		}
	}

	private render(): void {
		if (!this.view) {
			return;
		}

		this.view.webview.html = this.getHtml();
	}

	private getHtml(): string {
		return renderModuleSidebarHtml({
			filterQuery: this.filterQuery,
			modules: this.modules,
			state: this.state,
			message: this.message,
			signedIn: this.signedIn,
			signedInAccountLabel: this.signedInAccountLabel,
			canInitializeWorkspace: this.canInitializeWorkspace,
			selectedModuleKeys: this.selectedModuleKeys,
			appliedModuleKeys: this.appliedModuleKeys,
			managedModules: this.localManagedModules,
			unmanagedFolders: this.localUnmanagedFolders,
			workspaceLabel: this.workspaceLabel,
			moduleRoot: this.moduleRoot,
			workspaceLabviewVersion: this.workspaceLabviewVersion,
			gitAvailable: this.gitAvailable,
			introTipVisible: this.introTipVisible,
			includeAppliedModules: this.includeAppliedModules,
			scope: this.scope,
			offlineMode: this.offlineMode,
			sortState: this.sortState,
			staleModuleKeys: this.staleModuleKeys,
			renderLimit: this.renderLimit,
			initialRenderLimit: ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT,
			webviewCspSource: this.view?.webview.cspSource,
		});
	}
}