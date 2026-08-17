import * as crypto from 'crypto';
import { ModuleListScope, ModuleSortDirection, ModuleSortField, ModuleSortState } from './types';
import { formatRelativeDate, getApplyMethodLabel, getHtmlLang, getVisibilityLabel, t } from '../i18n';
import { truncate } from './utils';
import { ViewState } from './moduleTreeTypes';
import { sortModules } from './sort';
import { getVisibleModuleTopics } from './topics';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry, ModuleApplyMethod } from './types';

export interface LocalWorkspaceRenderState {
	signedIn: boolean;
	canInitializeWorkspace: boolean;
	managedModules: LocalManagedModuleEntry[];
	unmanagedFolders: LocalUnmanagedFolderEntry[];
	workspaceLabel?: string;
	moduleRoot?: string;
	gitAvailable: boolean;
	/** 工作区根目录检测到的 LabVIEW 版本显示名 */
	workspaceLabviewVersion?: string;
}

export interface ModuleSidebarRenderState extends LocalWorkspaceRenderState {
	filterQuery: string;
	includeAppliedModules: boolean;
	scope: ModuleListScope;
	modules: CsmModuleEntry[];
	state: ViewState;
	message: string;
	signedInAccountLabel?: string;
	selectedModuleKeys: ReadonlySet<string>;
	appliedModuleKeys: ReadonlySet<string>;
	introTipVisible: boolean;
	offlineMode: boolean;
	sortState: ModuleSortState;
	staleModuleKeys: ReadonlySet<string>;
	renderLimit: number;
	initialRenderLimit: number;
	webviewCspSource?: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/`/g, '&#96;')
		.replace(/\//g, '&#47;')
		.replace(/\\/g, '&#92;')
		.replace(/[\u0000-\u001F\u007F]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function createNonce(): string {
	return crypto.randomBytes(16).toString('base64');
}

type WorkspaceContent = {
	managed: LocalManagedModuleEntry[];
	unmanaged: LocalUnmanagedFolderEntry[];
	totalCount: number;
	filteredCount: number;
};

type CatalogContent = {
	modules: CsmModuleEntry[];
	totalCount: number;
	filteredCount: number;
	publicCount: number;
	privateCount: number;
};

type ToolbarMetaCounts = {
	appliedCount: number;
	totalCount: number;
	filteredCount: number;
	workspaceCount: number;
	catalogCount: number;
	publicCount: number;
	privateCount: number;
};

type ToolbarVisibilityFormatters = {
	shown: (filtered: number, total: number) => string;
	workspace: (total: number) => string;
	catalog: (total: number) => string;
	mixed: (workspace: number, catalog: number) => string;
	visibilityBreakdown: (publicCount: number, privateCount: number) => string;
};

function scopeIncludesWorkspace(scope: ModuleListScope): boolean {
	return scope !== 'catalog';
}

function scopeIncludesCatalog(scope: ModuleListScope): boolean {
	return scope !== 'workspace';
}

function getNormalizedFilterQuery(state: ModuleSidebarRenderState): string {
	return state.filterQuery.trim().toLowerCase();
}

function matchesFilterQuery(searchText: string, query: string): boolean {
	return query.length === 0 || searchText.includes(query);
}

function buildVisibilityBreakdownText(publicCount: number, privateCount: number, publicLabel: string, privateLabel: string): string {
	const segments: string[] = [];
	if (publicCount > 0 || privateCount === 0) {
		segments.push(`${publicCount} ${publicLabel}`);
	}
	if (privateCount > 0) {
		segments.push(`${privateCount} ${privateLabel}`);
	}
	return segments.join(' | ');
}

function buildToolbarVisibilityText(
	scope: ModuleListScope,
	counts: ToolbarMetaCounts,
	signedIn: boolean,
	formatters: ToolbarVisibilityFormatters,
): string {
	if (counts.filteredCount !== counts.totalCount) {
		return formatters.shown(counts.filteredCount, counts.totalCount);
	}

	switch (scope) {
		case 'workspace':
			return formatters.workspace(counts.totalCount);
		case 'catalog':
			return signedIn
				? formatters.visibilityBreakdown(counts.publicCount, counts.privateCount)
				: formatters.catalog(counts.totalCount);
		case 'all':
		default:
			if (counts.workspaceCount > 0 && counts.catalogCount > 0) {
				return formatters.mixed(counts.workspaceCount, counts.catalogCount);
			}
			if (counts.workspaceCount > 0) {
				return formatters.workspace(counts.workspaceCount);
			}
			return signedIn
				? formatters.visibilityBreakdown(counts.publicCount, counts.privateCount)
				: formatters.catalog(counts.catalogCount);
	}
}

function buildToolbarMetaText(
	scope: ModuleListScope,
	counts: ToolbarMetaCounts,
	selectedCount: number,
	signedIn: boolean,
	getVisibilityText: (scope: ModuleListScope, counts: ToolbarMetaCounts, signedIn: boolean) => string,
	formatMeta: (appliedCount: number, visibilityText: string, selectedCount: number) => string,
): string {
	return formatMeta(
		counts.appliedCount,
		getVisibilityText(scope, counts, signedIn),
		selectedCount,
	);
}

function getToolbarVisibilityFormatters(): ToolbarVisibilityFormatters {
	return {
		shown: (filtered, total) => t('toolbarMetaShown', { filtered, total }),
		workspace: (total) => t('toolbarMetaWorkspace', { total }),
		catalog: (total) => t('toolbarMetaCatalog', { total }),
		mixed: (workspace, catalog) => t('toolbarMetaMixed', { workspace, catalog }),
		visibilityBreakdown: (publicCount, privateCount) => getVisibilityBreakdownText(publicCount, privateCount),
	};
}

function getToolbarVisibilityText(state: ModuleSidebarRenderState, counts: ToolbarMetaCounts): string {
	return buildToolbarVisibilityText(state.scope, counts, state.signedIn, getToolbarVisibilityFormatters());
}

function getToolbarMetaText(state: ModuleSidebarRenderState, counts: ToolbarMetaCounts, selectedCount: number): string {
	const formatters = getToolbarVisibilityFormatters();
	return buildToolbarMetaText(
		state.scope,
		counts,
		selectedCount,
		state.signedIn,
		(scope, nextCounts, signedIn) => buildToolbarVisibilityText(scope, nextCounts, signedIn, formatters),
		(appliedCount, visibilityText, nextSelectedCount) => t('toolbarMeta', {
			applied: appliedCount,
			visibility: visibilityText,
			selected: nextSelectedCount,
		}),
	);
}

function getVisibilityBreakdownText(publicCount: number, privateCount: number): string {
	return buildVisibilityBreakdownText(publicCount, privateCount, t('publicVisibility'), t('privateVisibility'));
}

function getModuleKey(entry: CsmModuleEntry): string {
	return `${entry.owner}/${entry.name}`;
}

function getCatalogScopeSummaryText(state: ModuleSidebarRenderState): string | undefined {
	if (!scopeIncludesCatalog(state.scope)) {
		return undefined;
	}
	if (state.modules.length === 0) {
		return undefined;
	}
	if (!state.signedIn) {
		return t('catalogScopePublicLoggedOut', { count: state.modules.length });
	}
	return undefined;
}

function shouldRenderLocalWorkspaceSection(state: LocalWorkspaceRenderState): boolean {
	return Boolean(state.moduleRoot) || state.managedModules.length > 0 || state.unmanagedFolders.length > 0;
}

function getLocalManagedSearchText(entry: LocalManagedModuleEntry): string {
	return [
		entry.name,
		entry.owner,
		entry.description,
		entry.path,
		entry.source,
		entry.branch,
		entry.visibility,
		getApplyMethodLabel(entry.method),
		entry.labviewVersion ?? '',
		...getVisibleModuleTopics(entry.topics),
	].join(' ').toLowerCase();
}

function getLocalUnmanagedSearchText(entry: LocalUnmanagedFolderEntry): string {
	return [
		entry.name,
		entry.path,
		entry.labviewVersion ?? '',
		t('unmanagedBadge'),
		t('localUnmanagedSummary'),
	].join(' ').toLowerCase();
}

function hasAvailableOnlineRepositories(state: LocalWorkspaceRenderState): boolean {
	const candidate = state as LocalWorkspaceRenderState & { modules?: CsmModuleEntry[] };
	return Array.isArray(candidate.modules) && candidate.modules.length > 0;
}

function getWorkspaceContent(state: ModuleSidebarRenderState): WorkspaceContent {
	if (!scopeIncludesWorkspace(state.scope)) {
		return { managed: [], unmanaged: [], totalCount: 0, filteredCount: 0 };
	}

	const query = getNormalizedFilterQuery(state);
	const managed = state.managedModules.filter((entry) => matchesFilterQuery(getLocalManagedSearchText(entry), query));
	const unmanaged = state.unmanagedFolders.filter((entry) => matchesFilterQuery(getLocalUnmanagedSearchText(entry), query));
	return {
		managed,
		unmanaged,
		totalCount: state.managedModules.length + state.unmanagedFolders.length,
		filteredCount: managed.length + unmanaged.length,
	};
}

function getCatalogContent(state: ModuleSidebarRenderState): CatalogContent {
	if (!scopeIncludesCatalog(state.scope)) {
		return { modules: [], totalCount: 0, filteredCount: 0, publicCount: 0, privateCount: 0 };
	}

	const baseModules = getBaseVisibleModules(state);
	const query = getNormalizedFilterQuery(state);
	const filteredModules = query.length === 0
		? getSortedModules(baseModules, state)
		: getSortedModules(
			baseModules.filter((entry) => {
				const moduleKey = getModuleKey(entry);
				const localVersion = getLocalLabviewVersion(moduleKey, state);
				return matchesFilterQuery(getSearchText(entry, localVersion), query);
			}),
			state,
		);
	const publicCount = baseModules.filter((entry) => entry.visibility === 'public').length;
	return {
		modules: filteredModules,
		totalCount: baseModules.length,
		filteredCount: filteredModules.length,
		publicCount,
		privateCount: baseModules.length - publicCount,
	};
}

function getToolbarMetaCounts(state: ModuleSidebarRenderState, workspaceContent: WorkspaceContent, catalogContent: CatalogContent): ToolbarMetaCounts {
	return {
		appliedCount: state.managedModules.length,
		totalCount: workspaceContent.totalCount + catalogContent.totalCount,
		filteredCount: workspaceContent.filteredCount + catalogContent.filteredCount,
		workspaceCount: workspaceContent.totalCount,
		catalogCount: catalogContent.totalCount,
		publicCount: catalogContent.publicCount,
		privateCount: catalogContent.privateCount,
	};
}

function renderLocalWorkspaceSection(state: LocalWorkspaceRenderState): string {
	if (!shouldRenderLocalWorkspaceSection(state)) {
		return '';
	}

	const managedCount = state.managedModules.length;
	const unmanagedCount = state.unmanagedFolders.length;
	const summaryText = escapeHtml(t('workspaceModulesSummary', { managed: managedCount, unmanaged: unmanagedCount }));
	const sectionMeta = state.moduleRoot
		? `${summaryText} | ${escapeHtml(t('rootLabel'))}: ${escapeHtml(state.moduleRoot)}/`
		: summaryText;
	const managedBlock = managedCount > 0
		? `<section class="list local-list">${state.managedModules.map((entry) => renderLocalManagedCard(entry, state)).join('')}</section>`
		: '';
	const unmanagedBlock = unmanagedCount > 0
		? `<div class="section-group"><div class="section-subtitle">${escapeHtml(t('workspaceUnmanagedSectionTitle'))}</div><section class="list local-list">${state.unmanagedFolders.map((entry) => renderLocalUnmanagedCard(entry, state)).join('')}</section></div>`
		: '';
	const emptyState = managedCount === 0 && unmanagedCount === 0
		? renderEmptyState(
			t('workspaceModulesEmptyTitle', { root: state.moduleRoot ?? '' }),
			t('workspaceModulesEmptyBody'),
		)
		: '';

	return `<section class="local-section" data-role="local-section">${sectionMeta ? `<div class="section-header"><div class="section-meta">${sectionMeta}</div></div>` : ''}${emptyState}${managedBlock}${unmanagedBlock}</section>`;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
	return classNames.filter((className): className is string => Boolean(className)).join(' ');
}

function renderBadge(label: string, variant?: string, title?: string): string {
	const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
	return `<span class="badge${variant ? ` ${escapeHtml(variant)}` : ''}"${titleAttribute}>${escapeHtml(label)}</span>`;
}

function renderActionToolbar(actions: string[]): string {
	return actions.length > 0 ? `<div class="action-toolbar">${actions.join('')}</div>` : '';
}

function renderModuleHeaderTools(sections: string[]): string {
	return sections.length > 0 ? `<div class="module-header-tools">${sections.join('')}</div>` : '';
}

type ModuleCardShellOptions = {
	articleClasses?: string[];
	dataRole: string;
	articleAttributes?: string;
	title: string;
	titleDisplay?: string;
	titleBadges?: string[];
	owner: string;
	mainClasses?: string[];
	mainAttributes?: string;
	headerToolsHtml?: string;
	summary: string;
	summaryClasses?: string[];
	summaryAttributes?: string;
	footerHtml?: string;
	footerClasses?: string[];
	footerAttributes?: string;
	bodyExtrasHtml?: string;
	metaBadges?: string[];
};

function renderModuleCardShell(options: ModuleCardShellOptions): string {
	const articleAttributes = options.articleAttributes ? ` ${options.articleAttributes}` : '';
	const mainAttributes = options.mainAttributes ? ` ${options.mainAttributes}` : '';
	const summaryAttributes = options.summaryAttributes ? ` ${options.summaryAttributes}` : '';
	const footerAttributes = options.footerAttributes ? ` ${options.footerAttributes}` : '';
	const titleBadges = options.titleBadges?.join('') ?? '';
	const footer = options.footerHtml
		? `<div class="${joinClassNames('card-footer', ...(options.footerClasses ?? []))}"${footerAttributes}>${options.footerHtml}</div>`
		: '';
	const metaRow = options.metaBadges && options.metaBadges.length > 0
		? `<div class="meta-row">${options.metaBadges.join('')}</div>`
		: '';
	// 摘要为空时不渲染 summary 区域，避免出现带 margin 的空 div
	const summary = options.summary
		? `<div class="${joinClassNames('summary', ...(options.summaryClasses ?? []))}"${summaryAttributes}>${escapeHtml(options.summary)}</div>`
		: '';

	return `<article class="${joinClassNames('module-card', ...(options.articleClasses ?? []))}" data-role="${escapeHtml(options.dataRole)}"${articleAttributes}><div class="module-header"><div class="${joinClassNames('module-main', ...(options.mainClasses ?? []))}"${mainAttributes}><div class="title-row"><span class="module-name" title="${escapeHtml(options.title)}">${escapeHtml(options.titleDisplay ?? options.title)}</span>${titleBadges}</div><div class="module-owner">${escapeHtml(options.owner)}</div></div>${options.headerToolsHtml ?? ''}</div>${summary}${footer}${options.bodyExtrasHtml ?? ''}${metaRow}</article>`;
}

function renderLocalManagedCard(entry: LocalManagedModuleEntry, state: LocalWorkspaceRenderState): string {
	// 本地模块（method: local）：无 GitHub 源，使用独立的卡片渲染
	if (entry.kind === 'local') {
		return renderLocalLocalCard(entry, state);
	}
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const topicBadges = topics.map((topic) => renderBadge(topic));
	const locked = entry.locked !== false;
	// 描述为空时摘要留空（不显示“已从 {source} 建立跟踪”占位），路径信息由卡片底部展示
	const summary = entry.description.trim();
	const searchText = escapeHtml(getLocalManagedSearchText(entry));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'workspaceCard',
		workspaceCardKind: 'managed',
		moduleApplied: true,
		localItemId: entry.id,
		localItemPath: entry.path,
		moduleKey: entry.moduleKey,
		localLocked: locked,
		gitAvailable: state.gitAvailable,
		preventDefaultContextMenuItems: true,
	}));
	const actionButtons = renderActionToolbar([
		renderIconActionButton({
			action: 'openLocalFolder',
			localItemId: entry.id,
			title: t('openFolder'),
			icon: 'folder',
		}),
		renderIconActionButton({
			action: 'openLocalReadme',
			localItemId: entry.id,
			title: t('openReadme'),
			icon: 'readme',
		}),
		...(entry.repoUrl
			? [renderIconActionButton({
				action: 'openRepository',
				localItemId: entry.id,
				title: t('openOnGitHub'),
				icon: 'external',
			})]
			: []),
		renderIconActionButton({
			action: 'updateLocalModule',
			localItemId: entry.id,
			title: t('updateAction'),
			icon: 'update',
		}),
		renderIconActionButton({
			action: 'toggleLocalModuleLock',
			localItemId: entry.id,
			title: locked ? t('unlockLocalFiles') : t('lockLocalFiles'),
			icon: locked ? 'lock' : 'unlock',
		}),
	]);
	const metaBadges = [
		...(entry.labviewVersion ? [renderBadge(entry.labviewVersion, 'lv-version', t('badgeTooltipLvVersion'))] : []),
		renderBadge(t('managedBadge'), 'applied', t('badgeTooltipManaged')),
		renderBadge(
			locked ? t('lockedBadge') : t('unlockedBadge'),
			undefined,
			locked ? t('badgeTooltipLocked') : t('badgeTooltipUnlocked'),
		),
		renderBadge(getApplyMethodLabel(entry.method), entry.method, getApplyMethodTooltip(entry.method)),
		...(entry.stale ? [renderBadge(t('staleDirectoryMissing'), 'stale', t('badgeTooltipStale'))] : []),
		renderBadge(
			getVisibilityLabel(entry.visibility),
			entry.visibility === 'private' ? 'private' : undefined,
			entry.visibility === 'private' ? t('badgeTooltipPrivate') : undefined,
		),
		// 版本徽章 hover 展示 commit 信息（issue #93，数据来自本地缓存）
		renderBadge(getLocalManagedVersionLabel(entry), 'module-version', getLocalManagedVersionTooltip(entry)),
		// 远端分支有新提交、本地尚未同步（issue #90，手动刷新在线目录时检测）
		...(entry.remoteAhead ? [renderBadge(t('remoteHasNewCommits'), 'remote-update', t('badgeTooltipRemoteAhead'))] : []),
		// release 引入方式不依赖分支；branch 版本来源的版本标签已包含分支名，均不重复展示“分支：xxx”徽章
		...(entry.method === 'release' || entry.versionKind === 'branch'
			? []
			: [renderBadge(t('branchBadge', { branch: entry.branch }), undefined, t('badgeTooltipBranch'))]),
		...topicBadges,
	];
	return renderModuleCardShell({
		articleClasses: ['local-module-card', 'managed'],
		dataRole: 'local-module-card',
		articleAttributes: `data-search-text="${searchText}" data-card-scope="workspace" data-vscode-context="${vscodeContext}"`,
		title: entry.name,
		titleDisplay: truncate(entry.name, 44),
		owner: `@${entry.owner}`,
		headerToolsHtml: renderModuleHeaderTools([actionButtons]),
		summary: truncate(summary, 132),
		footerHtml: `<div class="card-footer-note">${escapeHtml(t('localFolderPathLabel', { path: entry.path }))}</div>`,
		metaBadges,
	});
}

/**
 * 渲染本地模块卡片（method: local，无 GitHub 源）。
 * 操作：打开目录 / 锁定或解锁 / 创建 GitHub 仓库；不提供更新、切换方式与 GitHub 打开。
 */
function renderLocalLocalCard(entry: LocalManagedModuleEntry, state: LocalWorkspaceRenderState): string {
	const locked = entry.locked !== false;
	const searchText = escapeHtml(getLocalManagedSearchText(entry));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'workspaceCard',
		workspaceCardKind: 'local',
		localItemId: entry.id,
		localItemPath: entry.path,
		localLocked: locked,
		signedIn: state.signedIn,
		preventDefaultContextMenuItems: true,
	}));
	const actionButtons = renderActionToolbar([
		renderIconActionButton({
			action: 'openLocalFolder',
			localItemId: entry.id,
			title: t('openFolder'),
			icon: 'folder',
		}),
		...(state.signedIn
			? [renderIconActionButton({
				action: 'createLocalRepository',
				localItemId: entry.id,
				title: t('createGithubRepository'),
				icon: 'plus',
			})]
			: []),
		renderIconActionButton({
			action: 'toggleLocalModuleLock',
			localItemId: entry.id,
			title: locked ? t('unlockLocalFiles') : t('lockLocalFiles'),
			icon: locked ? 'lock' : 'unlock',
		}),
	]);
	const metaBadges = [
		...(entry.labviewVersion ? [renderBadge(entry.labviewVersion, 'lv-version', t('badgeTooltipLvVersion'))] : []),
		renderBadge(t('localBadge'), 'local', t('badgeTooltipLocal')),
		renderBadge(
			locked ? t('lockedBadge') : t('unlockedBadge'),
			undefined,
			locked ? t('badgeTooltipLocked') : t('badgeTooltipUnlocked'),
		),
		renderBadge(getApplyMethodLabel(entry.method), entry.method, getApplyMethodTooltip(entry.method)),
		...(entry.stale ? [renderBadge(t('staleDirectoryMissing'), 'stale', t('badgeTooltipStale'))] : []),
	];
	return renderModuleCardShell({
		articleClasses: ['local-module-card', 'managed'],
		dataRole: 'local-module-card',
		articleAttributes: `data-search-text="${searchText}" data-card-scope="workspace" data-vscode-context="${vscodeContext}"`,
		title: entry.name,
		titleDisplay: truncate(entry.name, 44),
		owner: entry.path,
		headerToolsHtml: renderModuleHeaderTools([actionButtons]),
		summary: t('localModuleSummary'),
		footerHtml: `<div class="card-footer-note">${escapeHtml(t('localFolderPathLabel', { path: entry.path }))}</div>`,
		metaBadges,
	});
}

function renderLocalUnmanagedCard(entry: LocalUnmanagedFolderEntry, state: LocalWorkspaceRenderState): string {
	const canLinkRepository = hasAvailableOnlineRepositories(state);
	const actions = renderActionToolbar([
		renderIconActionButton({
			action: 'linkLocalRepository',
			localItemId: entry.id,
			title: t('linkGithubRepository'),
			icon: 'link',
		}),
		...(state.signedIn
			? [renderIconActionButton({
				action: 'createLocalRepository',
				localItemId: entry.id,
				title: t('createGithubRepository'),
				icon: 'plus',
			})]
			: []),
		renderIconActionButton({
			action: 'recordLocalModule',
			localItemId: entry.id,
			title: t('recordLocalModule'),
			icon: 'bookmark',
		}),
	]);
	const openFolderButton = renderActionToolbar([
		renderIconActionButton({
			action: 'openLocalFolder',
			localItemId: entry.id,
			title: t('openFolder'),
			icon: 'folder',
		}),
	]);
	const hint = [
		!state.signedIn ? `<div class="local-card-hint">${escapeHtml(t('signInToCreateRepositoryHint'))}</div>` : '',
		!canLinkRepository ? `<div class="local-card-hint">${escapeHtml(t('refreshCatalogToLinkRepositoryHint'))}</div>` : '',
	].filter(Boolean).join('');
	const searchText = escapeHtml(getLocalUnmanagedSearchText(entry));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'workspaceCard',
		workspaceCardKind: 'unmanaged',
		localItemId: entry.id,
		localItemPath: entry.path,
		signedIn: state.signedIn,
		canLinkRepository,
		preventDefaultContextMenuItems: true,
	}));
	return renderModuleCardShell({
		articleClasses: ['local-module-card', 'unmanaged'],
		dataRole: 'local-module-card',
		articleAttributes: `data-search-text="${searchText}" data-card-scope="workspace" data-vscode-context="${vscodeContext}"`,
		title: entry.name,
		titleDisplay: truncate(entry.name, 44),
		owner: entry.path,
		headerToolsHtml: renderModuleHeaderTools([openFolderButton, actions]),
		summary: t('localUnmanagedSummary'),
		bodyExtrasHtml: hint,
		metaBadges: [
			...(entry.labviewVersion ? [renderBadge(entry.labviewVersion, 'lv-version', t('badgeTooltipLvVersion'))] : []),
			renderBadge(t('unmanagedBadge'), undefined, t('badgeTooltipUnmanaged')),
		],
	});
}

type IconName = 'bookmark' | 'close' | 'external' | 'filter' | 'folder' | 'link' | 'plus' | 'readme' | 'search' | 'update' | 'remove' | 'switch' | 'lock' | 'unlock';

/**
 * 按钮图标统一采用 VS Code 标准 codicon 图形（issue #92）：
 * 实心风格在小尺寸下辨识度更高，且与 VS Code 内置图标语义一致。
 * 路径数据来自 @vscode/codicons（仅开发期提取，运行时零依赖）。
 */
const ICON_PATHS: Record<IconName, string> = {
	bookmark: '<path d="M3.77942 13.9187C3.44716 14.1405 3.00177 13.9024 3.00177 13.5029V4.01167C3.00177 2.9085 3.89502 2.01365 4.99819 2.01168L10.9982 2.00092C12.1028 1.99895 12.9998 2.89277 13.0018 3.99734V13.5029C13.0018 13.9024 12.5564 14.1405 12.2241 13.9187L8.00177 11.0994L3.77942 13.9187ZM12.0018 4.00092L11.9948 3.88252C11.9362 3.38529 11.5128 3.00001 11 3.00092L4.99998 3.01168C4.44839 3.01266 4.00177 3.46009 4.00177 4.01167V12.5678L7.72412 10.0824C7.89221 9.97018 8.11133 9.97018 8.27942 10.0824L12.0018 12.5678V4.00092Z"/>',
	close: '<path d="M8.70701 8.00001L12.353 4.35401C12.548 4.15901 12.548 3.84201 12.353 3.64701C12.158 3.45201 11.841 3.45201 11.646 3.64701L8.00001 7.29301L4.35401 3.64701C4.15901 3.45201 3.84201 3.45201 3.64701 3.64701C3.45201 3.84201 3.45201 4.15901 3.64701 4.35401L7.29301 8.00001L3.64701 11.646C3.45201 11.841 3.45201 12.158 3.64701 12.353C3.74501 12.451 3.87301 12.499 4.00101 12.499C4.12901 12.499 4.25701 12.45 4.35501 12.353L8.00101 8.70701L11.647 12.353C11.745 12.451 11.873 12.499 12.001 12.499C12.129 12.499 12.257 12.45 12.355 12.353C12.55 12.158 12.55 11.841 12.355 11.646L8.70901 8.00001H8.70701Z"/>',
	// 在 GitHub 中打开（方框 + 右上箭头）
	external: '<path d="M15 9.5V12.5C15 13.879 13.879 15 12.5 15H3.5C2.121 15 1 13.879 1 12.5V3.5C1 2.121 2.121 1 3.5 1H6.5C6.776 1 7 1.224 7 1.5C7 1.776 6.776 2 6.5 2H3.5C2.673 2 2 2.673 2 3.5V12.5C2 13.327 2.673 14 3.5 14H12.5C13.327 14 14 13.327 14 12.5V9.5C14 9.224 14.224 9 14.5 9C14.776 9 15 9.224 15 9.5ZM14.5 1H9.5C9.224 1 9 1.224 9 1.5C9 1.776 9.224 2 9.5 2H13.293L9.147 6.146C8.952 6.341 8.952 6.658 9.147 6.853C9.245 6.951 9.373 6.999 9.501 6.999C9.629 6.999 9.757 6.95 9.855 6.853L14.001 2.707V6.5C14.001 6.776 14.225 7 14.501 7C14.777 7 15.001 6.776 15.001 6.5V1.5C15.001 1.224 14.777 1 14.501 1H14.5Z"/>',
	filter: '<path d="M9.5 14H6.5C6.224 14 6 13.776 6 13.5V9.329C6 8.928 5.844 8.552 5.561 8.268L1.561 4.268C1.205 3.911 1 3.418 1 2.914C1 1.858 1.858 1 2.914 1H13.086C14.142 1 15 1.858 15 2.914C15 3.417 14.796 3.911 14.439 4.267L10.439 8.267C10.156 8.551 10 8.927 10 9.328V13.499C10 13.775 9.776 13.999 9.5 13.999V14ZM7 13H9V9.329C9 8.661 9.26 8.033 9.732 7.561L13.732 3.561C13.902 3.391 14 3.155 14 2.915C14 2.411 13.59 2.001 13.086 2.001H2.914C2.41 2.001 2 2.411 2 2.915C2 3.155 2.098 3.391 2.268 3.562L6.268 7.562C6.741 8.034 7 8.662 7 9.33V13.001V13Z"/>',
	// 打开本地目录（打开的文件夹）
	folder: '<path d="M2 4.5V9.10022L2.92389 7.5C3.45979 6.5718 4.45017 6 5.52196 6L11.9146 6C11.7087 5.4174 11.1531 5 10.5 5H7C6.86739 5 6.74021 4.94732 6.64645 4.85355L4.93934 3.14645C4.84557 3.05268 4.71839 3 4.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM7.06895 13.9953C7.04641 13.9984 7.02339 14 7 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5C1 3.11929 2.11929 2 3.5 2H4.58579C4.98361 2 5.36514 2.15804 5.64645 2.43934L7.20711 4H10.5C11.724 4 12.7426 4.87965 12.958 6.04127C14.605 6.34148 15.5443 8.22106 14.6616 9.75L13.0766 12.4953C12.5407 13.4235 11.5503 13.9953 10.4785 13.9953H7.06895ZM5.52196 7C4.80743 7 4.14718 7.3812 3.78991 8L2.20492 10.7453C1.62757 11.7453 2.34926 12.9953 3.50396 12.9953L10.4785 12.9953C11.193 12.9953 11.8533 12.6141 12.2105 11.9953L13.7955 9.25C14.3729 8.25 13.6512 7 12.4965 7L5.52196 7Z"/>',
	link: '<path d="M9.49999 4H10.5C12.433 4 14 5.567 14 7.5C14 9.36856 12.5357 10.8951 10.6941 10.9948L10.5023 11L9.5023 11.0046C9.22616 11.0059 9.00127 10.783 8.99999 10.5069C8.99888 10.2614 9.17481 10.0565 9.40787 10.0131L9.4977 10.0046L10.5 10C11.8807 10 13 8.88071 13 7.5C13 6.17452 11.9685 5.08996 10.6644 5.00532L10.5 5H9.49999C9.22386 5 8.99999 4.77614 8.99999 4.5C8.99999 4.25454 9.17687 4.05039 9.41012 4.00806L9.49999 4H10.5H9.49999ZM5.5 4H6.5C6.77614 4 7 4.22386 7 4.5C7 4.74546 6.82312 4.94961 6.58988 4.99194L6.5 5H5.5C4.11929 5 3 6.11929 3 7.5C3 8.82548 4.03154 9.91004 5.33562 9.99468L5.5 10H6.5C6.77614 10 7 10.2239 7 10.5C7 10.7455 6.82312 10.9496 6.58988 10.9919L6.5 11H5.5C3.567 11 2 9.433 2 7.5C2 5.63144 3.46428 4.10487 5.30796 4.00518L5.5 4H6.5H5.5ZM5.50023 7L10.5002 7.0023C10.7764 7.00242 11.0001 7.22638 11 7.50252C10.9999 7.74798 10.8229 7.95205 10.5897 7.99428L10.4998 8.0023L5.49977 8C5.22363 7.99987 4.99987 7.77591 5 7.49977C5.00011 7.25431 5.17708 7.05024 5.41035 7.00801L5.50023 7Z"/>',
	// 创建 / 发布 GitHub 仓库（向上箭头进入仓库）
	plus: '<path d="M4.85 4.85C4.755 4.95 4.627 5 4.5 5C4.372 5 4.245 4.95 4.15 4.85C4.05 4.755 4 4.627 4 4.5C4 4.373 4.05 4.245 4.15 4.15L7.15 1.15C7.245 1.05 7.372 1 7.5 1C7.628 1 7.755 1.05 7.85 1.15L10.85 4.15C10.95 4.245 11 4.372 11 4.5C11 4.628 10.95 4.755 10.85 4.85C10.755 4.95 10.627 5 10.5 5C10.373 5 10.245 4.95 10.15 4.85L8 2.71V9.5C8 9.78 7.78 10 7.5 10C7.22 10 7 9.78 7 9.5V2.71L4.85 4.85Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M9.95 13H12.5C12.78 13 13 13.22 13 13.5C13 13.78 12.78 14 12.5 14H9.95C9.72 15.14 8.71 16 7.5 16C6.29 16 5.28 15.14 5.05 14H2.5C2.22 14 2 13.78 2 13.5C2 13.22 2.22 13 2.5 13H5.05C5.28 11.86 6.29 11 7.5 11C8.71 11 9.72 11.86 9.95 13ZM6.09 14C6.29 14.58 6.85 15 7.5 15C8.15 15 8.71 14.58 8.91 14C8.97 13.84 9 13.68 9 13.5C9 13.32 8.97 13.16 8.91 13C8.71 12.42 8.15 12 7.5 12C6.85 12 6.29 12.42 6.09 13C6.03 13.16 6 13.32 6 13.5C6 13.68 6.03 13.84 6.09 14Z"/>',
	// 打开 README（书本）
	readme: '<path d="M2.5 2C1.67157 2 1 2.67157 1 3.5V12.5C1 13.3284 1.67157 14 2.5 14H6C6.8178 14 7.54389 13.6073 8 13.0002C8.45612 13.6073 9.1822 14 10 14H13.5C14.3284 14 15 13.3284 15 12.5V3.5C15 2.67157 14.3284 2 13.5 2H10C9.1822 2 8.45612 2.39267 8 2.99976C7.54389 2.39267 6.8178 2 6 2H2.5ZM7.5 4.5V11.5C7.5 12.3284 6.82843 13 6 13H2.5C2.22386 13 2 12.7761 2 12.5V3.5C2 3.22386 2.22386 3 2.5 3H6C6.82843 3 7.5 3.67157 7.5 4.5ZM8.5 11.5V4.5C8.5 3.67157 9.17157 3 10 3H13.5C13.7761 3 14 3.22386 14 3.5V12.5C14 12.7761 13.7761 13 13.5 13H10C9.17157 13 8.5 12.3284 8.5 11.5Z"/>',
	search: '<path d="M10.0195 10.7266C9.06578 11.5217 7.83875 12 6.5 12C3.46243 12 1 9.53757 1 6.5C1 3.46243 3.46243 1 6.5 1C9.53757 1 12 3.46243 12 6.5C12 7.83875 11.5217 9.06578 10.7266 10.0195L13.8535 13.1464C14.0488 13.3417 14.0488 13.6583 13.8535 13.8536C13.6583 14.0488 13.3417 14.0488 13.1464 13.8536L10.0195 10.7266ZM11 6.5C11 4.01472 8.98528 2 6.5 2C4.01472 2 2 4.01472 2 6.5C2 8.98528 4.01472 11 6.5 11C8.98528 11 11 8.98528 11 6.5Z"/>',
	// 更新模块（同步到最新：双向弧线箭头）
	update: '<path d="M14 3.5V6.5C14 6.78 13.78 7 13.5 7H10.5C10.22 7 9.99999 6.78 9.99999 6.5C9.99999 6.22 10.22 6 10.5 6H12.58C11.78 4.17 10.01 3 7.99999 3C5.77999 3 3.79999 4.5 3.18999 6.64C3.12999 6.86 2.92999 7 2.70999 7C2.65999 7 2.61999 7 2.56999 6.98C2.29999 6.9 2.14999 6.63 2.22999 6.36C2.95999 3.79 5.32999 2 7.99999 2C10.05 2 11.91 3.02 13 4.69V3.5C13 3.22 13.22 3 13.5 3C13.78 3 14 3.22 14 3.5ZM13.42 9.02C13.16 8.95 12.88 9.1 12.8 9.37C12.19 11.51 10.22 13.01 7.98999 13.01C5.97999 13.01 4.20999 11.84 3.40999 10.01H5.48999C5.76999 10.01 5.98999 9.79 5.98999 9.51C5.98999 9.23 5.76999 9.01 5.48999 9.01H2.48999C2.20999 9.01 1.98999 9.23 1.98999 9.51V12.51C1.98999 12.79 2.20999 13.01 2.48999 13.01C2.76999 13.01 2.98999 12.79 2.98999 12.51V11.32C4.07999 12.98 5.93999 14.01 7.98999 14.01C10.66 14.01 13.03 12.22 13.76 9.65C13.84 9.38 13.68 9.11 13.41 9.03L13.42 9.02Z"/>',
	remove: '<path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z"/>',
	// 切换引入方式（上下箭头交换）
	switch: '<path d="M11.3536 1.64645C11.1583 1.45118 10.8417 1.45118 10.6464 1.64645C10.4512 1.84171 10.4512 2.15829 10.6464 2.35355L12.2929 4H2.5C2.22386 4 2 4.22386 2 4.5C2 4.77614 2.22386 5 2.5 5H12.2929L10.6464 6.64645C10.4512 6.84171 10.4512 7.15829 10.6464 7.35355C10.8417 7.54882 11.1583 7.54882 11.3536 7.35355L13.8536 4.85355C14.0488 4.65829 14.0488 4.34171 13.8536 4.14645L11.3536 1.64645ZM5.35355 9.35355C5.54882 9.15829 5.54882 8.84171 5.35355 8.64645C5.15829 8.45118 4.84171 8.45118 4.64645 8.64645L2.14645 11.1464C1.95118 11.3417 1.95118 11.6583 2.14645 11.8536L4.64645 14.3536C4.84171 14.5488 5.15829 14.5488 5.35355 14.3536C5.54882 14.1583 5.54882 13.8417 5.35355 13.6464L3.70711 12H13.5C13.7761 12 14 11.7761 14 11.5C14 11.2239 13.7761 11 13.5 11H3.70711L5.35355 9.35355Z"/>',
	lock: '<path d="M8 9C8.55228 9 9 9.44771 9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44771 7.44772 9 8 9Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 1C9.654 1 11 2.346 11 4V6H12C13.103 6 14 6.897 14 8V13C14 14.103 13.103 15 12 15H4C2.897 15 2 14.103 2 13V8C2 6.897 2.897 6 4 6H5V4C5 2.346 6.346 1 8 1ZM4 7C3.449 7 3 7.449 3 8V13C3 13.551 3.449 14 4 14H12C12.551 14 13 13.551 13 13V8C13 7.449 12.551 7 12 7H4ZM8 2C6.897 2 6 2.897 6 4V6H10V4C10 2.897 9.103 2 8 2Z"/>',
	unlock: '<path d="M8 9C8.55228 9 9 9.44771 9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44771 7.44772 9 8 9Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13 1C14.654 1 16 2.346 16 4V4.5C16 4.776 15.776 5 15.5 5C15.224 5 15 4.776 15 4.5V4C15 2.897 14.103 2 13 2C11.897 2 11 2.897 11 4V6H12C13.103 6 14 6.897 14 8V13C14 14.103 13.103 15 12 15H4C2.897 15 2 14.103 2 13V8C2 6.897 2.897 6 4 6H10V4C10 2.346 11.346 1 13 1ZM4 7C3.449 7 3 7.449 3 8V13C3 13.551 3.449 14 4 14H12C12.551 14 13 13.551 13 13V8C13 7.449 12.551 7 12 7H4Z"/>',
};

function renderIconActionButton(options: { action: string; title: string; icon: IconName; moduleKey?: string; localItemId?: string; disabled?: boolean }): string {
	const moduleKeyAttribute = options.moduleKey ? ` data-module-key="${escapeHtml(options.moduleKey)}"` : '';
	const localItemIdAttribute = options.localItemId ? ` data-local-item-id="${escapeHtml(options.localItemId)}"` : '';
	const disabledAttribute = options.disabled ? ' disabled aria-disabled="true"' : '';
	return `<button class="icon-button" data-action="${escapeHtml(options.action)}"${moduleKeyAttribute}${localItemIdAttribute} title="${escapeHtml(options.title)}" aria-label="${escapeHtml(options.title)}"${disabledAttribute}>${renderIcon(options.icon)}</button>`;
}

function renderIcon(name: IconName): string {
	return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function renderStarIcon(filled: boolean): string {
	const path = filled
		? '<path d="M15.022 7.25497L12.203 10.003L12.869 13.883C12.917 14.165 12.844 14.438 12.664 14.654C12.479 14.872 12.205 15.001 11.929 15.001C11.775 15.001 11.626 14.963 11.485 14.89L8.00101 13.057L4.51701 14.889C4.13401 15.093 3.62401 14.991 3.34001 14.657C3.15801 14.439 3.08501 14.165 3.13201 13.884L3.79801 10.004L0.979007 7.25597C0.714007 6.99797 0.624007 6.63297 0.737007 6.27997C0.853007 5.92497 1.14001 5.68197 1.50701 5.62797L5.40301 5.06197L7.14501 1.53197C7.47301 0.865971 8.52801 0.865971 8.85601 1.53197L10.598 5.06197L14.494 5.62797C14.862 5.68197 15.149 5.92397 15.264 6.27597C15.378 6.63197 15.286 6.99697 15.022 7.25497Z"/>'
		: '<path d="M11.928 15C11.774 15 11.625 14.962 11.484 14.889L8 13.056L4.516 14.888C4.132 15.092 3.623 14.99 3.339 14.656C3.157 14.438 3.084 14.164 3.131 13.883L3.797 10.003L0.978 7.25499C0.713 6.99699 0.623 6.63199 0.736 6.27899C0.852 5.92399 1.139 5.68099 1.506 5.62699L5.402 5.06099L7.144 1.53099C7.472 0.864994 8.527 0.864994 8.855 1.53099L10.597 5.06099L14.493 5.62699C14.861 5.68099 15.148 5.92299 15.263 6.27499C15.377 6.63099 15.286 6.99599 15.022 7.25399L12.203 10.002L12.869 13.882C12.917 14.164 12.844 14.437 12.664 14.653C12.479 14.871 12.204 15 11.928 15ZM7.959 1.97399L6.066 5.97499L1.65 6.61599L4.871 9.65299L4.117 14.05L8 11.925L11.892 13.972L11.129 9.65299L14.324 6.53799L9.934 5.97499L7.959 1.97399Z"/>';
	return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${path}</svg>`;
}

