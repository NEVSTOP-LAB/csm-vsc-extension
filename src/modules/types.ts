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

export type ModuleApplyMethod = 'submodule' | 'copy' | 'release';

/**
 * 版本来源类型（issue #37）：
 * - `branch`：分支
 * - `commit`：具体提交（旧配置缺省按此处理）
 * - `tag`：git 标签
 * - `release`：GitHub Release
 */
export type ModuleVersionKind = 'branch' | 'commit' | 'tag' | 'release';

export interface LocalModuleConfigEntry {
	key: string;
	name: string;
	owner: string;
	source: string;
	method: ModuleApplyMethod;
	path: string;
	ref: string;
	branch: string;
	/** 版本来源类型（issue #37），旧配置缺省视为 `commit` */
	versionKind?: ModuleVersionKind;
	/** 版本来源引用：分支名 / tag 名 / release 名（commit 类型时为提交 SHA） */
	versionRef?: string;
	/** release 来源：release 标题（确认框/成功提示/侧边栏展示用） */
	releaseName?: string;
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
	/** 版本来源类型（issue #37），缺省视为 `commit` */
	versionKind?: ModuleVersionKind;
	/** 版本来源引用：分支名 / tag 名 / release 名 */
	versionRef?: string;
	/** release 来源：release 标题（侧边栏展示用） */
	releaseName?: string;
	/** 当前版本提交信息（来自本地缓存，避免每次在线查询） */
	commitInfo?: string;
	/** 当前版本提交日期（ISO 字符串，来自本地缓存） */
	commitDate?: string;
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

// ---------------------------------------------------------------------------
// 模块版本（issue #37）
// ---------------------------------------------------------------------------

/** 一次提交的展示信息 */
export interface ModuleCommitInfo {
	sha: string;
	message: string;
	/** ISO 日期字符串 */
	date?: string;
}

/** 一个 git 标签的展示信息 */
export interface ModuleTagInfo {
	name: string;
	/** 标签指向的引用 SHA（轻量标签为提交 SHA，注解标签可能为 tag 对象 SHA） */
	sha: string;
	/** ISO 日期字符串（尽力解析） */
	date?: string;
}

/** 一个 GitHub Release 附件的展示信息 */
export interface ModuleReleaseAssetInfo {
	name: string;
	/** 可直接下载的 URL（GitHub browser_download_url） */
	browserDownloadUrl: string;
	size?: number;
}

/** 一个 GitHub Release 的展示信息 */
export interface ModuleReleaseInfo {
	name: string;
	tagName: string;
	/** ISO 发布时间字符串 */
	publishedAt?: string;
	/** 附件列表（不含 GitHub 自动生成的 Source code 附件） */
	assets?: ModuleReleaseAssetInfo[];
}

/** 一个远端分支的展示信息 */
export interface ModuleBranchInfo {
	name: string;
	/** 分支 HEAD 提交 SHA */
	sha: string;
}

/**
 * 用户选择的更新目标版本。`kind === 'latest'` 表示更新到分支最新提交（与现状一致）；
 * 其余为具体版本来源（branch/commit/tag/release），更新时通过 `versionRef`/`ref` 定位。
 * release 来源：下载其附件（assets），而非 checkout 对应 commit/tag。
 */
export interface ModuleVersionSelection {
	kind: 'latest' | ModuleVersionKind;
	/** 版本来源引用：分支名 / tag 名 / release 名 / 提交 SHA */
	versionRef?: string;
	/** 目标提交 SHA（尽力解析，供确认对话框与更新使用） */
	ref?: string;
	/** 更新所基于的分支（提交记录默认基于该分支） */
	branch: string;
	/** 目标版本展示文本（确认对话框与成功提示） */
	label: string;
	/** release 来源：release 标题（确认框/成功提示/侧边栏展示用） */
	releaseName?: string;
	/** release 来源：待下载的附件列表 */
	releaseAssets?: ModuleReleaseAssetInfo[];
	/** 目标提交信息（更新成功后写入本地缓存） */
	commitInfo?: string;
	/** 目标提交日期（ISO，更新成功后写入本地缓存） */
	commitDate?: string;
}

/** 本地提交信息缓存条目：key=`owner/name`，value=`{ ref, commitInfo, date }` */
export interface ModuleVersionCacheEntry {
	ref: string;
	commitInfo?: string;
	date?: string;
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
