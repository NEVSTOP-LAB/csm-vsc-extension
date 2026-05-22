import type { ModuleApplyMethod } from './types';
import { getHtmlLang as getHtmlLangValue, localizeBundle } from '../i18n';

const messages = {
	outputChannelName: {
		en: 'CSM Modules',
		zh: 'CSM 模块',
	},
	commandErrorPrefix: {
		en: 'CSM Module Manager: {message}',
		zh: 'CSM 模块管理器：{message}',
	},
	unexpectedError: {
		en: 'Unexpected error',
		zh: '发生未知错误',
	},
	workspaceInitPrompt: {
		en: 'Detected {rootPath}/ and .lvproj files but no local CSM module config. Initialize CSM module management for this repository?',
		zh: '检测到 {rootPath}/ 目录和 .lvproj 文件，但尚未找到本地 CSM 模块配置。要为此仓库初始化 CSM 模块管理吗？',
	},
	signInToLoadModules: {
		en: 'Sign in to GitHub to include private modules.',
		zh: '登录 GitHub 以纳入私有模块。',
	},
	selectModuleToApply: {
		en: 'Select at least one module to apply to the current repository.',
		zh: '请至少选择一个要应用到当前仓库的模块。',
	},
	openWorkspaceBeforeApply: {
		en: 'Open the target repository as a workspace folder before applying modules.',
		zh: '应用模块前，请先将目标仓库作为工作区文件夹打开。',
	},
	workspaceNotGitRepo: {
		en: 'The current workspace folder is not a Git repository.',
		zh: '当前工作区文件夹不是 Git 仓库。',
	},
	signInRequiredForPrivate: {
		en: 'GitHub sign-in is required to apply private modules.',
		zh: '应用私有模块前需要登录 GitHub。',
	},
	duplicateTargetPaths: {
		en: 'Selected modules would map to the same target path: {paths}',
		zh: '所选模块会映射到相同的目标路径：{paths}',
	},
	copyTargetExists: {
		en: 'Copy target already exists',
		zh: '复制目标已存在',
	},
	targetPathExists: {
		en: 'Target path already exists',
		zh: '目标路径已存在',
	},
	applyConfirmation: {
		en: 'Apply {count} module(s) to {repository} using {method} under {root}/?',
		zh: '要在 {repository} 的 {root}/ 下以 {method} 方式应用 {count} 个模块吗？',
	},
	applyAction: {
		en: 'Apply',
		zh: '应用',
	},
	progressApplying: {
		en: 'Applying {count} module(s) via {method}...',
		zh: '正在通过 {method} 应用 {count} 个模块...',
	},
	applyPartialFailure: {
		en: 'Applied {appliedCount}/{selectedCount} module(s) before failure',
		zh: '失败前已应用 {appliedCount}/{selectedCount} 个模块',
	},
	applyFailed: {
		en: 'Failed to apply CSM modules',
		zh: '应用 CSM 模块失败',
	},
	applySuccess: {
		en: 'Applied {count} module(s) via {method}. Config: {configPath}',
		zh: '已通过 {method} 应用 {count} 个模块。配置文件：{configPath}',
	},
	openWorkspaceBeforeRemove: {
		en: 'Open the target repository as a workspace folder before removing modules.',
		zh: '移除模块前，请先将目标仓库作为工作区文件夹打开。',
	},
	noWorkspaceConfig: {
		en: 'No CSM module configuration found in this workspace.',
		zh: '当前工作区中未找到 CSM 模块配置。',
	},
	selectedModuleNotApplied: {
		en: 'Selected module is not currently applied to this workspace.',
		zh: '所选模块当前尚未应用到此工作区。',
	},
	removeConfirmation: {
		en: 'Remove module {module} from {repository}? This deletes {targetPath}.',
		zh: '要从 {repository} 移除模块 {module} 吗？这将删除 {targetPath}。',
	},
	removeAction: {
		en: 'Remove',
		zh: '移除',
	},
	progressRemoving: {
		en: 'Removing {module}...',
		zh: '正在移除 {module}...',
	},
	removeFailed: {
		en: 'Failed to remove module: {message}',
		zh: '移除模块失败：{message}',
	},
	removeSuccess: {
		en: 'Removed module {module}.',
		zh: '已移除模块 {module}。',
	},
	openWorkspaceBeforeUpdate: {
		en: 'Open the target repository as a workspace folder before updating modules.',
		zh: '更新模块前，请先将目标仓库作为工作区文件夹打开。',
	},
	progressUpdating: {
		en: 'Updating {module}...',
		zh: '正在更新 {module}...',
	},
	latestRef: {
		en: 'latest',
		zh: '最新版本',
	},
	updateSuccess: {
		en: 'Updated {module} to {ref}.',
		zh: '已将 {module} 更新到 {ref}。',
	},
	updateFailed: {
		en: 'Failed to update module: {message}',
		zh: '更新模块失败：{message}',
	},
	openWorkspaceBeforeInitialize: {
		en: 'Open the target repository as a workspace folder before initializing CSM module management.',
		zh: '初始化 CSM 模块管理前，请先将目标仓库作为工作区文件夹打开。',
	},
	configAlreadyExists: {
		en: 'Local CSM module config already exists at {configPath}.',
		zh: '本地 CSM 模块配置已存在：{configPath}。',
	},
	configInitializedFromSubmodules: {
		en: 'Initialized local CSM module config from existing submodules at {configPath}.',
		zh: '已根据现有子模块初始化本地 CSM 模块配置：{configPath}。',
	},
	signInCancelled: {
		en: 'GitHub sign-in was cancelled.',
		zh: 'GitHub 登录已取消。',
	},
	signedInAs: {
		en: 'Signed in as {account}.',
		zh: '已登录为 {account}。',
	},
	signedInAsTitle: {
		en: 'Signed in as {account}',
		zh: '已登录为 {account}',
	},
	availableModulesViewTitle: {
		en: 'Available Modules',
		zh: '可用模块',
	},
	signedOut: {
		en: 'Signed out of GitHub.',
		zh: '已退出 GitHub 登录。',
	},
	signOutCancelled: {
		en: 'GitHub sign-out was cancelled.',
		zh: 'GitHub 退出登录已取消。',
	},
	signOutFailed: {
		en: 'Failed to sign out of GitHub: {message}',
		zh: '退出 GitHub 登录失败：{message}',
	},
	refreshConfirmation: {
		en: 'Refresh CSM modules from GitHub?',
		zh: '要从 GitHub 刷新 CSM 模块吗？',
	},
	refreshAction: {
		en: 'Refresh',
		zh: '刷新',
	},
	signInRequiredForRefresh: {
		en: 'GitHub sign-in is required to refresh modules.',
		zh: '刷新模块前需要登录 GitHub。',
	},
	refreshWithoutSession: {
		en: 'Unable to refresh modules without a GitHub session.',
		zh: '没有 GitHub 会话，无法刷新模块。',
	},
	refreshingModules: {
		en: 'Refreshing modules from GitHub...',
		zh: '正在从 GitHub 刷新模块...',
	},
	modulesUpToDate: {
		en: 'CSM modules are up to date.',
		zh: 'CSM 模块已是最新。',
	},
	modulesRefreshed: {
		en: 'Refreshed {count} module(s).',
		zh: '已刷新 {count} 个模块。',
	},
	refreshFailed: {
		en: 'Failed to refresh CSM modules: {message}',
		zh: '刷新 CSM 模块失败：{message}',
	},
	readmeUnavailableTitle: {
		en: '# README not available',
		zh: '# README 不可用',
	},
	readmeUnavailableBody: {
		en: 'Unable to load README from GitHub for this module.',
		zh: '无法从 GitHub 加载此模块的 README。',
	},
	invalidYamlConfig: {
		en: 'The local CSM module config is not valid YAML. Fix the file or reinitialize the workspace.',
		zh: '本地 CSM 模块配置不是有效的 YAML。请修复该文件或重新初始化工作区。',
	},
	gitUnavailable: {
		en: 'Git is not available. Install Git or configure git.path in VS Code.',
		zh: 'Git 不可用。请安装 Git，或在 VS Code 中配置 git.path。',
	},
	gitCannotAccessRepo: {
		en: 'Git could not access the module repository. Check your GitHub session and repository permissions.',
		zh: 'Git 无法访问模块仓库。请检查 GitHub 会话和仓库权限。',
	},
	networkRequestFailed: {
		en: 'Network request failed while contacting GitHub. Check your connection and try again.',
		zh: '连接 GitHub 时网络请求失败。请检查网络连接后重试。',
	},
	github401: {
		en: 'GitHub rejected the request (HTTP 401). Sign in again and try again.',
		zh: 'GitHub 拒绝了请求（HTTP 401）。请重新登录后再试。',
	},
	github403: {
		en: 'GitHub rejected the request (HTTP 403). Check repository permissions and token scopes.',
		zh: 'GitHub 拒绝了请求（HTTP 403）。请检查仓库权限和令牌作用域。',
	},
	github404Module: {
		en: 'GitHub could not find the requested module data (HTTP 404).',
		zh: 'GitHub 找不到请求的模块数据（HTTP 404）。',
	},
	github404Readme: {
		en: 'GitHub could not find the requested README or repository data (HTTP 404).',
		zh: 'GitHub 找不到请求的 README 或仓库数据（HTTP 404）。',
	},
	githubTemporaryUnavailable: {
		en: 'GitHub is temporarily unavailable (HTTP {status}). Try again in a moment.',
		zh: 'GitHub 当前暂时不可用（HTTP {status}）。请稍后再试。',
	},
	githubRequestFailed: {
		en: 'GitHub request failed (HTTP {status}).',
		zh: 'GitHub 请求失败（HTTP {status}）。',
	},
	noCachedReadmeAndNoSession: {
		en: 'No cached README and no GitHub session available.',
		zh: '没有缓存的 README，且当前没有可用的 GitHub 会话。',
	},
	readmePanelTitle: {
		en: 'README: {name}',
		zh: 'README：{name}',
	},
	selectRepositoryPlaceholder: {
		en: 'Select the repository to receive the selected CSM modules.',
		zh: '选择一个仓库来接收所选的 CSM 模块。',
	},
	configRecoveredFromSubmodules: {
		en: 'Recovered local CSM module config from existing submodules at {configPath}.',
		zh: '已从现有子模块恢复本地 CSM 模块配置：{configPath}。',
	},
	selectConfigToUpdatePlaceholder: {
		en: 'Multiple CSM module configs were found. Select one to update.',
		zh: '发现多个 CSM 模块配置。请选择一个进行更新。',
	},
	noLocalConfigFoundPrompt: {
		en: 'No local CSM module config was found. Initialize one for this repository?',
		zh: '未找到本地 CSM 模块配置。要为此仓库初始化一个吗？',
	},
	useDefaultRoot: {
		en: 'Use {root}/',
		zh: '使用 {root}/',
	},
	chooseDirectory: {
		en: 'Choose Directory',
		zh: '选择目录',
	},
	later: {
		en: 'Later',
		zh: '稍后',
	},
	directoryPrompt: {
		en: 'Enter a directory relative to the repository root for local CSM modules.',
		zh: '请输入相对于仓库根目录的本地 CSM 模块目录。',
	},
	invalidDirectory: {
		en: 'Invalid directory.',
		zh: '目录无效。',
	},
	configInitializedAt: {
		en: 'Initialized local CSM module config at {configPath}.',
		zh: '已初始化本地 CSM 模块配置：{configPath}。',
	},
	initializeAction: {
		en: 'Initialize',
		zh: '初始化',
	},
	unableToLoadReadmePreview: {
		en: 'Unable to load README preview.',
		zh: '无法加载 README 预览。',
	},
	chooseApplyMethodPlaceholder: {
		en: 'Choose how to apply the selected CSM modules.',
		zh: '选择应用所选 CSM 模块的方式。',
	},
	applyMethodSubmoduleLabel: {
		en: 'submodule',
		zh: '子模块',
	},
	applyMethodSubmoduleDescription: {
		en: 'Track each module as a Git submodule.',
		zh: '将每个模块作为 Git 子模块进行跟踪。',
	},
	applyMethodSubmoduleDetail: {
		en: 'Runs git submodule add + git submodule update for {count} selected module(s).',
		zh: '对所选的 {count} 个模块执行 git submodule add 和 git submodule update。',
	},
	applyMethodCopyLabel: {
		en: 'copy',
		zh: '复制',
	},
	applyMethodCopyDescription: {
		en: 'Copy repository files without preserving .git metadata.',
		zh: '复制仓库文件，但不保留 .git 元数据。',
	},
	applyMethodCopyDetail: {
		en: 'Clones then copies files into the local module directory for {count} selected module(s).',
		zh: '先克隆，再把文件复制到本地模块目录，适用于所选的 {count} 个模块。',
	},
	loadingModules: {
		en: 'Loading modules...',
		zh: '正在加载模块...',
	},
	noCachedModulesTitle: {
		en: 'No cached modules yet',
		zh: '暂无缓存模块',
	},
	noCachedModulesBody: {
		en: 'No cached modules are available yet. Use Refresh to load the latest module list.',
		zh: '当前还没有可用的缓存模块。请点击刷新以加载最新模块列表。',
	},
	noRepositoriesFound: {
		en: 'No repositories with topic csm-modsets were found.',
		zh: '未找到带有 csm-modsets 主题的仓库。',
	},
	ownerLabel: {
		en: 'Owner',
		zh: '所有者',
	},
	noDescription: {
		en: '_No description_',
		zh: '_暂无描述_',
	},
	noRepositoryDescription: {
		en: 'No repository description provided.',
		zh: '此仓库未提供描述。',
	},
	topicsLabel: {
		en: 'Topics',
		zh: '主题',
	},
	topicsNone: {
		en: 'none',
		zh: '无',
	},
	visibilityLabel: {
		en: 'Visibility',
		zh: '可见性',
	},
	defaultBranchLabel: {
		en: 'Default branch',
		zh: '默认分支',
	},
	repositoryLabel: {
		en: 'Repository',
		zh: '仓库',
	},
	privateVisibility: {
		en: 'private',
		zh: '私有',
	},
	publicVisibility: {
		en: 'public',
		zh: '公开',
	},
	privateVisibilityTag: {
		en: '[PRI]',
		zh: '[私有]',
	},
	publicVisibilityTag: {
		en: '[PUB]',
		zh: '[公开]',
	},
	treeSignInLabel: {
		en: 'Sign in to GitHub',
		zh: '登录 GitHub',
	},
	treeTopicsLine: {
		en: '> {topicsLabel}: {topics} | {branchLabel}: {branch}',
		zh: '> {topicsLabel}：{topics} | {branchLabel}：{branch}',
	},
	treeSummaryLine: {
		en: '> {summaryLabel}: {summary}',
		zh: '> {summaryLabel}：{summary}',
	},
	summaryLabel: {
		en: 'summary',
		zh: '摘要',
	},
	branchLabel: {
		en: 'branch',
		zh: '分支',
	},
	searchModules: {
		en: 'Search modules',
		zh: '搜索模块',
	},
	clearSearch: {
		en: 'Clear search',
		zh: '清除搜索',
	},
	filterMenuType: {
		en: 'Type',
		zh: '类型',
	},
	filterMenuOrder: {
		en: 'Order',
		zh: '顺序',
	},
	applySelected: {
		en: 'Apply Selected',
		zh: '应用所选项',
	},
	signIn: {
		en: 'Sign in',
		zh: '登录',
	},
	rootLabel: {
		en: 'Root',
		zh: '根目录',
	},
	catalogScopePublicLoggedOut: {
		en: 'Loaded {count} public module(s). Sign in to see private modules.',
		zh: '已加载 {count} 个公开模块。登录后可查看私有模块。',
	},
	catalogScopeSignedInPublicOnly: {
		en: 'Loaded {count} public module(s).',
		zh: '已加载 {count} 个公开模块。',
	},
	catalogScopeSignedInWithPrivate: {
		en: 'Loaded {count} module(s), including private.',
		zh: '已加载 {count} 个模块（含私有）。',
	},
	tipTitle: {
		en: 'Tip',
		zh: '提示',
	},
	tipBody: {
		en: 'Use the checkboxes to build a selection, then apply modules from the toolbar or open individual README files from each card.',
		zh: '使用复选框建立选择，然后可从工具栏应用模块，或从每张卡片打开对应的 README。',
	},
	dismissTip: {
		en: 'Dismiss tip',
		zh: '关闭提示',
	},
	workspaceHintTitle: {
		en: 'Workspace hint',
		zh: '工作区提示',
	},
	workspaceHintBody: {
		en: 'Detected an existing csm/ layout and LabVIEW project files in the current repository.',
		zh: '检测到当前仓库中已存在 csm/ 目录结构和 LabVIEW 项目文件。',
	},
	toolbarMetaAvailable: {
		en: '{total} available',
		zh: '{total} 个可用',
	},
	toolbarMetaShown: {
		en: '{filtered} of {total} shown',
		zh: '显示 {filtered}/{total} 个',
	},
	toolbarMeta: {
		en: '{applied} applied | {visibility} | {selected} selected',
		zh: '已应用 {applied} 个 | {visibility} | 已选 {selected} 个',
	},
	sortFieldName: {
		en: 'Name',
		zh: '名称',
	},
	sortFieldOwner: {
		en: 'Owner',
		zh: '所有者',
	},
	sortFieldUpdated: {
		en: 'Updated',
		zh: '更新时间',
	},
	sortFieldApplied: {
		en: 'Applied Status',
		zh: '应用状态',
	},
	sortDirectionAsc: {
		en: 'Ascending',
		zh: '升序',
	},
	sortDirectionDesc: {
		en: 'Descending',
		zh: '降序',
	},
	filterAndSortTitle: {
		en: 'Filter and sort modules. Current: {field}, {direction}.',
		zh: '筛选并排序模块。当前：{field}，{direction}。',
	},
	sortOldestFirst: {
		en: 'Sort by oldest first',
		zh: '按最早更新时间优先排序',
	},
	sortNewestFirst: {
		en: 'Sort by newest first',
		zh: '按最近更新时间优先排序',
	},
	sortUnappliedFirst: {
		en: 'Sort by unapplied modules first',
		zh: '按未应用模块优先排序',
	},
	sortAppliedFirst: {
		en: 'Sort by applied modules first',
		zh: '按已应用模块优先排序',
	},
	sortOwnerAsc: {
		en: 'Sort owner A to Z',
		zh: '按所有者从 A 到 Z 排序',
	},
	sortOwnerDesc: {
		en: 'Sort owner Z to A',
		zh: '按所有者从 Z 到 A 排序',
	},
	sortNameAsc: {
		en: 'Sort name A to Z',
		zh: '按名称从 A 到 Z 排序',
	},
	sortNameDesc: {
		en: 'Sort name Z to A',
		zh: '按名称从 Z 到 A 排序',
	},
	emptySignInTitle: {
		en: 'Sign in to GitHub',
		zh: '登录 GitHub',
	},
	connectGitHub: {
		en: 'Connect GitHub',
		zh: '连接 GitHub',
	},
	unableToLoadModulesTitle: {
		en: 'Unable to load modules',
		zh: '无法加载模块',
	},
	noModulesFoundTitle: {
		en: 'No modules found',
		zh: '未找到模块',
	},
	refreshingCatalogTitle: {
		en: 'Refreshing module catalog',
		zh: '正在刷新模块目录',
	},
	catalogRefreshFailedTitle: {
		en: 'Catalog refresh failed',
		zh: '模块目录刷新失败',
	},
	offlineModeTitle: {
		en: 'Cached list',
		zh: '缓存列表',
	},
	offlineModeBody: {
		en: 'Showing cached modules. Use Refresh to update the catalog.',
		zh: '当前显示缓存模块。点击刷新即可更新目录。',
	},
	lastRefreshDescription: {
		en: 'Updated {relative}',
		zh: '更新于{relative}',
	},
	lastRefreshNever: {
		en: 'Never refreshed',
		zh: '从未刷新',
	},
	hiddenModulesTitle: {
		en: '{count} more module(s) hidden',
		zh: '还有 {count} 个模块未显示',
	},
	hiddenModulesBody: {
		en: 'Use search to narrow the list, or load more below.',
		zh: '可通过搜索缩小列表范围，或在下方继续加载更多。',
	},
	showMore: {
		en: 'Show {count} more',
		zh: '再显示 {count} 个',
	},
	filterNoMatchesTitle: {
		en: 'No modules match this filter',
		zh: '没有模块匹配当前筛选条件',
	},
	filterNoMatchesBody: {
		en: 'Try another keyword or clear the current filter to see the full catalog again.',
		zh: '请尝试其他关键词，或清除当前筛选条件以重新查看完整目录。',
	},
	clearFilter: {
		en: 'Clear Filter',
		zh: '清除筛选',
	},
	recordedForWorkspace: {
		en: 'Already recorded for {workspace}.',
		zh: '已记录到 {workspace}。',
	},
	recordedUnderRoot: {
		en: 'Already recorded for {workspace} under {root}/.',
		zh: '已记录到 {workspace} 的 {root}/ 下。',
	},
	staleDirectoryMissing: {
		en: 'stale: directory missing',
		zh: '已失效：目录缺失',
	},
	toggleReadmePreviewAria: {
		en: 'Toggle README preview for {name}',
		zh: '切换 {name} 的 README 预览',
	},
	appliedBadge: {
		en: 'Applied',
		zh: '已应用',
	},
	selectModule: {
		en: 'Select module',
		zh: '选择模块',
	},
	selectNamedModule: {
		en: 'Select {name}',
		zh: '选择 {name}',
	},
	openReadme: {
		en: 'Open README',
		zh: '打开 README',
	},
	starRepository: {
		en: 'Star repository',
		zh: 'Star 仓库',
	},
	unstarRepository: {
		en: 'Unstar repository',
		zh: '取消 Star',
	},
	loadingStarStatus: {
		en: 'Loading star status',
		zh: '正在加载 Star 状态',
	},
	unstarAction: {
		en: 'Unstar',
		zh: '取消 Star',
	},
	unstarConfirmation: {
		en: 'Remove your star from {name}?',
		zh: '确认取消对 {name} 的 Star 吗？',
	},
	starUpdateFailed: {
		en: 'Failed to update the star for {name}: {message}',
		zh: '更新 {name} 的 Star 状态失败：{message}',
	},
	branchBadge: {
		en: 'Branch: {branch}',
		zh: '分支：{branch}',
	},
	readmePreviewTitle: {
		en: 'README Preview',
		zh: 'README 预览',
	},
} as const;

export type ModuleManagerMessageKey = keyof typeof messages;

export function t(key: ModuleManagerMessageKey, params?: Record<string, string | number | boolean>): string {
	return localizeBundle(messages, key, params);
}

export function getHtmlLang(): string {
	return getHtmlLangValue();
}

export function getApplyMethodLabel(method: ModuleApplyMethod): string {
	return method === 'copy' ? t('applyMethodCopyLabel') : t('applyMethodSubmoduleLabel');
}

export function getVisibilityLabel(visibility: 'private' | 'public'): string {
	return visibility === 'private' ? t('privateVisibility') : t('publicVisibility');
}

export function getVisibilityTag(visibility: 'private' | 'public'): string {
	return visibility === 'private' ? t('privateVisibilityTag') : t('publicVisibilityTag');
}