function getBaseVisibleModules(state: ModuleSidebarRenderState): CsmModuleEntry[] {
	if (!scopeIncludesCatalog(state.scope)) {
		return [];
	}
	if (state.includeAppliedModules) {
		return state.modules;
	}
	return state.modules.filter((entry) => !isModuleApplied(getModuleKey(entry), state));
}

function getSortedModules(modules: CsmModuleEntry[], state: ModuleSidebarRenderState): CsmModuleEntry[] {
	return sortModules(modules, state.sortState, {
		appliedModuleKeys: state.appliedModuleKeys,
	});
}

function getVisibleSidebarEntries(state: ModuleSidebarRenderState): {
	workspaceContent: WorkspaceContent;
	catalogContent: CatalogContent;
	toolbarCounts: ToolbarMetaCounts;
} {
	const workspaceContent = getWorkspaceContent(state);
	const catalogContent = getCatalogContent(state);
	return {
		workspaceContent,
		catalogContent,
		toolbarCounts: getToolbarMetaCounts(state, workspaceContent, catalogContent),
	};
}

function getSearchText(entry: CsmModuleEntry, localLabviewVersion?: string): string {
	return [
		entry.name,
		entry.owner,
		entry.description,
		entry.defaultBranch,
		entry.visibility,
		entry.labviewVersion ?? localLabviewVersion ?? '',
		...getVisibleModuleTopics(entry.topics),
	].join(' ').toLowerCase();
}

