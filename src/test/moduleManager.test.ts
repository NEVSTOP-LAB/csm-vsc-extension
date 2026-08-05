import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getTempRoot } from '../common/tempPaths';
import JSZip from 'jszip';
import { ModuleCacheStore, mapRepoToModuleEntry } from '../modules';
import { GitExecOptions, IGitRunner } from '../modules/gitService';
import { ReadmeAssetCache } from '../modules/readmeAssetCache';
import { ModuleSidebarViewProvider } from '../modules/moduleSidebarViewProvider';
import { ModuleTreeItem } from '../modules/moduleTreeTypes';
import { GitHubRepoSummary } from '../modules';
import { getVisibleModuleTopics } from '../modules/topics';
import { CsmModuleEntry } from '../modules/types';
import { LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from '../modules/workspaceModuleService';
import * as vscode from 'vscode';

type VscodeMock = typeof vscode & {
	__resolveWebviewView: (viewId: string) => { html: string; fireMessage: (message: unknown) => void } | undefined;
	__getLastWebviewView: () => { viewId: string; html: string; title?: string; description?: string; options?: { enableScripts?: boolean; localResourceRoots?: vscode.Uri[] } } | undefined;
	__resetUiState: () => void;
	__setConfigurationValue: (key: string, value: unknown) => void;
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

async function makeTreeWritable(targetPath: string): Promise<void> {
	let stat;
	try {
		stat = await fs.lstat(targetPath);
	} catch {
		return;
	}

	if (stat.isSymbolicLink()) {
		return;
	}

	if (stat.isDirectory()) {
		const entries = await fs.readdir(targetPath, { withFileTypes: true });
		for (const entry of entries) {
			await makeTreeWritable(path.join(targetPath, entry.name));
		}
	}

	await fs.chmod(targetPath, stat.isDirectory() ? 0o700 : 0o600).catch(() => undefined);
}

async function removeWritableTree(targetPath: string): Promise<void> {
	await makeTreeWritable(targetPath);
	await fs.rm(targetPath, { recursive: true, force: true });
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

	test('getVisibleModuleTopics hides the default internal topics', () => {
		const topics = getVisibleModuleTopics(['csm-modsets', 'lv-csm-app', 'labview-csm', 'labview', 'automation']);

		assert.deepStrictEqual(topics, ['automation']);
	});

	test('getVisibleModuleTopics respects configured hidden topics', () => {
		mocked.__setConfigurationValue('csmModules.hiddenTopics', ['custom-hidden', 'automation']);

		const topics = getVisibleModuleTopics(['csm-modsets', 'custom-hidden', 'automation', 'manual']);

		assert.deepStrictEqual(topics, ['csm-modsets', 'manual']);
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

	test('ReadmeAssetCache saves and reads markdown to/from cache', async () => {
		const storageRoot = vscode.Uri.file(path.join(getTempRoot(), `csm-readme-assets-${Date.now()}`));
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

		try {
			const sampleMarkdown = '# Hello\n\nThis is a README with an image:\n\n<img width="385" height="322" alt="image" src="https://example.com/image.png" />\n\nEnd.';

			// Save markdown to cache
			await cache.saveMarkdown(entry, sampleMarkdown);

			// Read it back
			const readme = await cache.readMarkdown(entry);
			assert.ok(readme);
			assert.ok(readme!.includes('# Hello'));
			assert.ok(readme!.includes('<img width="385"'));
			assert.ok(readme!.includes('End.'));

			// Verify URI
			const markdownUri = cache.getMarkdownUri(entry);
			assert.ok(markdownUri.fsPath.endsWith('README.md'));
		} finally {
			await removeWritableTree(storageRoot.fsPath);
		}
	});

	test('ModuleTreeItem includes topic and visibility metadata', () => {
		const entry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'A demo module',
			topics: ['csm-modsets', 'lv-csm-app', 'labview-csm', 'labview', 'automation'],
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
		assert.ok(!tooltip.includes('lv-csm-app'));
		assert.ok(!tooltip.includes('labview-csm'));
		assert.ok(!tooltip.includes('labview'));
		assert.strictEqual(item.command, undefined);
	});

	test('ModuleSidebarViewProvider renders extension-style module cards', () => {
		const assetRoot = vscode.Uri.file(path.join(getTempRoot(), 'csm-sidebar-readme-assets'));
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
				topics: ['csm-modsets', 'lv-csm-app', 'labview-csm', 'labview', 'automation'],
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
				topics: ['csm-modsets', 'lv-csm-app', 'labview-csm', 'labview', 'automation'],
				moduleEntry: {
					id: 1,
					owner: 'org',
					name: 'module-a',
					description: 'A demo module',
					topics: ['csm-modsets', 'lv-csm-app', 'labview-csm', 'labview', 'automation'],
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
		assert.ok(!rendered?.html.includes('lv-csm-app'));
		assert.ok(!rendered?.html.includes('labview-csm'));
		assert.ok(!rendered?.html.includes('labview'));
		assert.ok(rendered?.html.includes('data-action="toggleLocalModuleLock"'));
		// 已管理卡片新增「在 GitHub 中打开」按钮（本地条目，区别于在线卡片的 module-key 按钮）
		assert.ok(rendered?.html.includes('data-action="openRepository" data-local-item-id="'));
		// 已管理卡片精简后：切换方式/移除仅保留在右键菜单，不再出现在卡片上
		assert.ok(!rendered?.html.includes('data-action="switchLocalModuleMethod" data-local-item-id='));
		assert.ok(!rendered?.html.includes('data-action="removeLocalModule" data-local-item-id='));
		// data-vscode-context 携带状态键：moduleCard（star/signedIn）、workspaceCard managed（lock/gitAvailable）
		assert.ok(rendered?.html.includes('moduleStarred&quot;:true'));
		assert.ok(rendered?.html.includes('signedIn&quot;:true'));
		assert.ok(rendered?.html.includes('localLocked&quot;:true'));
		assert.ok(rendered?.html.includes('gitAvailable&quot;:'));
		assert.ok(rendered?.html.includes('canLinkRepository&quot;:true'));
		assert.ok(rendered?.html.includes('placeholder="Search modules"'));
		assert.ok(rendered?.html.includes('data-role="search-box"'));
		assert.ok(rendered?.html.includes('data-role="filter-button"'));
		assert.ok(rendered?.html.includes('data-role="filter-menu"'));
		assert.ok(rendered?.html.includes('Filter and sort modules. Current: Name, Ascending.'));
		assert.ok(rendered?.html.includes('--module-font-md: 13px;'));
		assert.ok(rendered?.html.includes('--module-icon-size: 18px;'));
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
		assert.ok(rendered?.html.includes('data-action="openRepository" data-module-key="org&#47;module-a" title="Open on GitHub" aria-label="Open on GitHub"'));
		assert.ok(rendered?.html.includes('data-action="openReadme" data-module-key="org&#47;module-a" title="Open README" aria-label="Open README"'));
		assert.ok(!rendered?.html.includes('data-module-key="org&#47;module-b"'));
		assert.ok(!rendered?.html.includes('Workspace: repo'));
		assert.ok(rendered?.html.includes('csm/'));
		assert.ok(!rendered?.html.includes('Signed in as tester.'));
		assert.ok(!rendered?.html.includes('Loaded 2 module(s), including private.'));
		assert.ok(rendered?.html.includes('1 applied | 2 workspace | 1 catalog | 0 selected'));
		assert.ok(!rendered?.html.includes('data-role="apply-selected"'));
		assert.ok(rendered?.html.includes('title="Open README"'));
		assert.ok(!rendered?.html.includes('class="avatar"'));
		assert.ok(!rendered?.html.includes('title="Refresh modules"'));
		assert.ok(!rendered?.html.includes('Cached list'));

		// 本地管理模块卡片展示当前版本徽章（issue #37）
		assert.ok(rendered?.html.includes('badge module-version'));
		assert.ok(rendered?.html.includes('>abc123<'));
		assert.ok(rendered?.html.includes('Branch: main'));

		provider.setSelection(['org/module-a']);
		const selectedRender = mocked.__getLastWebviewView();
		assert.ok(selectedRender?.html.includes('1 applied | 2 workspace | 1 catalog | 1 selected'));
		assert.ok(selectedRender?.html.includes('moduleSelected&quot;:true'));

		resolved?.fireMessage({ type: 'dismissIntroTip' });
		const dismissedRender = mocked.__getLastWebviewView();
		assert.ok(!dismissedRender?.html.includes('data-role="intro-tip"'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider keeps local link action enabled before catalog load', () => {
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
			onLinkLocalRepository: () => undefined,
		});

		provider.setAuthenticated(false);
		provider.setModules([]);
		provider.setWorkspaceContext({
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			appliedModuleKeys: [],
			managedModules: [],
			unmanagedFolders: [{
				id: 'csm/custom-module',
				kind: 'unmanaged',
				name: 'custom-module',
				path: 'csm/custom-module',
			}],
		});

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const rendered = mocked.__resolveWebviewView('csmModules.view');

		assert.ok(rendered?.html.includes('data-action="linkLocalRepository" data-local-item-id="csm&#47;custom-module"'));
		assert.ok(!rendered?.html.includes('data-action="linkLocalRepository" data-local-item-id="csm&#47;custom-module" disabled'));
		assert.ok(rendered?.html.includes('Click Link Online Repo to load the module catalog first if it is not ready yet.'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider forwards checkbox selection and card actions', () => {
		const selectionUpdates: string[][] = [];
		let appliedModuleName = '';
		let toggledStarName = '';
		let openedRepositoryName = '';
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
			onOpenRepository: (entry) => {
				openedRepositoryName = entry.name;
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
		resolved?.fireMessage({ type: 'openRepository', moduleKey: 'org/module-a' });
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
		assert.strictEqual(openedRepositoryName, 'module-a');
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

	test('ModuleSidebarViewProvider renders merged workspace and catalog content and switches scope', () => {
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
			onCreateLocalRepository: () => undefined,
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
		});

		provider.setAuthenticated(true);
		provider.setModules([
			{
				id: 1,
				owner: 'org',
				name: 'module-remote',
				description: 'Remote module',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-remote',
			},
		]);
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

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');
		const rendered = mocked.__getLastWebviewView();

		assert.strictEqual(rendered?.viewId, 'csmModules.view');
		assert.ok(rendered?.html.includes('data-action="setScope" data-scope="all"'));
		assert.ok(rendered?.html.includes('data-action="setScope" data-scope="workspace"'));
		assert.ok(rendered?.html.includes('data-action="setScope" data-scope="catalog"'));
		assert.ok(rendered?.html.includes('<span class="section-title">Workspace</span>'));
		assert.ok(rendered?.html.includes('<span class="section-title">Catalog</span>'));
		assert.ok(rendered?.html.includes('csm/'));
		assert.ok(rendered?.html.includes('module-local'));
		assert.ok(rendered?.html.includes('custom-module'));
		assert.ok(rendered?.html.includes('module-remote'));
		assert.ok(rendered ? rendered.html.indexOf('<span class="section-title">Workspace</span>') < rendered.html.indexOf('<span class="section-title">Catalog</span>') : false);
		assert.ok(rendered ? rendered.html.indexOf('module-local') < rendered.html.indexOf('module-remote') : false);

		resolved?.fireMessage({ type: 'setScope', scope: 'workspace' });
		const workspaceRender = mocked.__getLastWebviewView();
		assert.ok(workspaceRender?.html.includes('data-action="setScope" data-scope="workspace"'));
		assert.match(workspaceRender?.html ?? '', /class="[^"]*\btoolbar-button\b[^"]*\bactive\b[^"]*"[^>]*data-action="setScope"[^>]*data-scope="workspace"/);
		assert.ok(workspaceRender?.html.includes('module-local'));
		assert.ok(!workspaceRender?.html.includes('module-remote'));

		resolved?.fireMessage({ type: 'setScope', scope: 'catalog' });
		const catalogRender = mocked.__getLastWebviewView();
		assert.ok(catalogRender?.html.includes('data-action="setScope" data-scope="catalog"'));
		assert.match(catalogRender?.html ?? '', /class="[^"]*\btoolbar-button\b[^"]*\bactive\b[^"]*"[^>]*data-action="setScope"[^>]*data-scope="catalog"/);
		assert.ok(catalogRender?.html.includes('module-remote'));
		assert.ok(!catalogRender?.html.includes('module-local'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider forwards local workspace actions', () => {
		let openedReadmeName = '';
		let removedModuleName = '';
		let updatedModuleName = '';
		let toggledLockName = '';
		let switchedModuleName = '';
		let createdRepositoryPath = '';
		let linkedRepositoryPath = '';
		let initialized = false;
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => {
				initialized = true;
			},
			onToggleStar: () => undefined,
			onOpenReadme: (entry) => {
				openedReadmeName = entry.name;
			},
			onRemoveModule: (entry) => {
				removedModuleName = entry.name;
			},
			onUpdateModule: (entry) => {
				updatedModuleName = entry.name;
			},
			onToggleLocalModuleLock: (entry) => {
				toggledLockName = entry.name;
			},
			onSwitchLocalModuleMethod: (entry) => {
				switchedModuleName = entry.name;
			},
			onCreateLocalRepository: (entry) => {
				createdRepositoryPath = entry.path;
			},
			onLinkLocalRepository: (entry) => {
				linkedRepositoryPath = entry.path;
			},
			onSelectionChange: () => undefined,
			onSortChange: () => undefined,
			onPreviewReadme: async () => '<p>Preview</p>',
			onApplySelection: () => undefined,
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
		provider.setCanInitializeWorkspace(true);

		const disposable = vscode.window.registerWebviewViewProvider('csmModules.view', provider);
		const resolved = mocked.__resolveWebviewView('csmModules.view');

		resolved?.fireMessage({ type: 'openLocalReadme', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'updateLocalModule', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'toggleLocalModuleLock', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'switchLocalModuleMethod', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'removeLocalModule', localItemId: 'local__module_local' });
		resolved?.fireMessage({ type: 'createLocalRepository', localItemId: 'csm/custom-module' });
		resolved?.fireMessage({ type: 'linkLocalRepository', localItemId: 'csm/custom-module' });
		resolved?.fireMessage({ type: 'initializeWorkspace' });

		assert.strictEqual(openedReadmeName, 'module-local');
		assert.strictEqual(updatedModuleName, 'module-local');
		assert.strictEqual(toggledLockName, 'module-local');
		assert.strictEqual(switchedModuleName, 'module-local');
		assert.strictEqual(removedModuleName, 'module-local');
		assert.strictEqual(createdRepositoryPath, 'csm/custom-module');
		assert.strictEqual(linkedRepositoryPath, 'csm/custom-module');
		assert.strictEqual(initialized, true);
		disposable.dispose();
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
		assert.ok(rendered?.html.includes('0 applied | 1 catalog | 0 selected'));
		assert.ok(rendered?.html.includes('Loaded 1 public module(s). Sign in to see private modules.'));
		assert.ok(!rendered?.html.includes('data-action="login"'));
		assert.ok(!rendered?.html.includes('data-role="apply-selected"'));
		disposable.dispose();
	});

	test('ModuleSidebarViewProvider opens README via built-in preview on module toggle', async () => {
		let openReadmeCalls = 0;
		const provider = new ModuleSidebarViewProvider({
			onLogin: () => undefined,
			onRefresh: () => undefined,
			onInitializeWorkspace: () => undefined,
			onToggleStar: () => undefined,
			onOpenReadme: () => {
				openReadmeCalls += 1;
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

		// togglePreview 现在触发 onOpenReadme（VS Code 内置 Markdown 预览）
		resolved?.fireMessage({ type: 'togglePreview', moduleKey: 'org/module-a' });
		await Promise.resolve();

		assert.strictEqual(openReadmeCalls, 1);

		// 再次 toggle 也触发 onOpenReadme
		resolved?.fireMessage({ type: 'togglePreview', moduleKey: 'org/module-a' });
		await Promise.resolve();

		assert.strictEqual(openReadmeCalls, 2);
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
		assert.ok(rendered?.html.includes('filter-menu-label">Scope</span>'));
		assert.ok(rendered?.html.includes('Filter and sort modules. Current: Owner, Descending.'));
		assert.ok(rendered?.html.includes('filter-menu-label">Type</span>'));
		assert.ok(rendered?.html.includes('filter-menu-label">Order</span>'));
		assert.ok(rendered?.html.includes('data-sort-field="owner"'));
		assert.ok(rendered?.html.includes('data-action="setScope" data-scope="all"'));
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
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-config-'));
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
			assert.strictEqual(reloadedConfig.modules.org__module_a?.locked, true);
			assert.deepStrictEqual(reloadedConfig.modules.org__module_a, updatedConfig.modules.org__module_a);
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService toggles local module files between readonly and writable', async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-lock-toggle-'));
		const service = new WorkspaceModuleService();
		try {
			const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
			await fs.mkdir(targetPath, { recursive: true });
			const readmePath = path.join(targetPath, 'README.md');
			await fs.writeFile(readmePath, 'demo', 'utf8');

			const lockedEntry = await service.setModuleLocked(workspaceRoot, {
				key: 'org__module_a',
				name: 'module-a',
				owner: 'org',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				path: 'csm/module-a',
				ref: 'abc123',
				branch: 'main',
			}, true);
			assert.strictEqual(lockedEntry.locked, true);
			assert.strictEqual((await fs.stat(readmePath)).mode & 0o222, 0);

			const unlockedEntry = await service.setModuleLocked(workspaceRoot, lockedEntry, false);
			assert.strictEqual(unlockedEntry.locked, false);
			assert.notStrictEqual((await fs.stat(readmePath)).mode & 0o200, 0);
		} finally {
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService computes platform-aware lock modes', () => {
		const service = new WorkspaceModuleService() as any;
		if (process.platform === 'win32') {
			assert.strictEqual(service.getLockMode(0o777, true, true), 0o555);
			assert.strictEqual(service.getLockMode(0o555, true, false), 0o755);
			assert.strictEqual(service.getLockMode(0o711, false, true), 0o511);
			assert.strictEqual(service.getLockMode(0o444, false, false), 0o644);
			return;
		}

		assert.strictEqual(service.getLockMode(0o755, true, true), 0o555);
		assert.strictEqual(service.getLockMode(0o555, true, false), 0o755);
		assert.strictEqual(service.getLockMode(0o744, false, true), 0o544);
		assert.strictEqual(service.getLockMode(0o544, false, false), 0o744);
	});

	test('WorkspaceModuleService continues locking remaining files when one chmod fails', async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-lock-partial-failure-'));
		const service = new WorkspaceModuleService();
		const fsModule = require('fs/promises') as typeof fs & { chmod: typeof fs.chmod };
		const originalChmod = fsModule.chmod;
		try {
			const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
			const failingFile = path.join(targetPath, 'a.txt');
			const healthyFile = path.join(targetPath, 'b.txt');
			await fs.mkdir(targetPath, { recursive: true });
			await fs.writeFile(failingFile, 'fail', 'utf8');
			await fs.writeFile(healthyFile, 'ok', 'utf8');

			fsModule.chmod = (async (pathLike, mode) => {
				const normalizedPath = pathLike.toString();
				if (normalizedPath === failingFile) {
					const error = new Error('mock chmod denied') as NodeJS.ErrnoException;
					error.code = 'EPERM';
					throw error;
				}
				return originalChmod(pathLike, mode);
			}) as typeof fs.chmod;

			await assert.rejects(() => service.setModuleLocked(workspaceRoot, {
				key: 'org__module_a',
				name: 'module-a',
				owner: 'org',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				path: 'csm/module-a',
				ref: 'abc123',
				branch: 'main',
			}, true), /a\.txt: mock chmod denied/);
			assert.strictEqual((await fs.stat(healthyFile)).mode & 0o222, 0);
		} finally {
			fsModule.chmod = originalChmod;
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService skips redundant chmod calls when lock state already matches', async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-lock-noop-sync-'));
		const service = new WorkspaceModuleService();
		const fsModule = require('fs/promises') as typeof fs & { chmod: typeof fs.chmod };
		const originalChmod = fsModule.chmod;
		let chmodCalls = 0;
		try {
			const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
			const readmePath = path.join(targetPath, 'README.md');
			await fs.mkdir(targetPath, { recursive: true });
			await fs.writeFile(readmePath, 'demo', 'utf8');

			const lockedEntry = await service.setModuleLocked(workspaceRoot, {
				key: 'org__module_a',
				name: 'module-a',
				owner: 'org',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				path: 'csm/module-a',
				ref: 'abc123',
				branch: 'main',
			}, true);

			fsModule.chmod = (async (pathLike, mode) => {
				chmodCalls += 1;
				return originalChmod(pathLike, mode);
			}) as typeof fs.chmod;

			await service.syncModuleLockStates(workspaceRoot, [lockedEntry]);

			assert.strictEqual(chmodCalls, 0);
		} finally {
			fsModule.chmod = originalChmod;
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService migrates legacy lvcsm config paths to yaml', async () => {
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-legacy-'));
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
			assert.strictEqual(config.modules.org__module_a?.locked, true);
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService backfills missing locked flags when loading yaml config', async () => {
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-locked-migrate-'));
		const service = new WorkspaceModuleService();
		try {
			const configDir = path.join(repoRoot, 'csm');
			const configPath = path.join(configDir, LOCAL_MODULE_CONFIG_FILE);
			await fs.mkdir(configDir, { recursive: true });
			await fs.writeFile(configPath, [
				'version: "2"',
				'root: "csm"',
				'modules:',
				'  org__module_a:',
				'    name: "module-a"',
				'    owner: "org"',
				'    source: "https://github.com/org/module-a"',
				'    method: "copy"',
				'    path: "csm/module-a"',
				'    ref: "abc123"',
				'    branch: "main"',
			].join('\n'), 'utf8');

			const config = await service.loadConfig(repoRoot, configPath);
			const migratedYaml = await fs.readFile(configPath, 'utf8');

			assert.strictEqual(config.modules.org__module_a?.locked, true);
			assert.ok(migratedYaml.includes('locked: true'));
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService publishes a local folder to a new remote repository', async () => {
		const folderPath = await fs.mkdtemp(path.join(getTempRoot(), 'csm-publish-module-'));
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
				case 'rev-parse HEAD':
					return 'abc123\n';
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
				'rev-parse HEAD',
			]);
			assert.deepStrictEqual(result, {
				branch: 'main',
				remoteName: 'origin',
				remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			});
		} finally {
			await removeWritableTree(folderPath);
		}
	});

	test('WorkspaceModuleService converts a published local folder into a git submodule', async () => {
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-convert-submodule-'));
		const targetRelativePath = 'csm/custom-module';
		const targetPath = path.join(repoRoot, 'csm', 'custom-module');
		const remoteUrl = 'https://github.com/tester/shared-module.git';
		await fs.mkdir(targetPath, { recursive: true });

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'rm -r --cached --ignore-unmatch -- csm/custom-module':
				case 'submodule add -f -b main https://github.com/tester/shared-module.git csm/custom-module':
				case 'submodule absorbgitdirs -- csm/custom-module':
				case 'submodule update --init --recursive csm/custom-module':
					return '';
				case 'rev-parse HEAD':
					assert.strictEqual(path.normalize(options.cwd), path.normalize(targetPath));
					return 'abc123\n';
				default:
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.convertPublishedFolderToSubmodule({
				repoRoot,
				targetRelativePath,
				remoteUrl,
				branch: 'main',
				authToken: 'token',
			});

			assert.deepStrictEqual(gitRunner.calls.map((call) => call.args.join(' ')), [
				'rm -r --cached --ignore-unmatch -- csm/custom-module',
				'submodule add -f -b main https://github.com/tester/shared-module.git csm/custom-module',
				'submodule absorbgitdirs -- csm/custom-module',
				'submodule update --init --recursive csm/custom-module',
				'rev-parse HEAD',
			]);
			assert.deepStrictEqual(result, {
				branch: 'main',
				headRef: 'abc123',
			});
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService switches a submodule to copy mode without changing module files', async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-to-copy-'));
		const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'demo', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'submodule deinit -f -- csm/module-a':
				case 'rm -rf -- csm/module-a':
					return '';
				default:
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.switchModuleMethod(
				workspaceRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'submodule',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
				},
				'copy',
				undefined,
				workspaceRoot,
			);

			assert.strictEqual(result.entry.method, 'copy');
			assert.strictEqual(result.entry.ref, 'abc123');
			assert.strictEqual(await fs.readFile(path.join(targetPath, 'README.md'), 'utf8'), 'demo');
			assert.deepStrictEqual(gitRunner.calls.map((call) => call.args.join(' ')), [
				'submodule deinit -f -- csm/module-a',
				'rm -rf -- csm/module-a',
			]);
		} finally {
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService fails submodule-to-copy switch when the recreated target disappears before relocking', async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-to-copy-missing-'));
		const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
		const fsModule = require('fs/promises') as typeof fs & { copyFile: typeof fs.copyFile };
		const originalCopyFile = fsModule.copyFile;
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'demo', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'submodule deinit -f -- csm/module-a':
				case 'rm -rf -- csm/module-a':
					return '';
				default:
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			fsModule.copyFile = (async (sourcePath, destinationPath, mode) => {
				const result = await originalCopyFile(sourcePath, destinationPath, mode);
				if (String(destinationPath) === path.join(targetPath, 'README.md')) {
					await fs.rm(targetPath, { recursive: true, force: true });
				}
				return result;
			}) as typeof fs.copyFile;

			await assert.rejects(() => service.switchModuleMethod(
				workspaceRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'submodule',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
					locked: true,
				},
				'copy',
				undefined,
				workspaceRoot,
			), /Converted module target is missing after switching to copy mode: csm\/module-a/);
		} finally {
			fsModule.copyFile = originalCopyFile;
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService switches a copied module to submodule mode', async () => {
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-to-submodule-'));
		const targetPath = path.join(repoRoot, 'csm', 'module-a');
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'demo', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'checkout abc123':
				case 'rm -r --cached --ignore-unmatch -- csm/module-a':
				case 'submodule add -f -b main https://github.com/org/module-a csm/module-a':
				case 'submodule absorbgitdirs -- csm/module-a':
					return '';
				case 'rev-parse HEAD':
					assert.strictEqual(path.normalize(options.cwd), path.normalize(targetPath));
					return 'abc123\n';
				default:
					if (options.args[0] === 'clone') {
						assert.deepStrictEqual(options.args.slice(0, 4), ['clone', '--branch', 'main', 'https://github.com/org/module-a']);
						await fs.mkdir(String(options.args[4]), { recursive: true });
						await fs.writeFile(path.join(String(options.args[4]), 'README.md'), 'demo', 'utf8');
						return '';
					}
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.switchModuleMethod(
				repoRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'copy',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
				},
				'submodule',
				'token',
				repoRoot,
			);

			assert.strictEqual(result.entry.method, 'submodule');
			assert.strictEqual(result.entry.ref, 'abc123');
			assert.ok(gitRunner.calls.some((call) => call.args[0] === 'clone'));
			assert.ok(gitRunner.calls.some((call) => call.args.join(' ') === 'checkout abc123'));
			assert.ok(gitRunner.calls.some((call) => call.args.join(' ') === 'submodule add -f -b main https://github.com/org/module-a csm/module-a'));
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService switches a copy module to release mode by downloading assets', async function () {
		this.timeout(20000);
		const originalFetch = globalThis.fetch;
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-to-release-'));
		const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'old', 'utf8');

		const gitRunner = new RecordingGitRunner(async () => {
			throw new Error('Unexpected git command');
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const zip = new JSZip();
			zip.file('rel-pkg/Foo.vi', 'rel-vi');
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
			globalThis.fetch = (async () => ({
				ok: true,
				status: 200,
				arrayBuffer: async () => zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
			}) as Response) as typeof fetch;

			const result = await service.switchModuleMethod(
				workspaceRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'copy',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
				},
				'release',
				undefined,
				workspaceRoot,
				{
					kind: 'release',
					versionRef: 'v2.0',
					releaseName: 'Release v2.0',
					releaseAssets: [{ name: 'rel-v2.zip', browserDownloadUrl: 'https://example.com/rel-v2.zip' }],
					branch: 'main',
					label: 'Release v2.0',
				},
			);

			// copy → release：目录被附件整体替换（顶层剥离），无 zip 备份
			assert.strictEqual(result.entry.method, 'release');
			assert.strictEqual(result.entry.versionKind, 'release');
			assert.strictEqual(result.entry.versionRef, 'v2.0');
			assert.strictEqual(result.entry.releaseName, 'Release v2.0');
			assert.strictEqual(await fs.readFile(path.join(targetPath, 'Foo.vi'), 'utf8'), 'rel-vi');
			const topEntries = await fs.readdir(targetPath);
			assert.ok(!topEntries.includes('README.md'));
			assert.deepStrictEqual(gitRunner.calls, []);
		} finally {
			globalThis.fetch = originalFetch;
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService switches a release module to copy mode by re-cloning the default branch', async function () {
		this.timeout(20000);
		const workspaceRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-release-to-copy-'));
		const targetPath = path.join(workspaceRoot, 'csm', 'module-a');
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'release-content', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case 'clone --depth 1 --branch main https://github.com/org/module-a src':
					await fs.mkdir(path.join(String(options.cwd), 'src'), { recursive: true });
					await fs.writeFile(path.join(String(options.cwd), 'src', 'README.md'), 'cloned', 'utf8');
					return '';
				case 'rev-parse HEAD':
					return 'def456\n';
				default:
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.switchModuleMethod(
				workspaceRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'release',
					path: 'csm/module-a',
					ref: '',
					branch: 'main',
					versionKind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release v1.0',
				},
				'copy',
				undefined,
				workspaceRoot,
			);

			// release → copy：重新克隆默认分支替换目录
			assert.strictEqual(result.entry.method, 'copy');
			assert.strictEqual(result.entry.versionKind, 'branch');
			assert.strictEqual(result.entry.versionRef, 'main');
			assert.strictEqual(result.entry.releaseName, undefined);
			assert.strictEqual(result.entry.ref, 'def456');
			assert.strictEqual(result.entry.branch, 'main');
			assert.strictEqual(await fs.readFile(path.join(targetPath, 'README.md'), 'utf8'), 'cloned');
			assert.deepStrictEqual(gitRunner.calls.map((call) => call.args.join(' ')), [
				'clone --depth 1 --branch main https://github.com/org/module-a src',
				'rev-parse HEAD',
			]);
		} finally {
			await removeWritableTree(workspaceRoot);
		}
	});

	test('WorkspaceModuleService switches a release module to submodule mode checking out the release tag', async function () {
		this.timeout(20000);
		const repoRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-switch-release-to-submodule-'));
		const targetPath = path.join(repoRoot, 'csm', 'module-a');
		await fs.mkdir(targetPath, { recursive: true });
		await fs.writeFile(path.join(targetPath, 'README.md'), 'release-content', 'utf8');

		const gitRunner = new RecordingGitRunner(async (options) => {
			const command = options.args.join(' ');
			switch (command) {
				case '-c protocol.file.allow=always submodule add -b main https://github.com/org/module-a csm/module-a':
				case '-c protocol.file.allow=always submodule update --init --recursive csm/module-a':
				case 'fetch --tags origin':
				case 'checkout v1.0':
					return '';
				case 'rev-parse HEAD':
					return 'def456\n';
				default:
					throw new Error(`Unexpected git command: ${command}`);
			}
		});
		const service = new WorkspaceModuleService(gitRunner);

		try {
			const result = await service.switchModuleMethod(
				repoRoot,
				{
					key: 'org__module_a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'release',
					path: 'csm/module-a',
					ref: '',
					branch: 'main',
					versionKind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release v1.0',
					locked: false,
				},
				'submodule',
				'token',
				repoRoot,
			);

			// release → submodule：submodule add 默认分支后检出 release 的 tag
			assert.strictEqual(result.entry.method, 'submodule');
			assert.strictEqual(result.entry.ref, 'def456');
			assert.strictEqual(result.entry.branch, 'main');
			assert.deepStrictEqual(gitRunner.calls.map((call) => call.args.join(' ')), [
				'-c protocol.file.allow=always submodule add -b main https://github.com/org/module-a csm/module-a',
				'-c protocol.file.allow=always submodule update --init --recursive csm/module-a',
				'fetch --tags origin',
				'checkout v1.0',
				'rev-parse HEAD',
			]);
		} finally {
			await removeWritableTree(repoRoot);
		}
	});

	test('WorkspaceModuleService reconstructs yaml config from existing csm submodules', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-recover-'));
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
			assert.strictEqual(config?.modules['local__module-a'].locked, true);
			assert.strictEqual((await fs.stat(path.join(repoRoot, 'csm', 'module-a', 'README.md'))).mode & 0o222, 0);
			const yamlText = await fs.readFile(config?.configPath ?? '', 'utf8');
			assert.ok(yamlText.includes('modules:'));
			assert.ok(yamlText.includes('local__module-a:'));
			assert.ok(yamlText.includes('locked: true'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService reconstructs yaml config from existing nested git module directories', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-recover-nested-'));
		const moduleRepo = path.join(tempRoot, 'module-nested-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# nested module\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init nested module']);
			runGit(moduleRepo, ['remote', 'add', 'origin', moduleRepo]);
			const nestedRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			await fs.mkdir(path.join(repoRoot, 'csm'), { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			await fs.cp(moduleRepo, path.join(repoRoot, 'csm', 'nested-module'), { recursive: true });

			const config = await service.recoverConfigFromExistingSubmodules(repoRoot);
			assert.ok(config);
			assert.ok(config?.modules['local__nested-module']);
			assert.strictEqual(config?.modules['local__nested-module'].method, 'submodule');
			assert.strictEqual(config?.modules['local__nested-module'].path, 'csm/nested-module');
			assert.strictEqual(config?.modules['local__nested-module'].source, moduleRepo);
			assert.strictEqual(config?.modules['local__nested-module'].ref, nestedRef);
			assert.strictEqual(config?.modules['local__nested-module'].branch, 'main');
			assert.strictEqual(config?.modules['local__nested-module'].locked, true);
			const gitmodulesText = await fs.readFile(path.join(repoRoot, '.gitmodules'), 'utf8');
			assert.ok(gitmodulesText.includes('csm/nested-module'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService previews and updates copy modules with a zip backup', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-copy-update-'));
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
			assert.strictEqual(applied.locked, true);
			assert.strictEqual((await fs.stat(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'))).mode & 0o222, 0);
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'), 'utf8')).includes('# v1'));

			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);
			const latestRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			const preview = await service.previewCopyModuleUpdate(workspaceRoot, applied, moduleEntry);
			assert.strictEqual(preview.needsUpdate, true);
			assert.strictEqual(preview.latestRef, latestRef);
			assert.ok(preview.backupDirectory?.endsWith('.csm-module-backups'));

			const result = await service.updateModule(workspaceRoot, applied, moduleEntry, {
				selection: {
					kind: 'latest',
					branch: 'main',
					label: 'latest',
					ref: preview.latestRef,
				},
				latestRefHint: preview.latestRef,
			});
			assert.strictEqual(result.entry.ref, latestRef);
			assert.strictEqual(result.entry.locked, true);
			assert.strictEqual(result.entry.versionKind, 'branch');
			assert.strictEqual(result.entry.versionRef, 'main');
			assert.ok(result.backupPath);
			assert.strictEqual((await fs.stat(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'))).mode & 0o222, 0);
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy', 'README.md'), 'utf8')).includes('# v2'));

			const backupZip = await JSZip.loadAsync(await fs.readFile(result.backupPath!));
			const backupReadme = await backupZip.file('module-copy/README.md')?.async('string');
			assert.ok(backupReadme?.includes('# v1'));

			const secondPreview = await service.previewCopyModuleUpdate(workspaceRoot, result.entry, moduleEntry);
			assert.strictEqual(secondPreview.needsUpdate, false);
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService updates a copy module to a specific older commit (rollback)', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-copy-commit-'));
		const moduleRepo = path.join(tempRoot, 'module-copy-commit-repo');
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
			const firstSha = runGit(moduleRepo, ['rev-parse', 'HEAD']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);
			const latestSha = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-copy-commit',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy');
			assert.strictEqual(applied.ref, latestSha);

			// 回退到旧提交
			const result = await service.updateModule(workspaceRoot, applied, moduleEntry, {
				selection: {
					kind: 'commit',
					versionRef: firstSha,
					ref: firstSha,
					branch: 'main',
					label: firstSha.slice(0, 7),
					commitInfo: 'init module',
				},
			});
			assert.strictEqual(result.entry.ref, firstSha);
			assert.strictEqual(result.entry.versionKind, 'commit');
			assert.strictEqual(result.entry.versionRef, firstSha);
			assert.strictEqual(result.entry.branch, 'main');
			assert.strictEqual(result.entry.locked, true);
			assert.ok(result.backupPath);
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy-commit', 'README.md'), 'utf8')).includes('# v1'));

			// 备份 zip 保存的是更新前的 v2
			const backupZip = await JSZip.loadAsync(await fs.readFile(result.backupPath!));
			const backupReadme = await backupZip.file('module-copy-commit/README.md')?.async('string');
			assert.ok(backupReadme?.includes('# v2'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService updates a submodule to a specific commit (detached HEAD)', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-submodule-commit-'));
		const moduleRepo = path.join(tempRoot, 'module-sub-commit-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v1\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module']);
			const firstSha = runGit(moduleRepo, ['rev-parse', 'HEAD']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);

			await fs.mkdir(repoRoot, { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repoRoot, ['-c', 'protocol.file.allow=always', 'submodule', 'add', moduleRepo, 'csm/module-a']);
			runGit(repoRoot, ['commit', '-am', 'add submodule']);

			const recovered = await service.recoverConfigFromExistingSubmodules(repoRoot);
			assert.ok(recovered);
			const entry = Object.values(recovered!.modules)[0]!;
			assert.strictEqual(entry.method, 'submodule');

			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'local',
				name: 'module-a',
				description: 'demo',
				topics: [],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};

			const result = await service.updateModule(repoRoot, entry, moduleEntry, {
				selection: {
					kind: 'commit',
					versionRef: firstSha,
					ref: firstSha,
					branch: 'main',
					label: firstSha.slice(0, 7),
					commitInfo: 'init module',
				},
			});
			assert.strictEqual(result.entry.ref, firstSha);
			assert.strictEqual(result.entry.versionKind, 'commit');
			assert.strictEqual(result.entry.versionRef, firstSha);

			const submodulePath = path.join(repoRoot, 'csm', 'module-a');
			const head = runGit(submodulePath, ['rev-parse', 'HEAD']);
			assert.strictEqual(head, firstSha);
			// detached HEAD：rev-parse --abbrev-ref 返回 "HEAD" 而非分支名
			const abbrevRef = runGit(submodulePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
			assert.strictEqual(abbrevRef, 'HEAD');
			assert.ok((await fs.readFile(path.join(submodulePath, 'README.md'), 'utf8')).includes('# v1'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService updates a copy module to a tag version', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-copy-tag-'));
		const moduleRepo = path.join(tempRoot, 'module-copy-tag-repo');
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
			const tagRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);
			runGit(moduleRepo, ['tag', 'v1.0']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-copy-tag',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy');

			const result = await service.updateModule(workspaceRoot, applied, moduleEntry, {
				selection: {
					kind: 'tag',
					versionRef: 'v1.0',
					branch: 'main',
					label: 'v1.0',
				},
			});
			assert.strictEqual(result.entry.ref, tagRef);
			assert.strictEqual(result.entry.versionKind, 'tag');
			assert.strictEqual(result.entry.versionRef, 'v1.0');
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-copy-tag', 'README.md'), 'utf8')).includes('# v1'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService applies a copy module at a specific tag version', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-tag-'));
		const moduleRepo = path.join(tempRoot, 'module-apply-tag-repo');
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
			const tagRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);
			runGit(moduleRepo, ['tag', 'v1.0']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-apply-tag',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			// 首次应用直接指定 v1.0 标签（copy）
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy', undefined, undefined, undefined, {
				kind: 'tag',
				versionRef: 'v1.0',
				branch: 'main',
				label: 'v1.0',
			});
			assert.strictEqual(applied.ref, tagRef);
			assert.strictEqual(applied.versionKind, 'tag');
			assert.strictEqual(applied.versionRef, 'v1.0');
			assert.strictEqual(applied.branch, 'main');
			assert.strictEqual(applied.locked, true);
			assert.ok((await fs.readFile(path.join(workspaceRoot, 'csm', 'module-apply-tag', 'README.md'), 'utf8')).includes('# v1'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService applies a submodule at a specific commit (detached HEAD)', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-sub-commit-'));
		const moduleRepo = path.join(tempRoot, 'module-apply-sub-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v1\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module']);
			const firstSha = runGit(moduleRepo, ['rev-parse', 'HEAD']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v2\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'update module']);

			await fs.mkdir(repoRoot, { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(repoRoot, 'README.md'), '# workspace\n', 'utf8');
			runGit(repoRoot, ['add', 'README.md']);
			runGit(repoRoot, ['commit', '-m', 'init workspace']);

			const config = await service.initializeConfig(repoRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-apply-sub',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			// 首次应用直接指定旧提交（submodule，detached HEAD）
			const applied = await service.applyModule(repoRoot, config, moduleEntry, 'submodule', undefined, undefined, undefined, {
				kind: 'commit',
				versionRef: firstSha,
				ref: firstSha,
				branch: 'main',
				label: firstSha.slice(0, 7),
			});
			assert.strictEqual(applied.ref, firstSha);
			assert.strictEqual(applied.versionKind, 'commit');
			assert.strictEqual(applied.versionRef, firstSha);
			assert.strictEqual(applied.branch, 'main');
			const submodulePath = path.join(repoRoot, 'csm', 'module-apply-sub');
			const head = runGit(submodulePath, ['rev-parse', 'HEAD']);
			assert.strictEqual(head, firstSha);
			const abbrevRef = runGit(submodulePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
			assert.strictEqual(abbrevRef, 'HEAD');
			assert.ok((await fs.readFile(path.join(submodulePath, 'README.md'), 'utf8')).includes('# v1'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService applies a copy module from a single release zip (top-level stripped)', async function () {
		this.timeout(20000);
		const originalFetch = globalThis.fetch;
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-release-single-'));
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			// 构造 zip：顶层单目录 module-xyz/
			const zip = new JSZip();
			zip.file('module-xyz/README.md', '# module\n');
			zip.file('module-xyz/Foo.vi', 'vi-bytes');
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
			globalThis.fetch = (async () => ({
				ok: true,
				status: 200,
				arrayBuffer: async () => zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
			}) as Response) as typeof fetch;

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 1,
				owner: 'org',
				name: 'module-rel',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-rel',
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy', undefined, undefined, undefined, {
				kind: 'release',
				versionRef: 'v1.0',
				releaseName: 'Release v1.0',
				releaseAssets: [
					{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/module-rel/releases/download/v1.0/module-v1.0.zip' },
				],
				branch: 'main',
				label: 'Release v1.0',
			});
			assert.strictEqual(applied.versionKind, 'release');
			assert.strictEqual(applied.versionRef, 'v1.0');
			assert.strictEqual(applied.releaseName, 'Release v1.0');
			assert.strictEqual(applied.ref, '');
			assert.strictEqual(applied.locked, true);
			const moduleDir = path.join(workspaceRoot, 'csm', 'module-rel');
			// 顶层单目录已剥离，内容直接放模块根
			assert.ok((await fs.readFile(path.join(moduleDir, 'README.md'), 'utf8')).includes('# module'));
			assert.strictEqual((await fs.readFile(path.join(moduleDir, 'Foo.vi'), 'utf8')), 'vi-bytes');
			const topEntries = await fs.readdir(moduleDir);
			assert.ok(!topEntries.includes('module-xyz'));
		} finally {
			globalThis.fetch = originalFetch;
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService applies a copy module from multiple release assets into per-asset subdirectories', async function () {
		this.timeout(20000);
		const originalFetch = globalThis.fetch;
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-release-multi-'));
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			const zipA = new JSZip();
			zipA.file('a-pkg/README.md', '# A\n');
			const bufA = await zipA.generateAsync({ type: 'nodebuffer' });
			const zipB = new JSZip();
			zipB.file('b-pkg/Foo.vi', 'b-vi');
			const bufB = await zipB.generateAsync({ type: 'nodebuffer' });
			globalThis.fetch = (async (input) => {
				const url = String(input);
				const buffer = url.includes('a-pkg') ? bufA : bufB;
				return {
					ok: true,
					status: 200,
					arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
				} as Response;
			}) as typeof fetch;

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 2,
				owner: 'org',
				name: 'module-rel-multi',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-rel-multi',
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy', undefined, undefined, undefined, {
				kind: 'release',
				versionRef: 'v1.0',
				releaseName: 'Release multi',
				releaseAssets: [
					{ name: 'a-pkg.zip', browserDownloadUrl: 'https://example.com/a-pkg.zip' },
					{ name: 'b-pkg.zip', browserDownloadUrl: 'https://example.com/b-pkg.zip' },
				],
				branch: 'main',
				label: 'Release multi',
			});
			const moduleDir = path.join(workspaceRoot, 'csm', 'module-rel-multi');
			// 每个附件一个独立子目录（文件名去扩展名），内部剥离顶层单目录
			assert.ok((await fs.readFile(path.join(moduleDir, 'a-pkg', 'README.md'), 'utf8')).includes('# A'));
			assert.strictEqual((await fs.readFile(path.join(moduleDir, 'b-pkg', 'Foo.vi'), 'utf8')), 'b-vi');
			const topEntries = await fs.readdir(moduleDir);
			assert.deepStrictEqual(topEntries.sort(), ['a-pkg', 'b-pkg']);
			assert.strictEqual(applied.versionKind, 'release');
		} finally {
			globalThis.fetch = originalFetch;
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService applies a copy module from a non-archive release asset by direct copy', async function () {
		this.timeout(20000);
		const originalFetch = globalThis.fetch;
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-release-flat-'));
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			const assetBytes = Buffer.from('readme-content');
			globalThis.fetch = (async () => ({
				ok: true,
				status: 200,
				arrayBuffer: async () => assetBytes.buffer.slice(assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength),
			}) as Response) as typeof fetch;

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 3,
				owner: 'org',
				name: 'module-rel-flat',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-rel-flat',
			};
			await service.applyModule(workspaceRoot, config, moduleEntry, 'copy', undefined, undefined, undefined, {
				kind: 'release',
				versionRef: 'v1.0',
				releaseName: 'Release flat',
				releaseAssets: [
					{ name: 'README.md', browserDownloadUrl: 'https://example.com/README.md' },
				],
				branch: 'main',
				label: 'Release flat',
			});
			const moduleDir = path.join(workspaceRoot, 'csm', 'module-rel-flat');
			assert.strictEqual((await fs.readFile(path.join(moduleDir, 'README.md'), 'utf8')), 'readme-content');
		} finally {
			globalThis.fetch = originalFetch;
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService rejects a release without downloadable assets', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-apply-release-none-'));
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 4,
				owner: 'org',
				name: 'module-rel-none',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-rel-none',
			};
			await assert.rejects(
				() => service.applyModule(workspaceRoot, config, moduleEntry, 'copy', undefined, undefined, undefined, {
					kind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release none',
					releaseAssets: [],
					branch: 'main',
					label: 'Release none',
				}),
				/no downloadable assets/,
			);
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService updates a copy module to a release by replacing the directory (no zip backup)', async function () {
		this.timeout(20000);
		const originalFetch = globalThis.fetch;
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-modules-update-release-'));
		const workspaceRoot = path.join(tempRoot, 'plain-workspace');
		const service = new WorkspaceModuleService();
		try {
			// 先以默认分支应用（模拟已有模块目录）
			const moduleRepo = path.join(tempRoot, 'module-repo');
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# v1\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init', '-q']);

			await fs.mkdir(workspaceRoot, { recursive: true });
			const config = await service.initializeConfig(workspaceRoot, 'csm');
			const moduleEntry: CsmModuleEntry = {
				id: 5,
				owner: 'org',
				name: 'module-rel-update',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: moduleRepo,
			};
			const applied = await service.applyModule(workspaceRoot, config, moduleEntry, 'copy');
			const moduleDir = path.join(workspaceRoot, 'csm', 'module-rel-update');
			assert.ok((await fs.readFile(path.join(moduleDir, 'README.md'), 'utf8')).includes('# v1'));

			// release 附件：zip 覆盖
			const zip = new JSZip();
			zip.file('rel-pkg/Foo.vi', 'rel-vi');
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
			globalThis.fetch = (async () => ({
				ok: true,
				status: 200,
				arrayBuffer: async () => zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
			}) as Response) as typeof fetch;

			const result = await service.updateModule(workspaceRoot, applied, moduleEntry, {
				selection: {
					kind: 'release',
					versionRef: 'v2.0',
					releaseName: 'Release v2.0',
					releaseAssets: [
						{ name: 'rel-v2.zip', browserDownloadUrl: 'https://example.com/rel-v2.zip' },
					],
					branch: 'main',
					label: 'Release v2.0',
				},
			});
			// 无 zip 备份，目录被整体替换为附件内容（顶层剥离）
			assert.strictEqual(result.backupPath, undefined);
			assert.strictEqual(result.entry.versionKind, 'release');
			assert.strictEqual(result.entry.versionRef, 'v2.0');
			assert.strictEqual(result.entry.releaseName, 'Release v2.0');
			assert.strictEqual((await fs.readFile(path.join(moduleDir, 'Foo.vi'), 'utf8')), 'rel-vi');
			const topEntries = await fs.readdir(moduleDir);
			assert.ok(!topEntries.includes('README.md'));
		} finally {
			globalThis.fetch = originalFetch;
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService syncSubmoduleEntriesToConfig adds untracked submodules to an existing config', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-sync-submodules-'));
		const moduleRepo = path.join(tempRoot, 'module-b-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# module-b\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module-b']);

			await fs.mkdir(repoRoot, { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repoRoot, ['-c', 'protocol.file.allow=always', 'submodule', 'add', moduleRepo, 'csm/module-b']);
			runGit(repoRoot, ['commit', '-am', 'add submodule module-b']);

			// Existing config that does NOT mention module-b
			const existingConfig = await service.initializeConfig(repoRoot, 'csm');

			const { config: synced, addedCount } = await service.syncSubmoduleEntriesToConfig(repoRoot, existingConfig);

			assert.strictEqual(addedCount, 1);
			assert.ok(synced.modules['local__module-b']);
			assert.strictEqual(synced.modules['local__module-b'].method, 'submodule');
			assert.strictEqual(synced.modules['local__module-b'].path, 'csm/module-b');
			assert.strictEqual(synced.modules['local__module-b'].locked, true);
			assert.strictEqual((await fs.stat(path.join(repoRoot, 'csm', 'module-b', 'README.md'))).mode & 0o222, 0);

			const yamlText = await fs.readFile(synced.configPath, 'utf8');
			assert.ok(yamlText.includes('local__module-b:'));
			assert.ok(yamlText.includes('locked: true'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService syncSubmoduleEntriesToConfig skips already-tracked submodules', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-sync-skip-'));
		const moduleRepo = path.join(tempRoot, 'module-c-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# module-c\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module-c']);

			await fs.mkdir(repoRoot, { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repoRoot, ['-c', 'protocol.file.allow=always', 'submodule', 'add', moduleRepo, 'csm/module-c']);
			runGit(repoRoot, ['commit', '-am', 'add submodule module-c']);

			// Recover config (already includes module-c)
			const recovered = await service.recoverConfigFromExistingSubmodules(repoRoot, 'csm');
			assert.ok(recovered);

			// Syncing again should add nothing
			const { addedCount } = await service.syncSubmoduleEntriesToConfig(repoRoot, recovered!);

			assert.strictEqual(addedCount, 0);
		} finally {
			await removeWritableTree(tempRoot);
		}
	});

	test('WorkspaceModuleService syncSubmoduleEntriesToConfig adds untracked nested git module directories to an existing config', async function () {
		this.timeout(20000);
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-sync-nested-repos-'));
		const moduleRepo = path.join(tempRoot, 'module-d-repo');
		const repoRoot = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fs.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(moduleRepo, 'README.md'), '# module-d\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module-d']);
			runGit(moduleRepo, ['remote', 'add', 'origin', moduleRepo]);
			const nestedRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			await fs.mkdir(path.join(repoRoot, 'csm'), { recursive: true });
			runGit(repoRoot, ['init', '--initial-branch=main']);
			runGit(repoRoot, ['config', 'user.name', 'Test User']);
			runGit(repoRoot, ['config', 'user.email', 'test@example.com']);
			await fs.cp(moduleRepo, path.join(repoRoot, 'csm', 'module-d'), { recursive: true });

			const existingConfig = await service.initializeConfig(repoRoot, 'csm');
			const { config: synced, addedCount } = await service.syncSubmoduleEntriesToConfig(repoRoot, existingConfig);

			assert.strictEqual(addedCount, 1);
			assert.ok(synced.modules['local__module-d']);
			assert.strictEqual(synced.modules['local__module-d'].method, 'submodule');
			assert.strictEqual(synced.modules['local__module-d'].source, moduleRepo);
			assert.strictEqual(synced.modules['local__module-d'].ref, nestedRef);
			assert.strictEqual(synced.modules['local__module-d'].branch, 'main');
			const gitmodulesText = await fs.readFile(path.join(repoRoot, '.gitmodules'), 'utf8');
			assert.ok(gitmodulesText.includes('csm/module-d'));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});
});
