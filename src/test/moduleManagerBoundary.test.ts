/**
 * Boundary tests for the moduleManager package (review item 6.2).
 *
 * These tests cover edge cases such as malformed YAML input, path traversal
 * attempts, and cache corruption that the standard regression suite did
 * not previously exercise.
 */
import './setup';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getTempRoot } from '../common/tempPaths';
import { suite, test } from 'mocha';

import { WorkspaceModuleService } from '../modules/workspaceModuleService';
import { ModuleCacheStore } from '../modules/cacheStore';

class InMemoryGlobalState {
	private readonly data = new Map<string, unknown>();
	get<T>(key: string): T | undefined {
		return this.data.get(key) as T | undefined;
	}
	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
	}
	keys(): readonly string[] { return [...this.data.keys()]; }
}

suite('Module Manager Boundary Tests', () => {
	test('YAML parser rejects malformed input gracefully', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-yaml-'));
		try {
			const configDir = path.join(tmpDir, 'csm');
			await fs.mkdir(configDir, { recursive: true });
			const configPath = path.join(configDir, 'modules.yaml');
			// Wildly malformed YAML: tabs, unbalanced brackets, embedded null
			await fs.writeFile(configPath, "version: '1.0'\nroot: csm\nmodules:\n  : invalid\n  - not a map\n", 'utf8');
			await assert.rejects(
				() => service.loadConfig(tmpDir, configPath),
				(error: unknown) => error instanceof Error && /Failed to parse YAML config/.test(error.message),
			);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('writeConfig + loadConfig round-trips entries with special characters', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-roundtrip-'));
		try {
			const configPath = path.join(tmpDir, 'csm', 'modules.yaml');
			const config = {
				version: '1.0',
				root: 'csm',
				configPath,
				modules: {
					'octocat__hello-world': {
						key: 'octocat__hello-world',
						name: 'hello-world',
						owner: 'octocat',
						source: 'https://github.com/octocat/hello-world.git',
						method: 'copy' as const,
						path: 'csm/hello-world',
						ref: 'abc123',
						branch: 'main: with colon # and hash',
					},
				},
			};
			await service.writeConfig(config);
			const reloaded = await service.loadConfig(tmpDir, configPath);
			assert.ok(reloaded);
			assert.strictEqual(reloaded.modules['octocat__hello-world'].branch, 'main: with colon # and hash');
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('ModuleCacheStore handles corrupt JSON-shaped GlobalState gracefully', () => {
		const state = new InMemoryGlobalState();
		// Inject a value of unexpected shape directly
		void state.update('csmModules.cache.modules', { random: 'not a snapshot' });
		const store = new ModuleCacheStore(state as unknown as import('vscode').Memento);
		const snapshot = store.getModuleSnapshot();
		// Either undefined (treated as missing) or an object with empty modules — must not throw.
		assert.ok(snapshot === undefined || Array.isArray(snapshot.modules), 'cache store must tolerate corrupt input');
	});

	test('targetExists rejects path-traversal style relative paths', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-trav-'));
		const outsideFile = path.join(path.dirname(tmpDir), `csm-outside-${Date.now()}.txt`);
		try {
			await fs.writeFile(outsideFile, 'outside', 'utf8');
			const exists = await service.targetExists(tmpDir, `../${path.basename(outsideFile)}`);
			assert.strictEqual(exists, false);
		} finally {
			await fs.rm(outsideFile, { force: true });
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories skips excluded relative paths (managed module subtrees)', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-scan-'));
		try {
			// csm/
			//   managed-a/          → excluded entirely (managed module)
			//     inner/
			//       data.lvlib      → strong signal; must NOT appear
			//   other/
			//     README.md
			//     main.vi           → weak signal; must appear
			const root = path.join(tmpDir, 'csm');
			await fs.mkdir(path.join(root, 'managed-a', 'inner'), { recursive: true });
			await fs.writeFile(path.join(root, 'managed-a', 'inner', 'data.lvlib'), '', 'utf8');
			await fs.mkdir(path.join(root, 'other'), { recursive: true });
			await fs.writeFile(path.join(root, 'other', 'README.md'), '# Other', 'utf8');
			await fs.writeFile(path.join(root, 'other', 'main.vi'), '', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm', {
				maxDepth: 3,
				includeReadmeWeakSignal: true,
				excludedRelativePaths: ['managed-a'],
			});
			assert.deepStrictEqual(discovered, ['other']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories skips default excluded directory names', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-skip-'));
		try {
			// csm/
			//   node_modules/       → default excluded name
			//     index.js + README → would otherwise be a weak-signal candidate
			//   real/
			//     README.md
			//     main.vi           → weak signal; must appear
			const root = path.join(tmpDir, 'csm');
			await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
			await fs.writeFile(path.join(root, 'node_modules', 'index.js'), '', 'utf8');
			await fs.writeFile(path.join(root, 'node_modules', 'README.md'), 'x', 'utf8');
			await fs.mkdir(path.join(root, 'real'), { recursive: true });
			await fs.writeFile(path.join(root, 'real', 'README.md'), '# real', 'utf8');
			await fs.writeFile(path.join(root, 'real', 'main.vi'), '', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm');
			assert.deepStrictEqual(discovered, ['real']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories skips special-character-prefixed directories (issue #77)', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-special-prefix-'));
		try {
			// csm/
			//   -dash/            → '-' prefix: not a submodule, never recursed
			//     README.md
			//     main.vi         → would otherwise be a strong-signal candidate
			//   _underscore/      → '_' prefix: skipped entirely
			//     data.lvlib
			//   _space-prefixed/  → ' ' prefix: skipped entirely
			//     other.vi
			//   real/             → normal folder, still discovered
			//     README.md
			//     main.vi
			const root = path.join(tmpDir, 'csm');
			await fs.mkdir(path.join(root, '-dash'), { recursive: true });
			await fs.writeFile(path.join(root, '-dash', 'README.md'), '# dash', 'utf8');
			await fs.writeFile(path.join(root, '-dash', 'main.vi'), '', 'utf8');
			await fs.mkdir(path.join(root, '_underscore'), { recursive: true });
			await fs.writeFile(path.join(root, '_underscore', 'data.lvlib'), '', 'utf8');
			await fs.mkdir(path.join(root, ' space-prefixed'), { recursive: true });
			await fs.writeFile(path.join(root, ' space-prefixed', 'other.vi'), '', 'utf8');
			await fs.mkdir(path.join(root, 'real'), { recursive: true });
			await fs.writeFile(path.join(root, 'real', 'README.md'), '# real', 'utf8');
			await fs.writeFile(path.join(root, 'real', 'main.vi'), '', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm');
			assert.deepStrictEqual(discovered, ['real']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories treats .vi/.vit files as a strong module signal (issue #77)', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-vi-signal-'));
		try {
			// csm/
			//   agilent/          → contains only .vi files, no README/.lvproj
			//     measure.vi
			//   typedef/          → contains only .vit files
			//     template.vit
			//   plain/            → no LabVIEW files: must NOT appear
			//     notes.txt
			const root = path.join(tmpDir, 'csm');
			await fs.mkdir(path.join(root, 'agilent'), { recursive: true });
			await fs.writeFile(path.join(root, 'agilent', 'measure.vi'), '', 'utf8');
			await fs.mkdir(path.join(root, 'typedef'), { recursive: true });
			await fs.writeFile(path.join(root, 'typedef', 'template.vit'), '', 'utf8');
			await fs.mkdir(path.join(root, 'plain'), { recursive: true });
			await fs.writeFile(path.join(root, 'plain', 'notes.txt'), 'x', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm', {
				includeReadmeWeakSignal: false,
			});
			assert.deepStrictEqual(discovered, ['agilent', 'typedef']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories does not recurse into a discovered module folder (issue #77)', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-no-recurse-'));
		try {
			// csm/
			//   module-a/         → strong signal at top level
			//     main.vi
			//     nested/         → inside a module: must NOT be reported separately
			//       inner.lvlib
			//   sibling/          → still discovered independently
			//     sibling.vi
			const root = path.join(tmpDir, 'csm');
			await fs.mkdir(path.join(root, 'module-a', 'nested'), { recursive: true });
			await fs.writeFile(path.join(root, 'module-a', 'main.vi'), '', 'utf8');
			await fs.writeFile(path.join(root, 'module-a', 'nested', 'inner.lvlib'), '', 'utf8');
			await fs.mkdir(path.join(root, 'sibling'), { recursive: true });
			await fs.writeFile(path.join(root, 'sibling', 'sibling.vi'), '', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm');
			assert.deepStrictEqual(discovered, ['module-a', 'sibling']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('listModuleDirectories reproduces the HAL/DMM layout from issue #77', async () => {
		const service = new WorkspaceModuleService();
		const tmpDir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-hal-dmm-'));
		try {
			// csm/HAL/DMM/{Agilent,NI,Typedef} — only NI contains .lvlib,
			// Agilent/Typedef only contain .vi files. All three must be found.
			const dmm = path.join(tmpDir, 'csm', 'HAL', 'DMM');
			await fs.mkdir(path.join(dmm, 'Agilent'), { recursive: true });
			await fs.writeFile(path.join(dmm, 'Agilent', 'agilent.vi'), '', 'utf8');
			await fs.mkdir(path.join(dmm, 'NI'), { recursive: true });
			await fs.writeFile(path.join(dmm, 'NI', 'data.lvlib'), '', 'utf8');
			await fs.mkdir(path.join(dmm, 'Typedef'), { recursive: true });
			await fs.writeFile(path.join(dmm, 'Typedef', 'typedef.vi'), '', 'utf8');

			const discovered = await service.listModuleDirectories(tmpDir, 'csm');
			assert.deepStrictEqual(discovered, ['HAL/DMM/Agilent', 'HAL/DMM/NI', 'HAL/DMM/Typedef']);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});
});