function isModuleApplied(moduleKey: string, state: ModuleSidebarRenderState): boolean {
	return state.appliedModuleKeys.has(moduleKey);
}

function renderStarButton(entry: CsmModuleEntry, moduleKey: string, signedIn: boolean): string {
	if (!signedIn) {
		return '';
	}
	const starred = entry.starred;
	const title = typeof starred === 'boolean'
		? (starred ? t('unstarRepository') : t('starRepository'))
		: t('loadingStarStatus');
	const active = starred === true;
	return `<button class="icon-button${active ? ' active' : ''}" data-action="toggleStar" data-module-key="${escapeHtml(moduleKey)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" aria-pressed="${active ? 'true' : 'false'}" ${typeof starred === 'boolean' ? '' : 'disabled aria-disabled="true"'}>${renderStarIcon(active)}</button>`;
}

export function renderModuleSidebarHtml(state: ModuleSidebarRenderState): string {
	const nonce = createNonce();
	const imgCspSource = state.webviewCspSource ?? 'https:';
	const visibleEntries = getVisibleSidebarEntries(state);
	const selectedCount = state.selectedModuleKeys.size;
	const toolbarMetaText = getToolbarMetaText(state, visibleEntries.toolbarCounts, selectedCount);
	const catalogScopeSummaryText = getCatalogScopeSummaryText(state);
	const filterButtonTitle = getFilterButtonTitle(state.sortState);
	const sortFieldOptions: Array<{ value: ModuleSortField; label: string }> = [
		{ value: 'name', label: t('sortFieldName') },
		{ value: 'owner', label: t('sortFieldOwner') },
		{ value: 'updatedAt', label: t('sortFieldUpdated') },
		{ value: 'applied', label: t('sortFieldApplied') },
	];
	const scopeOptions: Array<{ value: ModuleListScope; label: string }> = [
		{ value: 'all', label: t('moduleScopeAll') },
		{ value: 'workspace', label: t('moduleScopeWorkspace') },
		{ value: 'catalog', label: t('moduleScopeCatalog') },
	];
	const sortDirectionOptions: Array<{ value: ModuleSortDirection; label: string }> = [
		{ value: 'asc', label: t('sortDirectionAsc') },
		{ value: 'desc', label: t('sortDirectionDesc') },
	];
	const content = renderContent(state, visibleEntries.workspaceContent, visibleEntries.catalogContent);
	const clientStrings = JSON.stringify({
		toolbarMetaShown: t('toolbarMetaShown'),
		toolbarMetaWorkspace: t('toolbarMetaWorkspace'),
		toolbarMetaCatalog: t('toolbarMetaCatalog'),
		toolbarMetaMixed: t('toolbarMetaMixed'),
		toolbarMeta: t('toolbarMeta'),
		publicVisibility: t('publicVisibility'),
		privateVisibility: t('privateVisibility'),
	}).replace(/</g, '\\u003c');

	return `<!DOCTYPE html>
<html lang="${getHtmlLang()}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgCspSource} https:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(t('outputChannelName'))}</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: light dark;
			--module-font-xs: 11px;
			--module-font-sm: 12px;
			--module-font-md: 13px;
			--module-font-lg: 15px;
			--module-icon-size: 18px;
		}
		[hidden] {
			display: none !important;
		}
		body {
			margin: 0;
			padding: 10px;
			font-family: var(--vscode-font-family);
			font-size: var(--module-font-md);
			line-height: 1.45;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
		}
		button {
			font: inherit;
			cursor: pointer;
			border: 1px solid transparent;
			border-radius: 4px;
			padding: 6px 10px;
			background: transparent;
			color: var(--vscode-foreground);
		}
		button:hover:not(:disabled) {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		button:disabled {
			opacity: 0.55;
			cursor: default;
		}
		.header {
			display: grid;
			gap: 6px;
			margin-bottom: 8px;
		}
		.toolbar-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 6px;
			flex-wrap: wrap;
		}
		.toolbar-account {
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
			min-width: 0;
		}
		.toolbar {
			display: flex;
			align-items: center;
			gap: 3px;
			min-height: 26px;
		}
		.toolbar-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			height: 28px;
			padding: 0 8px;
			color: var(--vscode-descriptionForeground);
		}
		.toolbar-button svg,
		.search-box svg,
		.icon-button svg {
			width: var(--module-icon-size);
			height: var(--module-icon-size);
		}
		.toolbar-button.callout {
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
		}
		.scope-switch {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			flex-wrap: wrap;
		}
		.scope-switch .toolbar-button {
			height: 24px;
			padding: 0 10px;
			border-radius: 999px;
			border-color: var(--vscode-panel-border);
		}
		.scope-switch .toolbar-button.active {
			color: var(--vscode-foreground);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
			border-color: var(--vscode-focusBorder, var(--vscode-panel-border));
		}
		.toolbar-meta {
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
		}
		.workspace-summary {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.search-box {
			display: flex;
			align-items: center;
			gap: 4px;
			height: 32px;
			padding: 0 6px 0 10px;
			border-radius: 4px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
		}
		.search-shell {
			position: relative;
		}
		.search-icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
		}
		.search-box:focus-within {
			border-color: var(--vscode-focusBorder);
		}
		.search-box input {
			flex: 1 1 auto;
			min-width: 0;
			border: 0;
			outline: none;
			padding: 0;
			background: transparent;
			color: var(--vscode-input-foreground, var(--vscode-foreground));
			font: inherit;
			font-size: var(--module-font-md);
		}
		.search-box input::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}
		.search-box .icon-button {
			width: 24px;
			height: 24px;
			color: var(--vscode-descriptionForeground);
		}
		.filter-button[aria-expanded="true"] {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
			color: var(--vscode-foreground);
		}
		.filter-menu {
			position: absolute;
			top: calc(100% + 4px);
			right: 0;
			min-width: 220px;
			padding: 6px;
			border-radius: 6px;
			background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
			border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
			z-index: 20;
			display: grid;
			gap: 6px;
		}
		.filter-menu-section + .filter-menu-section {
			padding-top: 6px;
			border-top: 1px solid var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
		}
		.filter-menu-label {
			display: block;
			padding: 2px 6px 4px;
			font-size: var(--module-font-xs);
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.filter-menu-option {
			display: grid;
			grid-template-columns: 14px minmax(0, 1fr);
			align-items: center;
			width: 100%;
			padding: 5px 6px;
			border-radius: 4px;
			color: var(--vscode-menu-foreground, var(--vscode-foreground));
			text-align: left;
		}
		.filter-menu-option.selected {
			background: var(--vscode-list-activeSelectionBackground, var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)));
			color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
		}
		.filter-menu-option:hover {
			background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
		}
		.filter-menu-check {
			font-size: 11px;
			opacity: 0;
		}
		.filter-menu-option.selected .filter-menu-check {
			opacity: 1;
		}
		.filter-menu-option-label {
			font-size: var(--module-font-md);
		}
		.filter-menu-option-hint {
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.notice {
			display: flex;
			gap: 6px;
			align-items: flex-start;
			justify-content: space-between;
			padding: 7px 8px;
			border-radius: 6px;
			background: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.12));
			border: 1px solid var(--vscode-editorInfo-border, var(--vscode-panel-border));
			margin-bottom: 6px;
		}
		.notice strong {
			display: block;
			font-size: var(--module-font-md);
		}
		.notice span {
			display: block;
			margin-top: 2px;
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.notice-actions {
			display: flex;
			align-items: center;
			gap: 4px;
			margin-left: 8px;
		}
		.list {
			display: grid;
			gap: 6px;
		}
		.list-section {
			display: grid;
			gap: 8px;
		}
		.list-section + .list-section {
			margin-top: 12px;
			padding-top: 12px;
			border-top: 1px solid var(--vscode-panel-border);
		}
		.section-toggle {
			display: flex;
			align-items: baseline;
			gap: 8px;
			width: 100%;
			padding: 4px 6px;
			border: 0;
			border-radius: 4px;
			background: transparent;
			text-align: left;
		}
		.section-toggle .section-title {
			flex: 0 1 auto;
			min-width: 0;
		}
		.section-toggle .section-meta {
			margin-left: auto;
		}
		.section-toggle .section-chevron {
			flex: 0 0 auto;
			width: 14px;
			height: 14px;
			align-self: center;
			color: var(--vscode-descriptionForeground);
			transition: transform 0.15s ease;
		}
		.list-section.collapsed .section-toggle .section-chevron {
			transform: rotate(-90deg);
		}
		.list-section.collapsed .list {
			display: none;
		}
		.local-section {
			margin-top: 12px;
			padding-top: 12px;
			border-top: 1px solid var(--vscode-panel-border);
			display: grid;
			gap: 8px;
		}
		.section-header {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: 8px;
			flex-wrap: wrap;
		}
		.section-title {
			font-size: var(--module-font-sm);
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.section-meta {
			font-size: var(--module-font-xs);
			color: var(--vscode-descriptionForeground);
		}
		.section-group {
			display: grid;
			gap: 6px;
		}
		.section-subtitle {
			font-size: var(--module-font-xs);
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.local-list {
			display: grid;
			gap: 6px;
		}
		.module-card {
			border-radius: 6px;
			padding: 8px 10px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background));
			border: 1px solid var(--vscode-panel-border);
		}
		.local-module-card.managed {
			border-left: 3px solid var(--vscode-terminal-ansiGreen, #2ea043);
			padding-left: 8px;
		}
		.local-module-card.unmanaged {
			border-style: dashed;
		}
		.module-card:hover {
			background: var(--vscode-list-hoverBackground, var(--vscode-editorWidget-background));
		}
		.module-card.applied {
			border-left-color: var(--vscode-terminal-ansiGreen, #2ea043);
			border-left-width: 3px;
			padding-left: 8px;
		}
		.module-card.selected {
			border-color: var(--vscode-focusBorder, var(--vscode-textLink-foreground));
		}
		.module-header {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px;
			align-items: flex-start;
		}
		.module-main {
			min-width: 0;
			display: grid;
			gap: 1px;
		}
		.module-select {
			margin: 0;
			width: 16px;
			height: 16px;
		}
		.module-header-tools {
			display: flex;
			align-items: center;
			gap: 2px;
			margin-top: -2px;
		}
		.title-row {
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			flex-wrap: wrap;
		}
		.module-name {
			font-size: var(--module-font-md);
			font-weight: 600;
			line-height: 1.4;
			min-width: 0;
		}
		.module-owner {
			font-size: var(--module-font-xs);
			color: var(--vscode-descriptionForeground);
			min-width: 0;
		}
		.summary {
			margin-top: 4px;
			font-size: var(--module-font-sm);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.meta-row {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			margin-top: 6px;
		}
		.badge {
			display: inline-flex;
			align-items: center;
			padding: 0 6px;
			height: 18px;
			line-height: 1;
			border-radius: 10px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			color: var(--vscode-descriptionForeground);
			background: transparent;
			white-space: nowrap;
		}
		.badge.private {
			border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
			color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
		}
		.badge.applied {
			border-color: rgba(46, 160, 67, 0.35);
			color: var(--vscode-terminal-ansiGreen, #2ea043);
		}
		.badge.stale {
			border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
			color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
		}
		.badge.remote-update {
			border-color: rgba(255, 152, 0, 0.45);
			color: var(--vscode-terminal-ansiYellow, #c69026);
		}
		.badge.copy {
			border-color: rgba(14, 99, 156, 0.5);
			color: var(--vscode-terminal-ansiBlue, #0e639c);
		}
		.badge.submodule {
			border-color: rgba(188, 63, 188, 0.4);
			color: var(--vscode-terminal-ansiMagenta, #bc3fbc);
		}
		.badge.lv-version {
			background: transparent;
			border-color: var(--vscode-button-background, #0078d4);
			color: var(--vscode-button-background, #0078d4);
			font-weight: 600;
		}
		.badge.module-version {
			background: transparent;
			border-color: var(--vscode-editorInfo-foreground, var(--vscode-panel-border));
			color: var(--vscode-editorInfo-foreground, var(--vscode-foreground));
			font-variant-numeric: tabular-nums;
		}
		.card-footer {
			display: flex;
			justify-content: flex-start;
			gap: 6px;
			align-items: flex-end;
			margin-top: 5px;
		}
		.card-footer-note {
			flex: 1 1 auto;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.card-footer-spacer {
			flex: 1 1 auto;
		}
		.action-toolbar {
			display: flex;
			align-items: center;
			gap: 2px;
		}
		.local-card-hint {
			margin-top: 6px;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.select-toolbar-item {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			border-radius: 4px;
			opacity: 0;
			pointer-events: none;
			transition: opacity 120ms ease;
		}
		.module-card:hover .select-toolbar-item,
		.module-card.selected .select-toolbar-item {
			opacity: 1;
			pointer-events: auto;
		}
		.select-toolbar-item:hover {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.icon-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			padding: 0;
			color: var(--vscode-descriptionForeground);
		}
		.icon-button.active {
			color: var(--vscode-charts-yellow, var(--vscode-textLink-foreground));
		}
		.icon-button[disabled] {
			opacity: 0.5;
			cursor: default;
		}
		.empty-state {
			padding: 20px 16px;
			border-radius: 6px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background));
			border: 1px dashed var(--vscode-panel-border);
		}
		.empty-state h2 {
			margin: 0;
			font-size: var(--module-font-lg);
		}
		.empty-state p {
			margin: 8px 0 0;
			font-size: var(--module-font-md);
			line-height: 1.5;
			color: var(--vscode-descriptionForeground);
		}
		.skeleton {
			padding-top: 12px;
			padding-bottom: 12px;
			border-radius: 6px;
			animation: skeleton-pulse 1.8s ease-in-out infinite;
		}
		.skeleton-label {
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
			padding: 0 8px 8px;
			animation: skeleton-pulse 1.8s ease-in-out infinite;
		}
		.skeleton-line {
			height: 10px;
			border-radius: 999px;
			background: rgba(127, 127, 127, 0.18);
			position: relative;
			overflow: hidden;
		}
		.skeleton-line::after {
			content: '';
			position: absolute;
			top: 0;
			left: -100%;
			width: 100%;
			height: 100%;
			background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.12) 40%, rgba(255, 255, 255, 0.18) 50%, rgba(255, 255, 255, 0.12) 60%, transparent 100%);
			animation: shimmer 1.6s ease-in-out infinite;
		}
		.skeleton-line + .skeleton-line {
			margin-top: 8px;
		}
		.skeleton-line.short {
			width: 42%;
		}
		.skeleton-line.medium {
			width: 68%;
		}
		@keyframes shimmer {
			0% { left: -100%; }
			100% { left: 100%; }
		}
		@keyframes skeleton-pulse {
			0%, 100% { opacity: 0.6; }
			50% { opacity: 1; }
		}
	</style>
</head>
<body>
	<section class="header">
		<div class="search-shell">
			<div class="search-box" data-role="search-box">
				<span class="search-icon">${renderIcon('search')}</span>
				<input type="text" value="${escapeHtml(state.filterQuery)}" data-role="filter-input" placeholder="${escapeHtml(t('searchModules'))}" aria-label="${escapeHtml(t('searchModules'))}">
				<button class="icon-button" data-action="clearFilter" data-role="clear-filter" title="${escapeHtml(t('clearSearch'))}" aria-label="${escapeHtml(t('clearSearch'))}" ${state.filterQuery ? '' : 'hidden'}>${renderIcon('close')}</button>
				<button class="icon-button filter-button" data-action="toggleFilterMenu" data-role="filter-button" title="${escapeHtml(filterButtonTitle)}" aria-label="${escapeHtml(filterButtonTitle)}" aria-haspopup="menu" aria-expanded="false">${renderIcon('filter')}</button>
			</div>
			<div class="filter-menu" data-role="filter-menu" role="menu" hidden>
				<div class="filter-menu-section">
					<span class="filter-menu-label">${escapeHtml(t('filterMenuShow'))}</span>
					${renderFilterMenuToggleOption(t('includeAppliedModules'), state.includeAppliedModules)}
				</div>
				<div class="filter-menu-section">
					<span class="filter-menu-label">${escapeHtml(t('filterMenuScope'))}</span>
					${scopeOptions.map((option) => renderScopeFilterMenuOption(option.value, option.label, state.scope === option.value)).join('')}
				</div>
				<div class="filter-menu-section">
					<span class="filter-menu-label">${escapeHtml(t('filterMenuType'))}</span>
					${sortFieldOptions.map((option) => renderFilterMenuOption('field', option.value, option.label, state.sortState.field === option.value)).join('')}
				</div>
				<div class="filter-menu-section">
					<span class="filter-menu-label">${escapeHtml(t('filterMenuOrder'))}</span>
					${sortDirectionOptions.map((option) => renderFilterMenuOption('direction', option.value, option.label, state.sortState.direction === option.value)).join('')}
				</div>
			</div>
		</div>
		<div class="toolbar-row">
			<span class="toolbar-meta" data-role="toolbar-meta" data-scope="${escapeHtml(state.scope)}" data-applied-count="${visibleEntries.toolbarCounts.appliedCount}" data-total-count="${visibleEntries.toolbarCounts.totalCount}" data-filtered-count="${visibleEntries.toolbarCounts.filteredCount}" data-workspace-count="${visibleEntries.toolbarCounts.workspaceCount}" data-catalog-count="${visibleEntries.toolbarCounts.catalogCount}" data-public-count="${visibleEntries.toolbarCounts.publicCount}" data-private-count="${visibleEntries.toolbarCounts.privateCount}" data-signed-in="${state.signedIn ? 'true' : 'false'}">${toolbarMetaText}</span>
			<div class="scope-switch" role="toolbar" aria-label="${escapeHtml(t('scopeToolbarLabel'))}">${scopeOptions.map((option) => renderScopeToolbarButton(option.value, option.label, state.scope === option.value)).join('')}</div>
		</div>
			${catalogScopeSummaryText || (state.workspaceLabel && state.moduleRoot) || state.workspaceLabviewVersion
			? `<div class="workspace-summary">${catalogScopeSummaryText ? `<span>${escapeHtml(catalogScopeSummaryText)}</span>` : ''}${state.workspaceLabel && state.moduleRoot ? `<span>${escapeHtml(state.workspaceLabel)} &mdash; ${escapeHtml(state.moduleRoot)}/</span>` : ''}${state.workspaceLabviewVersion ? `<span>${escapeHtml(state.workspaceLabviewVersion)}</span>` : ''}</div>`
			: ''}
		${state.introTipVisible ? `<section class="notice" data-role="intro-tip"><div><strong>${escapeHtml(t('tipTitle'))}</strong><span>${escapeHtml(t('tipBody'))}</span></div><div class="notice-actions"><button class="icon-button" data-action="dismissIntroTip" title="${escapeHtml(t('dismissTip'))}" aria-label="${escapeHtml(t('dismissTip'))}">${renderIcon('close')}</button></div></section>` : ''}
		${state.canInitializeWorkspace ? `<section class="notice"><div><strong>${escapeHtml(t('workspaceHintTitle'))}</strong><span>${escapeHtml(t('workspaceHintBody'))}</span></div><div class="notice-actions"><button class="toolbar-button callout" data-action="initializeWorkspace">${escapeHtml(t('initializeAction'))}</button></div></section>` : ''}
	</section>
	${content}
	<script nonce="${nonce}">
		const uiStrings = ${clientStrings};
		const vscode = acquireVsCodeApi();
		const filterInput = document.querySelector('[data-role="filter-input"]');
		const clearFilterButton = document.querySelector('[data-role="clear-filter"]');
		const filterMenu = document.querySelector('[data-role="filter-menu"]');
		const filterMenuButton = document.querySelector('[data-role="filter-button"]');
		const toolbarMeta = document.querySelector('[data-role="toolbar-meta"]');
		const filterEmptyState = document.querySelector('[data-role="filter-empty"]');

		function formatMessage(template, values) {
			return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) => token in values ? String(values[token]) : match);
		}

		${buildVisibilityBreakdownText.toString()}

		${buildToolbarVisibilityText.toString()}

		${buildToolbarMetaText.toString()}

		function getToolbarVisibilityFormatters() {
			return {
				shown: function (filtered, total) {
					return formatMessage(uiStrings.toolbarMetaShown, { filtered: filtered, total: total });
				},
				workspace: function (total) {
					return formatMessage(uiStrings.toolbarMetaWorkspace, { total: total });
				},
				catalog: function (total) {
					return formatMessage(uiStrings.toolbarMetaCatalog, { total: total });
				},
				mixed: function (workspace, catalog) {
					return formatMessage(uiStrings.toolbarMetaMixed, { workspace: workspace, catalog: catalog });
				},
				visibilityBreakdown: function (publicCount, privateCount) {
					return buildVisibilityBreakdownText(publicCount, privateCount, uiStrings.publicVisibility, uiStrings.privateVisibility);
				},
			};
		}

		function getVisibilityBreakdownText(publicCount, privateCount) {
			return buildVisibilityBreakdownText(publicCount, privateCount, uiStrings.publicVisibility, uiStrings.privateVisibility);
		}

		function getToolbarVisibilityText(scope, totalCount, filteredCount, workspaceCount, catalogCount, publicCount, privateCount, signedIn) {
			return buildToolbarVisibilityText(scope, {
				totalCount: totalCount,
				filteredCount: filteredCount,
				workspaceCount: workspaceCount,
				catalogCount: catalogCount,
				publicCount: publicCount,
				privateCount: privateCount,
			}, signedIn, getToolbarVisibilityFormatters());
		}

		function getToolbarMetaText(scope, appliedCount, totalCount, filteredCount, selectedCount, workspaceCount, catalogCount, publicCount, privateCount, signedIn) {
			const formatters = getToolbarVisibilityFormatters();
			return buildToolbarMetaText(scope, {
				appliedCount: appliedCount,
				totalCount: totalCount,
				filteredCount: filteredCount,
				workspaceCount: workspaceCount,
				catalogCount: catalogCount,
				publicCount: publicCount,
				privateCount: privateCount,
			}, selectedCount, signedIn, function (nextScope, counts, nextSignedIn) {
				return buildToolbarVisibilityText(nextScope, counts, nextSignedIn, formatters);
			}, function (nextAppliedCount, visibilityText, nextSelectedCount) {
				return formatMessage(uiStrings.toolbarMeta, {
					applied: nextAppliedCount,
					visibility: visibilityText,
					selected: nextSelectedCount,
				});
			});
		}

		function openFilterMenu() {
			if (!(filterMenu instanceof HTMLElement) || !(filterMenuButton instanceof HTMLElement)) {
				return;
			}
			filterMenu.hidden = false;
			filterMenuButton.setAttribute('aria-expanded', 'true');
		}

		function closeFilterMenu() {
			if (!(filterMenu instanceof HTMLElement) || !(filterMenuButton instanceof HTMLElement)) {
				return;
			}
			filterMenu.hidden = true;
			filterMenuButton.setAttribute('aria-expanded', 'false');
		}

		function toggleFilterMenu() {
			if (!(filterMenu instanceof HTMLElement)) {
				return;
			}
			if (filterMenu.hidden) {
				openFilterMenu();
				return;
			}
			closeFilterMenu();
		}

		function getCards() {
			return Array.from(document.querySelectorAll('[data-role="module-card"], [data-role="local-module-card"]'));
		}

		function isCardApplied(card) {
			return card.getAttribute('data-module-applied') === 'true';
		}

		function isCardSelected(card) {
			return card.getAttribute('data-module-selected') === 'true';
		}

		function updateCardContext(card) {
			card.setAttribute('data-vscode-context', JSON.stringify({
				webviewSection: 'moduleCard',
				moduleKey: card.getAttribute('data-module-key') || undefined,
				moduleApplied: isCardApplied(card),
				moduleSelected: isCardSelected(card),
				preventDefaultContextMenuItems: true,
			}));
		}

		function setCardSelection(card, selected, shouldNotify) {
			const checkbox = card.querySelector('[data-role="select-toggle"]');
			if (checkbox instanceof HTMLInputElement) {
				checkbox.checked = selected;
			}
			card.classList.toggle('selected', selected);
			card.setAttribute('data-module-selected', selected ? 'true' : 'false');
			updateCardContext(card);
			if (shouldNotify) {
				vscode.postMessage({
					type: 'toggleSelection',
					moduleKey: card.getAttribute('data-module-key') || undefined,
					selected,
				});
			}
			updateToolbarMeta();
		}

		function updateToolbarMeta() {
			if (!toolbarMeta) {
				return;
			}
			const scope = String(toolbarMeta.getAttribute('data-scope') || 'all');
			const appliedCount = Number(toolbarMeta.getAttribute('data-applied-count') || '0');
			const totalCount = Number(toolbarMeta.getAttribute('data-total-count') || '0');
			const workspaceCount = Number(toolbarMeta.getAttribute('data-workspace-count') || '0');
			const catalogCount = Number(toolbarMeta.getAttribute('data-catalog-count') || '0');
			const publicCount = Number(toolbarMeta.getAttribute('data-public-count') || '0');
			const privateCount = Number(toolbarMeta.getAttribute('data-private-count') || '0');
			const signedIn = toolbarMeta.getAttribute('data-signed-in') === 'true';
			const hasQuery = filterInput instanceof HTMLInputElement && filterInput.value.trim().length > 0;
			const filteredCount = hasQuery
				? getCards().filter((card) => !card.hasAttribute('hidden')).length
				: totalCount;
			const selectedCount = document.querySelectorAll('[data-role="select-toggle"]:checked').length;
			toolbarMeta.setAttribute('data-filtered-count', String(filteredCount));
			toolbarMeta.textContent = getToolbarMetaText(scope, appliedCount, totalCount, filteredCount, selectedCount, workspaceCount, catalogCount, publicCount, privateCount, signedIn);
		}

		function applyFilter(shouldNotify) {
			const query = filterInput instanceof HTMLInputElement ? filterInput.value.trim().toLowerCase() : '';
			let visibleCount = 0;
			for (const card of getCards()) {
				const searchText = String(card.getAttribute('data-search-text') || '');
				const matches = !query || searchText.includes(query);
				card.toggleAttribute('hidden', !matches);
				if (matches) {
					visibleCount += 1;
				}
			}
			if (filterEmptyState) {
				filterEmptyState.toggleAttribute('hidden', !(query && visibleCount === 0));
			}
			if (clearFilterButton) {
				clearFilterButton.toggleAttribute('hidden', !query);
			}
			updateToolbarMeta();
			if (shouldNotify) {
				vscode.postMessage({ type: 'setFilterQuery', query });
			}
		}

		document.addEventListener('click', (event) => {
			const rawTarget = event.target instanceof Element ? event.target : null;
			if (rawTarget && !rawTarget.closest('[data-role="filter-menu"]') && !rawTarget.closest('[data-role="filter-button"]')) {
				closeFilterMenu();
			}
			const sectionToggle = rawTarget ? rawTarget.closest('[data-role="section-toggle"]') : null;
			if (sectionToggle instanceof HTMLButtonElement) {
				const section = sectionToggle.closest('.list-section');
				if (section instanceof HTMLElement) {
					const collapsed = section.classList.toggle('collapsed');
					sectionToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
				}
				return;
			}
			const target = rawTarget ? rawTarget.closest('[data-action]') : null;
			if (!target) {
				return;
			}
			if (target instanceof HTMLButtonElement && target.disabled) {
				return;
			}
			const action = target.getAttribute('data-action');
			if (action === 'toggleFilterMenu') {
				toggleFilterMenu();
				return;
			}
			if (action === 'clearFilter') {
				if (filterInput instanceof HTMLInputElement) {
					filterInput.value = '';
					applyFilter(true);
				}
				return;
			}
			if (action === 'setSortField') {
				const sortField = target.getAttribute('data-sort-field') || undefined;
				closeFilterMenu();
				vscode.postMessage({ type: 'setSortField', sortField });
				return;
			}
			if (action === 'setSortDirection') {
				const sortDirection = target.getAttribute('data-sort-direction') || undefined;
				closeFilterMenu();
				vscode.postMessage({ type: 'setSortDirection', sortDirection });
				return;
			}
			if (action === 'setIncludeApplied') {
				const includeApplied = target.getAttribute('data-include-applied') === 'true';
				closeFilterMenu();
				vscode.postMessage({ type: 'setIncludeApplied', includeApplied });
				return;
			}
			if (action === 'setScope') {
				const scope = target.getAttribute('data-scope') || undefined;
				closeFilterMenu();
				vscode.postMessage({ type: 'setScope', scope });
				return;
			}
			const moduleKey = target.getAttribute('data-module-key') || undefined;
			const localItemId = target.getAttribute('data-local-item-id') || undefined;
			if (!action || action === 'toggleSelection') {
				return;
			}
			vscode.postMessage({ type: action, moduleKey, localItemId });
		});
		if (filterInput instanceof HTMLInputElement) {
			filterInput.addEventListener('input', () => {
				applyFilter(true);
			});
		}
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				closeFilterMenu();
			}
		});
		document.addEventListener('change', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) {
				return;
			}
			if (target.getAttribute('data-action') !== 'toggleSelection') {
				return;
			}
			const card = target.closest('[data-role="module-card"]');
			if (card instanceof HTMLElement) {
				setCardSelection(card, target.checked, true);
			}
		});
		applyFilter(false);
	</script>
</body>
</html>`;
}

