export interface CsmModuleEntry {
	id: number;
	owner: string;
	name: string;
	description: string;
	topics: string[];
	visibility: 'public' | 'private';
	archived?: boolean;
	fork?: boolean;
	pushedAt?: string;
	defaultBranch: string;
	repoUrl: string;
	starred?: boolean;
	readme?: string;
	updatedAt?: string;
	/** 从 GitHub topics 中提取的 LabVIEW 开发版本显示名（如 "lv2020"） */
	labviewVersion?: string;
}

export type ModuleApplyMethod = 'submodule' | 'copy';

export interface LocalModuleConfigEntry {
	key: string;
	name: string;
	owner: string;
	source: string;
	method: ModuleApplyMethod;
	path: string;
	ref: string;
	branch: string;
	locked?: boolean;
	/** LabVIEW 开发版本显示名（如 "lv2020"），持久化到 YAML 配置 */
	labviewVersion?: string;
}

export interface LocalModuleConfig {
	version: string;
	root: string;
	configPath: string;
	modules: Record<string, LocalModuleConfigEntry>;
}

export interface LocalManagedModuleEntry {
	id: string;
	kind: 'managed';
	owner: string;
	name: string;
	path: string;
	source: string;
	method: ModuleApplyMethod;
	branch: string;
	ref: string;
	locked?: boolean;
	repoUrl: string;
	description: string;
	visibility: 'public' | 'private';
	topics: string[];
	moduleEntry: CsmModuleEntry;
	moduleKey?: string;
	stale: boolean;
	/** LabVIEW 开发版本显示名（如 "lv2020", "lv2020(64bit)"），未检测到则为 undefined */
	labviewVersion?: string;
}

export interface LocalUnmanagedFolderEntry {
	id: string;
	kind: 'unmanaged';
	name: string;
	path: string;
	/** LabVIEW 开发版本显示名（如 "lv2020", "lv2020(64bit)"），未检测到则为 undefined */
	labviewVersion?: string;
}

export interface CopyModuleUpdatePreview {
	currentRef: string;
	latestRef: string;
	branch: string;
	needsUpdate: boolean;
	backupDirectory?: string;
}

export interface ModuleUpdateResult {
	entry: LocalModuleConfigEntry;
	backupPath?: string;
}

export interface ModuleCacheSnapshot {
	schemaVersion?: number;
	lastRefreshAt: string;
	modules: CsmModuleEntry[];
	refreshAccountId?: string;
	refreshAccountLabel?: string;
}

export interface ModuleAuthSnapshot {
	accountId: string;
	accountLabel: string;
}

export interface GitHubRepoSummary {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	archived?: boolean;
	fork?: boolean;
	pushed_at?: string;
	default_branch: string;
	html_url: string;
	topics?: string[];
	updated_at?: string;
}

// ---------------------------------------------------------------------------
// 从 interfaces.ts 合并的类型（排序、视图、作用域）
// ---------------------------------------------------------------------------

export type ModuleSortField = 'name' | 'owner' | 'updatedAt' | 'applied';
export type ModuleSortDirection = 'asc' | 'desc';
export type ModuleListScope = 'all' | 'workspace' | 'catalog';

export interface ModuleSortState {
	field: ModuleSortField;
	direction: ModuleSortDirection;
}

export interface SidebarWorkspaceContext {
	workspaceLabel?: string;
	moduleRoot?: string;
	gitAvailable?: boolean;
	appliedModuleKeys: string[];
	staleModuleKeys?: string[];
	managedModules?: LocalManagedModuleEntry[];
	unmanagedFolders?: LocalUnmanagedFolderEntry[];
	/** 工作区根目录检测到的 LabVIEW 版本显示名（如 "lv2020"） */
	workspaceLabviewVersion?: string;
}

/**
 * Abstraction over the sidebar/webview implementation so the controller
 * does not have to depend on a concrete `ModuleSidebarViewProvider`
 * (review item 2.2 — improves testability and removes `instanceof` checks).
 */
export interface IModuleViewProvider {
	setAuthenticated(signedIn: boolean, accountLabel?: string): void;
	setLoading(message?: string, forceSkeleton?: boolean): void;
	setError(message: string): void;
	setModules(modules: CsmModuleEntry[]): void;
	setModulesPreview?(modules: CsmModuleEntry[]): void;
	setSelection(moduleKeys: string[]): void;
	setWorkspaceContext(context: SidebarWorkspaceContext): void;
	setCanInitializeWorkspace(canInitializeWorkspace: boolean): void;
	setOfflineMode?(offline: boolean): void;
	setSortOrder?(sortState: ModuleSortState): void;
	setViewDescription?(description?: string): void;
}
