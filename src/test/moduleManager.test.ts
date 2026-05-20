import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ModuleCacheStore, mapRepoToModuleEntry } from '../moduleManager';
import { ModuleTreeDataProvider, ModuleTreeItem } from '../moduleManager/moduleTreeDataProvider';
import { GitHubRepoSummary } from '../moduleManager';
import { LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE, WorkspaceModuleService } from '../moduleManager/workspaceModuleService';

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
		assert.strictEqual(snapshot?.schemaVersion, 1);
		assert.strictEqual(snapshot?.modules.length, 1);
		assert.ok(snapshot?.lastRefreshAt);

		await store.clear();
		assert.strictEqual(store.getModuleSnapshot(), undefined);
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
});