export function renderLocalWorkspaceViewHtml(state: LocalWorkspaceRenderState): string {
	const nonce = createNonce();
	const initNotice = state.canInitializeWorkspace
		? `<section class="notice"><div><strong>${escapeHtml(t('workspaceHintTitle'))}</strong><span>${escapeHtml(t('workspaceHintBody'))}</span></div><div class="notice-actions"><button class="toolbar-button callout" data-action="initializeWorkspace">${escapeHtml(t('initializeAction'))}</button></div></section>`
		: '';
	const content = renderLocalWorkspaceSection(state) || renderEmptyState(
		state.moduleRoot
			? t('workspaceModulesEmptyTitle', { root: state.moduleRoot })
			: t('workspaceModulesTitle'),
		t('workspaceModulesEmptyBody'),
	);

	return `<!DOCTYPE html>
<html lang="${getHtmlLang()}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(t('outputChannelName'))}</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: light dark;
			--module-font-xs: 11px;
			--module-font-sm: 12px;
			--module-font-md: 13px;
			--module-font-lg: 15px;
			--module-icon-size: 18px;
		}
		body {
			margin: 0;
			padding: 10px;
			font-family: var(--vscode-font-family);
			font-size: var(--module-font-md);
			line-height: 1.45;
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
		}
		button {
			font: inherit;
			cursor: pointer;
			border: 1px solid transparent;
			border-radius: 4px;
			padding: 6px 10px;
			background: transparent;
			color: var(--vscode-foreground);
		}
		button:hover:not(:disabled) {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
		}
		.header {
			display: grid;
			gap: 6px;
			margin-bottom: 8px;
		}
		.workspace-summary {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.notice {
			display: flex;
			gap: 6px;
			align-items: flex-start;
			justify-content: space-between;
			padding: 7px 8px;
			border-radius: 6px;
			background: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.12));
			border: 1px solid var(--vscode-editorInfo-border, var(--vscode-panel-border));
		}
		.notice strong {
			display: block;
			font-size: var(--module-font-md);
		}
		.notice span {
			display: block;
			margin-top: 2px;
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.notice-actions {
			display: flex;
			align-items: center;
			gap: 4px;
		}
		.toolbar-button.callout {
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
		}
		.list,
		.local-list {
			display: grid;
			gap: 6px;
		}
		.local-section {
			display: grid;
			gap: 8px;
		}
		.section-header {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: 8px;
			flex-wrap: wrap;
		}
		.section-title {
			font-size: var(--module-font-sm);
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.section-meta {
			font-size: var(--module-font-xs);
			color: var(--vscode-descriptionForeground);
		}
		.section-group {
			display: grid;
			gap: 6px;
		}
		.section-subtitle {
			font-size: var(--module-font-xs);
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.module-card {
			border-radius: 6px;
			padding: 8px 10px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background));
			border: 1px solid var(--vscode-panel-border);
		}
		.local-module-card.managed {
			border-left: 3px solid var(--vscode-terminal-ansiGreen, #2ea043);
			padding-left: 8px;
		}
		.local-module-card.unmanaged {
			border-style: dashed;
		}
		.module-card:hover {
			background: var(--vscode-list-hoverBackground, var(--vscode-editorWidget-background));
		}
		.module-header {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px;
			align-items: flex-start;
		}
		.module-main {
			min-width: 0;
			display: grid;
			gap: 1px;
		}
		.module-header-tools {
			display: flex;
			align-items: center;
			gap: 2px;
			margin-top: -2px;
		}
		.title-row {
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
			flex-wrap: wrap;
		}
		.module-name {
			font-size: var(--module-font-md);
			font-weight: 600;
			line-height: 1.4;
			min-width: 0;
		}
		.module-owner {
			font-size: var(--module-font-xs);
			color: var(--vscode-descriptionForeground);
			min-width: 0;
		}
		.summary {
			margin-top: 4px;
			font-size: var(--module-font-sm);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.meta-row {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			margin-top: 6px;
		}
		.badge {
			display: inline-flex;
			align-items: center;
			padding: 0 6px;
			height: 18px;
			line-height: 1;
			border-radius: 10px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			color: var(--vscode-descriptionForeground);
			background: transparent;
			white-space: nowrap;
		}
		.badge.private {
			border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
			color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
		}
		.badge.applied {
			border-color: rgba(46, 160, 67, 0.35);
			color: var(--vscode-terminal-ansiGreen, #2ea043);
		}
		.badge.stale {
			border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
			color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
		}
		.badge.remote-update {
			border-color: rgba(255, 152, 0, 0.45);
			color: var(--vscode-terminal-ansiYellow, #c69026);
		}
		.badge.copy {
			border-color: rgba(14, 99, 156, 0.5);
			color: var(--vscode-terminal-ansiBlue, #0e639c);
		}
		.badge.submodule {
			border-color: rgba(188, 63, 188, 0.4);
			color: var(--vscode-terminal-ansiMagenta, #bc3fbc);
		}
		.badge.lv-version {
			background: transparent;
			border-color: var(--vscode-button-background, #0078d4);
			color: var(--vscode-button-background, #0078d4);
			font-weight: 600;
		}
		.badge.module-version {
			background: transparent;
			border-color: var(--vscode-editorInfo-foreground, var(--vscode-panel-border));
			color: var(--vscode-editorInfo-foreground, var(--vscode-foreground));
			font-variant-numeric: tabular-nums;
		}
		.action-toolbar {
			display: flex;
			align-items: center;
			gap: 2px;
		}
		.card-footer {
			display: flex;
			justify-content: flex-start;
			gap: 6px;
			align-items: flex-end;
			margin-top: 5px;
		}
		.card-footer-note {
			flex: 1 1 auto;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.icon-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			padding: 0;
			color: var(--vscode-descriptionForeground);
		}
		.icon-button svg {
			width: var(--module-icon-size, 18px);
			height: var(--module-icon-size, 18px);
		}
		.icon-button[disabled] {
			opacity: 0.5;
			cursor: default;
		}
		.local-card-hint {
			margin-top: 6px;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.empty-state {
			padding: 20px 16px;
			border-radius: 6px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background));
			border: 1px dashed var(--vscode-panel-border);
		}
		.empty-state h2 {
			margin: 0;
			font-size: var(--module-font-lg);
		}
		.empty-state p {
			margin: 8px 0 0;
			font-size: var(--module-font-md);
			line-height: 1.5;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<section class="header">${initNotice}</section>
	${content}
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.addEventListener('click', (event) => {
			const rawTarget = event.target instanceof Element ? event.target : null;
			const target = rawTarget ? rawTarget.closest('[data-action]') : null;
			if (!target) {
				return;
			}
			const action = target.getAttribute('data-action');
			const localItemId = target.getAttribute('data-local-item-id') || undefined;
			if (!action) {
				return;
			}
			vscode.postMessage({ type: action, localItemId });
		});
	</script>
</body>
</html>`;
}

