import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';
import { getVisibilityLabel, getVisibilityTag, t } from './messages';
import { getVisibleModuleTopics } from './topics';

export type ViewState = 'loading' | 'ready' | 'empty' | 'error';

class ModuleActionItem extends vscode.TreeItem {
	constructor(label: string, command: string, tooltip: string, iconId: string, arguments_: unknown[] = []) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.command = {
			command,
			title: label,
			arguments: arguments_,
		};
		this.tooltip = tooltip;
		this.iconPath = new vscode.ThemeIcon(iconId);
		this.contextValue = command;
	}
}

class ModuleDetailItem extends vscode.TreeItem {
	constructor(label: string, iconId: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.iconPath = new vscode.ThemeIcon(iconId);
		this.contextValue = 'csmModuleDetail';
	}
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength - 3)}...`;
}

export class ModuleTreeItem extends vscode.TreeItem {
	constructor(public readonly moduleEntry: CsmModuleEntry) {
		super(moduleEntry.name, vscode.TreeItemCollapsibleState.Expanded);
		const topics = getVisibleModuleTopics(moduleEntry.topics);
		const visibilityLabel = getVisibilityLabel(moduleEntry.visibility);
		const shortName = truncate(moduleEntry.name, 36);
		const visibilityTag = getVisibilityTag(moduleEntry.visibility);
		this.label = {
			label: `${shortName}  [GH] ${visibilityTag}`,
			highlights: [[0, shortName.length]],
		};
		this.description = `@${moduleEntry.owner}`;
		this.iconPath = new vscode.ThemeIcon(moduleEntry.visibility === 'private' ? 'lock' : 'repo');
		this.tooltip = new vscode.MarkdownString([
			`**${moduleEntry.name}**`,
			`${t('ownerLabel')}: ${moduleEntry.owner}`,
			moduleEntry.description || t('noDescription'),
			topics.length > 0 ? `${t('topicsLabel')}: ${topics.join(', ')}` : `${t('topicsLabel')}: ${t('topicsNone')}`,
			`${t('visibilityLabel')}: ${visibilityLabel}`,
			`${t('defaultBranchLabel')}: ${moduleEntry.defaultBranch}`,
			`${t('repositoryLabel')}: ${moduleEntry.repoUrl}`,
		].join('  \n'));
		this.contextValue = 'csmModuleEntry';
	}
}

/**
 * @deprecated The webview-based {@link ModuleSidebarViewProvider} is the production
 * module manager UI. This legacy `TreeDataProvider` is retained only as a fallback
 * for hosts that disable webviews; it is not wired up by the controller and may be
 * removed in a future release (review item 2.6).
 */
export class ModuleTreeDataProvider implements vscode.TreeDataProvider<ModuleTreeItem | vscode.TreeItem> {
	private readonly emitter = new vscode.EventEmitter<ModuleTreeItem | vscode.TreeItem | undefined>();
	private modules: CsmModuleEntry[] = [];
	private state: ViewState = 'loading';
	private message = t('loadingModules');
	private signedIn = false;

	public readonly onDidChangeTreeData = this.emitter.event;

	public setAuthenticated(signedIn: boolean): void {
		this.signedIn = signedIn;
		this.emitter.fire(undefined);
	}

	public setLoading(message = t('loadingModules')): void {
		this.state = 'loading';
		this.message = message;
		this.emitter.fire(undefined);
	}

	public setError(message: string): void {
		this.state = 'error';
		this.message = message;
		this.emitter.fire(undefined);
	}

	public setModules(modules: CsmModuleEntry[]): void {
		this.modules = modules;
		if (modules.length === 0) {
			this.state = 'empty';
			this.message = t('noRepositoriesFound');
		} else {
			this.state = 'ready';
		}
		this.emitter.fire(undefined);
	}

	public getTreeItem(element: ModuleTreeItem | vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: ModuleTreeItem | vscode.TreeItem): Array<ModuleTreeItem | vscode.TreeItem> {
		if (element instanceof ModuleTreeItem) {
			const topics = getVisibleModuleTopics(element.moduleEntry.topics);
			const topicsText = topics.length > 0 ? topics.join(', ') : t('topicsNone');
			const line2 = t('treeTopicsLine', {
				topicsLabel: t('topicsLabel').toLowerCase(),
				topics: truncate(topicsText, 64),
				branchLabel: t('branchLabel'),
				branch: element.moduleEntry.defaultBranch,
			});
			const summaryText = element.moduleEntry.description ? element.moduleEntry.description : t('noRepositoryDescription');
			const line3 = t('treeSummaryLine', {
				summaryLabel: t('summaryLabel'),
				summary: truncate(summaryText, 86),
			});
			return [
				new ModuleDetailItem(line2, 'tag'),
				new ModuleDetailItem(line3, 'info'),
			];
		}
		if (this.state === 'ready') {
			return this.modules.map((moduleEntry) => new ModuleTreeItem(moduleEntry));
		}
		if (this.signedIn) {
			return [new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None)];
		}
		return [
			new ModuleActionItem(t('treeSignInLabel'), 'csmModules.login', t('signInToLoadModules'), 'account'),
			new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None),
		];
	}
}
