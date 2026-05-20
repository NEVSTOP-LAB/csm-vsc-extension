import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';

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
		const topics = moduleEntry.topics ?? [];
		const visibilityLabel = moduleEntry.visibility === 'private' ? 'private' : 'public';
		const shortName = truncate(moduleEntry.name, 36);
		const visibilityTag = moduleEntry.visibility === 'private' ? '[PRI]' : '[PUB]';
		this.label = {
			label: `${shortName}  [GH] ${visibilityTag}`,
			highlights: [[0, shortName.length]],
		};
		this.description = `@${moduleEntry.owner}`;
		this.iconPath = new vscode.ThemeIcon(moduleEntry.visibility === 'private' ? 'lock' : 'repo');
		this.tooltip = new vscode.MarkdownString([
			`**${moduleEntry.name}**`,
			`Owner: ${moduleEntry.owner}`,
			moduleEntry.description || '_No description_',
			topics.length > 0 ? `Topics: ${topics.join(', ')}` : 'Topics: none',
			`Visibility: ${visibilityLabel}`,
			`Default branch: ${moduleEntry.defaultBranch}`,
			`Repository: ${moduleEntry.repoUrl}`,
		].join('  \n'));
		this.contextValue = 'csmModuleEntry';
		this.command = {
			command: 'csmModules.openReadme',
			title: 'Open README',
			arguments: [moduleEntry],
		};
	}
}

export class ModuleTreeDataProvider implements vscode.TreeDataProvider<ModuleTreeItem | vscode.TreeItem> {
	private readonly emitter = new vscode.EventEmitter<ModuleTreeItem | vscode.TreeItem | undefined>();
	private modules: CsmModuleEntry[] = [];
	private state: ViewState = 'loading';
	private message = 'Loading modules...';
	private signedIn = false;

	public readonly onDidChangeTreeData = this.emitter.event;

	public setAuthenticated(signedIn: boolean): void {
		this.signedIn = signedIn;
		this.emitter.fire(undefined);
	}

	public setLoading(message = 'Loading modules...'): void {
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
			this.message = 'No repositories with topic csm-modsets were found.';
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
			const topics = element.moduleEntry.topics ?? [];
			const topicsText = topics.length > 0 ? topics.join(', ') : 'none';
			const line2 = `> topics: ${truncate(topicsText, 64)} | branch: ${element.moduleEntry.defaultBranch}`;
			const summaryText = element.moduleEntry.description ? element.moduleEntry.description : 'No description';
			const line3 = `> summary: ${truncate(summaryText, 86)}`;
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
			new ModuleActionItem('Sign in to GitHub', 'csmModules.login', 'Sign in to GitHub to load modules.', 'account'),
			new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None),
		];
	}
}
