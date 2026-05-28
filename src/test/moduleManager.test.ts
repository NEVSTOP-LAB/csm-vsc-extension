import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { ModuleCacheStore, mapRepoToModuleEntry } from '../moduleManager';
import { GitExecOptions, IGitRunner } from '../moduleManager/gitService';
import { ReadmeAssetCache } from '../moduleManager/readmeAssetCache';
import { LocalWorkspaceViewProvider } from '../moduleManager/localWorkspaceViewProvider';
import { ModuleSidebarViewProvider } from '../moduleManager/moduleSidebarViewProvider';
import { ModuleTreeDataProvider, ModuleTreeItem } from '../moduleManager/moduleTreeDataProvider';
import { GitHubRepoSummary } from '../moduleManager';
import { CsmModuleEntry } from '../moduleManager/types';
import { LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from '../moduleManager/workspaceModuleService';
import * as vscode from 'vscode';

type VscodeMock = typeof vscode & {
	__resolveWebviewView: (viewId: string) => { html: string; fireMessage: (message: unknown) => void } | undefined;
	__getLastWebviewView: () => { viewId: string; html: string; title?: string; description?: string; options?: { enableScripts?: boolean; localResourceRoots?: vscode.Uri[] } } | undefined;
	__resetUiState: () => void;
};

function runGit(cwd: string, args: string[]): string {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

class FakeMemento {
	private readonly store = new Map<string, unknown>();

	public get<T>(key: string, defaultValue?: T): T {
		if (this.store.has(key)) {
			return this.store.get(key) as T;
		}
		return defaultValue as T;
	}

	public async update(key: string, value: unknown): Promise<void> {
		if (typeof value === 'undefined') {
			this.store.delete(key);
			return;
		}
		this.store.set(key, value);
	}
}

class RecordingGitRunner implements IGitRunner {
	public readonly calls: GitExecOptions[] = [];

	constructor(private readonly handler: (options: GitExecOptions) => Promise<string> | string) { }

	public async exec(options: GitExecOptions): Promise<string> {
		this.calls.push({
			...options,
			args: [...options.args],
		});
		return this.handler(options);
	}

	public async isAvailable(): Promise<boolean> {
		return true;
	}
}

suite('Module Manager Tests', () => {
	const mocked = vscode as VscodeMock;

	teardown(() => {
		mocked.__resetUiState();
	});

	test('mapRepoToModuleEntry maps visibility and owner fields', () => {
		const repo: GitHubRepoSummary = {
			id: 101,
			name: 'robot-vision-pack',
			full_name: 'nevstop/robot-vision-pack',
			description: 'vision helpers',
			private: true,
			default_branch: 'main',
			html_url: 'https://github.com/nevstop/robot-vision-pack',
			topics: ['csm-modsets'],
		};

		const entry = mapRepoToModuleEntry(repo);
		assert.strictEqual(entry.owner, 'nevstop');
		assert.strictEqual(entry.visibility, 'private');
		assert.strictEqual(entry.defaultBranch, 'main');
		assert.strictEqual(entry.repoUrl, repo.html_url);
		assert.deepStrictEqual(entry.topics, ['csm-modsets']);
	});

	test('ModuleCacheStore stores and clears module snapshot', async () => {
		const memento = new FakeMemento();
		const store = new ModuleCacheStore(memento as never);

		const storedSnapshot = await store.setModuleSnapshot([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: '',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
		], {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		});
		await store.setAuthSnapshot({
			accountId: 'tester',
			accountLabel: 'tester',
		});

		const snapshot = store.getModuleSnapshot();
		assert.ok(snapshot);
		assert.strictEqual(snapshot?.schemaVersion, 1);
		assert.strictEqual(snapshot?.modules.length, 1);
		assert.ok(snapshot?.lastRefreshAt);
		assert.strictEqual(snapshot?.refreshAccountId, 'tester');
		assert.strictEqual(snapshot?.refreshAccountLabel, 'tester');
		assert.strictEqual(storedSnapshot.refreshAccountId, 'tester');
		assert.deepStrictEqual(store.getAuthSnapshot(), {
			accountId: 'tester',
			accountLabel: 'tester',
		});

		await store.clear();
		assert.strictEqual(store.getModuleSnapshot(), undefined);
		assert.strictEqual(store.getAuthSnapshot(), undefined);
		assert.deepStrictEqual(store.getReadmeCache(), {});
	});

	test('ModuleCacheStore treats stale snapshots as expired while keeping legacy schema readable', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', {
			lastRefreshAt: '2000-01-01T00:00:00.000Z',
			modules: [{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: '',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			}],
		});
		const store = new ModuleCacheStore(memento as never);

		const snapshot = store.getModuleSnapshot();
		assert.ok(snapshot);
		assert.strictEqual(snapshot?.schemaVersion, 1);
		assert.strictEqual(store.isModuleSnapshotExpired(snapshot, 1), true);
	});

	test('ReadmeAssetCache renders raw HTML img tags in README previews', async () => {
		const storageRoot = vscode.Uri.file(path.join(os.tmpdir(), `csm-readme-assets-${Date.now()}`));
		const cache = new ReadmeAssetCache(storageRoot);
		const entry: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'A demo module',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => ({
			ok: true,
			status: 200,
			arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
		}) as Response) as typeof fetch;

		try {
			const panel = vscode.window.createWebviewPanel('csmModulesReadmeTest', 'README', vscode.ViewColumn.One, {});
			const html = await cache.renderMarkdownFragment(
				entry,
				'<img width="385" height="322" alt="image" src="https://github.com/user-attachments/assets/ff122167-f2f9-4ab4-8905-d0d5b468217e" />',
				panel.webview,
			);

			assert.ok(html.includes('<img alt="image"'));
			assert.ok(html.includes('width="385"'));
			assert.ok(html.includes('height="322"'));
			assert.ok(html.includes('<p><img'));
			assert.ok(!html.includes('&lt;img'));
		} finally {
			globalThis.fetch = originalFetch;
			await fs.rm(storageRoot.fsPath, { recursive: true, force: true });
		}
	});

	test('ModuleTreeItem includes topic and visibility metadata', () => {
		const entry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'A demo module',
			topics: ['csm-modsets', 'labview-csm', 'automation'],
			visibility: 'private' as const,
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};

		const item = new ModuleTreeItem(entry);
		const rawLabel = item.label;
		const label = typeof rawLabel === 'string' ? rawLabel : String(rawLabel?.label ?? '');
		const highlights = typeof rawLabel === 'string' ? [] : (rawLabel?.highlights ?? []);
		const description = String(item.description ?? '');
		const tooltip = item.tooltip instanceof Object && 'value' in item.tooltip ? String((item.tooltip as { value?: string }).value ?? '') : String(item.tooltip ?? '');
		assert.ok(label.includes('[GH]'));
		assert.ok(label.includes('[PRI]'));
		assert.deepStrictEqual(highlights, [[0, 'module-a'.length]]);
		assert.ok(description.includes('@org'));
		assert.strictEqual(item.collapsibleState, 2);
		assert.ok(tooltip.includes('Topics: automation'));
		assert.ok(!tooltip.includes('csm-modsets'));
		assert.ok(!tooltip.includes('labview-csm'));
		assert.strictEqual(item.command, undefined);
	});

	test('ModuleTreeDataProvider keeps refresh only in the title bar when signed in', () => {
		const provider = new ModuleTreeDataProvider();
		provider.setAuthenticated(true);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
		]);

		const children = provider.getChildren();
		assert.strictEqual(children.length, 1);
		assert.strictEqual(children[0]?.contextValue, 'csmModuleEntry');
	});

	test('ModuleSidebarViewProvider renders extension-style module cards', () => {
		const assetRoot = vscode.Uri.file(path.join(os.tmpdir(), 'csm-sidebar-readme-assets'));
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => undefined,
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
		}, {
			getLocalResourceRoots: () => [assetRoot],
		});

		provider.setAuthenticated(true, 'tester');
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets', 'labview-csm', 'automation'],
				visibility: 'private',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
				starred: true,
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'Manual module',
				topics: ['csm-modsets', 'manual'],
				visibility: 'public',
				defaultBranch: 'develop',
				repoUrl: 'https://github.com/org/module-b',
				starred: false,
			},
		]);
		provider.setWorkspaceContext({
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			appliedModuleKeys: ['org/module-b'],
			managedModules: [{
				id: 'org__module_a',
				kind: 'managed',
				owner: 'org',
				name: 'module-a',
				path: 'csm/module-a',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				branch: 'main',
				ref: 'abc123',
				repoUrl: 'https://github.com/org/module-a',
				description: 'A demo module',
				visibility: 'private',
				topics: ['csm-modsets', 'labview-csm', 'automation'],
				moduleEntry: {
					id: 1,
					owner: 'org',
					name: 'module-a',
					description: 'A demo module',
					topics: ['csm-modsets', 'labview-csm', 'automation'],
					visibility: 'private',
					defaultBranch: 'main',
					repoUrl: 'https://github.com/org/module-a',
					starred: true,
				},
				moduleKey: 'org/module-a',
				stale: false,
			}],
			unmanagedFolders: [{
				id: 'csm/custom-module',
				kind: 'unmanaged',
				name: 'custom-module',
				path: 'csm/custom-module',
			}],
		});
		provider.setOfflineMode(true);
		provider.setViewDescription('Updated 5 minutes ago');

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');
		const rendered = mocked.__getLastWebviewView();

		assert.ok(resolved);
		assert.strictEqual(rendered?.viewId, 'csmModules.view');
		assert.strictEqual(rendered?.title, 'Signed in as tester');
		assert.strictEqual(rendered?.description, 'Updated 5 minutes ago');
		assert.ok(rendered?.html.includes('module-card'));
		assert.deepStrictEqual(rendered?.options?.localResourceRoots?.map((uri) => uri.fsPath), [assetRoot.fsPath]);
		assert.ok(rendered?.html.includes('module-a'));
		assert.ok(rendered?.html.includes('@org'));
		assert.ok(rendered?.html.includes('automation'));
		assert.ok(!rendered?.html.includes('csm-modsets'));
		assert.ok(!rendered?.html.includes('labview-csm'));
		assert.ok(rendered?.html.includes('placeholder="Search modules"'));
		assert.ok(rendered?.html.includes('data-role="search-box"'));
		assert.ok(rendered?.html.includes('data-role="filter-button"'));
		assert.ok(rendered?.html.includes('data-role="filter-menu"'));
		assert.ok(rendered?.html.includes('Filter and sort modules. Current: Name, Ascending.'));
		assert.ok(rendered?.html.includes('--module-font-md: 13px;'));
		assert.ok(rendered?.html.includes('--module-icon-size: 16px;'));
		assert.ok(rendered?.html.includes('data-action="togglePreview"'));
		assert.ok(rendered?.html.includes('type="text"'));
		assert.ok(rendered?.html.includes('Include applied modules'));
		assert.ok(!rendered?.html.includes('data-role="include-applied-toggle"'));
		assert.ok(rendered?.html.includes('data-vscode-context="'));
		assert.ok(rendered?.html.includes('webviewSection&quot;:&quot;moduleCard&quot;'));
		assert.ok(rendered?.html.includes('moduleKey&quot;:&quot;org&#47;module-a&quot;'));
		assert.ok(rendered?.html.includes('moduleApplied&quot;:false'));
		assert.ok(rendered?.html.includes('preventDefaultContextMenuItems&quot;:true'));
		assert.ok(!rendered?.html.includes('data-action="applyOne"'));
		assert.ok(rendered?.html.includes('.module-card:hover .select-toolbar-item,'));
		assert.ok(rendered?.html.includes('.module-card.selected .select-toolbar-item {'));
		assert.ok(rendered?.html.includes('opacity: 0;'));
		assert.ok(rendered?.html.includes('pointer-events: none;'));
		assert.ok(rendered?.html.includes('data-action="toggleStar" data-module-key="org&#47;module-a" title="Unstar repository" aria-label="Unstar repository" aria-pressed="true"'));
		assert.ok(rendered?.html.includes('data-action="openReadme" data-module-key="org&#47;module-a" title="Open README" aria-label="Open README"'));
		assert.ok(!rendered?.html.includes('data-module-key="org&#47;module-b"'));
		assert.ok(!rendered?.html.includes('Workspace: repo'));
		assert.ok(rendered?.html.includes('Root: csm/'));
		assert.ok(!rendered?.html.includes('Signed in as tester.'));
		assert.ok(!rendered?.html.includes('Loaded 2 module(s), including private.'));
		assert.ok(rendered?.html.includes('1 applied | 1 public | 1 private | 0 selected'));
		assert.ok(!rendered?.html.includes('data-role="apply-selected"'));
		assert.ok(rendered?.html.includes('title="Open README"'));
		assert.ok(!rendered?.html.includes('class="avatar"'));
		assert.ok(!rendered?.html.includes('title="Refresh modules"'));
		assert.ok(!rendered?.html.includes('Cached list'));

		provider.setSelection(['org/module-a']);
		const selectedRender = mocked.__getLastWebviewView();
		assert.ok(selectedRender?.html.includes('1 applied | 1 public | 1 private | 1 selected'));
		assert.ok(selectedRender?.html.includes('moduleSelected&quot;:true'));

		resolved?.fireMessage({ type: 'dismissIntroTip' });
		const dismissedRender = mocked.__getLastWebviewView();
		assert.ok(!dismissedRender?.html.includes('data-role="intro-tip"'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider forwards checkbox selection and card actions', () => {
		const selectionUpdates: string[][] = [];
		let appliedModuleName = '';
		let toggledStarName = '';
		let openedReadmeName = '';
		let removedModuleName = '';
		let updatedModuleName = '';
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: (entry) => {
				toggledStarName = entry.name;
			},
			onOpenReadme: (entry) => {
				openedReadmeName = entry.name;
			},
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: (entry) => {
				appliedModuleName = entry?.name ?? 'selected';
			},
			onRemoveModule: (entry) => {
				removedModuleName = entry.name;
			},
			onUpdateModule: (entry) => {
				updatedModuleName = entry.name;
			},
			onSelectionChange: (moduleKeys) => {
				selectionUpdates.push(moduleKeys);
			},
			onSortChange: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
				starred: false,
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'Second module',
				topics: ['csm-modsets', 'manual'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
				starred: true,
			},
		]);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');

		resolved?.fireMessage({ type: 'setFilterQuery', query: 'module-a' });
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'Second module',
				topics: ['csm-modsets', 'manual'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
		]);
		resolved?.fireMessage({ type: 'toggleSelection', moduleKey: 'org/module-a', selected: true });
		resolved?.fireMessage({ type: 'toggleStar', moduleKey: 'org/module-a' });
		resolved?.fireMessage({ type: 'openReadme', moduleKey: 'org/module-a' });
		resolved?.fireMessage({ type: 'applyOne', moduleKey: 'org/module-a' });
		resolved?.fireMessage({ type: 'removeModule', moduleKey: 'org/module-a' });
		resolved?.fireMessage({ type: 'updateModule', moduleKey: 'org/module-a' });

		const rerendered = mocked.__getLastWebviewView();
		assert.ok(rerendered?.html.includes('value="module-a"'));
		assert.ok(rerendered?.html.includes('0 applied | 1 of 2 shown | 1 selected'));
		assert.ok(!rerendered?.html.includes('data-role="apply-selected"'));
		assert.deepStrictEqual(selectionUpdates[selectionUpdates.length - 1], ['org/module-a']);
		assert.strictEqual(toggledStarName, 'module-a');
		assert.strictEqual(openedReadmeName, 'module-a');
		assert.strictEqual(appliedModuleName, 'module-a');
		assert.strictEqual(removedModuleName, 'module-a');
		assert.strictEqual(updatedModuleName, 'module-a');
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider can include applied modules when toggled', () => {
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => undefined,
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'Applied module',
				topics: ['csm-modsets'],
				visibility: 'private',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
		]);
		provider.setWorkspaceContext({
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			appliedModuleKeys: ['org/module-b'],
			managedModules: [],
			unmanagedFolders: [],
		});

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');
		const initialRender = mocked.__getLastWebviewView();

		assert.ok(!initialRender?.html.includes('data-module-key="org&#47;module-b"'));

		resolved?.fireMessage({ type: 'setIncludeApplied', includeApplied: true });
		const rerendered = mocked.__getLastWebviewView();

		assert.ok(rerendered?.html.includes('data-module-key="org&#47;module-b"'));
		assert.ok(rerendered?.html.includes('data-action="setIncludeApplied" data-include-applied="false"'));
		assert.ok(!rerendered?.html.includes('data-role="include-applied-toggle"'));
		disposable.dispose();
	});

	test('LocalWorkspaceViewProvider renders managed and unmanaged workspace folders', () => {
		const provider = new LocalWorkspaceViewProvider({
			onInitializeWorkspace: () => undefined,
			onOpenReadme: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onCreateLocalRepository: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setWorkspaceContext({
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			appliedModuleKeys: [],
			managedModules: [{
				id: 'local__module_local',
				kind: 'managed',
				owner: 'local',
				name: 'module-local',
				path: 'csm/module-local',
				source: 'https://github.com/local/module-local',
				method: 'copy',
				branch: 'main',
				ref: 'abc123',
				repoUrl: 'https://github.com/local/module-local',
				description: 'Local module',
				visibility: 'public',
				topics: ['manual'],
				moduleEntry: {
					id: 0,
					owner: 'local',
					name: 'module-local',
					description: 'Local module',
					topics: ['manual'],
					visibility: 'public',
					defaultBranch: 'main',
					repoUrl: 'https://github.com/local/module-local',
				},
				stale: false,
			}],
			unmanagedFolders: [{
				id: 'csm/custom-module',
				kind: 'unmanaged',
				name: 'custom-module',
				path: 'csm/custom-module',
			}],
		});

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.workspaceView', provider);
		mocked.__resolveWebviewView('csmModules.workspaceView');
		const rendered = mocked.__getLastWebviewView();

		assert.strictEqual(rendered?.viewId, 'csmModules.workspaceView');
		assert.strictEqual(rendered?.description, 'csm');
		assert.ok(!rendered?.html.includes('Workspace Modules'));
		assert.ok(!rendered?.html.includes('Managed folders'));
		assert.ok(rendered?.html.includes('Unmanaged folders'));
		assert.ok(rendered?.html.includes('1 managed | 1 unmanaged'));
		assert.ok(rendered?.html.includes('Root: csm/'));
		assert.ok(!rendered?.html.includes('csm-vsc-extension'));
		assert.ok(rendered ? rendered.html.indexOf('1 managed | 1 unmanaged') < rendered.html.indexOf('Root: csm/') : false);
		assert.ok(rendered?.html.includes('module-local'));
		assert.ok(rendered?.html.includes('custom-module'));
		assert.ok(rendered?.html.includes('Create GitHub Repo'));
		disposable.dispose();
	});

	test('LocalWorkspaceViewProvider forwards local workspace actions', () => {
		let openedReadmeName = '';
		let removedModuleName = '';
		let updatedModuleName = '';
		let createdRepositoryPath = '';
		let initialized = false;
		const provider = new LocalWorkspaceViewProvider({
			onInitializeWorkspace: () => undefined,
			onOpenReadme: (entry) => {
				openedReadmeName = entry.name;
			},
			onRemoveModule: (entry) => {
				removedModuleName = entry.name;
			},
			onUpdateModule: (entry) => {
				updatedModuleName = entry.name;
			},
			onCreateLocalRepository: (entry) => {
				createdRepositoryPath = entry.path;
			},
		});

		const initializingProvider = new LocalWorkspaceViewProvider({
			onInitializeWorkspace: () => {
				initialized = true;
			},
			onOpenReadme: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onCreateLocalRepository: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setWorkspaceContext({
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			appliedModuleKeys: [],
			managedModules: [{
				id: 'local__module_local',
				kind: 'managed',
				owner: 'local',
				name: 'module-local',
				path: 'csm/module-local',
				source: 'https://github.com/local/module-local',
				method: 'copy',
				branch: 'main',
				ref: 'abc123',
				repoUrl: 'https://github.com/local/module-local',
				description: 'Local module',
				visibility: 'public',
				topics: ['manual'],
				moduleEntry: {
					id: 0,
					owner: 'local',
					name: 'module-local',
					description: 'Local module',
					topics: ['manual'],
					visibility: 'public',
					defaultBranch: 'main',
					repoUrl: 'https://github.com/local/module-local',
				},
				stale: false,
			}],
			unmanagedFolders: [{
				id: 'csm/custom-module',
				kind: 'unmanaged',
				name: 'custom-module',
				path: 'csm/custom-module',
			}],
		});
		initializingProvider.setCanInitializeWorkspace(true);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.workspaceView', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.workspaceView');
		const initDisposable = vscode.window.registerWebviewViewProvider('csmModules.workspaceInitView', initializingProvider);
		const initResolved = mocked.__resolveWebviewView('csmModules.workspaceInitView');

		resolved?.fireMessage({ type: 'openLocalReadme', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'updateLocalModule', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'removeLocalModule', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'createLocalRepository', localItemId: 'csm/custom-module' });
		initResolved?.fireMessage({ type: 'initializeWorkspace' });

		assert.strictEqual(openedReadmeName, 'module-local');
		assert.strictEqual(updatedModuleName, 'module-local');
		assert.strictEqual(removedModuleName, 'module-local');
		assert.strictEqual(createdRepositoryPath, 'csm/custom-module');
		assert.strictEqual(initialized, true);
		disposable.dispose();
		initDisposable.dispose();
	});

	test('ModuleSidebarViewProvider keeps login and batch apply in the title bar', () => {
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => undefined,
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
		});

		provider.setAuthenticated(false);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
		]);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		mocked.__resolveWebviewView('csmModules.view');
		const rendered = mocked.__getLastWebviewView();

		assert.strictEqual(rendered?.title, 'Available Modules');
		assert.ok(rendered?.html.includes('1 available | 0 selected'));
		assert.ok(rendered?.html.includes('Loaded 1 public module(s). Sign in to see private modules.'));
		assert.ok(!rendered?.html.includes('data-action="login"'));
		assert.ok(!rendered?.html.includes('data-role="apply-selected"'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider toggles inline README preview from module clicks', async () => {
		let previewRequests = 0;
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => undefined,
			onPreviewReadme: async (entry) => {
				previewRequests += 1;
				return `<h1>${entry.name}</h1><p>Rendered README preview</p>`;
			},
			onApplySelection: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
		]);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');

		resolved?.fireMessage({ type: 'togglePreview', moduleKey: 'org/module-a' });
		await Promise.resolve();
		await Promise.resolve();

		const previewRender = mocked.__getLastWebviewView();
		assert.strictEqual(previewRequests, 1);
		assert.ok(previewRender?.html.includes('data-role="readme-preview"'));
		assert.ok(previewRender?.html.includes('Rendered README preview'));

		resolved?.fireMessage({ type: 'togglePreview', moduleKey: 'org/module-a' });
		await Promise.resolve();

		const collapsedRender = mocked.__getLastWebviewView();
		assert.strictEqual(previewRequests, 1);
		assert.ok(!collapsedRender?.html.includes('data-role="readme-preview"'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider renders and forwards sort control changes', () => {
		const sortUpdates: Array<Record<string, string>> = [];
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => undefined,
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: () => undefined,
			onRemoveModule: () => undefined,
			onUpdateModule: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: (sortState) => {
				sortUpdates.push(sortState as Record<string, string>);
			},
		});

		provider.setAuthenticated(true);
		provider.setSortOrder({ field: 'owner', direction: 'desc' });
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'A demo module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
		]);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');
		const rendered = mocked.__getLastWebviewView();

		assert.ok(rendered?.html.includes('data-role="filter-button"'));
		assert.ok(rendered?.html.includes('filter-menu-label">Show</span>'));
		assert.ok(rendered?.html.includes('Filter and sort modules. Current: Owner, Descending.'));
		assert.ok(rendered?.html.includes('filter-menu-label">Type</span>'));
		assert.ok(rendered?.html.includes('filter-menu-label">Order</span>'));
		assert.ok(rendered?.html.includes('data-sort-field="owner"'));
		assert.ok(rendered?.html.includes('filter-menu-option selected" data-action="setSortField" data-sort-field="owner"'));
		assert.ok(rendered?.html.includes('filter-menu-option selected" data-action="setSortDirection" data-sort-direction="desc"'));

		resolved?.fireMessage({ type: 'setSortField', sortField: 'applied' });
		resolved?.fireMessage({ type: 'setSortDirection', sortDirection: 'asc' });

		assert.deepStrictEqual(sortUpdates, [
			{ field: 'applied' },
			{ direction: 'asc' },
		]);
		disposable.dispose();
	});

	test('WorkspaceModuleService persists and reloads local module config', async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-modules-config-'));
		const service = new WorkspaceModuleService();
		try {
			const initialConfig = await service.initializeConfig(repoRoot, 'csm');
			const updatedConfig = service.withAppliedModule(initialConfig, {
				key: 'org__module_a',
				name: 'module-a',
				owner: 'org',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				path: 'csm/module-a',
				ref: 'abc123',
				branch: 'main',
			});
			await service.writeConfig(updatedConfig);

			const reloadedConfig = await service.loadConfig(repoRoot, initialConfig.configPath);
			assert.strictEqual(path.basename(initialConfig.configPath), LOCAL_MODULE_CONFIG_FILE);
			assert.strictEqual(reloadedConfig.root, 'csm');
			assert.strictEqual(reloadedConfig.version, '2');
			assert.deepStrictEqual(reloadedConfig.modules.org__module_a, updatedConfig.modules.org__module_a);
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('WorkspaceModuleService migrates legacy lvcsm config paths to yaml', async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-modules-legacy-'));
		const service = new WorkspaceModuleService();
		try {
			const configDir = path.join(repoRoot, 'csm');
			await fs.mkdir(configDir, { recursive: true });
			const legacyConfigPath = path.join(configDir, LEGACY_LOCAL_MODULE_CONFIG_FILE);
			await fs.writeFile(legacyConfigPath, [
				'[csmModules]',
				'version=1',
				'root=csm',
				'',
				'[module.org__module_a]',
				'name=module-a',
				'owner=org',
				'source=https://github.com/org/module-a',
				'method=submodule',
				'path=csm/module-a',
				'ref=abc123',
				'branch=main',
			].join('\n'), 'utf8');

			const config = await service.loadConfig(repoRoot, legacyConfigPath);
			assert.strictEqual(path.basename(config.configPath), LOCAL_MODULE_CONFIG_FILE);
			assert.strictEqual(config.modules.org__module_a?.method, 'submodule');
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('WorkspaceModuleService publishes a local folder to a new remote repository', async () => {
		const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-publish-module-'));
		const remoteUrl = 'https://github.com/tester/shared-module.git';
		await fs.writeFile(path.join(folderPath, 'module.vi'), 'demo', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'init':
				case 'config user.name Tester':
				case 'config user.email tester@example.com':
				case 'add --all':
				case 'commit -m Initial publish of custom-module':
				case 'branch -M main':
				case 'push -u origin main':
					return '';
				case 'remote get-url origin':
				case 'rev-parse --verify HEAD':
					throw new Error('missing');
				case 'status --porcelain':
					return 'A  module.vi';
				case 'branch --show-current':
					return 'master';
				default:
					if (options.args[0] === 'remote' && options.args[1] === 'add') {
						assert.strictEqual(options.args[2], 'origin');
						assert.strictEqual(options.args[3], remoteUrl);
						return '';
					}
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.publishLocalFolder({
				folderPath,
				remoteUrl,
				authToken: 'token',
				defaultBranch: 'main',
				commitMessage: 'Initial publish of custom-module',
				authorName: 'Tester',
				authorEmail: 'tester@example.com',
			});

			assert.deepStrictEqual(gitRunner.calls.map((call) => call.args.join(' ')), [
				'init',
				'config user.name Tester',
				'config user.email tester@example.com',
				'remote get-url origin',
				'remote add origin https://github.com/tester/shared-module.git',
				'add --all',
				'rev-parse --verify HEAD',
				'status --porcelain',
				'commit -m Initial publish of custom-module',
				'branch --show-current',
				'branch -M main',
				'push -u origin main',
			]);
			assert.deepStrictEqual(result, {
				branch: 'main',
				remoteName: 'origin',
				remoteUrl,
				createdCommit: true,
			});
		} finally {
			await fs.rm(folderPath, { recursive: true, force: true });
		}
	});

	test('WorkspaceModuleService reconstructs yaml config from existing csm submodules', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-modules-recover-'));
		const moduleRepo = path.join(tempRoot, 'module-a-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# module-a\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module']);

			await fs.mkdir(repoRoot, { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repoRoot, ['-c', 'protocol.file.allow=always', 'submodule', 'add', moduleRepo, 'csm/module-a']);
			runGit(repoRoot, ['commit', '-am', 'add submodule']);

			const config = await service.recoverConfigFromExistingSubmodules(repoRoot);
			assert.ok(config);
			assert.strictEqual(path.basename(config?.configPath ?? ''), LOCAL_MODULE_CONFIG_FILE);
			assert.ok(config?.modules['local__module-a']);
			assert.strictEqual(config?.modules['local__module-a'].method, 'submodule');
			assert.strictEqual(config?.modules['local__module-a'].path, 'csm/module-a');
			const yamlText = await fs.readFile(config?.configPath ?? '', 'utf8');
			assert.ok(yamlText.includes('modules:'));
			assert.ok(yamlText.includes('local__module-a:'));
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	test('WorkspaceModuleService previews and updates copy modules with a zip backup', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-modules-copy-update-'));
		const moduleRepo = path.join(tempRoot, 'module-copy-repo');
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v1\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module']);

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy');
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'), 'utf8')).includes('# v1'));

			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);
			const latestRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			const preview = await service.previewCopyModuleUpdate(workspaceRoot, applied, moduleEntry);
			assert.strictEqual(preview.needsUpdate, true);
			assert.strictEqual(preview.latestRef, latestRef);
			assert.ok(preview.backupDirectory?.endsWith('.csm-module-backups'));

			const result = await service.updateModule(workspaceRoot, applied, moduleEntry, undefined, undefined, preview.latestRef);
			assert.strictEqual(result.entry.ref, latestRef);
			assert.ok(result.backupPath);
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'), 'utf8')).includes('# v2'));

			const backupZip = await JSZip.loadAsync(await fs.readFile(result.backupPath!));
			const backupReadme = await backupZip.file('module-copy/README.md')?.async('string');
			assert.ok(backupReadme?.includes('# v1'));

			const secondPreview = await service.previewCopyModuleUpdate(workspaceRoot, result.entry, moduleEntry);
			assert.strictEqual(secondPreview.needsUpdate, false);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