function renderFilterMenuOption(
	kind: 'field' | 'direction',
	value: ModuleSortField | ModuleSortDirection,
	label: string,
	selected: boolean,
): string {
	const action = kind === 'field' ? 'setSortField' : 'setSortDirection';
	const dataAttribute = kind === 'field'
		? `data-sort-field="${escapeHtml(String(value))}"`
		: `data-sort-direction="${escapeHtml(String(value))}"`;
	return `<button class="filter-menu-option${selected ? ' selected' : ''}" data-action="${action}" ${dataAttribute} role="menuitemradio" aria-checked="${selected ? 'true' : 'false'}"><span class="filter-menu-check">&#10003;</span><span class="filter-menu-option-label">${escapeHtml(label)}</span></button>`;
}

function renderScopeFilterMenuOption(scope: ModuleListScope, label: string, selected: boolean): string {
	return `<button class="filter-menu-option${selected ? ' selected' : ''}" data-action="setScope" data-scope="${escapeHtml(scope)}" role="menuitemradio" aria-checked="${selected ? 'true' : 'false'}"><span class="filter-menu-check">&#10003;</span><span class="filter-menu-option-label">${escapeHtml(label)}</span></button>`;
}

function renderScopeToolbarButton(scope: ModuleListScope, label: string, selected: boolean): string {
	return `<button class="toolbar-button${selected ? ' active' : ''}" data-action="setScope" data-scope="${escapeHtml(scope)}" aria-pressed="${selected ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

function renderFilterMenuToggleOption(label: string, selected: boolean): string {
	return `<button class="filter-menu-option${selected ? ' selected' : ''}" data-action="setIncludeApplied" data-include-applied="${selected ? 'false' : 'true'}" role="menuitemcheckbox" aria-checked="${selected ? 'true' : 'false'}"><span class="filter-menu-check">&#10003;</span><span class="filter-menu-option-label">${escapeHtml(label)}</span></button>`;
}

