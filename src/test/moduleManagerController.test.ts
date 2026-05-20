import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ModuleManagerController } from '../moduleManager/moduleManagerController';
import { ModuleTreeItem } from '../moduleManager/moduleTreeDataProvider';
import { CsmModuleEntry, LocalModuleConfig, ModuleCacheSnapshot } from '../moduleManager/types';

type VscodeMock = typeof vscode & {
	__getMessageLog: () => Array<{ level: 'info' | 'warn' | 'error'; text: string }>;
	__resetMessageLog: () => void;
	__resetUiState: () => void;
	__setWarningMessageResponse: (response: string | undefined) => void;
	__setInformationMessageResponse: (response: unknown) => void;
	__setQuickPickResponse: (response: unknown) => void;
	__setFindFilesResult: (result: vscode.Uri[]) => void;
	__setWorkspaceFolders: (folders: Array<{ name: string; uri: vscode.Uri }> | undefined) => void;
	__setConfigurationValue: (key: string, value: unknown) => void;
	__getLastWebviewPanel: () => { title: string; html: string } | undefined;
};

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

function createController(globalState = new FakeMemento()): ModuleManagerController {
	const storageRoot = vscode.Uri.file(path.join(os.tmpdir(), `csm-vsc-support-tests-${Date.now()}`));
	const context = {
		globalState,
		globalStorageUri: storageRoot,
	} as unknown as vscode.ExtensionContext;
	return new ModuleManagerController(context);
}

function createCachedSnapshot(modules: CsmModuleEntry[], lastRefreshAt = new Date().toISOString()): ModuleCacheSnapshot {
	return {
		schemaVersion: 1,
		lastRefreshAt,
		modules,
	};
}

