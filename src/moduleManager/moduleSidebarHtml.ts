import * as crypto from 'crypto';
import { ModuleListScope, ModuleSortDirection, ModuleSortField, ModuleSortState } from './interfaces';
import { getApplyMethodLabel, getHtmlLang, getVisibilityLabel, t } from './messages';
import { ViewState } from './moduleTreeDataProvider';
import { sortModules } from './sort';
import { getVisibleModuleTopics } from './topics';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from './types';

export type ReadmePreviewState = {
	moduleKey: string;
	title: string;
	status: 'loading' | 'ready' | 'error';
	html?: string;
	message?: string;
};

export interface LocalWorkspaceRenderState {
	signedIn: boolean;
	canInitializeWorkspace: boolean;
	managedModules: LocalManagedModuleEntry[];
	unmanagedFolders: LocalUnmanagedFolderEntry[];
	workspaceLabel?: string;
	moduleRoot?: string;
	gitAvailable: boolean;
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
	previewState?: ReadmePreviewState;
	renderLimit: number;
	initialRenderLimit: number;
	webviewCspSource?: string;
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength - 3)}...`;
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
		...getVisibleModuleTopics(entry.topics),
	].join(' ').toLowerCase();
}

function getLocalUnmanagedSearchText(entry: LocalUnmanagedFolderEntry): string {
	return [
		entry.name,
		entry.path,
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
			baseModules.filter((entry) => matchesFilterQuery(getSearchText(entry), query)),
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

function renderBadge(label: string, variant?: string): string {
	return `<span class="badge${variant ? ` ${escapeHtml(variant)}` : ''}">${escapeHtml(label)}</span>`;
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

	return `<article class="${joinClassNames('module-card', ...(options.articleClasses ?? []))}" data-role="${escapeHtml(options.dataRole)}"${articleAttributes}><div class="module-header"><div class="${joinClassNames('module-main', ...(options.mainClasses ?? []))}"${mainAttributes}><div class="title-row"><span class="module-name" title="${escapeHtml(options.title)}">${escapeHtml(options.titleDisplay ?? options.title)}</span>${titleBadges}</div><div class="module-owner">${escapeHtml(options.owner)}</div></div>${options.headerToolsHtml ?? ''}</div><div class="${joinClassNames('summary', ...(options.summaryClasses ?? []))}"${summaryAttributes}>${escapeHtml(options.summary)}</div>${footer}${options.bodyExtrasHtml ?? ''}${metaRow}</article>`;
}

function renderLocalManagedCard(entry: LocalManagedModuleEntry, state: LocalWorkspaceRenderState): string {
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const topicBadges = topics.map((topic) => renderBadge(topic));
	const locked = entry.locked !== false;
	const nextMethod = entry.method === 'copy' ? 'submodule' : 'copy';
	const summary = entry.description.trim().length > 0
		? entry.description.trim()
		: t('localManagedFallbackSummary', { source: entry.source });
	const searchText = escapeHtml(getLocalManagedSearchText(entry));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'workspaceCard',
		workspaceCardKind: 'managed',
		localItemId: entry.id,
		moduleKey: entry.moduleKey,
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
		renderIconActionButton({
			action: 'switchLocalModuleMethod',
			localItemId: entry.id,
			title: state.gitAvailable
				? t('switchMethodToTarget', { method: getApplyMethodLabel(nextMethod) })
				: t('switchMethodRequiresGitRepo'),
			icon: 'switch',
			disabled: !state.gitAvailable,
		}),
		renderIconActionButton({
			action: 'removeLocalModule',
			localItemId: entry.id,
			title: t('removeAction'),
			icon: 'remove',
		}),
	]);
	const metaBadges = [
		renderBadge(t('managedBadge'), 'applied'),
		renderBadge(locked ? t('lockedBadge') : t('unlockedBadge')),
		renderBadge(getApplyMethodLabel(entry.method), entry.method),
		...(entry.stale ? [renderBadge(t('staleDirectoryMissing'), 'stale')] : []),
		renderBadge(getVisibilityLabel(entry.visibility), entry.visibility === 'private' ? 'private' : undefined),
		renderBadge(t('branchBadge', { branch: entry.branch })),
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

function renderLocalUnmanagedCard(entry: LocalUnmanagedFolderEntry, state: LocalWorkspaceRenderState): string {
	const canLinkRepository = hasAvailableOnlineRepositories(state);
	const linkButton = `<button class="chip-button" data-action="linkLocalRepository" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('linkGithubRepository'))}</button>`;
	const createButton = state.signedIn
		? `<button class="chip-button callout" data-action="createLocalRepository" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('createGithubRepository'))}</button>`
		: '';
	const actions = `<div class="local-card-actions">${linkButton}${createButton}</div>`;
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
		metaBadges: [renderBadge(t('unmanagedBadge'))],
	});
}

type IconName = 'close' | 'filter' | 'folder' | 'readme' | 'search' | 'update' | 'remove' | 'switch' | 'lock' | 'unlock';

function renderIconActionButton(options: { action: string; title: string; icon: IconName; moduleKey?: string; localItemId?: string; disabled?: boolean }): string {
	const moduleKeyAttribute = options.moduleKey ? ` data-module-key="${escapeHtml(options.moduleKey)}"` : '';
	const localItemIdAttribute = options.localItemId ? ` data-local-item-id="${escapeHtml(options.localItemId)}"` : '';
	const disabledAttribute = options.disabled ? ' disabled aria-disabled="true"' : '';
	return `<button class="icon-button" data-action="${escapeHtml(options.action)}"${moduleKeyAttribute}${localItemIdAttribute} title="${escapeHtml(options.title)}" aria-label="${escapeHtml(options.title)}"${disabledAttribute}>${renderIcon(options.icon)}</button>`;
}

function renderIcon(name: IconName): string {
	switch (name) {
		case 'close':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8"></path><path d="M12 4l-8 8"></path></svg>';
		case 'filter':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11"></path><path d="M4.75 8h6.5"></path><path d="M6.75 12h2.5"></path></svg>';
		case 'folder':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V6a1.5 1.5 0 0 0-1.5-1.5H8L6.5 3H3.5A1.5 1.5 0 0 0 2 4.5z"></path></svg>';
		case 'readme':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2.5h4.5a2 2 0 0 1 2 2V13a2 2 0 0 0-2-2H3z"></path><path d="M13 2.5H8.5a2 2 0 0 0-2 2V13a2 2 0 0 1 2-2H13z"></path></svg>';
		case 'search':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5L14 14"></path></svg>';
		case 'update':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6V3h-3"></path><path d="M13 3 9.75 6.25"></path><path d="M12 8.5a4.5 4.5 0 1 1-1.6-3.45"></path></svg>';
		case 'remove':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 4.5h9"></path><path d="M6 4.5v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"></path><path d="M5 6.5v5"></path><path d="M8 6.5v5"></path><path d="M11 6.5v5"></path><path d="M4.5 4.5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5"></path></svg>';
		case 'switch':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h8"></path><path d="M9.5 2.5 12 5 9.5 7.5"></path><path d="M13 11H5"></path><path d="M6.5 8.5 4 11l2.5 2.5"></path></svg>';
		case 'lock':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"></rect><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7"></path></svg>';
		case 'unlock':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"></rect><path d="M10.5 7V5.5a2.5 2.5 0 0 0-4.88-.88"></path></svg>';
	}
}

function renderStarIcon(filled: boolean): string {
	return `<svg viewBox="0 0 16 16" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.1l1.67 3.38 3.73.54-2.7 2.63.64 3.72L8 10.62 4.66 12.37l.64-3.72-2.7-2.63 3.73-.54L8 2.1z"></path></svg>`;
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