function getSortFieldLabel(field: ModuleSortField): string {
	switch (field) {
		case 'owner':
			return t('sortFieldOwner');
		case 'updatedAt':
			return t('sortFieldUpdated');
		case 'applied':
			return t('sortFieldApplied');
		case 'name':
		default:
			return t('sortFieldName');
	}
}

function getSortDirectionLabel(direction: ModuleSortDirection): string {
	return direction === 'asc' ? t('sortDirectionAsc') : t('sortDirectionDesc');
}

function getFilterButtonTitle(sortState: ModuleSortState): string {
	return t('filterAndSortTitle', {
		field: getSortFieldLabel(sortState.field),
		direction: getSortDirectionLabel(sortState.direction),
	});
}

function renderFilterEmptyState(): string {
	return `<section class="empty-state" data-role="filter-empty" hidden><h2>${escapeHtml(t('filterNoMatchesTitle'))}</h2><p>${escapeHtml(t('filterNoMatchesBody'))}</p><div class="action-toolbar"><button class="toolbar-button callout" data-action="clearFilter">${escapeHtml(t('clearFilter'))}</button></div></section>`;
}

function renderCatalogEmptyState(state: ModuleSidebarRenderState): string {
	if (state.offlineMode && state.state === 'error' && state.modules.length === 0) {
		return renderEmptyState(
			t('noCachedModulesTitle'),
			state.message,
		);
	}

	if (!state.signedIn && state.modules.length === 0 && state.state !== 'ready') {
		return renderEmptyState(
			t('emptySignInTitle'),
			state.message,
			`<button class="primary" data-action="login">${escapeHtml(t('connectGitHub'))}</button>`,
		);
	}

	if (state.state === 'loading' && state.modules.length === 0) {
		return `<section class="list"><div class="skeleton-label">${escapeHtml(state.message || t('loadingModules'))}</div>${[1, 2, 3].map(() => renderSkeletonCard()).join('')}</section>`;
	}

	if (state.state === 'error' && state.modules.length === 0) {
		return renderEmptyState(
			t('unableToLoadModulesTitle'),
			state.message,
		);
	}

	return renderEmptyState(
		t('noModulesFoundTitle'),
		state.message,
	);
}