suite('ModuleManagerController Regression Tests', () => {
	const mocked = vscode as VscodeMock;

	teardown(() => {
		mocked.__resetMessageLog();
		mocked.__resetUiState();
	});

	test('refresh without session sets error and warning message', async () => {
		const controller = createController() as any;
		let setErrorText = '';
			mocked.__setWarningMessageResponse('Refresh');

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: (message: string) => {
				setErrorText = message;
			},
			setLoading: () => undefined,
			setModules: () => undefined,
		};

		await controller.refreshCommand();

		assert.strictEqual(setErrorText, 'GitHub sign-in is required to refresh modules.');
		const warnings = mocked.__getMessageLog().filter((m) => m.level === 'warn').map((m) => m.text);
		assert.ok(warnings.some((text) => text.includes('Unable to refresh modules without a GitHub session.')));
	});

	test('refresh github error sets tree error and error toast', async () => {
		const controller = createController() as any;
		let setErrorText = '';
			mocked.__setWarningMessageResponse('Refresh');

		controller.authService = {
			getSessionSilently: async () => ({ accessToken: 'token', account: { label: 'tester' } }),
			getSessionInteractively: async () => undefined,
		};
		controller.githubService = {
			fetchModules: async () => {
				throw new Error('503');
			},
			fetchReadme: async () => '',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: (message: string) => {
				setErrorText = message;
			},
			setLoading: () => undefined,
			setModules: () => undefined,
		};

		await controller.refreshCommand();

		assert.strictEqual(setErrorText, 'Failed to load modules from GitHub.');
		const errors = mocked.__getMessageLog().filter((m) => m.level === 'error').map((m) => m.text);
		assert.ok(errors.some((text) => text.includes('Failed to refresh CSM modules: 503')));
	});

	test('openReadme without cache and token shows warning', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: '',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};

		await controller.openReadmeCommand(entry);

		const warnings = mocked.__getMessageLog().filter((m) => m.level === 'warn').map((m) => m.text);
		assert.ok(warnings.some((text) => text.includes('No cached README and no GitHub session available.')));
	});

	test('openReadme accepts ModuleTreeItem from the view context menu', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 11,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};

		controller.readmeCache['org/module-a'] = '# demo';

		await controller.openReadmeCommand(new ModuleTreeItem(entry));

		const panel = mocked.__getLastWebviewPanel();
		assert.ok(panel);
		assert.strictEqual(panel?.title, 'README: module-a');
		assert.ok(panel?.html.includes('demo'));
	});

	test('login success triggers immediate module refresh', async () => {
		const controller = createController() as any;
		let moduleCount = -1;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => ({
				accessToken: 'token',
				account: { label: 'tester' },
			}),
		};
		controller.githubService = {
			fetchModules: async () => ([
				{
					id: 1,
					owner: 'org',
					name: 'module-a',
					description: 'demo',
					topics: ['csm-modsets'],
					visibility: 'public',
					defaultBranch: 'main',
					repoUrl: 'https://github.com/org/module-a',
				},
			]),
			fetchReadme: async () => '# demo',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: (modules: CsmModuleEntry[]) => {
				moduleCount = modules.length;
			},
		};

		await controller.loginCommand();

		assert.strictEqual(moduleCount, 1);
	});

	test('refresh cancellation does not fetch modules', async () => {
		const controller = createController() as any;
		let fetched = false;

		controller.authService = {
			getSessionSilently: async () => ({ accessToken: 'token', account: { label: 'tester' } }),
			getSessionInteractively: async () => undefined,
		};
		controller.githubService = {
			fetchModules: async () => {
				fetched = true;
				return [];
			},
			fetchReadme: async () => '',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
		};
		mocked.__resetMessageLog();
		mocked.__setWarningMessageResponse(undefined);

		await controller.refreshCommand();

		assert.strictEqual(fetched, false);
	});

	test('register keeps fresh cache without immediate background refresh', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1,
				owner: 'org',
				name: 'cached-module',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/cached-module',
			},
		]));
		const controller = createController(memento) as any;
		let fetched = false;
		let visibleModuleCount = 0;

		controller.authService = {
			getSessionSilently: async () => ({ accessToken: 'token', account: { label: 'tester' } }),
			getSessionInteractively: async () => undefined,
		};
		controller.githubService = {
			fetchModules: async () => {
				fetched = true;
				return [];
			},
			fetchReadme: async () => '',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: (modules: CsmModuleEntry[]) => {
				visibleModuleCount = modules.length;
			},
		};
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 60);

		controller.register([]);
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(visibleModuleCount, 1);
		assert.strictEqual(fetched, false);
	});

	test('expired cache refreshes in background without replacing visible modules with loading state', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1,
				owner: 'org',
				name: 'cached-module',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/cached-module',
			},
		], '2000-01-01T00:00:00.000Z'));
		const controller = createController(memento) as any;
		let fetched = false;
		let loadingCalls = 0;

		controller.authService = {
			getSessionSilently: async () => ({ accessToken: 'token', account: { label: 'tester' } }),
			getSessionInteractively: async () => undefined,
		};
		controller.githubService = {
			fetchModules: async () => {
				fetched = true;
				return [];
			},
			fetchReadme: async () => '',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => {
				loadingCalls += 1;
			},
			setModules: () => undefined,
		};
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 1);

		controller.register([]);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(fetched, true);
		assert.strictEqual(loadingCalls, 0);
	});

	test('apply initializes config and writes module record', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};
		const initialConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		};
		let writtenConfig: LocalModuleConfig | undefined;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			initializeConfig: async () => initialConfig,
			loadConfig: async () => initialConfig,
			getTargetRelativePath: (_config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `csm/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => ({
				key: 'org__module_a',
				name: moduleEntry.name,
				owner: moduleEntry.owner,
				source: moduleEntry.repoUrl,
				method: 'copy',
				path: `csm/${moduleEntry.name}`,
				ref: 'abc123',
				branch: moduleEntry.defaultBranch,
			}),
			withAppliedModule: (config: LocalModuleConfig, moduleEntry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[moduleEntry.key]: moduleEntry,
				},
			}),
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([]);
		mocked.__setInformationMessageResponse('Use csm/');
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(new ModuleTreeItem(entry));

		assert.ok(writtenConfig);
		assert.strictEqual(writtenConfig?.modules.org__module_a?.method, 'copy');
		assert.strictEqual(writtenConfig?.modules.org__module_a?.path, 'csm/module-a');
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Initialized local CSM module config')));
		assert.ok(infos.some((text) => text.includes('Applied 1 module(s) via copy')));
	});

	test('apply warns when copy target already exists', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 2,
			owner: 'org',
			name: 'module-b',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-b',
		};
		let applyCalled = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			getTargetRelativePath: (_config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `csm/${moduleEntry.name}`,
			targetExists: async () => true,
			applyModule: async () => {
				applyCalled = true;
				throw new Error('should not run');
			},
			withAppliedModule: (config: LocalModuleConfig) => config,
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setQuickPickResponse({ method: 'copy' });

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(applyCalled, false);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('Copy target already exists: csm/module-b')));
	});

	test('missing config recovers yaml config from existing csm submodules', async () => {
		const controller = createController() as any;
		const recoveredConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				local__module_a: {
					key: 'local__module_a',
					name: 'module-a',
					owner: '',
					source: 'https://github.com/org/module-a',
					method: 'submodule',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		let initializeCalled = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => recoveredConfig,
			initializeConfig: async () => {
				initializeCalled = true;
				return recoveredConfig;
			},
			loadConfig: async () => recoveredConfig,
			getTargetRelativePath: (_config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `csm/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => ({
				key: 'org__module_b',
				name: moduleEntry.name,
				owner: moduleEntry.owner,
				source: moduleEntry.repoUrl,
				method: 'submodule',
				path: `csm/${moduleEntry.name}`,
				ref: 'def456',
				branch: moduleEntry.defaultBranch,
			}),
			withAppliedModule: (config: LocalModuleConfig, moduleEntry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[moduleEntry.key]: moduleEntry,
				},
			}),
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([]);
		mocked.__setQuickPickResponse({ method: 'submodule' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand({
			id: 2,
			owner: 'org',
			name: 'module-b',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-b',
		});

		assert.strictEqual(initializeCalled, false);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Recovered local CSM module config from existing submodules')));
	});
});
