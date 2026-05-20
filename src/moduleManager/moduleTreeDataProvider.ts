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

export class ModuleTreeItem extends vscode.TreeItem {
	constructor(public readonly moduleEntry: CsmModuleEntry) {
		super(moduleEntry.name, vscode.TreeItemCollapsibleState.None);
		const topics = moduleEntry.topics ?? [];
		const topicSummary = topics.slice(0, 3).join(', ');
		const visibilityLabel = moduleEntry.visibility === 'private' ? 'private' : 'public';
		this.description = [moduleEntry.owner, visibilityLabel, moduleEntry.defaultBranch, topicSummary].filter(Boolean).join(' · ');
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

	public getChildren(): Array<ModuleTreeItem | vscode.TreeItem> {
		if (this.state === 'ready') {
			return [
				new ModuleActionItem('Refresh modules', 'csmModules.refresh', 'Refresh modules from GitHub after confirmation.', 'refresh'),
				...this.modules.map((moduleEntry) => new ModuleTreeItem(moduleEntry)),
			];
		}
		if (this.signedIn) {
			return [
				new ModuleActionItem('Refresh modules', 'csmModules.refresh', 'Refresh modules from GitHub after confirmation.', 'refresh'),
				new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None),
			];
		}
		return [
			new ModuleActionItem('Sign in to GitHub', 'csmModules.login', 'Sign in to GitHub to load modules.', 'account'),
			new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None),
		];
	}
}
