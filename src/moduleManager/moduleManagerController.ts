import * as vscode from 'vscode';
import { AuthService } from './authService';
import { GitHubModuleService } from './githubModuleService';
import { ModuleCacheStore } from './cacheStore';
import { CsmModuleEntry } from './types';
import { ModuleTreeDataProvider } from './moduleTreeDataProvider';
import { ReadmeAssetCache } from './readmeAssetCache';

export class ModuleManagerController {
	private readonly authService = new AuthService();
	private readonly githubService = new GitHubModuleService();
	private readonly cacheStore: ModuleCacheStore;
	private readonly treeDataProvider = new ModuleTreeDataProvider();
	private readonly readmeAssetCache: ReadmeAssetCache;
	private readonly readmeCache: Record<string, string>;
	private currentToken: string | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.cacheStore = new ModuleCacheStore(context.globalState);
		this.readmeAssetCache = new ReadmeAssetCache(context.globalStorageUri);
		this.readmeCache = this.cacheStore.getReadmeCache();
	}

	public register(subscriptions: vscode.Disposable[]): void {
		subscriptions.push(
			vscode.window.registerTreeDataProvider('csmModules.view', this.treeDataProvider),
			vscode.commands.registerCommand('csmModules.login', () => this.loginCommand()),
			vscode.commands.registerCommand('csmModules.refresh', () => this.refreshCommand()),
			vscode.commands.registerCommand('csmModules.openReadme', (entry?: CsmModuleEntry) => this.openReadmeCommand(entry)),
		);

		const cached = this.cacheStore.getModuleSnapshot();
		if (cached && cached.modules.length > 0) {
			this.treeDataProvider.setModules(cached.modules);
		} else {
			this.treeDataProvider.setLoading('Sign in to GitHub to load modules.');
		}

		void this.loadModules({ interactiveAuth: false, showSuccessMessage: false, showErrorMessage: false });
	}

	private async loginCommand(): Promise<void> {
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			void vscode.window.showWarningMessage('GitHub sign-in was cancelled.');
			return;
		}
		this.currentToken = session.accessToken;
		this.treeDataProvider.setAuthenticated(true);
		void vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
		await this.loadModules({ interactiveAuth: false, showSuccessMessage: true, showErrorMessage: true });
	}

	private async ensureToken(interactive: boolean): Promise<string | undefined> {
		if (this.currentToken) {
			return this.currentToken;
		}
		const silentSession = await this.authService.getSessionSilently();
		if (silentSession) {
			this.currentToken = silentSession.accessToken;
			this.treeDataProvider.setAuthenticated(true);
			return this.currentToken;
		}
		if (!interactive) {
			return undefined;
		}
		const session = await this.authService.getSessionInteractively();
		if (!session) {
			return undefined;
		}
		this.currentToken = session.accessToken;
		return this.currentToken;
	}

	private async refreshCommand(): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			'Refresh CSM modules from GitHub?',
			{ modal: true },
			'Refresh',
			'Cancel',
		);
		if (choice !== 'Refresh') {
			return;
		}
		await this.loadModules({ interactiveAuth: true, showSuccessMessage: true, showErrorMessage: true });
	}

	private async loadModules(options: {
		interactiveAuth: boolean;
		showSuccessMessage: boolean;
		showErrorMessage: boolean;
	}): Promise<void> {
		const token = await this.ensureToken(options.interactiveAuth);
		if (!token) {
			if (options.interactiveAuth) {
				this.treeDataProvider.setError('GitHub sign-in is required to refresh modules.');
				void vscode.window.showWarningMessage('Unable to refresh modules without a GitHub session.');
			}
			return;
		}
		this.treeDataProvider.setAuthenticated(true);

		this.treeDataProvider.setLoading('Refreshing modules from GitHub...');
		try {
			const modules = await this.githubService.fetchModules(token);
			const refreshedReadme: Record<string, string> = {};
			for (const moduleEntry of modules) {
				const key = this.getReadmeCacheKey(moduleEntry);
				try {
					const markdown = await this.githubService.fetchReadme(moduleEntry.owner, moduleEntry.name, token);
					refreshedReadme[key] = markdown;
					await this.readmeAssetCache.saveMarkdown(moduleEntry, markdown);
				} catch {
					refreshedReadme[key] = '';
				}
			}
			Object.assign(this.readmeCache, refreshedReadme);
			await this.cacheStore.setModuleSnapshot(modules);
			await this.cacheStore.setReadmeCache(this.readmeCache);
			this.treeDataProvider.setModules(modules);
			if (options.showSuccessMessage) {
				void vscode.window.showInformationMessage(`Refreshed ${modules.length} module(s).`);
			}
		} catch (error) {
			this.treeDataProvider.setError('Failed to load modules from GitHub.');
			if (options.showErrorMessage) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				void vscode.window.showErrorMessage(`Failed to refresh CSM modules: ${message}`);
			}
		}
	}

	private async openReadmeCommand(entry?: CsmModuleEntry): Promise<void> {
		if (!entry) {
			return;
		}
		const key = this.getReadmeCacheKey(entry);
		let readme: string | undefined = this.readmeCache[key];
		if (!readme) {
			readme = await this.readmeAssetCache.readMarkdown(entry);
			if (readme) {
				this.readmeCache[key] = readme;
			}
		}
		if (!readme) {
			const token = await this.ensureToken(false);
			if (!token) {
				void vscode.window.showWarningMessage('No cached README and no GitHub session available.');
				return;
			}
			try {
				readme = await this.githubService.fetchReadme(entry.owner, entry.name, token);
				this.readmeCache[key] = readme;
				await this.cacheStore.setReadmeCache(this.readmeCache);
				await this.readmeAssetCache.saveMarkdown(entry, readme);
			} catch {
				readme = '';
			}
		}

		const markdownContent = readme || '# README not available\n\nUnable to load README from GitHub for this module.';
		const panel = vscode.window.createWebviewPanel(
			'csmModulesReadme',
			`README: ${entry.name}`,
			vscode.ViewColumn.Active,
			{
				enableFindWidget: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.readmeAssetCache.rootUri],
			},
		);
		panel.webview.html = await this.readmeAssetCache.renderMarkdown(entry, markdownContent, panel.webview);
	}

	private getReadmeCacheKey(entry: CsmModuleEntry): string {
		return `${entry.owner}/${entry.name}`;
	}
}
