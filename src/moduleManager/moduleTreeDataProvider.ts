import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';

export type ViewState = 'loading' | 'ready' | 'empty' | 'error';

export class ModuleTreeItem extends vscode.TreeItem {
	constructor(public readonly moduleEntry: CsmModuleEntry) {
		super(moduleEntry.name, vscode.TreeItemCollapsibleState.None);
		this.description = `${moduleEntry.visibility} · ${moduleEntry.defaultBranch}`;
		this.tooltip = new vscode.MarkdownString([
			`**${moduleEntry.name}**`,
			moduleEntry.description || '_No description_',
			`Visibility: ${moduleEntry.visibility}`,
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

	public readonly onDidChangeTreeData = this.emitter.event;

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
			return this.modules.map((moduleEntry) => new ModuleTreeItem(moduleEntry));
		}
		return [new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None)];
	}
}