function renderCatalogStatusBanner(state: ModuleSidebarRenderState): string {
	if (!scopeIncludesCatalog(state.scope)) {
		return '';
	}
	return state.state === 'loading'
		? `<section class="notice"><div><strong>${escapeHtml(t('refreshingCatalogTitle'))}</strong><span>${escapeHtml(state.message)}</span></div></section>`
		: state.state === 'error'
			? `<section class="notice"><div><strong>${escapeHtml(t('catalogRefreshFailedTitle'))}</strong><span>${escapeHtml(state.message)}</span></div></section>`
			: '';
}

function getFilteredEmptyAction(state: ModuleSidebarRenderState): string | undefined {
	if (state.filterQuery.trim().length > 0) {
		return `<div class="action-toolbar"><button class="toolbar-button callout" data-action="clearFilter">${escapeHtml(t('clearFilter'))}</button></div>`;
	}
	if (scopeIncludesCatalog(state.scope) && !state.includeAppliedModules && state.appliedModuleKeys.size > 0) {
		return `<div class="action-toolbar"><button class="toolbar-button callout" data-action="setIncludeApplied" data-include-applied="true">${escapeHtml(t('includeAppliedModules'))}</button></div>`;
	}
	return undefined;
}

function renderWorkspaceEmptyState(state: ModuleSidebarRenderState): string {
	return renderEmptyState(
		state.moduleRoot
			? t('workspaceModulesEmptyTitle', { root: state.moduleRoot })
			: t('workspaceModulesTitle'),
		t('workspaceModulesEmptyBody'),
	);
}

