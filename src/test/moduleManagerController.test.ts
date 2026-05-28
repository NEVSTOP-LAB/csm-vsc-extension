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
	__setInputBoxResponses: (responses: Array<string | undefined>) => void;
	__setFindFilesResult: (result: vscode.Uri[]) => void;
	__setFindFilesResultForPattern: (pattern: string, result: vscode.Uri[]) => void;
	__setWorkspaceFolders: (folders: Array<{ name: string; uri: vscode.Uri }> | undefined) => void;
	__setConfigurationValue: (key: string, value: unknown) => void;
	__getContextValue: (key: string) => unknown;
	__getLastQuickPick: () => { items: unknown[]; options?: unknown } | undefined;
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

function createCachedSnapshot(
	modules: CsmModuleEntry[],
	lastRefreshAt = new Date().toISOString(),
	options: Partial<Pick<ModuleCacheSnapshot, 'refreshAccountId' | 'refreshAccountLabel'>> = {},
): ModuleCacheSnapshot {
	return {
		schemaVersion: 1,
		lastRefreshAt,
		modules,
		...options,
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
		let sidebarRefreshCount = 0;
		let initRefreshCount = 0;

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
		(controller as any).refreshSidebarWorkspaceState = async () => {
			sidebarRefreshCount += 1;
		};
		(controller as any).refreshWorkspaceInitializationState = async (options: { prompt: boolean }) => {
			assert.strictEqual(options.prompt, false);
			initRefreshCount += 1;
		};

		await controller.refreshCommand();

		assert.strictEqual(setErrorText, 'GitHub is temporarily unavailable (HTTP 503). Try again in a moment.');
		assert.strictEqual(sidebarRefreshCount, 1);
		assert.strictEqual(initRefreshCount, 1);
		const errors = mocked.__getMessageLog().filter((m) => m.level === 'error').map((m) => m.text);
		assert.ok(errors.some((text) => text.includes('Failed to refresh CSM modules: GitHub is temporarily unavailable (HTTP 503). Try again in a moment.')));
	});

	test('refreshCommand recomputes workspace state after a successful refresh', async () => {
		let loadCalls = 0;
		let sidebarRefreshCount = 0;
		let initRefreshCount = 0;
		const controller = createController() as any;

		controller.loadModules = async (options: { interactiveAuth: boolean; showSuccessMessage: boolean; showErrorMessage: boolean }) => {
			assert.deepStrictEqual(options, {
				interactiveAuth: false,
				showSuccessMessage: true,
				showErrorMessage: true,
			});
			loadCalls += 1;
		};
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshCount += 1;
		};
		controller.refreshWorkspaceInitializationState = async (options: { prompt: boolean }) => {
			assert.deepStrictEqual(options, { prompt: false });
			initRefreshCount += 1;
		};

		await controller.refreshCommand();

		assert.strictEqual(loadCalls, 1);
		assert.strictEqual(sidebarRefreshCount, 1);
		assert.strictEqual(initRefreshCount, 1);
	});

	test('login passes the signed-in account label to the sidebar view', async () => {
		const authUpdates: Array<{ signedIn: boolean; accountLabel?: string }> = [];

		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => createSession('token', 'tester'),
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setAuthenticated: (signedIn: boolean, accountLabel?: string) => {
					authUpdates.push({ signedIn, accountLabel });
				},
			}),
		});

		await controller.loginCommand();

		assert.deepStrictEqual(authUpdates[authUpdates.length - 1], {
			signedIn: true,
			accountLabel: 'tester',
		});
	});

	test('logout signs out the current account and hides private cached modules locally', async () => {
		const authUpdates: Array<{ signedIn: boolean; accountLabel?: string }> = [];
		let currentSession: vscode.AuthenticationSession | undefined = createSession('token', 'tester');
		let signedOutAccount: string | undefined;
		let visibleModuleCount = 0;
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
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
			{
				id: 2,
				owner: 'org',
				name: 'module-private',
				description: 'private',
				topics: ['csm-modsets'],
				visibility: 'private',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-private',
			},
		], '2026-05-20T08:00:00.000Z', {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		}));
		await memento.update('csmModules.auth.lastKnown', {
			accountId: 'tester',
			accountLabel: 'tester',
		});

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => currentSession,
				getSessionInteractively: async () => currentSession,
				signOut: async (accountLabel: string) => {
					signedOutAccount = accountLabel;
					currentSession = undefined;
				},
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setAuthenticated: (signedIn: boolean, accountLabel?: string) => {
					authUpdates.push({ signedIn, accountLabel });
				},
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleCount = modules.length;
				},
			}),
		});

		controller.register([]);
		mocked.__resetMessageLog();

		await controller.logoutCommand();

		assert.strictEqual(signedOutAccount, 'tester');
		assert.deepStrictEqual(authUpdates[authUpdates.length - 1], {
			signedIn: false,
			accountLabel: undefined,
		});
		assert.strictEqual(visibleModuleCount, 1);
		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), false);
		assert.strictEqual(memento.get<ModuleCacheSnapshot>('csmModules.cache.modules')?.modules.length, 1);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Signed out of GitHub.')));
	});

	test('logout keeps the current account when the built-in sign-out flow is cancelled', async () => {
		const authUpdates: Array<{ signedIn: boolean; accountLabel?: string }> = [];
		const currentSession = createSession('token', 'tester');
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
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
		], '2026-05-20T08:00:00.000Z', {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		}));
		await memento.update('csmModules.auth.lastKnown', {
			accountId: 'tester',
			accountLabel: 'tester',
		});

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => currentSession,
				getSessionInteractively: async () => currentSession,
				signOut: async () => undefined,
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider({
				setAuthenticated: (signedIn: boolean, accountLabel?: string) => {
					authUpdates.push({ signedIn, accountLabel });
				},
			}),
		});

		controller.register([]);
		mocked.__resetMessageLog();

		await controller.logoutCommand();

		assert.deepStrictEqual(authUpdates[authUpdates.length - 1], {
			signedIn: true,
			accountLabel: 'tester',
		});
		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), true);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('GitHub sign-out was cancelled.')));
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

	test('login reveals cached private modules immediately and then refreshes from GitHub', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
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
			{
				id: 2,
				owner: 'org',
				name: 'module-private',
				description: 'private',
				topics: ['csm-modsets'],
				visibility: 'private',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-private',
			},
		], '2026-05-20T08:00:00.000Z', {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		}));
		const moduleCounts: number[] = [];
		let loadingCalls = 0;
		let fetched = 0;

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => undefined,
				getSessionInteractively: async () => createSession(),
			},
			githubService: {
				fetchModules: async () => {
					fetched += 1;
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
							{
								id: 2,
								owner: 'org',
								name: 'module-private',
								description: 'private',
								topics: ['csm-modsets'],
								visibility: 'private',
								defaultBranch: 'main',
								repoUrl: 'https://github.com/org/module-private',
							},
							{
								id: 3,
								owner: 'org',
								name: 'module-new',
								description: 'new',
								topics: ['csm-modsets'],
								visibility: 'public',
								defaultBranch: 'main',
								repoUrl: 'https://github.com/org/module-new',
							},
						],
					};
				},
				fetchReadme: async () => '# demo',
			},
			viewProvider: createViewProvider({
				setLoading: () => {
					loadingCalls += 1;
				},
				setModules: (modules: CsmModuleEntry[]) => {
					moduleCounts.push(modules.length);
				},
			}),
		});

		controller.register([]);
		await controller.loginCommand();

		assert.strictEqual(fetched, 1);
		assert.strictEqual(loadingCalls, 0);
		assert.deepStrictEqual(moduleCounts.slice(-2), [2, 3]);
		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), true);
	});

	test('refresh keeps cached private modules when GitHub reports modules unchanged', async () => {
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
		], '2026-05-20T08:00:00.000Z', {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		}));
		await memento.update('csmModules.auth.lastKnown', {
			accountId: 'tester',
			accountLabel: 'tester',
		});
		let loadingCalls = 0;
		let renderedModuleCount = -1;
		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
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
		controller.register([]);

		await controller.refreshCommand();

		assert.strictEqual(loadingCalls, 1);
		assert.strictEqual(renderedModuleCount, 2);
		assert.strictEqual(memento.get<ModuleCacheSnapshot>('csmModules.cache.modules')?.modules.length, 2);
	});

	test('refresh hydrates GitHub star state for signed-in modules', async () => {
		let renderedModules: CsmModuleEntry[] = [];
		let starChecks = 0;
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
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
					],
				}),
				fetchReadme: async () => '',
				isRepositoryStarred: async () => {
					starChecks += 1;
					return true;
				},
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					renderedModules = modules;
				},
			}),
		});

		await controller.refreshCommand();

		assert.strictEqual(starChecks, 1);
		assert.strictEqual(renderedModules[0]?.starred, true);
	});

	test('selection state toggles apply and remove toolbar contexts by applied status', async () => {
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
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
		];
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
			setSelection: () => undefined,
		};

		controller.setSelectedModuleKeys(['org/module-a', 'org/module-b']);
		assert.strictEqual(mocked.__getContextValue('csmModules.hasSelection'), true);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasApplied'), false);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasUnapplied'), true);

		controller.appliedModuleKeys.add('org/module-a');
		await controller.setSelectionContexts();
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasApplied'), true);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasUnapplied'), true);

		controller.appliedModuleKeys.add('org/module-b');
		await controller.setSelectionContexts();
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasApplied'), true);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasUnapplied'), false);

		controller.setSelectedModuleKeys([]);
		assert.strictEqual(mocked.__getContextValue('csmModules.hasSelection'), false);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasApplied'), false);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasUnapplied'), false);
	});

	test('remove command removes only applied modules from a mixed selection', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
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
				org__module_b: {
					key: 'org__module_b',
					name: 'module-b',
					owner: 'org',
					source: 'https://github.com/org/module-b',
					method: 'copy',
					path: 'csm/module-b',
					ref: 'def456',
					branch: 'main',
				},
			},
		};
		const removedModules: string[] = [];
		const writtenModuleKeys: string[][] = [];

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
			{
				id: 2,
				owner: 'org',
				name: 'module-b',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
			{
				id: 3,
				owner: 'org',
				name: 'module-c',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-c',
			},
		];
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
			setSelection: () => undefined,
		};
		controller.appliedModuleKeys.clear();
		controller.appliedModuleKeys.add('org/module-a');
		controller.appliedModuleKeys.add('org/module-b');
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			removeModule: async (_repoRoot: string, entry: LocalModuleConfig['modules'][string]) => {
				removedModules.push(`${entry.owner}/${entry.name}`);
			},
			withoutModule: (currentConfig: LocalModuleConfig, moduleKey: string) => {
				const { [moduleKey]: _omitted, ...remainingModules } = currentConfig.modules;
				config = {
					...currentConfig,
					modules: remainingModules,
				};
				return config;
			},
			writeConfig: async (nextConfig: LocalModuleConfig) => {
				writtenModuleKeys.push(Object.keys(nextConfig.modules));
			},
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			controller.appliedModuleKeys.clear();
			await controller.setSelectionContexts();
		};
		controller.setSelectedModuleKeys(['org/module-a', 'org/module-b', 'org/module-c']);
		mocked.__setWarningMessageResponse('Remove');

		await controller.removeModuleCommand();

		assert.deepStrictEqual(removedModules, ['org/module-a', 'org/module-b']);
		assert.deepStrictEqual(writtenModuleKeys, [['org__module_b'], []]);
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('Remove 2 module(s)'));
		assert.strictEqual(mocked.__getContextValue('csmModules.hasSelection'), true);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasApplied'), false);
		assert.strictEqual(mocked.__getContextValue('csmModules.selectionHasUnapplied'), true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Removed 2 module(s).')));
	});

	test('update command allows copy modules in a non-git workspace after confirmation', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/plain-workspace/csm/csm-modules.yaml',
			modules: {
				org__module_copy: {
					key: 'org__module_copy',
					name: 'module-copy',
					owner: 'org',
					source: 'https://github.com/org/module-copy',
					method: 'copy',
					path: 'csm/module-copy',
					ref: 'abc1234567890',
					branch: 'main',
				},
			},
		};
		let previewWorkspaceRoot = '';
		let updateCall:
			| { workspaceRoot: string; repoRoot?: string; latestRef?: string }
			| undefined;

		controller.availableModules = [
			{
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
		];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			previewCopyModuleUpdate: async (workspaceRoot: string) => {
				previewWorkspaceRoot = workspaceRoot;
				return {
					currentRef: 'abc1234567890',
					latestRef: 'def4567890123',
					branch: 'main',
					needsUpdate: true,
					backupDirectory: 'd:/plain-workspace/.csm-module-backups',
				};
			},
			updateModule: async (
				workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				_moduleEntry: CsmModuleEntry,
				_authToken?: string,
				repoRoot?: string,
				latestRef?: string,
			) => {
				updateCall = { workspaceRoot, repoRoot, latestRef };
				return {
					entry: { ...entry, ref: latestRef ?? 'def4567890123' },
					backupPath: 'd:/plain-workspace/.csm-module-backups/org__module-copy.zip',
				};
			},
			withAppliedModule: (currentConfig: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => {
				config = {
					...currentConfig,
					modules: {
						...currentConfig.modules,
						[entry.key]: entry,
					},
				};
				return config;
			},
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		mocked.__setWarningMessageResponse('Update');

		await controller.updateModuleCommand();

		assert.strictEqual(previewWorkspaceRoot, 'd:/plain-workspace');
		assert.deepStrictEqual(updateCall, {
			workspaceRoot: 'd:/plain-workspace',
			repoRoot: undefined,
			latestRef: 'def4567890123',
		});
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('.csm-module-backups'));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(!errors.some((text) => text.includes('not a Git repository')));
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Backup saved to d:/plain-workspace/.csm-module-backups/org__module-copy.zip.')));
	});

	test('remove command allows copy modules in a non-git workspace', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/plain-workspace/csm/csm-modules.yaml',
			modules: {
				org__module_copy: {
					key: 'org__module_copy',
					name: 'module-copy',
					owner: 'org',
					source: 'https://github.com/org/module-copy',
					method: 'copy',
					path: 'csm/module-copy',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		const removeCalls: Array<{ workspaceRoot: string; repoRoot?: string; module: string }> = [];

		controller.availableModules = [
			{
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
		];
		controller.treeDataProvider = {
			setAuthenticated: () => undefined,
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
			setSelection: () => undefined,
		};
		controller.appliedModuleKeys.clear();
		controller.appliedModuleKeys.add('org/module-copy');
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			removeModule: async (workspaceRoot: string, entry: LocalModuleConfig['modules'][string], repoRoot?: string) => {
				removeCalls.push({
					workspaceRoot,
					repoRoot,
					module: `${entry.owner}/${entry.name}`,
				});
			},
			withoutModule: (currentConfig: LocalModuleConfig, moduleKey: string) => {
				const { [moduleKey]: _omitted, ...remainingModules } = currentConfig.modules;
				config = {
					...currentConfig,
					modules: remainingModules,
				};
				return config;
			},
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			controller.appliedModuleKeys.clear();
			await controller.setSelectionContexts();
		};
		controller.setSelectedModuleKeys(['org/module-copy']);
		mocked.__setWarningMessageResponse('Remove');

		await controller.removeModuleCommand();

		assert.deepStrictEqual(removeCalls, [{
			workspaceRoot: 'd:/plain-workspace',
			repoRoot: undefined,
			module: 'org/module-copy',
		}]);
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('module-copy'));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(!errors.some((text) => text.includes('not a Git repository')));
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Removed module org/module-copy.')));
	});

	test('missing session clears signed-in toolbar context', async () => {
		const controller = createController() as any;

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => createSession(),
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

		await controller.refreshCommand();

		assert.strictEqual(mocked.__getContextValue('csmModules.signedIn'), false);
	});

	test('refresh runs immediately without a confirmation prompt', async () => {
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

		await controller.refreshCommand();

		assert.strictEqual(fetched, true);
		assert.strictEqual(mocked.__getLastWarningPrompt(), undefined);
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
		controller.register([]);
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(visibleModuleCount, 1);
		assert.strictEqual(fetched, false);
	});

	test('register shows cached private modules immediately when cached auth matches the refresh account', async () => {
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
		], '2026-05-20T08:00:00.000Z', {
			refreshAccountId: 'tester',
			refreshAccountLabel: 'tester',
		}));
		await memento.update('csmModules.auth.lastKnown', {
			accountId: 'tester',
			accountLabel: 'tester',
		});
		let fetched = false;
		let visibleModuleCount = 0;
		let viewDescription = '';

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
				setViewDescription: (description?: string) => {
					viewDescription = description ?? '';
				},
			}),
		});

		controller.register([]);
		await new Promise<void>((resolve) => setImmediate(resolve));

		assert.strictEqual(fetched, false);
		assert.strictEqual(visibleModuleCount, 2);
		assert.ok(viewDescription.includes('Updated'));
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
			listModuleDirectories: async () => [],
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
		controller.register([]);
		await controller.refreshSidebarWorkspaceState();

		assert.deepStrictEqual(renderedSortState, { field: 'applied', direction: 'desc' });
		assert.deepStrictEqual(visibleModuleKeys, ['org/module-b', 'org/module-a']);
	});

	test('expired cache stays visible without background refresh', async () => {
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
			getSessionSilently: async () => ({ accessToken: 'token', account: { id: 'tester', label: 'tester' } }),
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
		controller.register([]);
		await new Promise<void>((resolve) => setImmediate(resolve));

		assert.strictEqual(fetched, false);
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
			listModuleDirectories: async () => [],
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, []);
		controller.register([]);
		mocked.__resolveWebviewView('csmModules.view');
		await controller.refreshSidebarWorkspaceState();

		const rendered = mocked.__getLastWebviewView();
		assert.ok(!rendered?.html.includes('Workspace: repo'));
		assert.ok(rendered?.html.includes('Root: csm/'));
		assert.ok(rendered?.html.includes('1 applied'));
		assert.ok(rendered?.html.includes('module-a'));
		assert.ok(rendered?.html.includes('module-b'));
	});

	test('refreshSidebarWorkspaceState exposes managed and unmanaged folders', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		let capturedContext: Record<string, unknown> | undefined;

		controller.availableModules = [{
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'cached',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		}];
		controller.treeDataProvider = createViewProvider({
			setWorkspaceContext: (context) => {
				capturedContext = context as unknown as Record<string, unknown>;
			},
		});
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
			listModuleDirectories: async () => ['custom-module', 'module-a'],
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		assert.strictEqual(capturedContext?.moduleRoot, 'csm');
		assert.deepStrictEqual((capturedContext?.managedModules as Array<{ path: string }>)?.map((entry) => entry.path), ['csm/module-a']);
		assert.deepStrictEqual((capturedContext?.unmanagedFolders as Array<{ path: string }>)?.map((entry) => entry.path), ['csm/custom-module']);
		assert.strictEqual((capturedContext?.managedModules as Array<{ moduleEntry: { name: string } }>)[0]?.moduleEntry.name, 'module-a');
	});

	test('register marks copy modules as applied in a non-git workspace from config file', async () => {
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
			resolveGitRepositoryRoot: async () => undefined,
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/plain-workspace/csm/csm-modules.yaml',
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
			listModuleDirectories: async () => [],
		};
		mocked.__setWorkspaceFolders([{ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/plain-workspace/csm/csm-modules.yaml')]);
		mocked.__setFindFilesResultForPattern(lvprojSearchPattern, []);
		controller.register([]);
		mocked.__resolveWebviewView('csmModules.view');
		await controller.refreshSidebarWorkspaceState();

		const rendered = mocked.__getLastWebviewView();
		assert.ok(!rendered?.html.includes('Workspace: plain-workspace'));
		assert.ok(rendered?.html.includes('Root: csm/'));
		assert.ok(rendered?.html.includes('1 applied'));
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
			listModuleDirectories: async () => [],
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
			listModuleDirectories: async () => [],
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([vscode.Uri.file(existingConfig.configPath)]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', 'configured-root');
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(appliedRoot, 'existing-root');
	});

	test('apply in a non-git workspace still offers copy mode and does not error immediately', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 9,
			owner: 'org',
			name: 'module-non-git',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-non-git',
		};
		let appliedRoot = '';
		let writtenConfig: LocalModuleConfig | undefined;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			initializeConfig: async (repoRoot: string, rootRelativePath: string) => ({
				version: '2',
				root: rootRelativePath,
				configPath: `${repoRoot}/${rootRelativePath}/csm-modules.yaml`,
				modules: {},
			}),
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/plain-workspace/csm/csm-modules.yaml',
				modules: {},
			}),
			getTargetRelativePath: (_config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `csm/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (repoRoot: string, _config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => {
				appliedRoot = repoRoot;
				return {
					key: 'org__module_non_git',
					name: moduleEntry.name,
					owner: moduleEntry.owner,
					source: moduleEntry.repoUrl,
					method: 'copy',
					path: `csm/${moduleEntry.name}`,
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
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		mocked.__setWorkspaceFolders([{ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') }]);
		mocked.__setFindFilesResult([]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', 'csm');
		mocked.__setInformationMessageResponse('Use csm/');
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(appliedRoot, 'd:/plain-workspace');
		assert.strictEqual(writtenConfig?.modules.org__module_non_git?.method, 'copy');
		const quickPick = mocked.__getLastQuickPick();
		const quickPickItems = quickPick?.items as Array<{ label?: string; method?: string; kind?: vscode.QuickPickItemKind }> | undefined;
		assert.ok(quickPickItems?.some((item) => item.label?.includes('submodule')));
		assert.ok(!quickPickItems?.some((item) => item.method === 'submodule'));
		assert.strictEqual(quickPickItems?.[0]?.kind, vscode.QuickPickItemKind.Separator);
		const quickPickOptions = quickPick?.options as { prompt?: string } | undefined;
		assert.ok(quickPickOptions?.prompt?.includes('not a Git repository'));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(!errors.some((text) => text.includes('not a Git repository')));
	});

	test('apply auto-stars imported community modules for signed-in users', async () => {
		const renderedModules: CsmModuleEntry[][] = [];
		const starRequests: Array<{ owner: string; repo: string; token: string; starred: boolean }> = [];
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
				setRepositoryStarred: async (owner: string, repo: string, token: string, starred: boolean) => {
					starRequests.push({ owner, repo, token, starred });
				},
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					renderedModules.push(modules);
				},
			}),
		}) as any;
		const entry: CsmModuleEntry = {
			id: 7,
			owner: 'org',
			name: 'module-star',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-star',
			starred: false,
		};
		controller.availableModules = [entry];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			initializeConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			getTargetRelativePath: (_config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `csm/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => ({
				key: 'org__module_star',
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
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', 'csm');
		mocked.__setInformationMessageResponse('Use csm/');
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.deepStrictEqual(starRequests, [{
			owner: 'org',
			repo: 'module-star',
			token: 'token',
			starred: true,
		}]);
		assert.strictEqual(renderedModules[renderedModules.length - 1]?.[0]?.starred, true);
	});

	test('createLocalFolderRepositoryCommand runs the GitHub creation wizard with default topics', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csm-share-module-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let createdRequest:
			| { token: string; name: string; description?: string; private: boolean; topics: string[] }
			| undefined;
		let publishedRequest:
			| { folderPath: string; remoteUrl: string; authToken?: string; defaultBranch?: string; authorName?: string; authorEmail?: string; commitMessage?: string }
			| undefined;
		let convertedRequest:
			| { repoRoot: string; targetRelativePath: string; remoteUrl: string; branch?: string; authToken?: string }
			| undefined;
		let refreshed = false;
		let sidebarRefreshed = false;
		let writtenConfig: LocalModuleConfig | undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			createRepository: async (token: string, options: { name: string; description?: string; private: boolean; topics: string[] }) => {
				createdRequest = { token, ...options };
				return {
					id: 1,
					name: options.name,
					full_name: `tester/${options.name}`,
					description: options.description ?? '',
					private: options.private,
					default_branch: 'main',
					html_url: `https://github.com/tester/${options.name}`,
					topics: options.topics,
				};
			},
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			publishLocalFolder: async (options: { folderPath: string; remoteUrl: string; authToken?: string; defaultBranch?: string; authorName?: string; authorEmail?: string; commitMessage?: string }) => {
				publishedRequest = options;
				return {
					branch: options.defaultBranch ?? 'main',
					remoteName: 'origin',
					remoteUrl: options.remoteUrl,
					headRef: 'abc123',
					createdCommit: true,
				};
			},
			convertPublishedFolderToSubmodule: async (options: { repoRoot: string; targetRelativePath: string; remoteUrl: string; branch?: string; authToken?: string }) => {
				convertedRequest = options;
				return {
					branch: options.branch ?? 'main',
					headRef: 'def456',
				};
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		controller.loadModules = async () => {
			refreshed = true;
		};
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.deepStrictEqual(createdRequest, {
			token: 'token',
			name: 'shared-module',
			description: 'Demo repo',
			private: true,
			topics: ['labview-csm', 'csm-modsets', 'custom-topic'],
		});
		assert.deepStrictEqual(publishedRequest, {
			folderPath: path.join(workspaceRoot, 'csm', 'custom-module'),
			remoteUrl: 'https://github.com/tester/shared-module.git',
			authToken: 'token',
			defaultBranch: 'main',
			authorName: 'Tester',
			authorEmail: 'tester@example.com',
			commitMessage: 'Initial publish of custom-module',
		});
		assert.deepStrictEqual(convertedRequest, {
			repoRoot: workspaceRoot,
			targetRelativePath: 'csm/custom-module',
			remoteUrl: 'https://github.com/tester/shared-module.git',
			branch: 'main',
			authToken: 'token',
		});
		assert.deepStrictEqual(writtenConfig, {
			...existingConfig,
			modules: {
				'tester__shared-module': {
					key: 'tester__shared-module',
					name: 'shared-module',
					owner: 'tester',
					source: 'https://github.com/tester/shared-module',
					method: 'submodule',
					path: 'csm/custom-module',
					ref: 'def456',
					branch: 'main',
				},
			},
		});
		assert.strictEqual(sidebarRefreshed, true);
		assert.strictEqual(refreshed, true);
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('csm/custom-module'));
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Created GitHub repository tester/shared-module and published the local folder contents.')));
	});

	test('createLocalFolderRepositoryCommand warns when local state sync fails after publish', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csm-share-module-sync-fail-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let sidebarRefreshed = false;
		let refreshed = false;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			createRepository: async (_token: string, options: { name: string; description?: string; private: boolean; topics: string[] }) => ({
				id: 1,
				name: options.name,
				full_name: `tester/${options.name}`,
				description: options.description ?? '',
				private: options.private,
				default_branch: 'main',
				html_url: `https://github.com/tester/${options.name}`,
				topics: options.topics,
			}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			publishLocalFolder: async (options: { folderPath: string; remoteUrl: string; authToken?: string; defaultBranch?: string; authorName?: string; authorEmail?: string; commitMessage?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'abc123',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => {
				throw new Error('disk full');
			},
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		controller.loadModules = async () => {
			refreshed = true;
		};
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.strictEqual(sidebarRefreshed, false);
		assert.strictEqual(refreshed, true);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('Created GitHub repository tester/shared-module and published csm/custom-module, but failed to update the local CSM module state: disk full')));
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(!infos.some((text) => text.includes('Created GitHub repository tester/shared-module and published the local folder contents.')));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.strictEqual(errors.length, 0);
	});

	test('createLocalFolderRepositoryCommand keeps copy mode when workspace is not a git repo', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csm-share-module-copy-fallback-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let convertedToSubmodule = false;
		let writtenConfig: LocalModuleConfig | undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			createRepository: async (_token: string, options: { name: string; description?: string; private: boolean; topics: string[] }) => ({
				id: 1,
				name: options.name,
				full_name: `tester/${options.name}`,
				description: options.description ?? '',
				private: options.private,
				default_branch: 'main',
				html_url: `https://github.com/tester/${options.name}`,
				topics: options.topics,
			}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			publishLocalFolder: async (options: { remoteUrl: string; defaultBranch?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async () => {
				convertedToSubmodule = true;
				return {
					branch: 'main',
					headRef: 'def456',
				};
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.strictEqual(convertedToSubmodule, false);
		assert.deepStrictEqual(writtenConfig, {
			...existingConfig,
			modules: {
				'tester__shared-module': {
					key: 'tester__shared-module',
					name: 'shared-module',
					owner: 'tester',
					source: 'https://github.com/tester/shared-module',
					method: 'copy',
					path: 'csm/custom-module',
					ref: 'abc123',
					branch: 'main',
				},
			},
		});
	});

	test('initializePublishedFolderConfig derives the root from Windows-style folder paths', async () => {
		const controller = createController() as any;
		let capturedRoot: string | undefined;

		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, ''),
			initializeConfig: async (_workspaceRoot: string, rootRelativePath: string) => {
				capturedRoot = rootRelativePath;
				return {
					version: '2',
					root: rootRelativePath,
					configPath: path.join('d:/repo', rootRelativePath, 'csm-modules.yaml'),
					modules: {},
				};
			},
		};
		controller.setWorkspaceInitializationContext = async () => undefined;

		const config = await controller.initializePublishedFolderConfig('d:/repo', {
			id: 'csm\\nested\\custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm\\nested\\custom-module',
		});

		assert.strictEqual(capturedRoot, 'csm/nested');
		assert.strictEqual(config.root, 'csm/nested');
	});

	test('toggleStar unstars a repository only after confirmation', async () => {
		let renderedModules: CsmModuleEntry[] = [];
		const starRequests: boolean[] = [];
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
				setRepositoryStarred: async (_owner: string, _repo: string, _token: string, starred: boolean) => {
					starRequests.push(starred);
				},
			},
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					renderedModules = modules;
				},
			}),
		}) as any;
		const entry: CsmModuleEntry = {
			id: 8,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
			starred: true,
		};
		controller.availableModules = [entry];
		mocked.__setWarningMessageResponse('Unstar');

		await controller.toggleStarCommand(entry);

		assert.deepStrictEqual(starRequests, [false]);
		assert.strictEqual(renderedModules[0]?.starred, false);
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('org/module-a'));
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