function getSearchText(entry: CsmModuleEntry): string {
	return [
		entry.name,
		entry.owner,
		entry.description,
		entry.defaultBranch,
		entry.visibility,
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
			--module-icon-size: 16px;
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
		.module-preview-trigger {
			cursor: pointer;
			border-radius: 4px;
		}
		.module-preview-trigger:focus-visible {
			outline: 1px solid var(--vscode-focusBorder, var(--vscode-textLink-foreground));
			outline-offset: 2px;
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
		.summary.module-preview-trigger:hover,
		.module-main.module-preview-trigger:hover .module-name {
			color: var(--vscode-foreground);
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
			border-radius: 10px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			color: var(--vscode-descriptionForeground);
			background: transparent;
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
		.badge.copy {
			border-color: rgba(14, 99, 156, 0.5);
			color: var(--vscode-terminal-ansiBlue, #0e639c);
		}
		.badge.submodule {
			border-color: rgba(188, 63, 188, 0.4);
			color: var(--vscode-terminal-ansiMagenta, #bc3fbc);
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
		.readme-preview {
			margin-top: 8px;
			padding-top: 8px;
			border-top: 1px solid var(--vscode-panel-border);
			display: grid;
			gap: 8px;
		}
		.readme-preview-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			font-size: var(--module-font-xs);
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.readme-preview-body {
			max-height: 280px;
			overflow: auto;
			padding-right: 4px;
			font-size: var(--module-font-sm);
			line-height: 1.55;
			color: var(--vscode-foreground);
		}
		.readme-preview-body > :first-child {
			margin-top: 0;
		}
		.readme-preview-body > :last-child {
			margin-bottom: 0;
		}
		.readme-preview-body h1,
		.readme-preview-body h2,
		.readme-preview-body h3,
		.readme-preview-body h4,
		.readme-preview-body h5,
		.readme-preview-body h6 {
			margin: 1.1em 0 0.5em;
			font-size: var(--module-font-md);
		}
		.readme-preview-body p,
		.readme-preview-body ul,
		.readme-preview-body ol,
		.readme-preview-body pre,
		.readme-preview-body blockquote {
			margin: 0 0 8px;
		}
		.readme-preview-body ul,
		.readme-preview-body ol {
			padding-left: 1.25em;
		}
		.readme-preview-body a {
			color: var(--vscode-textLink-foreground);
		}
		.readme-preview-body code,
		.readme-preview-body pre {
			background: var(--vscode-textCodeBlock-background, rgba(110, 118, 129, 0.18));
			border-radius: 6px;
		}
		.readme-preview-body code {
			padding: 0.1rem 0.3rem;
		}
		.readme-preview-body pre {
			padding: 10px;
			overflow: auto;
		}
		.readme-preview-body img {
			max-width: 100%;
			height: auto;
			border-radius: 6px;
		}
		.readme-preview-status {
			font-size: var(--module-font-sm);
			color: var(--vscode-descriptionForeground);
		}
		.readme-preview-error {
			color: var(--vscode-errorForeground, var(--vscode-foreground));
		}
		.readme-preview-loading {
			display: grid;
			gap: 8px;
		}
		.action-toolbar {
			display: flex;
			align-items: center;
			gap: 2px;
		}
		.local-card-actions {
			display: flex;
			align-items: center;
			gap: 6px;
			flex-wrap: wrap;
		}
		.local-card-hint {
			margin-top: 6px;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.chip-button {
			height: 24px;
			padding: 0 8px;
			border-radius: 999px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			background: transparent;
			color: var(--vscode-descriptionForeground);
		}
		.chip-button.callout {
			color: var(--vscode-foreground);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
		}
		.chip-button:hover:not(:disabled) {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
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
		}
		.skeleton-line {
			height: 10px;
			border-radius: 999px;
			background: rgba(127, 127, 127, 0.28);
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
			${catalogScopeSummaryText || (state.workspaceLabel && state.moduleRoot)
			? `<div class="workspace-summary">${catalogScopeSummaryText ? `<span>${escapeHtml(catalogScopeSummaryText)}</span>` : ''}${state.workspaceLabel && state.moduleRoot ? `<span>${escapeHtml(t('rootLabel'))}: ${escapeHtml(state.moduleRoot)}/</span>` : ''}</div>`
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
			const previewTarget = event.target instanceof HTMLElement ? event.target.closest('[data-action="togglePreview"]') : null;
			if ((event.key === 'Enter' || event.key === ' ') && previewTarget instanceof HTMLElement) {
				event.preventDefault();
				vscode.postMessage({
					type: 'togglePreview',
					moduleKey: previewTarget.getAttribute('data-module-key') || undefined,
				});
				return;
			}
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
			--module-icon-size: 16px;
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
			border-radius: 10px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			color: var(--vscode-descriptionForeground);
			background: transparent;
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
		.badge.copy {
			border-color: rgba(14, 99, 156, 0.5);
			color: var(--vscode-terminal-ansiBlue, #0e639c);
		}
		.badge.submodule {
			border-color: rgba(188, 63, 188, 0.4);
			color: var(--vscode-terminal-ansiMagenta, #bc3fbc);
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
			width: var(--module-icon-size, 16px);
			height: var(--module-icon-size, 16px);
		}
		.icon-button[disabled] {
			opacity: 0.5;
			cursor: default;
		}
		.local-card-actions {
			display: flex;
			align-items: center;
			gap: 6px;
			flex-wrap: wrap;
		}
		.local-card-hint {
			margin-top: 6px;
			font-size: var(--module-font-xs);
			line-height: 1.4;
			color: var(--vscode-descriptionForeground);
		}
		.chip-button {
			height: 24px;
			padding: 0 8px;
			border-radius: 999px;
			font-size: var(--module-font-xs);
			border: 1px solid var(--vscode-panel-border);
			background: transparent;
			color: var(--vscode-descriptionForeground);
		}
		.chip-button.callout {
			color: var(--vscode-foreground);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
		}
		.chip-button:hover:not(:disabled) {
			background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
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
		return `<section class="list">${[1, 2, 3].map(() => renderSkeletonCard()).join('')}</section>`;
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

function renderListSection(title: string, meta: string | undefined, bodyHtml: string): string {
	if (!bodyHtml) {
		return '';
	}
	const header = `<div class="section-header"><div class="section-title">${escapeHtml(title)}</div>${meta ? `<div class="section-meta">${meta}</div>` : ''}</div>`;
	return `<section class="list-section">${header}<div class="list">${bodyHtml}</div></section>`;
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
	const catalogSection = renderListSection(
		t('moduleScopeCatalog'),
		getCatalogSectionMeta(state, catalogContent),
		catalogCards,
	);

	return `${statusBanner}<section class="list">${workspaceSection}${catalogSection}</section>${showMoreButton}${renderFilterEmptyState()}`;
}

function renderModuleCard(entry: CsmModuleEntry, state: ModuleSidebarRenderState): string {
	const moduleKey = getModuleKey(entry);
	const selected = state.selectedModuleKeys.has(moduleKey);
	const applied = isModuleApplied(moduleKey, state);
	const previewOpen = state.previewState?.moduleKey === moduleKey;
	const stale = state.staleModuleKeys.has(moduleKey);
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const summary = entry.description.trim().length > 0 ? entry.description.trim() : t('noRepositoryDescription');
	const footerNote = applied && state.workspaceLabel
		? `<div class="card-footer-note">${escapeHtml(state.moduleRoot
			? t('recordedUnderRoot', { workspace: state.workspaceLabel, root: state.moduleRoot })
			: t('recordedForWorkspace', { workspace: state.workspaceLabel }))}${stale ? ` <span class="badge stale">${escapeHtml(t('staleDirectoryMissing'))}</span>` : ''}</div>`
		: '<span class="card-footer-spacer"></span>';
	const searchText = escapeHtml(getSearchText(entry));
	const vscodeContext = escapeHtml(JSON.stringify({
		webviewSection: 'moduleCard',
		moduleKey,
		moduleApplied: applied,
		moduleSelected: selected,
		preventDefaultContextMenuItems: true,
	}));
	const preview = previewOpen ? renderReadmePreview(moduleKey, state.previewState) : '';

	return renderModuleCardShell({
		articleClasses: [selected ? 'selected' : '', applied ? 'applied' : ''],
		dataRole: 'module-card',
		articleAttributes: `data-module-key="${escapeHtml(moduleKey)}" data-module-applied="${applied ? 'true' : 'false'}" data-module-selected="${selected ? 'true' : 'false'}" data-card-scope="catalog" data-search-text="${searchText}" data-vscode-context="${vscodeContext}"`,
		title: entry.name,
		titleDisplay: truncate(entry.name, 44),
		titleBadges: applied ? [renderBadge(t('appliedBadge'), 'applied')] : [],
		owner: `@${entry.owner}`,
		mainClasses: ['module-preview-trigger'],
		mainAttributes: `data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}" tabindex="0" role="button" aria-expanded="${previewOpen ? 'true' : 'false'}" aria-label="${escapeHtml(t('toggleReadmePreviewAria', { name: entry.name }))}"`,
		headerToolsHtml: renderModuleHeaderTools([
			`<label class="select-toolbar-item" title="${escapeHtml(t('selectModule'))}" aria-label="${escapeHtml(t('selectModule'))}"><input class="module-select" type="checkbox" data-role="select-toggle" data-action="toggleSelection" data-module-key="${escapeHtml(moduleKey)}" ${selected ? 'checked' : ''} aria-label="${escapeHtml(t('selectNamedModule', { name: entry.name }))}"></label>`,
			renderActionToolbar([
				renderStarButton(entry, moduleKey, state.signedIn),
				renderIconActionButton({
					action: 'openReadme',
					moduleKey,
					title: t('openReadme'),
					icon: 'readme',
				}),
			]),
		]),
		summary: truncate(summary, 132),
		summaryClasses: ['module-preview-trigger'],
		summaryAttributes: `data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}"`,
		footerHtml: footerNote,
		footerClasses: ['module-preview-trigger'],
		footerAttributes: `data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}"`,
		bodyExtrasHtml: preview,
		metaBadges: [
			renderBadge(getVisibilityLabel(entry.visibility), entry.visibility === 'private' ? 'private' : undefined),
			renderBadge(t('branchBadge', { branch: entry.defaultBranch })),
			...topics.map((topic) => renderBadge(topic)),
		],
	});
}

function renderReadmePreview(moduleKey: string, previewState: ReadmePreviewState | undefined): string {
	if (!previewState || previewState.moduleKey !== moduleKey) {
		return '';
	}
	const title = escapeHtml(previewState.title);
	if (previewState.status === 'loading') {
		return `<section class="readme-preview" data-role="readme-preview"><div class="readme-preview-header"><span>${escapeHtml(t('readmePreviewTitle'))}</span><span>${title}</span></div><div class="readme-preview-loading"><div class="skeleton-line medium"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></section>`;
	}
	if (previewState.status === 'error') {
		return `<section class="readme-preview" data-role="readme-preview"><div class="readme-preview-header"><span>${escapeHtml(t('readmePreviewTitle'))}</span><span>${title}</span></div><div class="readme-preview-status readme-preview-error">${escapeHtml(previewState.message ?? t('unableToLoadReadmePreview'))}</div></section>`;
	}
	return `<section class="readme-preview" data-role="readme-preview"><div class="readme-preview-header"><span>${escapeHtml(t('readmePreviewTitle'))}</span><span>${title}</span></div><div class="readme-preview-body">${previewState.html ?? ''}</div></section>`;
}

function renderEmptyState(title: string, message: string, actionHtml = ''): string {
	const actions = actionHtml ? `<div class="action-toolbar">${actionHtml}</div>` : '';
	return `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${actions}</section>`;
}

function renderSkeletonCard(): string {
	return `<article class="module-card skeleton"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div></article>`;
}