function renderSectionChevron(): string {
	return '<svg class="section-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>';
}

/**
 * 渲染可折叠区域（issue #80）：标题栏整体可点击切换折叠/展开。
 * 折叠为纯显示层优化——不改变任何内部处理逻辑（搜索过滤、勾选状态、计数等均不受影响）。
 */
function renderListSection(title: string, meta: string | undefined, bodyHtml: string): string {
	if (!bodyHtml) {
		return '';
	}
	const header = `<button type="button" class="section-toggle" data-role="section-toggle" aria-expanded="true"><span class="section-title">${escapeHtml(title)}</span>${meta ? `<span class="section-meta">${meta}</span>` : ''}${renderSectionChevron()}</button>`;
	return `<section class="list-section" data-role="section">${header}<div class="list">${bodyHtml}</div></section>`;
}

function getWorkspaceSectionMeta(_state: ModuleSidebarRenderState, workspaceContent: WorkspaceContent): string | undefined {
	return escapeHtml(t('workspaceModulesSummary', {
		managed: workspaceContent.managed.length,
		unmanaged: workspaceContent.unmanaged.length,
	}));
}

function getCatalogSectionMeta(state: ModuleSidebarRenderState, catalogContent: CatalogContent): string | undefined {
	if (catalogContent.modules.length === 0) {
		return escapeHtml(t('toolbarMetaCatalog', { total: 0 }));
	}
	if (!state.signedIn) {
		return escapeHtml(t('toolbarMetaCatalog', { total: catalogContent.modules.length }));
	}
	const publicCount = catalogContent.modules.filter((entry) => entry.visibility === 'public').length;
	const privateCount = catalogContent.modules.length - publicCount;
	return escapeHtml(getVisibilityBreakdownText(publicCount, privateCount));
}

function renderContent(
	state: ModuleSidebarRenderState,
	workspaceContent: WorkspaceContent,
	catalogContent: CatalogContent,
): string {
	const statusBanner = renderCatalogStatusBanner(state);
	const totalScopedCount = workspaceContent.totalCount + catalogContent.totalCount;
	const totalVisibleCount = workspaceContent.filteredCount + catalogContent.filteredCount;

	if (state.scope === 'workspace' && totalScopedCount === 0) {
		return renderWorkspaceEmptyState(state);
	}

	if (totalScopedCount === 0) {
		return renderCatalogEmptyState(state);
	}

	if (totalVisibleCount === 0) {
		return `${statusBanner}${renderEmptyState(
			t('filterNoMatchesTitle'),
			t('filterNoMatchesBody'),
			getFilteredEmptyAction(state),
		)}`;
	}

	const workspaceCards = [
		...workspaceContent.managed.map((entry) => renderLocalManagedCard(entry, state)),
		...workspaceContent.unmanaged.map((entry) => renderLocalUnmanagedCard(entry, state)),
	].join('');
	const visibleCatalog = catalogContent.modules.slice(0, state.renderLimit);
	const catalogCards = visibleCatalog.map((entry) => renderModuleCard(entry, state)).join('');
	const hiddenCount = Math.max(0, catalogContent.filteredCount - visibleCatalog.length);
	const showMoreButton = hiddenCount > 0
		? `<section class="notice"><div><strong>${escapeHtml(t('hiddenModulesTitle', { count: hiddenCount }))}</strong><span>${escapeHtml(t('hiddenModulesBody'))}</span></div><button class="toolbar-button" data-action="showMore">${escapeHtml(t('showMore', { count: Math.min(hiddenCount, state.initialRenderLimit) }))}</button></section>`
		: '';
	const workspaceSection = renderListSection(
		t('moduleScopeWorkspace'),
		getWorkspaceSectionMeta(state, workspaceContent),
		workspaceCards,
	);
	// Show More 按钮放入在线区域内容末尾，折叠时随区域一起隐藏（issue #80）
	const catalogSection = renderListSection(
		t('moduleScopeCatalog'),
		getCatalogSectionMeta(state, catalogContent),
		`${catalogCards}${showMoreButton}`,
	);

	return `${statusBanner}<section class="list">${workspaceSection}${catalogSection}</section>${renderFilterEmptyState()}`;
}

function getLocalLabviewVersion(moduleKey: string, state: ModuleSidebarRenderState): string | undefined {
	const localEntry = state.managedModules.find((m) => m.moduleKey === moduleKey);
	return localEntry?.labviewVersion;
}

function formatShortSha(sha: string | undefined): string {
	if (!sha) {
		return t('versionUnknown');
	}
	return sha.length > 10 ? sha.slice(0, 7) : sha;
}

/**
 * 构建本地管理模块的当前版本展示文本（issue #37 / #90）：
 * tag / release 优先显示来源名称；branch 显示 分支名 · 短SHA · 提交信息 · 相对日期
 * （跟随本地实际 HEAD，提交后由刷新同步）；其余显示 短SHA · 提交信息 · 相对日期（读本地缓存）。
 */
function getLocalManagedVersionLabel(entry: LocalManagedModuleEntry): string {
	if (entry.versionKind === 'release') {
		// 显示 release 的 tag 名（不用标题）
		return entry.versionRef || entry.releaseName || formatShortSha(entry.ref);
	}
	if (entry.versionKind === 'tag' && entry.versionRef) {
		return entry.versionRef;
	}
	// branch 类型跟随本地实际 HEAD 展示（issue #90）：
	// 子模块通过其他 git 操作（提交 / pull / checkout）更新后，刷新时同步 ref 与提交信息
	if (entry.versionKind === 'branch') {
		const parts = [entry.versionRef || entry.branch || formatShortSha(undefined)];
		if (entry.ref) {
			parts.push(formatShortSha(entry.ref));
		}
		if (entry.commitInfo) {
			parts.push(truncate(entry.commitInfo, 40));
			const relative = formatRelativeDate(entry.commitDate);
			if (relative) {
				parts.push(relative);
			}
		}
		return parts.join(' · ');
	}
	const ref = formatShortSha(entry.ref);
	if (entry.commitInfo) {
		const parts = [ref, truncate(entry.commitInfo, 40)];
		const relative = formatRelativeDate(entry.commitDate);
		if (relative) {
			parts.push(relative);
		}
		return parts.join(' · ');
	}
	return ref;
}

/** 版本来源类型的中英文标签（第一行 hover 前缀，issue #93）。 */
function getVersionKindLabel(entry: LocalManagedModuleEntry): string {
	switch (entry.versionKind) {
		case 'tag':
			return t('versionKindLabelTag', { ref: entry.versionRef ?? formatShortSha(entry.ref) });
		case 'release':
			return t('versionKindLabelRelease', { ref: entry.versionRef ?? entry.releaseName ?? formatShortSha(entry.ref) });
		case 'branch':
			return t('versionKindLabelBranch', { ref: entry.versionRef ?? entry.branch ?? formatShortSha(entry.ref) });
		default:
			return t('versionKindLabelCommit');
	}
}

/**
 * 构建版本徽章的悬浮提示（issue #93）：
 * 第一行说明版本来源（tag / release / branch / commit），
 * 第二行展示 短SHA · 提交信息 · 相对日期（来自本地缓存，ref 匹配才填充）。
 */
function getLocalManagedVersionTooltip(entry: LocalManagedModuleEntry): string {
	const kindLabel = getVersionKindLabel(entry);
	if (!entry.commitInfo) {
		return `${kindLabel}\n${t('versionTooltipNoInfo')}`;
	}
	const parts = [formatShortSha(entry.ref), truncate(entry.commitInfo, 60)];
	const relative = formatRelativeDate(entry.commitDate);
	if (relative) {
		parts.push(relative);
	}
	return `${kindLabel}\n${parts.join(' · ')}`;
}

/** 引入方式徽章的悬浮提示（issue #92）。 */
function getApplyMethodTooltip(method: ModuleApplyMethod): string {
	switch (method) {
		case 'submodule':
			return t('badgeTooltipMethodSubmodule');
		case 'copy':
			return t('badgeTooltipMethodCopy');
		case 'release':
			return t('badgeTooltipMethodRelease');
		case 'local':
			return t('badgeTooltipMethodLocal');
	}
}

function renderModuleCard(entry: CsmModuleEntry, state: ModuleSidebarRenderState): string {
	const moduleKey = getModuleKey(entry);
	const selected = state.selectedModuleKeys.has(moduleKey);
	const applied = isModuleApplied(moduleKey, state);
	const stale = state.staleModuleKeys.has(moduleKey);
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const summary = entry.description.trim().length > 0 ? entry.description.trim() : t('noRepositoryDescription');
	const footerNote = applied && state.workspaceLabel
		? `<div class="card-footer-note">${escapeHtml(state.moduleRoot
			? t('recordedUnderRoot', { workspace: state.workspaceLabel, root: state.moduleRoot })
			: t('recordedForWorkspace', { workspace: state.workspaceLabel }))}${stale ? ` <span class="badge stale">${escapeHtml(t('staleDirectoryMissing'))}</span>` : ''}</div>`
		: '<span class="card-footer-spacer"></span>';
	const searchText = escapeHtml(getSearchText(entry, getLocalLabviewVersion(moduleKey, state)));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'moduleCard',
		moduleKey,
		moduleApplied: applied,
		moduleSelected: selected,
		moduleStarred: entry.starred === true,
		signedIn: state.signedIn,
		preventDefaultContextMenuItems: true,
	}));

	// 优先使用 GitHub topics 中的版本；若已应用到本地，则回退到本地检测的版本
	const labviewVersion = entry.labviewVersion ?? getLocalLabviewVersion(moduleKey, state);

	return renderModuleCardShell({
		articleClasses: [selected ? 'selected' : '', applied ? 'applied' : ''],
		dataRole: 'module-card',
		articleAttributes: `data-module-key="${escapeHtml(moduleKey)}" data-module-applied="${applied ? 'true' : 'false'}" data-module-selected="${selected ? 'true' : 'false'}" data-card-scope="catalog" data-search-text="${searchText}" data-vscode-context="${vscodeContext}"`,
		title: entry.name,
		titleDisplay: truncate(entry.name, 44),
		titleBadges: applied ? [renderBadge(t('appliedBadge'), 'applied', t('badgeTooltipApplied'))] : [],
		owner: `@${entry.owner}`,
		headerToolsHtml: renderModuleHeaderTools([
			`<label class="select-toolbar-item" title="${escapeHtml(t('selectModule'))}" aria-label="${escapeHtml(t('selectModule'))}"><input class="module-select" type="checkbox" data-role="select-toggle" data-action="toggleSelection" data-module-key="${escapeHtml(moduleKey)}" ${selected ? 'checked' : ''} aria-label="${escapeHtml(t('selectNamedModule', { name: entry.name }))}"></label>`,
			renderActionToolbar([
				renderStarButton(entry, moduleKey, state.signedIn),
				renderIconActionButton({
					action: 'openRepository',
					moduleKey,
					title: t('openOnGitHub'),
					icon: 'external',
				}),
				renderIconActionButton({
					action: 'openReadme',
					moduleKey,
					title: t('openReadme'),
					icon: 'readme',
				}),
			]),
		]),
		summary: truncate(summary, 132),
		footerHtml: footerNote,
		metaBadges: [
			...(labviewVersion ? [renderBadge(labviewVersion, 'lv-version', t('badgeTooltipLvVersion'))] : []),
			renderBadge(
				getVisibilityLabel(entry.visibility),
				entry.visibility === 'private' ? 'private' : undefined,
				entry.visibility === 'private' ? t('badgeTooltipPrivate') : undefined,
			),
			renderBadge(t('branchBadge', { branch: entry.defaultBranch }), undefined, t('badgeTooltipBranch')),
			...topics.map((topic) => renderBadge(topic)),
		],
	});
}

function renderEmptyState(title: string, message: string, actionHtml = ''): string {
	const actions = actionHtml ? `<div class="action-toolbar">${actionHtml}</div>` : '';
	return `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${actions}</section>`;
}

function renderSkeletonCard(): string {
	return `<article class="module-card skeleton"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div></article>`;
}