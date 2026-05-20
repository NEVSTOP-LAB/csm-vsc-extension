import * as assert from 'assert';
import { ModuleCacheStore, mapRepoToModuleEntry } from '../moduleManager';
import { ModuleTreeDataProvider, ModuleTreeItem } from '../moduleManager/moduleTreeDataProvider';
import { GitHubRepoSummary } from '../moduleManager';

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

suite('Module Manager Tests', () => {
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

		await store.setModuleSnapshot([
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
		]);

		const snapshot = store.getModuleSnapshot();
		assert.ok(snapshot);
		assert.strictEqual(snapshot?.modules.length, 1);
		assert.ok(snapshot?.lastRefreshAt);

		await store.clear();
		assert.strictEqual(store.getModuleSnapshot(), undefined);
		assert.deepStrictEqual(store.getReadmeCache(), {});
	});

	test('ModuleTreeItem includes topic and visibility metadata', () => {
		const entry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'A demo module',
			topics: ['csm-modsets', 'automation'],
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
		assert.ok(tooltip.includes('Topics: csm-modsets, automation'));
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
});
