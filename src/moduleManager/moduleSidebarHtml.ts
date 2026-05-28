import * as crypto from 'crypto';
import { ModuleSortDirection, ModuleSortField, ModuleSortState } from './interfaces';
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
}

export interface ModuleSidebarRenderState extends LocalWorkspaceRenderState {
	filterQuery: string;
	includeAppliedModules: boolean;
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

function getToolbarMetaText(appliedCount: number, totalCount: number, filteredCount: number, selectedCount: number): string {
	const visibilityText = filteredCount === totalCount
		? t('toolbarMetaAvailable', { total: totalCount })
		: t('toolbarMetaShown', { filtered: filteredCount, total: totalCount });
	return t('toolbarMeta', {
		applied: appliedCount,
		visibility: visibilityText,
		selected: selectedCount,
	});
}

function getSignedInToolbarMetaText(
	appliedCount: number,
	filteredCount: number,
	selectedCount: number,
	publicCount: number,
	privateCount: number,
	totalCount: number,
): string {
	const visibilityText = filteredCount === totalCount
		? getVisibilityBreakdownText(publicCount, privateCount)
		: t('toolbarMetaShown', { filtered: filteredCount, total: totalCount });
	return t('toolbarMeta', {
		applied: appliedCount,
		visibility: visibilityText,
		selected: selectedCount,
	});
}

function getVisibilityBreakdownText(publicCount: number, privateCount: number): string {
	const segments: string[] = [];
	if (publicCount > 0 || privateCount === 0) {
		segments.push(`${publicCount} ${t('publicVisibility')}`);
	}
	if (privateCount > 0) {
		segments.push(`${privateCount} ${t('privateVisibility')}`);
	}
	return segments.join(' | ');
}

function getModuleKey(entry: CsmModuleEntry): string {
	return `${entry.owner}/${entry.name}`;
}

function getCatalogScopeSummaryText(state: ModuleSidebarRenderState): string | undefined {
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
		? `<section class="list local-list">${state.managedModules.map((entry) => renderLocalManagedCard(entry)).join('')}</section>`
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

function renderLocalManagedCard(entry: LocalManagedModuleEntry): string {
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const topicBadges = topics.map((topic) => `<span class="badge">${escapeHtml(topic)}</span>`).join('');
	const summary = entry.description.trim().length > 0
		? entry.description.trim()
		: t('localManagedFallbackSummary', { source: entry.source });
	return `<article class="module-card local-module-card managed" data-role="local-module-card"><div class="module-header"><div class="module-main"><div class="title-row"><span class="module-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncate(entry.name, 44))}</span><span class="badge applied">${escapeHtml(t('managedBadge'))}</span><span class="badge">${escapeHtml(getApplyMethodLabel(entry.method))}</span>${entry.stale ? `<span class="badge stale">${escapeHtml(t('staleDirectoryMissing'))}</span>` : ''}</div><div class="module-owner">@${escapeHtml(entry.owner)}</div></div><div class="local-card-actions"><button class="chip-button" data-action="openLocalReadme" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('openReadme'))}</button><button class="chip-button" data-action="updateLocalModule" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('updateAction'))}</button><button class="chip-button" data-action="removeLocalModule" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('removeAction'))}</button></div></div><div class="summary">${escapeHtml(truncate(summary, 132))}</div><div class="card-footer"><div class="card-footer-note">${escapeHtml(t('localFolderPathLabel', { path: entry.path }))}</div></div><div class="meta-row"><span class="badge ${entry.visibility === 'private' ? 'private' : ''}">${escapeHtml(getVisibilityLabel(entry.visibility))}</span><span class="badge">${escapeHtml(t('branchBadge', { branch: entry.branch }))}</span>${topicBadges}</div></article>`;
}

function renderLocalUnmanagedCard(entry: LocalUnmanagedFolderEntry, state: LocalWorkspaceRenderState): string {
	const actions = state.signedIn
		? `<div class="local-card-actions"><button class="chip-button callout" data-action="createLocalRepository" data-local-item-id="${escapeHtml(entry.id)}">${escapeHtml(t('createGithubRepository'))}</button></div>`
		: '';
	const hint = !state.signedIn
		? `<div class="local-card-hint">${escapeHtml(t('signInToCreateRepositoryHint'))}</div>`
		: '';
	return `<article class="module-card local-module-card unmanaged" data-role="local-module-card"><div class="module-header"><div class="module-main"><div class="title-row"><span class="module-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncate(entry.name, 44))}</span><span class="badge">${escapeHtml(t('unmanagedBadge'))}</span></div><div class="module-owner">${escapeHtml(entry.path)}</div></div>${actions}</div><div class="summary">${escapeHtml(t('localUnmanagedSummary'))}</div>${hint}</article>`;
}

type IconName = 'close' | 'filter' | 'readme' | 'search';

function renderIcon(name: IconName): string {
	switch (name) {
		case 'close':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8"></path><path d="M12 4l-8 8"></path></svg>';
		case 'filter':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11"></path><path d="M4.75 8h6.5"></path><path d="M6.75 12h2.5"></path></svg>';
		case 'readme':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2.5h4.5a2 2 0 0 1 2 2V13a2 2 0 0 0-2-2H3z"></path><path d="M13 2.5H8.5a2 2 0 0 0-2 2V13a2 2 0 0 1 2-2H13z"></path></svg>';
		case 'search':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5L14 14"></path></svg>';
	}
}

function renderStarIcon(filled: boolean): string {
	return `<svg viewBox="0 0 16 16" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.1l1.67 3.38 3.73.54-2.7 2.63.64 3.72L8 10.62 4.66 12.37l.64-3.72-2.7-2.63 3.73-.54L8 2.1z"></path></svg>`;
}

function getBaseVisibleModules(state: ModuleSidebarRenderState): CsmModuleEntry[] {
	if (state.includeAppliedModules) {
		return state.modules;
	}
	return state.modules.filter((entry) => !isModuleApplied(getModuleKey(entry), state));
}

function getFilteredModules(state: ModuleSidebarRenderState): CsmModuleEntry[] {
	const modules = getBaseVisibleModules(state);
	const normalizedQuery = state.filterQuery.trim().toLowerCase();
	if (!normalizedQuery) {
		return getSortedModules(modules, state);
	}
	return getSortedModules(
		modules.filter((entry) => getSearchText(entry).includes(normalizedQuery)),
		state,
	);
}

function getToolbarFilteredCount(state: ModuleSidebarRenderState): number {
	return state.filterQuery.trim().length > 0
		? getFilteredModules(state).length
		: state.modules.length;
}

function getSortedModules(modules: CsmModuleEntry[], state: ModuleSidebarRenderState): CsmModuleEntry[] {
	return sortModules(modules, state.sortState, {
		appliedModuleKeys: state.appliedModuleKeys,
	});
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
	const selectedCount = state.selectedModuleKeys.size;
	const moduleCount = state.modules.length;
	const publicCount = state.modules.filter((entry) => entry.visibility === 'public').length;
	const privateCount = moduleCount - publicCount;
	const filteredCount = getToolbarFilteredCount(state);
	const appliedCount = state.appliedModuleKeys.size;
	const toolbarMetaText = state.signedIn
		? getSignedInToolbarMetaText(appliedCount, filteredCount, selectedCount, publicCount, privateCount, moduleCount)
		: getToolbarMetaText(appliedCount, moduleCount, filteredCount, selectedCount);
	const catalogScopeSummaryText = getCatalogScopeSummaryText(state);
	const filterButtonTitle = getFilterButtonTitle(state.sortState);
	const sortFieldOptions: Array<{ value: ModuleSortField; label: string }> = [
		{ value: 'name', label: t('sortFieldName') },
		{ value: 'owner', label: t('sortFieldOwner') },
		{ value: 'updatedAt', label: t('sortFieldUpdated') },
		{ value: 'applied', label: t('sortFieldApplied') },
	];
	const sortDirectionOptions: Array<{ value: ModuleSortDirection; label: string }> = [
		{ value: 'asc', label: t('sortDirectionAsc') },
		{ value: 'desc', label: t('sortDirectionDesc') },
	];
	const content = renderContent(state);
	const clientStrings = JSON.stringify({
		toolbarMetaAvailable: t('toolbarMetaAvailable'),
		toolbarMetaShown: t('toolbarMetaShown'),
		toolbarMeta: t('toolbarMeta'),
		publicVisibility: t('publicVisibility'),
		privateVisibility: t('privateVisibility'),
		includeAppliedModules: t('includeAppliedModules'),
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
			<span class="toolbar-meta" data-role="toolbar-meta" data-applied-count="${appliedCount}" data-total-count="${moduleCount}" data-filtered-count="${filteredCount}" data-public-count="${publicCount}" data-private-count="${privateCount}" data-signed-in="${state.signedIn ? 'true' : 'false'}">${toolbarMetaText}</span>
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

		function getToolbarMetaText(appliedCount, totalCount, filteredCount, selectedCount) {
			const visibilityText = filteredCount === totalCount
				? formatMessage(uiStrings.toolbarMetaAvailable, { total: totalCount })
				: formatMessage(uiStrings.toolbarMetaShown, { filtered: filteredCount, total: totalCount });
			return formatMessage(uiStrings.toolbarMeta, {
				applied: appliedCount,
				visibility: visibilityText,
				selected: selectedCount,
			});
		}

		function getVisibilityBreakdownText(publicCount, privateCount) {
			const segments = [];
			if (publicCount > 0 || privateCount === 0) {
				segments.push(String(publicCount) + ' ' + uiStrings.publicVisibility);
			}
			if (privateCount > 0) {
				segments.push(String(privateCount) + ' ' + uiStrings.privateVisibility);
			}
			return segments.join(' | ');
		}

		function getSignedInToolbarMetaText(appliedCount, totalCount, filteredCount, selectedCount, publicCount, privateCount) {
			const visibilityText = filteredCount === totalCount
				? getVisibilityBreakdownText(publicCount, privateCount)
				: formatMessage(uiStrings.toolbarMetaShown, { filtered: filteredCount, total: totalCount });
			return formatMessage(uiStrings.toolbarMeta, {
				applied: appliedCount,
				visibility: visibilityText,
				selected: selectedCount,
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
			return Array.from(document.querySelectorAll('[data-role="module-card"]'));
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
			const appliedCount = Number(toolbarMeta.getAttribute('data-applied-count') || '0');
			const totalCount = Number(toolbarMeta.getAttribute('data-total-count') || '0');
			const publicCount = Number(toolbarMeta.getAttribute('data-public-count') || '0');
			const privateCount = Number(toolbarMeta.getAttribute('data-private-count') || '0');
			const signedIn = toolbarMeta.getAttribute('data-signed-in') === 'true';
			const hasQuery = filterInput instanceof HTMLInputElement && filterInput.value.trim().length > 0;
			const filteredCount = hasQuery
				? getCards().filter((card) => !card.hasAttribute('hidden')).length
				: totalCount;
			const selectedCount = document.querySelectorAll('[data-role="select-toggle"]:checked').length;
			toolbarMeta.setAttribute('data-filtered-count', String(filteredCount));
			toolbarMeta.textContent = signedIn
				? getSignedInToolbarMetaText(appliedCount, totalCount, filteredCount, selectedCount, publicCount, privateCount)
				: getToolbarMetaText(appliedCount, totalCount, filteredCount, selectedCount);
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
	<title>${escapeHtml(t('workspaceModulesTitle'))}</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: light dark;
			--module-font-xs: 11px;
			--module-font-sm: 12px;
			--module-font-md: 13px;
			--module-font-lg: 15px;
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

function renderContent(state: ModuleSidebarRenderState): string {
	return renderCatalogContent(state);
}

function renderCatalogContent(state: ModuleSidebarRenderState): string {
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

	if (state.modules.length === 0) {
		return renderEmptyState(
			t('noModulesFoundTitle'),
			state.message,
		);
	}

	const statusBanner = state.state === 'loading'
		? `<section class="notice"><div><strong>${escapeHtml(t('refreshingCatalogTitle'))}</strong><span>${escapeHtml(state.message)}</span></div></section>`
		: state.state === 'error'
			? `<section class="notice"><div><strong>${escapeHtml(t('catalogRefreshFailedTitle'))}</strong><span>${escapeHtml(state.message)}</span></div></section>`
			: '';

	const sortedAll = getFilteredModules(state);
	if (sortedAll.length === 0) {
		const emptyAction = state.filterQuery.trim().length > 0
			? `<div class="action-toolbar"><button class="toolbar-button callout" data-action="clearFilter">${escapeHtml(t('clearFilter'))}</button></div>`
			: !state.includeAppliedModules && state.appliedModuleKeys.size > 0
				? `<div class="action-toolbar"><button class="toolbar-button callout" data-action="setIncludeApplied" data-include-applied="true">${escapeHtml(t('includeAppliedModules'))}</button></div>`
				: undefined;
		return `${statusBanner}${renderEmptyState(
			t('filterNoMatchesTitle'),
			t('filterNoMatchesBody'),
			emptyAction,
		)}`;
	}
	const total = sortedAll.length;
	const visible = sortedAll.slice(0, state.renderLimit);
	const hiddenCount = Math.max(0, total - visible.length);
	const showMoreButton = hiddenCount > 0
		? `<section class="notice"><div><strong>${escapeHtml(t('hiddenModulesTitle', { count: hiddenCount }))}</strong><span>${escapeHtml(t('hiddenModulesBody'))}</span></div><button class="toolbar-button" data-action="showMore">${escapeHtml(t('showMore', { count: Math.min(hiddenCount, state.initialRenderLimit) }))}</button></section>`
		: '';

	return `${statusBanner}<section class="list">${visible.map((entry) => renderModuleCard(entry, state)).join('')}</section>${showMoreButton}<section class="empty-state" data-role="filter-empty" hidden><h2>${escapeHtml(t('filterNoMatchesTitle'))}</h2><p>${escapeHtml(t('filterNoMatchesBody'))}</p><div class="action-toolbar"><button class="toolbar-button callout" data-action="clearFilter">${escapeHtml(t('clearFilter'))}</button></div></section>`;
}

function renderModuleCard(entry: CsmModuleEntry, state: ModuleSidebarRenderState): string {
	const moduleKey = getModuleKey(entry);
	const selected = state.selectedModuleKeys.has(moduleKey);
	const applied = isModuleApplied(moduleKey, state);
	const previewOpen = state.previewState?.moduleKey === moduleKey;
	const stale = state.staleModuleKeys.has(moduleKey);
	const topics = getVisibleModuleTopics(entry.topics).slice(0, 3);
	const topicBadges = topics.map((topic) => `<span class="badge">${escapeHtml(topic)}</span>`).join('');
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

	return `<article class="module-card${selected ? ' selected' : ''}${applied ? ' applied' : ''}" data-role="module-card" data-module-key="${escapeHtml(moduleKey)}" data-module-applied="${applied ? 'true' : 'false'}" data-module-selected="${selected ? 'true' : 'false'}" data-search-text="${searchText}" data-vscode-context="${vscodeContext}">
			<div class="module-header">
				<div class="module-main module-preview-trigger" data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}" tabindex="0" role="button" aria-expanded="${previewOpen ? 'true' : 'false'}" aria-label="${escapeHtml(t('toggleReadmePreviewAria', { name: entry.name }))}">
					<div class="title-row">
						<span class="module-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncate(entry.name, 44))}</span>
						${applied ? `<span class="badge applied">${escapeHtml(t('appliedBadge'))}</span>` : ''}
					</div>
					<div class="module-owner">@${escapeHtml(entry.owner)}</div>
				</div>
				<div class="module-header-tools">
					<label class="select-toolbar-item" title="${escapeHtml(t('selectModule'))}" aria-label="${escapeHtml(t('selectModule'))}">
						<input class="module-select" type="checkbox" data-role="select-toggle" data-action="toggleSelection" data-module-key="${escapeHtml(moduleKey)}" ${selected ? 'checked' : ''} aria-label="${escapeHtml(t('selectNamedModule', { name: entry.name }))}">
					</label>
					<div class="action-toolbar">
							${renderStarButton(entry, moduleKey, state.signedIn)}
						<button class="icon-button" data-action="openReadme" data-module-key="${escapeHtml(moduleKey)}" title="${escapeHtml(t('openReadme'))}" aria-label="${escapeHtml(t('openReadme'))}">${renderIcon('readme')}</button>
					</div>
				</div>
			</div>
			<div class="summary module-preview-trigger" data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}">${escapeHtml(truncate(summary, 132))}</div>
			<div class="card-footer module-preview-trigger" data-action="togglePreview" data-module-key="${escapeHtml(moduleKey)}">
				${footerNote}
			</div>
			${preview}
			<div class="meta-row">
				<span class="badge ${entry.visibility === 'private' ? 'private' : ''}">${escapeHtml(getVisibilityLabel(entry.visibility))}</span>
				<span class="badge">${escapeHtml(t('branchBadge', { branch: entry.defaultBranch }))}</span>
				${topicBadges}
			</div>
		</article>`;
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