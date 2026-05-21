import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { CsmModuleEntry } from './types';
import { ViewState } from './moduleTreeDataProvider';
import { IModuleViewProvider, ModuleSortDirection, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
import { DEFAULT_MODULE_SORT_STATE, isModuleSortDirection, isModuleSortField, normalizeModuleSortState, sortModules } from './sort';

interface ModuleSidebarActions {
	onLogin: () => void;
	onRefresh: () => void;
	onInitializeWorkspace: () => void;
	onOpenReadme: (entry: CsmModuleEntry) => void;
	onApplySelection: (entry?: CsmModuleEntry) => void;
	onRemoveModule: (entry: CsmModuleEntry) => void;
	onUpdateModule: (entry: CsmModuleEntry) => void;
	onSelectionChange: (moduleKeys: string[]) => void;
	onSortChange: (sortState: Partial<ModuleSortState>) => void;
}

type WebviewMessage = {
	type: 'login' | 'refresh' | 'initializeWorkspace' | 'applySelected' | 'openReadme' | 'applyOne' | 'toggleSelection' | 'setFilterQuery' | 'clearFilter' | 'dismissIntroTip' | 'removeModule' | 'updateModule' | 'setSortField' | 'setSortDirection' | 'showMore';
	moduleKey?: string;
	selected?: boolean;
	query?: string;
	sortField?: ModuleSortField;
	sortDirection?: ModuleSortDirection;
};

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

function getToolbarMetaText(totalCount: number, filteredCount: number, selectedCount: number): string {
	const visibilityText = filteredCount === totalCount ? `${totalCount} available` : `${filteredCount} of ${totalCount} shown`;
	return `${visibilityText} | ${selectedCount} selected`;
}

type IconName = 'close' | 'readme' | 'refresh' | 'search' | 'sortAsc' | 'sortDesc';

function renderIcon(name: IconName): string {
	switch (name) {
		case 'close':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8"></path><path d="M12 4l-8 8"></path></svg>';
		case 'readme':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2.5h4.5a2 2 0 0 1 2 2V13a2 2 0 0 0-2-2H3z"></path><path d="M13 2.5H8.5a2 2 0 0 0-2 2V13a2 2 0 0 1 2-2H13z"></path></svg>';
		case 'refresh':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2.5v3.5H9.5"></path><path d="M13 6A5.5 5.5 0 1 0 14 8"></path></svg>';
		case 'search':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5L14 14"></path></svg>';
		case 'sortAsc':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5V3.5"></path><path d="M3.5 5.5l2-2 2 2"></path><path d="M9 4.5h3.5"></path><path d="M9 8h2.5"></path><path d="M9 11.5h1.5"></path></svg>';
		case 'sortDesc':
			return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 3.5v9"></path><path d="M3.5 10.5l2 2 2-2"></path><path d="M9 4.5h1.5"></path><path d="M9 8h2.5"></path><path d="M9 11.5h3.5"></path></svg>';
	}
}

export class ModuleSidebarViewProvider implements vscode.WebviewViewProvider, IModuleViewProvider {
	private view: vscode.WebviewView | undefined;
	private modules: CsmModuleEntry[] = [];
	private state: ViewState = 'loading';
	private message = 'Loading modules...';
	private signedIn = false;
	private canInitializeWorkspace = false;
	private readonly selectedModuleKeys = new Set<string>();
	private readonly appliedModuleKeys = new Set<string>();
	private workspaceLabel: string | undefined;
	private moduleRoot: string | undefined;
	private filterQuery = '';
	private introTipVisible = true;
	private offlineMode = false;
	private sortState: ModuleSortState = DEFAULT_MODULE_SORT_STATE;
	private readonly staleModuleKeys = new Set<string>();
	private static readonly INITIAL_RENDER_LIMIT = 100;
	private renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;

	constructor(private readonly actions: ModuleSidebarActions) {}

	public static getModuleKey(entry: CsmModuleEntry): string {
		return `${entry.owner}/${entry.name}`;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
		};
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			void this.handleMessage(message);
		});
		this.render();
	}

	public setAuthenticated(signedIn: boolean): void {
		this.signedIn = signedIn;
		this.render();
	}

	public setLoading(message = 'Loading modules...'): void {
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
			this.message = 'No repositories with topic csm-modsets were found.';
		} else {
			this.state = 'ready';
		}
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

	public setWorkspaceContext(context: SidebarWorkspaceContext): void {
		this.workspaceLabel = context.workspaceLabel;
		this.moduleRoot = context.moduleRoot;
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
			case 'applySelected':
				this.actions.onApplySelection();
				return;
			case 'setFilterQuery':
				this.filterQuery = typeof message.query === 'string' ? message.query.slice(0, 120) : '';
				return;
			case 'clearFilter':
				this.filterQuery = '';
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

	private render(): void {
		if (!this.view) {
			return;
		}

		this.view.webview.html = this.getHtml();
	}

	private getHtml(): string {
		const nonce = createNonce();
		const selectedCount = this.selectedModuleKeys.size;
		const moduleCount = this.modules.length;
		const filteredCount = this.getFilteredModules(this.filterQuery).length;
		const toolbarMetaText = getToolbarMetaText(moduleCount, filteredCount, selectedCount);
		const appliedCount = this.appliedModuleKeys.size;
		const nextSortDirection: ModuleSortDirection = this.sortState.direction === 'asc' ? 'desc' : 'asc';
		const directionTitle = this.getSortDirectionTitle(nextSortDirection);
		const sortFieldOptions: Array<{ value: ModuleSortField; label: string }> = [
			{ value: 'name', label: 'Name' },
			{ value: 'owner', label: 'Owner' },
			{ value: 'updatedAt', label: 'Updated' },
			{ value: 'applied', label: 'Applied Status' },
		];
		const content = this.renderContent();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CSM Modules</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: light dark;
		}
		[hidden] {
			display: none !important;
		}
		body {
			margin: 0;
			padding: 10px;
			font-family: var(--vscode-font-family);
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
			height: 26px;
			padding: 0 7px;
			color: var(--vscode-descriptionForeground);
		}
		.toolbar-button svg,
		.search-box svg,
		.icon-button svg {
			width: 14px;
			height: 14px;
		}
		.toolbar-button.callout {
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
			background: var(--vscode-editorWidget-background, var(--vscode-button-secondaryBackground));
		}
		.toolbar-meta {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
			margin-left: auto;
		}
		.workspace-summary {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		.search-box {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			height: 30px;
			padding: 0 7px;
			border-radius: 4px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
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
		}
		.search-box input::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}
		.sort-row {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: wrap;
		}
		.sort-controls {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
		}
		.sort-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		.sort-select {
			height: 28px;
			min-width: 120px;
			border-radius: 4px;
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			background: var(--vscode-dropdown-background, var(--vscode-input-background));
			color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground, var(--vscode-foreground)));
			font: inherit;
			padding: 0 6px;
		}
		.sort-select:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 1px;
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
			font-size: 12px;
		}
		.notice span {
			display: block;
			margin-top: 2px;
			font-size: 11px;
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
		.module-card {
			border-radius: 6px;
			padding: 8px 10px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background));
			border: 1px solid var(--vscode-panel-border);
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
			width: 14px;
			height: 14px;
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
			font-size: 12px;
			font-weight: 600;
			line-height: 1.4;
			min-width: 0;
		}
		.module-owner {
			font-size: 10px;
			color: var(--vscode-descriptionForeground);
			min-width: 0;
		}
		.summary {
			margin-top: 4px;
			font-size: 11px;
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
			padding: 0 5px;
			border-radius: 10px;
			font-size: 9px;
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
		.card-footer {
			display: flex;
			justify-content: flex-start;
			gap: 6px;
			align-items: flex-end;
			margin-top: 5px;
		}
		.card-footer-note {
			flex: 1 1 auto;
			font-size: 10px;
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
		.select-toolbar-item {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
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
			width: 24px;
			height: 24px;
			padding: 0;
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
			font-size: 14px;
		}
		.empty-state p {
			margin: 8px 0 0;
			font-size: 12px;
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
		<div class="search-box" data-role="search-box">
			${renderIcon('search')}
			<input type="text" value="${escapeHtml(this.filterQuery)}" data-role="filter-input" placeholder="Search modules" aria-label="Search modules">
			<button class="icon-button" data-action="clearFilter" data-role="clear-filter" title="Clear search" aria-label="Clear search" ${this.filterQuery ? '' : 'hidden'}>${renderIcon('close')}</button>
		</div>
		<div class="sort-row">
			<div class="sort-controls">
				<label class="sort-label" for="module-sort-field">Sort</label>
				<select class="sort-select" id="module-sort-field" data-role="sort-field" aria-label="Sort modules">
					${sortFieldOptions.map((option) => `<option value="${option.value}" ${this.sortState.field === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
				</select>
				<button class="icon-button" data-action="setSortDirection" data-role="sort-direction" data-sort-direction="${nextSortDirection}" title="${escapeHtml(directionTitle)}" aria-label="${escapeHtml(directionTitle)}">${renderIcon(this.sortState.direction === 'asc' ? 'sortAsc' : 'sortDesc')}</button>
			</div>
		</div>
		<div class="toolbar-row">
			<div class="toolbar">
				<button class="toolbar-button callout" data-action="applySelected" data-role="apply-selected" ${selectedCount === 0 ? 'hidden' : ''}>Apply Selected</button>
				${this.signedIn ? '' : '<button class="toolbar-button callout" data-action="login">Sign in</button>'}
			</div>
			<span class="toolbar-meta" data-role="toolbar-meta" data-total-count="${moduleCount}" data-filtered-count="${filteredCount}">${toolbarMetaText}</span>
		</div>
		${this.workspaceLabel ? `<div class="workspace-summary">${this.moduleRoot ? `<span>Root: ${escapeHtml(this.moduleRoot)}/</span>` : ''}<span>${appliedCount} applied</span></div>` : ''}
		${this.introTipVisible ? `<section class="notice" data-role="intro-tip"><div><strong>Tip</strong><span>Use the checkboxes to build a selection, then apply modules from the toolbar or open individual README files from each card.</span></div><div class="notice-actions"><button class="icon-button" data-action="dismissIntroTip" title="Dismiss tip" aria-label="Dismiss tip">${renderIcon('close')}</button></div></section>` : ''}
		${this.canInitializeWorkspace ? `<section class="notice"><div><strong>Workspace hint</strong><span>Detected an existing csm/ layout and LabVIEW project files in the current repository.</span></div><div class="notice-actions"><button class="toolbar-button callout" data-action="initializeWorkspace">Initialize</button></div></section>` : ''}
	</section>
	${content}
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const filterInput = document.querySelector('[data-role="filter-input"]');
		const clearFilterButton = document.querySelector('[data-role="clear-filter"]');
		const sortFieldSelect = document.querySelector('[data-role="sort-field"]');
		const toolbarMeta = document.querySelector('[data-role="toolbar-meta"]');
		const applySelectedButton = document.querySelector('[data-role="apply-selected"]');
		const filterEmptyState = document.querySelector('[data-role="filter-empty"]');

		function getToolbarMetaText(totalCount, filteredCount, selectedCount) {
			const visibilityText = filteredCount === totalCount ? totalCount + ' available' : filteredCount + ' of ' + totalCount + ' shown';
			return visibilityText + ' | ' + selectedCount + ' selected';
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
			const totalCount = Number(toolbarMeta.getAttribute('data-total-count') || '0');
			const filteredCount = getCards().filter((card) => !card.hasAttribute('hidden')).length;
			const selectedCount = document.querySelectorAll('[data-role="select-toggle"]:checked').length;
			toolbarMeta.setAttribute('data-filtered-count', String(filteredCount));
			toolbarMeta.textContent = getToolbarMetaText(totalCount, filteredCount, selectedCount);
			if (applySelectedButton instanceof HTMLElement) {
				applySelectedButton.toggleAttribute('hidden', selectedCount === 0);
			}
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
			const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
			if (!target) {
				return;
			}
			if (target instanceof HTMLButtonElement && target.disabled) {
				return;
			}
			const action = target.getAttribute('data-action');
			if (action === 'clearFilter') {
				if (filterInput instanceof HTMLInputElement) {
					filterInput.value = '';
					applyFilter(true);
				}
				return;
			}
			if (action === 'setSortDirection') {
				const sortDirection = target.getAttribute('data-sort-direction') || undefined;
				vscode.postMessage({ type: 'setSortDirection', sortDirection });
				return;
			}
			const moduleKey = target.getAttribute('data-module-key') || undefined;
			if (!action || action === 'toggleSelection') {
				return;
			}
			vscode.postMessage({ type: action, moduleKey });
		});
		if (filterInput instanceof HTMLInputElement) {
			filterInput.addEventListener('input', () => {
				applyFilter(true);
			});
		}
		if (sortFieldSelect instanceof HTMLSelectElement) {
			sortFieldSelect.addEventListener('change', () => {
				vscode.postMessage({ type: 'setSortField', sortField: sortFieldSelect.value });
			});
		}
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

	private getFilteredModules(query: string): CsmModuleEntry[] {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return this.getSortedModules(this.modules);
		}
		return this.getSortedModules(this.modules.filter((entry) => this.getSearchText(entry).includes(normalizedQuery)));
	}

	private getSortedModules(modules: CsmModuleEntry[]): CsmModuleEntry[] {
		return sortModules(modules, this.sortState, {
			appliedModuleKeys: this.appliedModuleKeys,
		});
	}

	private getSearchText(entry: CsmModuleEntry): string {
		return [
			entry.name,
			entry.owner,
			entry.description,
			entry.defaultBranch,
			entry.visibility,
			...entry.topics,
		].join(' ').toLowerCase();
	}

	private isModuleApplied(moduleKey: string): boolean {
		return this.appliedModuleKeys.has(moduleKey);
	}

	private getSortDirectionTitle(direction: ModuleSortDirection): string {
		switch (this.sortState.field) {
			case 'updatedAt':
				return direction === 'asc' ? 'Sort by oldest first' : 'Sort by newest first';
			case 'applied':
				return direction === 'asc' ? 'Sort by unapplied modules first' : 'Sort by applied modules first';
			case 'owner':
				return direction === 'asc' ? 'Sort owner A to Z' : 'Sort owner Z to A';
			case 'name':
			default:
				return direction === 'asc' ? 'Sort name A to Z' : 'Sort name Z to A';
		}
	}

	private renderContent(): string {
		if (!this.signedIn && this.modules.length === 0 && this.state !== 'ready') {
			return this.renderEmptyState(
				'Sign in to GitHub',
				this.message,
				'<button class="primary" data-action="login">Connect GitHub</button>',
			);
		}

		if (this.state === 'loading' && this.modules.length === 0) {
			return `<section class="list">${[1, 2, 3].map(() => this.renderSkeletonCard()).join('')}</section>`;
		}

		if (this.state === 'error' && this.modules.length === 0) {
			return this.renderEmptyState(
				'Unable to load modules',
				this.message,
			);
		}

		if (this.modules.length === 0) {
			return this.renderEmptyState(
				'No modules found',
				this.message,
			);
		}

		const statusBanner = this.state === 'loading'
			? `<section class="notice"><div><strong>Refreshing module catalog</strong><span>${escapeHtml(this.message)}</span></div></section>`
			: this.state === 'error'
				? `<section class="notice"><div><strong>Catalog refresh failed</strong><span>${escapeHtml(this.message)}</span></div></section>`
				: '';

		const offlineBanner = this.offlineMode
			? `<section class="notice offline"><div><strong>Offline mode</strong><span>Showing cached module list. Sign in to refresh.</span></div></section>`
			: '';

		// Virtualization-lite (review item 5.3): cap initial render at INITIAL_RENDER_LIMIT cards
		// and offer a "Show more" affordance for catalogs with hundreds of modules.
		const sortedAll = this.getSortedModules(this.modules);
		const total = sortedAll.length;
		const visible = sortedAll.slice(0, this.renderLimit);
		const hiddenCount = Math.max(0, total - visible.length);
		const showMoreButton = hiddenCount > 0
			? `<section class="notice"><div><strong>${hiddenCount} more module(s) hidden</strong><span>Use search to narrow the list, or load more below.</span></div><button class="toolbar-button" data-action="showMore">Show ${Math.min(hiddenCount, ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT)} more</button></section>`
			: '';

		return `${offlineBanner}${statusBanner}<section class="list">${visible.map((entry) => this.renderModuleCard(entry)).join('')}</section>${showMoreButton}<section class="empty-state" data-role="filter-empty" hidden><h2>No modules match this filter</h2><p>Try another keyword or clear the current filter to see the full catalog again.</p><div class="action-toolbar"><button class="toolbar-button callout" data-action="clearFilter">Clear Filter</button></div></section>`;
	}

	private renderModuleCard(entry: CsmModuleEntry): string {
		const moduleKey = ModuleSidebarViewProvider.getModuleKey(entry);
		const selected = this.selectedModuleKeys.has(moduleKey);
		const applied = this.isModuleApplied(moduleKey);
		const stale = this.staleModuleKeys.has(moduleKey);
		const topics = entry.topics.filter((topic) => topic !== 'csm-modsets').slice(0, 3);
		const topicBadges = topics.map((topic) => `<span class="badge">${escapeHtml(topic)}</span>`).join('');
		const summary = entry.description.trim().length > 0 ? entry.description.trim() : 'No repository description provided.';
		const footerNote = applied && this.workspaceLabel
			? `<div class="card-footer-note">Already recorded for ${escapeHtml(this.workspaceLabel)}${this.moduleRoot ? ` under ${escapeHtml(this.moduleRoot)}/` : ''}.${stale ? ' <span class="badge stale">stale: directory missing</span>' : ''}</div>`
			: '<span class="card-footer-spacer"></span>';
		const searchText = escapeHtml(this.getSearchText(entry));
		const vscodeContext = escapeHtml(JSON.stringify({
			webviewSection: 'moduleCard',
			moduleKey,
			moduleApplied: applied,
			moduleSelected: selected,
			preventDefaultContextMenuItems: true,
		}));

		return `<article class="module-card${selected ? ' selected' : ''}${applied ? ' applied' : ''}" data-role="module-card" data-module-key="${escapeHtml(moduleKey)}" data-module-applied="${applied ? 'true' : 'false'}" data-module-selected="${selected ? 'true' : 'false'}" data-search-text="${searchText}" data-vscode-context="${vscodeContext}">
			<div class="module-header">
				<div class="module-main">
					<div class="title-row">
						<span class="module-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncate(entry.name, 44))}</span>
						${applied ? '<span class="badge applied">Applied</span>' : ''}
					</div>
					<div class="module-owner">@${escapeHtml(entry.owner)}</div>
				</div>
				<div class="module-header-tools">
					<label class="select-toolbar-item" title="Select module" aria-label="Select module">
						<input class="module-select" type="checkbox" data-role="select-toggle" data-action="toggleSelection" data-module-key="${escapeHtml(moduleKey)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(entry.name)}">
					</label>
					<div class="action-toolbar">
						<button class="icon-button" data-action="openReadme" data-module-key="${escapeHtml(moduleKey)}" title="Open README" aria-label="Open README">${renderIcon('readme')}</button>
					</div>
				</div>
			</div>
			<div class="summary">${escapeHtml(truncate(summary, 132))}</div>
			<div class="card-footer">
				${footerNote}
			</div>
			<div class="meta-row">
				<span class="badge ${entry.visibility === 'private' ? 'private' : ''}">${entry.visibility === 'private' ? 'Private' : 'Public'}</span>
				<span class="badge">Branch: ${escapeHtml(entry.defaultBranch)}</span>
				${topicBadges}
			</div>
		</article>`;
	}

	private renderEmptyState(title: string, message: string, actionHtml = ''): string {
		const actions = actionHtml ? `<div class="action-toolbar">${actionHtml}</div>` : '';
		return `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${actions}</section>`;
	}

	private renderSkeletonCard(): string {
		return `<article class="module-card skeleton"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div></article>`;
	}
}