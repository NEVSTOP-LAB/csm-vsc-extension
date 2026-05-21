import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_LOCAL_MODULE_ROOT, IModuleViewProvider, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE } from '../moduleManager';
import { ModuleManagerController, ModuleManagerControllerDeps } from '../moduleManager/moduleManagerController';
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
	__setFindFilesResultForPattern: (pattern: string, result: vscode.Uri[]) => void;
	__setWorkspaceFolders: (folders: Array<{ name: string; uri: vscode.Uri }> | undefined) => void;
	__setConfigurationValue: (key: string, value: unknown) => void;
	__getContextValue: (key: string) => unknown;
	__getLastWarningPrompt: () => { message: string; items: unknown[] } | undefined;
	__getLastWebviewPanel: () => { title: string; html: string } | undefined;
	__resolveWebviewView: (viewId: string) => { html: string; fireMessage: (message: unknown) => void } | undefined;
	__getLastWebviewView: () => { viewId: string; html: string } | undefined;
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

function createController(globalState: FakeMemento = new FakeMemento(), deps: ModuleManagerControllerDeps = {}): ModuleManagerController {
	const storageRoot = vscode.Uri.file(path.join(os.tmpdir(), `csm-vsc-support-tests-${Date.now()}`));
	const context = {
		globalState,
		globalStorageUri: storageRoot,
	} as unknown as vscode.ExtensionContext;
	return new ModuleManagerController(context, deps);
}

function createViewProvider(overrides: Partial<IModuleViewProvider> = {}): IModuleViewProvider {
	return {
		setAuthenticated: () => undefined,
		setLoading: () => undefined,
		setError: () => undefined,
		setModules: () => undefined,
		setSelection: () => undefined,
		setWorkspaceContext: () => undefined,
		setCanInitializeWorkspace: () => undefined,
		...overrides,
	};
}

function createSession(token = 'token', label = 'tester'): vscode.AuthenticationSession {
	return {
		id: `${label}-session`,
		accessToken: token,
		account: {
			id: label,
			label,
		},
		scopes: [],
	};
}

function createCachedSnapshot(modules: CsmModuleEntry[], lastRefreshAt = new Date().toISOString()): ModuleCacheSnapshot {
	return {
		schemaVersion: 1,
		lastRefreshAt,
		modules,
	};
}

function createWorkspaceFolderWithCsmProject(prefix: string, root = DEFAULT_LOCAL_MODULE_ROOT): { repoRoot: string; lvprojPath: string } {
	const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	fs.mkdirSync(path.join(repoRoot, root), { recursive: true });
	const lvprojPath = path.join(repoRoot, 'demo.lvproj');
	fs.writeFileSync(lvprojPath, '<Project />', 'utf8');
	return { repoRoot, lvprojPath };
}

const configSearchPattern = `**/{${LOCAL_MODULE_CONFIG_FILE},${LEGACY_LOCAL_MODULE_CONFIG_FILE}}`;
const lvprojSearchPattern = '**/*.lvproj';

