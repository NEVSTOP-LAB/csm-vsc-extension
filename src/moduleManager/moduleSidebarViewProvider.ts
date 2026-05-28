import * as vscode from 'vscode';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from './types';
import { ViewState } from './moduleTreeDataProvider';
import { IModuleViewProvider, ModuleSortDirection, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
import { DEFAULT_MODULE_SORT_STATE, isModuleSortDirection, isModuleSortField, normalizeModuleSortState } from './sort';
import { t } from './messages';
import { ReadmePreviewState, renderModuleSidebarHtml } from './moduleSidebarHtml';

interface ModuleSidebarActions {
	onLogin: () => void;
	onRefresh: () => void;
	onInitializeWorkspace: () => void;
	onToggleStar: (entry: CsmModuleEntry) => void;
	onOpenReadme: (entry: CsmModuleEntry) => void;
	onPreviewReadme: (entry: CsmModuleEntry, webview: vscode.Webview) => Promise<string>;
	onApplySelection: (entry?: CsmModuleEntry) => void;
	onRemoveModule: (entry: CsmModuleEntry) => void;
	onUpdateModule: (entry: CsmModuleEntry) => void;
	onCreateLocalRepository?: (entry: LocalUnmanagedFolderEntry) => void;
	onSelectionChange: (moduleKeys: string[]) => void;
	onSortChange: (sortState: Partial<ModuleSortState>) => void;
}

interface ModuleSidebarViewProviderOptions {
	getLocalResourceRoots?: () => readonly vscode.Uri[];
}

type WebviewMessage = {
	type: 'login' | 'refresh' | 'initializeWorkspace' | 'applySelected' | 'toggleStar' | 'openReadme' | 'togglePreview' | 'applyOne' | 'toggleSelection' | 'setFilterQuery' | 'clearFilter' | 'setIncludeApplied' | 'dismissIntroTip' | 'removeModule' | 'updateModule' | 'setSortField' | 'setSortDirection' | 'showMore' | 'openLocalReadme' | 'removeLocalModule' | 'updateLocalModule' | 'createLocalRepository';
	moduleKey?: string;
	localItemId?: string;
	selected?: boolean;
	query?: string;
	includeApplied?: boolean;
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
	private readonly localManagedModulesById = new Map<string, LocalManagedModuleEntry>();
	private readonly localUnmanagedFoldersById = new Map<string, LocalUnmanagedFolderEntry>();
	private workspaceLabel: string | undefined;
	private moduleRoot: string | undefined;
	private filterQuery = '';
	private includeAppliedModules = false;
	private introTipVisible = true;
	private offlineMode = false;
	private sortState: ModuleSortState = DEFAULT_MODULE_SORT_STATE;
	private readonly staleModuleKeys = new Set<string>();
	private previewState: ReadmePreviewState | undefined;
	private static readonly INITIAL_RENDER_LIMIT = 100;
	private renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;

	constructor(
		private readonly actions: ModuleSidebarActions,
		private readonly options: ModuleSidebarViewProviderOptions = {},
	) { }

	public static getModuleKey(entry: CsmModuleEntry): string {
		return `${entry.owner}/${entry.name}`;
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

	public setLoading(message = t('loadingModules')): void {
		this.state = 'loading';
		this.message = message;
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
		this.prunePreview();
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
		this.localManagedModules = context.managedModules ?? [];
		this.localUnmanagedFolders = context.unmanagedFolders ?? [];
		this.localManagedModulesById.clear();
		for (const entry of this.localManagedModules) {
			this.localManagedModulesById.set(entry.id, entry);
		}
		this.localUnmanagedFoldersById.clear();
		for (const entry of this.localUnmanagedFolders) {
			this.localUnmanagedFoldersById.set(entry.id, entry);
		}
		this.appliedModuleKeys.clear();
		for (const moduleKey of context.appliedModuleKeys) {
			if (this.findEntry(moduleKey)) {
				this.appliedModuleKeys.add(moduleKey);
			}
		}
		this.staleModuleKeys.clear();
		for (const key of context.staleModuleKeys ?? []) {
			this.staleModuleKeys.add(key);
		}
		this.render();
	}

	public setOfflineMode(offline: boolean): void {
		this.offlineMode = offline;
		this.render();
	}

	public setSortOrder(sortState: ModuleSortState): void {
		this.sortState = normalizeModuleSortState(sortState);
		this.render();
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!this.isWebviewMessage(message)) {
			return;
		}

		switch (message.type) {
			case 'login':
				this.actions.onLogin();
				return;
			case 'refresh':
				this.actions.onRefresh();
				return;
			case 'initializeWorkspace':
				this.actions.onInitializeWorkspace();
				return;
			case 'toggleStar': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (entry) {
					this.actions.onToggleStar(entry);
				}
				return;
			}
			case 'applySelected':
				this.actions.onApplySelection();
				return;
			case 'setFilterQuery':
				this.filterQuery = typeof message.query === 'string' ? message.query.slice(0, 120) : '';
				return;
			case 'clearFilter':
				this.filterQuery = '';
				return;
			case 'setIncludeApplied':
				this.includeAppliedModules = message.includeApplied === true;
				this.render();
				return;
			case 'setSortField':
				if (isModuleSortField(message.sortField)) {
					this.actions.onSortChange({ field: message.sortField });
				}
				return;
			case 'setSortDirection':
				if (isModuleSortDirection(message.sortDirection)) {
					this.actions.onSortChange({ direction: message.sortDirection });
				}
				return;
			case 'dismissIntroTip':
				this.introTipVisible = false;
				this.render();
				return;
			case 'toggleSelection': {
				if (!message.moduleKey) {
					return;
				}
				if (message.selected) {
					this.selectedModuleKeys.add(message.moduleKey);
				} else {
					this.selectedModuleKeys.delete(message.moduleKey);
				}
				this.pruneSelection();
				this.render();
				this.actions.onSelectionChange([...this.selectedModuleKeys]);
				return;
			}
			case 'openReadme': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (entry) {
					this.actions.onOpenReadme(entry);
				}
				return;
			}
			case 'togglePreview': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (!entry || !this.view) {
					return;
				}
				const moduleKey = ModuleSidebarViewProvider.getModuleKey(entry);
				if (this.previewState?.moduleKey === moduleKey && this.previewState.status !== 'loading') {
					this.previewState = undefined;
					this.render();
					return;
				}
				this.previewState = {
					moduleKey,
					title: entry.name,
					status: 'loading',
				};
				this.render();
				try {
					const html = await this.actions.onPreviewReadme(entry, this.view.webview);
					if (this.previewState?.moduleKey !== moduleKey) {
						return;
					}
					this.previewState = {
						moduleKey,
						title: entry.name,
						status: 'ready',
						html,
					};
				} catch (error) {
					if (this.previewState?.moduleKey !== moduleKey) {
						return;
					}
					this.previewState = {
						moduleKey,
						title: entry.name,
						status: 'error',
						message: error instanceof Error ? error.message : t('unableToLoadReadmePreview'),
					};
				}
				this.render();
				return;
			}
			case 'applyOne': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (entry) {
					this.actions.onApplySelection(entry);
				}
				return;
			}
			case 'removeModule': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (entry) {
					this.actions.onRemoveModule(entry);
				}
				return;
			}
			case 'updateModule': {
				const entry = message.moduleKey ? this.findEntry(message.moduleKey) : undefined;
				if (entry) {
					this.actions.onUpdateModule(entry);
				}
				return;
			}
			case 'openLocalReadme': {
				const entry = message.localItemId ? this.localManagedModulesById.get(message.localItemId) : undefined;
				if (entry) {
					this.actions.onOpenReadme(entry.moduleEntry);
				}
				return;
			}
			case 'removeLocalModule': {
				const entry = message.localItemId ? this.localManagedModulesById.get(message.localItemId) : undefined;
				if (entry) {
					this.actions.onRemoveModule(entry.moduleEntry);
				}
				return;
			}
			case 'updateLocalModule': {
				const entry = message.localItemId ? this.localManagedModulesById.get(message.localItemId) : undefined;
				if (entry) {
					this.actions.onUpdateModule(entry.moduleEntry);
				}
				return;
			}
			case 'createLocalRepository': {
				const entry = message.localItemId ? this.localUnmanagedFoldersById.get(message.localItemId) : undefined;
				if (entry) {
					this.actions.onCreateLocalRepository?.(entry);
				}
				return;
			}
			case 'showMore': {
				this.renderLimit += ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;
				this.render();
				return;
			}
		}
	}

	private isWebviewMessage(message: unknown): message is WebviewMessage {
		return typeof message === 'object' && message !== null && 'type' in message;
	}

	private findEntry(moduleKey: string): CsmModuleEntry | undefined {
		return this.modules.find((entry) => ModuleSidebarViewProvider.getModuleKey(entry) === moduleKey);
	}

	private pruneSelection(): void {
		const availableKeys = new Set(this.modules.map((entry) => ModuleSidebarViewProvider.getModuleKey(entry)));
		for (const key of [...this.selectedModuleKeys]) {
			if (!availableKeys.has(key)) {
				this.selectedModuleKeys.delete(key);
			}
		}
	}

	private prunePreview(): void {
		if (this.previewState && !this.findEntry(this.previewState.moduleKey)) {
			this.previewState = undefined;
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
			introTipVisible: this.introTipVisible,
			includeAppliedModules: this.includeAppliedModules,
			offlineMode: this.offlineMode,
			sortState: this.sortState,
			staleModuleKeys: this.staleModuleKeys,
			previewState: this.previewState,
			renderLimit: this.renderLimit,
			initialRenderLimit: ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT,
			webviewCspSource: this.view?.webview.cspSource,
		});
	}
}