suite('ModuleManagerController Regression Tests', () => {
	const mocked = vscode as VscodeMock;

	teardown(() => {
		mocked.__resetMessageLog();
		mocked.__resetUiState();
	});

	test('refresh without session still fetches public modules', async () => {
		let moduleCount = -1;
		let receivedToken = 'unset';
		mocked.__setWarningMessageResponse('Refresh');

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async (token?: string) => {
					receivedToken = token ?? 'undefined';
					return {
						modules: [
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
						],
					};
				},
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					moduleCount = modules.length;
				},
			}),
		});

		await controller.refreshCommand();

		assert.strictEqual(receivedToken, 'undefined');
		assert.strictEqual(moduleCount, 1);
		const warnings = mocked.__getMessageLog().filter((m) => m.level === 'warn').map((m) => m.text);
		assert.ok(!warnings.some((text) => text.includes('Unable to refresh modules without a GitHub session.')));
	});

	test('refresh github error sets tree error and error toast', async () => {
		let setErrorText = '';
		mocked.__setWarningMessageResponse('Refresh');

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => {
					throw new Error('GitHub API request failed: 503');
				},
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setError: (message: string) => {
					setErrorText = message;
				},
			}),
		});

		await controller.refreshCommand();

		assert.strictEqual(setErrorText, 'GitHub is temporarily unavailable (HTTP 503). Try again in a moment.');
		const errors = mocked.__getMessageLog().filter((m) => m.level === 'error').map((m) => m.text);
		assert.ok(errors.some((text) => text.includes('Failed to refresh CSM modules: GitHub is temporarily unavailable (HTTP 503). Try again in a moment.')));
	});

	test('openReadme without cache and token fetches public README anonymously', async () => {
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

		let receivedToken = 'unset';
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchReadme: async (_owner: string, _repo: string, token?: string) => {
					receivedToken = token ?? 'undefined';
					return '# demo';
				},
				fetchModules: async () => ({ modules: [] }),
			},
		});

		await controller.openReadmeCommand(entry);

		assert.strictEqual(receivedToken, 'undefined');
		const panel = mocked.__getLastWebviewPanel();
		assert.ok(panel);
		assert.strictEqual(panel?.title, 'README: module-a');
		const warnings = mocked.__getMessageLog().filter((m) => m.level === 'warn').map((m) => m.text);
		assert.ok(!warnings.some((text) => text.includes('No cached README and no GitHub session available.')));
	});

	test('openReadme without cache and token still warns for private modules', async () => {
		const entry: CsmModuleEntry = {
			id: 2,
			owner: 'org',
			name: 'module-private',
			description: '',
			topics: ['csm-modsets'],
			visibility: 'private',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-private',
		};

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
		});

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
		let moduleCount = -1;

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => createSession(),
			},
			githubService: {
				fetchModules: async () => ({
					modules: [
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
					]
				}),
				fetchReadme: async () => '# demo',
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					moduleCount = modules.length;
				},
			}),
		});

		await controller.loginCommand();

		assert.strictEqual(moduleCount, 1);
		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), true);
	});

	test('login clears loading banner when GitHub reports modules unchanged', async () => {
		let loadingCalls = 0;
		let renderedModuleCount = -1;
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => createSession(),
			},
			githubService: {
				fetchModules: async () => ({ modules: [], notModified: true }),
				fetchReadme: async () => '# demo',
			},
			viewProvider: createViewProvider({
				setLoading: () => {
					loadingCalls += 1;
				},
				setModules: (modules: CsmModuleEntry[]) => {
					renderedModuleCount = modules.length;
				},
			}),
		});
		const controllerInternals = controller as unknown as { availableModules: CsmModuleEntry[] };
		controllerInternals.availableModules = [
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
		];

		await controller.loginCommand();

		assert.strictEqual(loadingCalls, 1);
		assert.strictEqual(renderedModuleCount, 1);
	});

	test('selection state toggles apply toolbar context', () => {
		const controller = createController() as any;
		controller.availableModules = [
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
		];
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
			setSelection: () => undefined,
		};

		controller.setSelectedModuleKeys(['org/module-a']);
		assert.strictEqual(mocked.__getContextValue('csmModules.hasSelection'), true);

		controller.setSelectedModuleKeys([]);
		assert.strictEqual(mocked.__getContextValue('csmModules.hasSelection'), false);
	});

	test('missing session clears signed-in toolbar context', async () => {
		const controller = createController() as any;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => ({
				accessToken: 'token',
				account: { label: 'tester' },
			}),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '# demo',
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
		};

		await controller.loginCommand();
		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), true);

		controller.currentToken = 'expired-token';
		controller.lastTokenVerifiedAt = 0;
		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		mocked.__setWarningMessageResponse('Refresh');

		await controller.refreshCommand();

		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), false);
	});

	test('refresh cancellation does not fetch modules', async () => {
		let fetched = false;

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => {
					fetched = true;
					return { modules: [] };
				},
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider(),
		});
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
		let fetched = false;
		let visibleModuleCount = 0;
		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => {
					fetched = true;
					return { modules: [] };
				},
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleCount = modules.length;
				},
			}),
		});
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 60);

		controller.register([]);
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(visibleModuleCount, 1);
		assert.strictEqual(fetched, false);
	});

	test('register refreshes fresh public cache when a signed-in session can expand results', async () => {
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
		let fetched = false;
		let visibleModuleCount = 0;

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => {
					fetched = true;
					return {
						modules: [
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
							{
								id: 2,
								owner: 'org',
								name: 'private-module',
								description: 'private',
								topics: ['csm-modsets'],
								visibility: 'private',
								defaultBranch: 'main',
								repoUrl: 'https://github.com/org/private-module',
							},
						],
					};
				},
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleCount = modules.length;
				},
			}),
		});
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 60);

		controller.register([]);
		await new Promise<void>((resolve) => setImmediate(resolve));

		assert.strictEqual(fetched, true);
		assert.strictEqual(visibleModuleCount, 2);
	});

	test('register restores persisted applied sort state for cached modules', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
		]));
		await memento.update('csmModules.sort.state', { field: 'applied', direction: 'desc' });
		const controller = createController(memento) as any;
		let visibleModuleKeys: string[] = [];
		let renderedSortState: Record<string, string> | undefined;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {
					org__module_b: {
						key: 'org__module_b',
						name: 'module-b',
						owner: 'org',
						source: 'https://github.com/org/module-b',
						method: 'copy',
						path: 'csm/module-b',
						ref: 'abc123',
						branch: 'main',
					},
				},
			}),
		};
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: (modules: CsmModuleEntry[]) => {
				visibleModuleKeys = modules.map((module) => `${module.owner}/${module.name}`);
			},
			setSortOrder: (sortState: Record<string, string>) => {
				renderedSortState = sortState;
			},
			setWorkspaceContext: () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, []);
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 60);

		controller.register([]);
		await controller.refreshSidebarWorkspaceState();

		assert.deepStrictEqual(renderedSortState, { field: 'applied', direction: 'desc' });
		assert.deepStrictEqual(visibleModuleKeys, ['org/module-b', 'org/module-a']);
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
				return { modules: [] };
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
		await new Promise<void>((resolve) => setImmediate(resolve));

		assert.strictEqual(fetched, true);
		assert.strictEqual(loadingCalls, 0);
	});

	test('setSortOrderCommand persists updated field and keeps direction', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.sort.state', { field: 'updatedAt', direction: 'desc' });
		const controller = createController(memento) as any;
		let visibleModuleKeys: string[] = [];
		let renderedSortState: Record<string, string> | undefined;

		controller.availableModules = [
			{
				id: 1,
				owner: 'alpha',
				name: 'module-a',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/alpha/module-a',
			},
			{
				id: 2,
				owner: 'zeta',
				name: 'module-b',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/zeta/module-b',
			},
		];
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: (modules: CsmModuleEntry[]) => {
				visibleModuleKeys = modules.map((module) => `${module.owner}/${module.name}`);
			},
			setSortOrder: (sortState: Record<string, string>) => {
				renderedSortState = sortState;
			},
		};

		controller.setSortOrderCommand('owner');
		await Promise.resolve();

		assert.deepStrictEqual(renderedSortState, { field: 'owner', direction: 'desc' });
		assert.deepStrictEqual(visibleModuleKeys, ['zeta/module-b', 'alpha/module-a']);
		assert.deepStrictEqual(memento.get('csmModules.sort.state'), { field: 'owner', direction: 'desc' });
	});

	test('register marks modules already applied in the current workspace', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1,
				owner: 'org',
				name: 'module-a',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'cached',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
		]));
		const controller = createController(memento) as any;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {
					org__module_a: {
						key: 'org__module_a',
						name: 'module-a',
						owner: 'org',
						source: 'https://github.com/org/module-a',
						method: 'copy',
						path: 'csm/module-a',
						ref: 'abc123',
						branch: 'main',
					},
				},
			}),
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, []);
		mocked.__setConfigurationValue('csmModules.cache.ttlMinutes', 60);

		controller.register([]);
		mocked.__resolveWebviewView('csmModules.view');
		await controller.refreshSidebarWorkspaceState();

		const rendered = mocked.__getLastWebviewView();
		assert.ok(!rendered?.html.includes('Workspace: repo'));
		assert.ok(rendered?.html.includes('Root: csm/'));
		assert.ok(rendered?.html.includes('1 applied'));
		assert.ok(rendered?.html.includes('Already recorded for repo under csm'));
		assert.ok(rendered?.html.includes('module-a'));
		assert.ok(rendered?.html.includes('module-b'));
	});

	test('proactive init detection prompts when csm and lvproj exist without config', async () => {
		const configuredRoot = 'modules/library';
		const { repoRoot, lvprojPath } = createWorkspaceFolderWithCsmProject('csm-init-detect-', configuredRoot);
		const controller = createController() as any;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => repoRoot,
			normalizeRootPath: (value: string) => value,
		};

		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file(repoRoot) }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, []);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, [vscode.Uri.file(lvprojPath)]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', configuredRoot);
		mocked.__setInformationMessageResponse('Later');

		await controller.refreshWorkspaceInitializationState({ prompt: true });

		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes(`Detected ${configuredRoot}/ and .lvproj files but no local CSM module config`)));
		assert.strictEqual(mocked.__getContextValue('csmModules.canInitializeWorkspace'), true);
	});

	test('initializeWorkspaceCommand recovers existing submodules and clears init toolbar state', async () => {
		const { repoRoot, lvprojPath } = createWorkspaceFolderWithCsmProject('csm-init-run-');
		const controller = createController() as any;
		const recoveredConfig: LocalModuleConfig = {
			version: '2',
			root: DEFAULT_LOCAL_MODULE_ROOT,
			configPath: path.join(repoRoot, DEFAULT_LOCAL_MODULE_ROOT, LOCAL_MODULE_CONFIG_FILE),
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
			resolveGitRepositoryRoot: async () => repoRoot,
			recoverConfigFromExistingSubmodules: async () => {
				mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file(recoveredConfig.configPath)]);
				return recoveredConfig;
			},
			initializeConfig: async () => {
				initializeCalled = true;
				return recoveredConfig;
			},
		};

		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file(repoRoot) }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, []);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, [vscode.Uri.file(lvprojPath)]);
		mocked.__setInformationMessageResponse('Initialize');

		await controller.initializeWorkspaceCommand();

		assert.strictEqual(initializeCalled, false);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Initialized local CSM module config from existing submodules')));
		assert.strictEqual(mocked.__getContextValue('csmModules.canInitializeWorkspace'), false);
	});

	test('apply initializes config and writes module record', async () => {
		const controller = createController() as any;
		const configuredRoot = 'modules/library';
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
			root: configuredRoot,
			configPath: `d:/repo/${configuredRoot}/csm-modules.yaml`,
			modules: {},
		};
		let writtenConfig: LocalModuleConfig | undefined;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			initializeConfig: async () => initialConfig,
			loadConfig: async () => initialConfig,
			getTargetRelativePath: (config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `${config.root}/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => ({
				key: 'org__module_a',
				name: moduleEntry.name,
				owner: moduleEntry.owner,
				source: moduleEntry.repoUrl,
				method: 'copy',
				path: `${configuredRoot}/${moduleEntry.name}`,
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
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', configuredRoot);
		mocked.__setInformationMessageResponse(`Use ${configuredRoot}/`);
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(new ModuleTreeItem(entry));

		assert.ok(writtenConfig);
		assert.strictEqual(writtenConfig?.modules.org__module_a?.method, 'copy');
		assert.strictEqual(writtenConfig?.modules.org__module_a?.path, `${configuredRoot}/module-a`);
		const applyPrompt = mocked.__getLastWarningPrompt();
		const applyActions = applyPrompt?.items.filter((item): item is string => typeof item === 'string') ?? [];
		assert.ok(applyActions.includes('Apply'));
		assert.ok(!applyActions.includes('Cancel'));
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Initialized local CSM module config')));
		assert.ok(infos.some((text) => text.includes('Applied 1 module(s) via copy')));
	});

	test('apply keeps existing config root when default root setting differs', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 3,
			owner: 'org',
			name: 'module-c',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-c',
		};
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'existing-root',
			configPath: 'd:/repo/existing-root/csm-modules.yaml',
			modules: {},
		};
		let appliedRoot = '';

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			loadConfig: async () => existingConfig,
			getTargetRelativePath: (config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `${config.root}/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => {
				appliedRoot = config.root;
				return {
					key: 'org__module_c',
					name: moduleEntry.name,
					owner: moduleEntry.owner,
					source: moduleEntry.repoUrl,
					method: 'copy',
					path: `${config.root}/${moduleEntry.name}`,
					ref: 'abc123',
					branch: moduleEntry.defaultBranch,
				};
			},
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
		mocked.__setFindFilesResult([vscode.Uri.file(existingConfig.configPath)]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', 'configured-root');
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(appliedRoot, 'existing-root');
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

	test('apply surfaces actionable git permission failures', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 4,
			owner: 'org',
			name: 'module-d',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-d',
		};

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
			targetExists: async () => false,
			applyModule: async () => {
				throw new Error('fatal: Authentication failed for https://github.com/org/module-d');
			},
			withAppliedModule: (config: LocalModuleConfig) => config,
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(errors.some((text) => text.includes('Check your GitHub session and repository permissions.')));
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

	test('webview context commands target the clicked module and update selection', async () => {
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
		const selectionUpdates: string[][] = [];
		let appliedEntry: CsmModuleEntry | undefined;
		let applyUsedSingleEntry = false;
		let openedReadmeName = '';
		let removedModuleName = '';
		let updatedModuleName = '';

		controller.availableModules = [entry];
		controller.treeDataProvider = {
			setSelection: (moduleKeys: string[]) => {
				selectionUpdates.push(moduleKeys);
			},
			setAuthenticated: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
		};
		controller.applyToWorkspaceCommand = async (target?: CsmModuleEntry, useOnlyEntry = false) => {
			appliedEntry = target;
			applyUsedSingleEntry = useOnlyEntry;
		};
		controller.openReadmeCommand = async (target?: CsmModuleEntry) => {
			openedReadmeName = target?.name ?? '';
		};
		controller.removeModuleCommand = async (target?: CsmModuleEntry) => {
			removedModuleName = target?.name ?? '';
		};
		controller.updateModuleCommand = async (target?: CsmModuleEntry) => {
			updatedModuleName = target?.name ?? '';
		};

		await controller.contextApplyModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		await controller.contextOpenReadmeCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		await controller.contextRemoveModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		await controller.contextUpdateModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		controller.contextSelectModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		controller.contextClearModuleSelectionCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });

		assert.strictEqual(appliedEntry?.name, 'module-a');
		assert.strictEqual(applyUsedSingleEntry, true);
		assert.strictEqual(openedReadmeName, 'module-a');
		assert.strictEqual(removedModuleName, 'module-a');
		assert.strictEqual(updatedModuleName, 'module-a');
		assert.deepStrictEqual(selectionUpdates, [['org/module-a'], []]);
	});
});
