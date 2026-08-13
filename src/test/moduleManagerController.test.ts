import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getTempRoot } from '../common/tempPaths';
import * as vscode from 'vscode';
import { DEFAULT_LOCAL_MODULE_ROOT, IModuleViewProvider, LEGACY_LOCAL_MODULE_CONFIG_FILE, LOCAL_MODULE_CONFIG_FILE } from '../modules';
import { ModuleManagerController, ModuleManagerControllerDeps } from '../modules/moduleManagerController';
import { ModuleTreeItem } from '../modules/moduleTreeTypes';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalModuleConfig, LocalUnmanagedFolderEntry, ModuleApplyMethod, ModuleCacheSnapshot } from '../modules/types';

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
	__getQuickPickHistory: () => Array<{ items: unknown[]; options?: unknown }>;
	__getLastWarningPrompt: () => { message: string; items: unknown[] } | undefined;
	__getLastWebviewPanel: () => { title: string; html: string } | undefined;
	__resolveWebviewView: (viewId: string) => { html: string; fireMessage: (message: unknown) => void } | undefined;
	__getLastWebviewView: () => { viewId: string; html: string } | undefined;
	__getExecutedCommands: () => Array<{ command: string; args: unknown[] }>;
	__getFileSystemWatchers: () => Array<{
		disposed: boolean;
		pattern: unknown;
		__fire: (kind: 'create' | 'change' | 'delete', uri?: vscode.Uri) => void;
	}>;
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
	const storageRoot = vscode.Uri.file(path.join(getTempRoot(), `csm-vsc-support-tests-${Date.now()}`));
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
	const repoRoot = fs.mkdtempSync(path.join(getTempRoot(), prefix));
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
		mocked.__setQuickPickResponse({ mode: 'online' });

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
		mocked.__setQuickPickResponse({ mode: 'online' });

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
		mocked.__setQuickPickResponse({ mode: 'online' });

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
		const cmds = mocked.__getExecutedCommands();
		const previewCmd = cmds.find((c) => c.command === 'markdown.showPreview');
		assert.ok(previewCmd, 'markdown.showPreview should be called');
		assert.ok(String(previewCmd?.args[0]).includes('README.md'));
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

		const cmds = mocked.__getExecutedCommands();
		const previewCmd = cmds.find((c) => c.command === 'markdown.showPreview');
		assert.ok(previewCmd, 'markdown.showPreview should be called');
		assert.ok(String(previewCmd?.args[0]).includes('README.md'));
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
		mocked.__setQuickPickResponse({ mode: 'online' });

		await controller.refreshCommand();

		assert.strictEqual(loadingCalls, 3);
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
		mocked.__setQuickPickResponse({ mode: 'online' });

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
		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [],
			listReleases: async () => [],
			listCommits: async () => [],
			resolveCommitInfo: async () => ({}),
		};
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
				options: { repoRoot?: string; selection: { ref?: string } },
			) => {
				updateCall = { workspaceRoot, repoRoot: options.repoRoot, latestRef: options.selection.ref };
				return {
					entry: { ...entry, ref: options.selection.ref ?? 'def4567890123' },
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
		mocked.__setQuickPickResponse({ versionSource: 'latest', label: 'Update to latest (main)' });
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

	test('update command picks a specific commit via two-step quickpick and caches version info', async () => {
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
		let updateSelection: { kind: string; ref?: string; branch?: string } | undefined;
		let cachedVersionInfo: unknown;

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
		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [],
			listReleases: async () => [],
			listCommits: async () => [
				{
					sha: 'def4567890123abcdef',
					message: 'fix xxx',
					date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
				},
				{ sha: 'abc1234567890abcdef', message: 'init module', date: undefined },
			],
			resolveCommitInfo: async () => ({}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			previewCopyModuleUpdate: async () => undefined as never,
			updateModule: async (
				_workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				_moduleEntry: CsmModuleEntry,
				options: { repoRoot?: string; selection: { kind: string; ref?: string; branch?: string } },
			) => {
				updateSelection = { kind: options.selection.kind, ref: options.selection.ref, branch: options.selection.branch };
				return {
					entry: {
						...entry,
						ref: options.selection.ref ?? 'def4567890123abcdef',
						versionKind: 'commit',
						versionRef: options.selection.ref,
					},
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
		controller.cacheStore.setModuleVersionCache = async (cache: unknown) => {
			cachedVersionInfo = cache;
		};
		// 第一步：选择"提交记录"；第二步：选择具体提交
		mocked.__setQuickPickResponse({ versionSource: 'commits', label: 'Commit history' });
		mocked.__setQuickPickResponse({
			label: 'def4567 · fix xxx · 2天前',
			commit: { sha: 'def4567890123abcdef', message: 'fix xxx', date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
		});
		mocked.__setWarningMessageResponse('Update');

		await controller.updateModuleCommand();

		assert.deepStrictEqual(updateSelection, { kind: 'commit', ref: 'def4567890123abcdef', branch: 'main' });
		// 提交信息写入本地缓存（key = owner/name）
		assert.ok(cachedVersionInfo);
		const cache = cachedVersionInfo as Record<string, { ref: string; commitInfo: string }>;
		assert.deepStrictEqual(cache['org/module-copy']?.commitInfo, 'fix xxx');
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Updated org/module-copy to def4567 · fix xxx')));
	});

	test('update command cancels version source pick and aborts without touching the module', async () => {
		const controller = createController() as any;
		let updateCalled = false;
		const config: LocalModuleConfig = {
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
		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [],
			listReleases: async () => [],
			listCommits: async () => [],
			resolveCommitInfo: async () => ({}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			previewCopyModuleUpdate: async () => undefined as never,
			updateModule: async () => {
				updateCalled = true;
				throw new Error('should not be called');
			},
			withAppliedModule: (currentConfig: LocalModuleConfig, _entry: LocalModuleConfig['modules'][string]) => currentConfig,
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		// 第一步 QuickPick 返回 undefined（用户取消）
		mocked.__setQuickPickResponse(undefined);

		await controller.updateModuleCommand();

		assert.strictEqual(updateCalled, false);
	});

	test('update command picks a tag version via two-step quickpick', async () => {
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
		let updateSelection: { kind: string; versionRef?: string; ref?: string } | undefined;

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
		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [{ name: 'v1.0', sha: 'def4567890123' }, { name: 'v2.0', sha: 'aaa1112223334' }],
			listReleases: async () => [],
			listCommits: async () => [],
			resolveCommitInfo: async () => ({}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			previewCopyModuleUpdate: async () => undefined as never,
			updateModule: async (
				_workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				_moduleEntry: CsmModuleEntry,
				options: { selection: { kind: string; versionRef?: string; ref?: string } },
			) => {
				updateSelection = { kind: options.selection.kind, versionRef: options.selection.versionRef, ref: options.selection.ref };
				return {
					entry: { ...entry, ref: 'def4567890123', versionKind: 'tag', versionRef: 'v1.0' },
					backupPath: 'd:/plain-workspace/.csm-module-backups/org__module-copy.zip',
				};
			},
			withAppliedModule: (currentConfig: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => {
				config = {
					...currentConfig,
					modules: { ...currentConfig.modules, [entry.key]: entry },
				};
				return config;
			},
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		mocked.__setQuickPickResponse({ versionSource: 'tags', label: 'Tags' });
		mocked.__setQuickPickResponse({ label: 'v1.0 · def4567', tag: { name: 'v1.0', sha: 'def4567890123' } });
		mocked.__setWarningMessageResponse('Update');

		await controller.updateModuleCommand();

		assert.deepStrictEqual(updateSelection, { kind: 'tag', versionRef: 'v1.0', ref: 'def4567890123' });
		// 确认对话框展示 当前版本 → 目标版本
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('from abc1234 to v1.0'));
	});

	test('update command picks a commit from a chosen branch via three-step quickpick', async () => {
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
		let updateSelection: { kind: string; ref?: string; branch?: string } | undefined;
		let requestedCommitsBranch = '';

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
		controller.versionService = {
			listBranches: async () => [{ name: 'dev', sha: 'eee5551112223' }, { name: 'main', sha: 'abc1234567890' }],
			listTags: async () => [],
			listReleases: async () => [],
			listCommits: async (_owner: string, _repo: string, branch: string) => {
				requestedCommitsBranch = branch;
				return [{ sha: 'fff6667778889', message: 'fix dev', date: undefined }];
			},
			resolveCommitInfo: async () => ({}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			previewCopyModuleUpdate: async () => undefined as never,
			updateModule: async (
				_workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				_moduleEntry: CsmModuleEntry,
				options: { selection: { kind: string; ref?: string; branch?: string } },
			) => {
				updateSelection = { kind: options.selection.kind, ref: options.selection.ref, branch: options.selection.branch };
				return {
					entry: { ...entry, ref: options.selection.ref, versionKind: 'commit', versionRef: options.selection.ref },
					backupPath: 'd:/plain-workspace/.csm-module-backups/org__module-copy.zip',
				};
			},
			withAppliedModule: (currentConfig: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => {
				config = {
					...currentConfig,
					modules: { ...currentConfig.modules, [entry.key]: entry },
				};
				return config;
			},
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		mocked.__setQuickPickResponse({ versionSource: 'branches', label: 'Branches' });
		mocked.__setQuickPickResponse({ label: 'dev', branch: { name: 'dev', sha: 'eee5551112223' } });
		mocked.__setQuickPickResponse({ label: 'fff6667 · fix dev', commit: { sha: 'fff6667778889', message: 'fix dev', date: undefined } });
		mocked.__setWarningMessageResponse('Update');

		await controller.updateModuleCommand();

		assert.deepStrictEqual(updateSelection, { kind: 'commit', ref: 'fff6667778889', branch: 'dev' });
		assert.strictEqual(requestedCommitsBranch, 'dev');
	});

	test('switchLocalModuleMethodCommand switches a managed local module to submodule mode in a git workspace', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
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
		let switchCall:
			| { workspaceRoot: string; nextMethod: ModuleApplyMethod; repoRoot?: string; authToken?: string }
			| undefined;
		let sidebarRefreshed = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			switchModuleMethod: async (
				workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				nextMethod: ModuleApplyMethod,
				authToken?: string,
				repoRoot?: string,
			) => {
				switchCall = { workspaceRoot, nextMethod, repoRoot, authToken };
				return {
					entry: {
						...entry,
						method: 'submodule',
						ref: 'def456',
					},
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setQuickPickResponse({ method: 'submodule' });
		mocked.__setWarningMessageResponse('Switch');

		await controller.switchLocalModuleMethodCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'copy',
			branch: 'main',
			ref: 'abc123',
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.deepStrictEqual(switchCall, {
			workspaceRoot: 'd:/repo',
			nextMethod: 'submodule',
			repoRoot: 'd:/repo',
			authToken: undefined,
		});
		assert.strictEqual(config.modules.org__module_copy?.method, 'submodule');
		assert.strictEqual(config.modules.org__module_copy?.ref, 'def456');
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Switched org/module-copy to submodule.')));
	});

	test('switchLocalModuleMethodCommand switches a copy module to release mode', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
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
		let switchCall:
			| {
				workspaceRoot: string;
				nextMethod: ModuleApplyMethod;
				repoRoot?: string;
				authToken?: string;
				versionSelection?: unknown;
			}
			| undefined;
		let sidebarRefreshed = false;

		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [],
			listReleases: async () => [
				{
					name: 'Release v1.0',
					tagName: 'v1.0',
					publishedAt: '2026-06-01T00:00:00Z',
					assets: [
						{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/module-copy/releases/download/v1.0/module-v1.0.zip' },
					],
				},
			],
			listCommits: async () => [],
			resolveCommitInfo: async () => ({}),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			switchModuleMethod: async (
				workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				nextMethod: ModuleApplyMethod,
				authToken?: string,
				repoRoot?: string,
				versionSelection?: unknown,
			) => {
				switchCall = { workspaceRoot, nextMethod, repoRoot, authToken, versionSelection };
				return {
					entry: {
						...entry,
						method: 'release',
						ref: '',
						versionKind: 'release',
						versionRef: 'v1.0',
						releaseName: 'Release v1.0',
					},
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		// 三选一：GitHub Release
		mocked.__setQuickPickResponse({ method: 'release' });
		// Release 列表选择 v1.0
		mocked.__setQuickPickResponse({
			label: 'v1.0',
			release: {
				name: 'Release v1.0',
				tagName: 'v1.0',
				publishedAt: '2026-06-01T00:00:00Z',
				assets: [
					{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/module-copy/releases/download/v1.0/module-v1.0.zip' },
				],
			},
		});
		mocked.__setWarningMessageResponse('Switch');

		await controller.switchLocalModuleMethodCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'copy',
			branch: 'main',
			ref: 'abc123',
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.strictEqual(switchCall?.nextMethod, 'release');
		assert.strictEqual(switchCall?.workspaceRoot, 'd:/repo');
		const selection = switchCall?.versionSelection as { kind: string; versionRef: string; releaseName: string };
		assert.strictEqual(selection.kind, 'release');
		assert.strictEqual(selection.versionRef, 'v1.0');
		assert.strictEqual(selection.releaseName, 'Release v1.0');
		assert.strictEqual(config.modules.org__module_copy?.method, 'release');
		assert.strictEqual(config.modules.org__module_copy?.versionRef, 'v1.0');
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Switched org/module-copy to GitHub Release.')));
	});

	test('switchLocalModuleMethodCommand switches a release module to copy mode', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				org__module_copy: {
					key: 'org__module_copy',
					name: 'module-copy',
					owner: 'org',
					source: 'https://github.com/org/module-copy',
					method: 'release',
					path: 'csm/module-copy',
					ref: '',
					branch: 'main',
					versionKind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release v1.0',
				},
			},
		};
		let switchCall:
			| {
				workspaceRoot: string;
				nextMethod: ModuleApplyMethod;
				repoRoot?: string;
				authToken?: string;
				versionSelection?: unknown;
			}
			| undefined;
		let sidebarRefreshed = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			switchModuleMethod: async (
				workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				nextMethod: ModuleApplyMethod,
				authToken?: string,
				repoRoot?: string,
				versionSelection?: unknown,
			) => {
				switchCall = { workspaceRoot, nextMethod, repoRoot, authToken, versionSelection };
				return {
					entry: {
						...entry,
						method: 'copy',
						ref: 'def456',
						branch: 'main',
						versionKind: 'branch',
						versionRef: 'main',
						releaseName: undefined,
					},
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setWarningMessageResponse('Switch');

		await controller.switchLocalModuleMethodCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'release',
			branch: 'main',
			ref: '',
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.strictEqual(switchCall?.nextMethod, 'copy');
		assert.strictEqual(switchCall?.versionSelection, undefined);
		assert.strictEqual(config.modules.org__module_copy?.method, 'copy');
		assert.strictEqual(config.modules.org__module_copy?.ref, 'def456');
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Switched org/module-copy to copy.')));
	});

	test('switchLocalModuleMethodCommand switches a release module to submodule mode', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				org__module_copy: {
					key: 'org__module_copy',
					name: 'module-copy',
					owner: 'org',
					source: 'https://github.com/org/module-copy',
					method: 'release',
					path: 'csm/module-copy',
					ref: '',
					branch: 'main',
					versionKind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release v1.0',
				},
			},
		};
		let switchCall:
			| {
				workspaceRoot: string;
				nextMethod: ModuleApplyMethod;
				repoRoot?: string;
				authToken?: string;
				versionSelection?: unknown;
			}
			| undefined;
		let sidebarRefreshed = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			switchModuleMethod: async (
				workspaceRoot: string,
				entry: LocalModuleConfig['modules'][string],
				nextMethod: ModuleApplyMethod,
				authToken?: string,
				repoRoot?: string,
				versionSelection?: unknown,
			) => {
				switchCall = { workspaceRoot, nextMethod, repoRoot, authToken, versionSelection };
				return {
					entry: {
						...entry,
						method: 'submodule',
						ref: 'def456',
						branch: 'main',
					},
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setQuickPickResponse({ method: 'submodule' });
		mocked.__setWarningMessageResponse('Switch');

		await controller.switchLocalModuleMethodCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'release',
			branch: 'main',
			ref: '',
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.strictEqual(switchCall?.nextMethod, 'submodule');
		assert.strictEqual(switchCall?.versionSelection, undefined);
		assert.strictEqual(config.modules.org__module_copy?.method, 'submodule');
		assert.strictEqual(config.modules.org__module_copy?.ref, 'def456');
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Switched org/module-copy to submodule.')));
	});

	test('switchLocalModuleMethodCommand is blocked in a non-git workspace', async () => {
		const controller = createController() as any;
		let switchAttempted = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			switchModuleMethod: async () => {
				switchAttempted = true;
				throw new Error('should not run');
			},
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file('d:/plain-workspace') });

		await controller.switchLocalModuleMethodCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'copy',
			branch: 'main',
			ref: 'abc123',
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.strictEqual(switchAttempted, false);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('only available when the current workspace folder is a Git repository')));
	});

	test('toggleLocalModuleLockCommand unlocks a managed local module after confirmation', async () => {
		const controller = createController() as any;
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
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
					locked: true,
				},
			},
		};
		let lockCall:
			| { workspaceRoot: string; entryKey: string; locked: boolean }
			| undefined;
		let sidebarRefreshed = false;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			setModuleLocked: async (workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => {
				lockCall = { workspaceRoot, entryKey: entry.key, locked };
				return {
					...entry,
					locked,
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setWarningMessageResponse('Unlock');

		await controller.toggleLocalModuleLockCommand({
			id: 'org__module_copy',
			kind: 'managed',
			owner: 'org',
			name: 'module-copy',
			path: 'csm/module-copy',
			source: 'https://github.com/org/module-copy',
			method: 'copy',
			branch: 'main',
			ref: 'abc123',
			locked: true,
			repoUrl: 'https://github.com/org/module-copy',
			description: 'demo',
			visibility: 'public',
			topics: ['csm-modsets'],
			moduleEntry: {
				id: 1,
				owner: 'org',
				name: 'module-copy',
				description: 'demo',
				topics: ['csm-modsets'],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-copy',
			},
			stale: false,
		});

		assert.deepStrictEqual(lockCall, {
			workspaceRoot: 'd:/repo',
			entryKey: 'org__module_copy',
			locked: false,
		});
		assert.strictEqual(config.modules.org__module_copy?.locked, false);
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Unlocked local files for org/module-copy.')));
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
		mocked.__setQuickPickResponse({ mode: 'online' });

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
		mocked.__setQuickPickResponse({ mode: 'online' });

		await controller.refreshCommand();

		assert.strictEqual(fetched, true);
		assert.strictEqual(mocked.__getLastWarningPrompt(), undefined);
	});

	test('refreshCommand offers online catalog and local module re-scan modes', async () => {
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider(),
		});
		mocked.__setQuickPickResponse({ mode: 'online' });

		await controller.refreshCommand();

		const pick = mocked.__getLastQuickPick();
		assert.ok(pick, 'refresh should show a quick pick');
		const modes = (pick.items as Array<{ mode?: string }>).map((item) => item.mode);
		assert.deepStrictEqual(modes, ['online', 'local']);
	});

	test('refreshCommand re-scans local modules without fetching GitHub in local mode', async () => {
		let fetched = false;
		let sidebarRefreshCount = 0;
		let initRefreshCount = 0;
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
		}) as any;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshCount += 1;
		};
		controller.refreshWorkspaceInitializationState = async (options: { prompt: boolean }) => {
			assert.strictEqual(options.prompt, false);
			initRefreshCount += 1;
		};
		mocked.__setQuickPickResponse({ mode: 'local' });

		await controller.refreshCommand();

		assert.strictEqual(fetched, false);
		assert.strictEqual(sidebarRefreshCount, 1);
		assert.strictEqual(initRefreshCount, 1);
	});

	test('refreshCommand does nothing when the mode pick is dismissed', async () => {
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
		}) as any;
		let sidebarRefreshCount = 0;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshCount += 1;
		};
		mocked.__setQuickPickResponse(undefined);

		await controller.refreshCommand();

		assert.strictEqual(fetched, false);
		assert.strictEqual(sidebarRefreshCount, 0);
	});

	test('refreshCommand local mode reports the discovered unmanaged module count', async () => {
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider(),
		}) as any;
		controller.refreshSidebarWorkspaceState = async () => 2;
		controller.refreshWorkspaceInitializationState = async () => undefined;
		mocked.__resetMessageLog();
		mocked.__setQuickPickResponse({ mode: 'local' });

		await controller.refreshCommand();

		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Found 2 unmanaged module(s)')));
	});

	test('refreshCommand local mode reports when no unmanaged modules are found', async () => {
		const controller = createController(undefined, {
			authService: {
				getSessionSilently: async () => createSession(),
				getSessionInteractively: async () => undefined,
			},
			githubService: {
				fetchModules: async () => ({ modules: [] }),
				fetchReadme: async () => '',
			},
			viewProvider: createViewProvider(),
		}) as any;
		controller.refreshSidebarWorkspaceState = async () => 0;
		controller.refreshWorkspaceInitializationState = async () => undefined;
		mocked.__resetMessageLog();
		mocked.__setQuickPickResponse({ mode: 'local' });

		await controller.refreshCommand();

		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('No unmanaged modules found')));
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
						locked: false,
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
		assert.ok(rendered?.html.includes('csm/'));
		assert.ok(rendered?.html.includes('1 applied'));
		assert.ok(rendered?.html.includes('module-a'));
		assert.ok(rendered?.html.includes('module-b'));
	});

	test('register immediately renders the cached workspace context', async () => {
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([], new Date().toISOString()));
		await memento.update('csmModules.cache.workspaceContext', {
			workspaceLabel: 'repo',
			moduleRoot: 'csm',
			gitAvailable: true,
			appliedModuleKeys: [],
			managedModules: [],
			unmanagedFolders: [],
		});
		const workspaceUpdates: Array<Record<string, unknown>> = [];
		const controller = createController(memento, {
			viewProvider: createViewProvider({
				setWorkspaceContext: (context) => {
					workspaceUpdates.push(context as unknown as Record<string, unknown>);
				},
			}),
		});

		controller.register([]);
		await Promise.resolve();
		await Promise.resolve();

		// 微任务恢复阶段应以缓存工作区状态渲染本地区域（缓存渲染确实发生）
		assert.strictEqual(workspaceUpdates.some((update) => update.workspaceLabel === 'repo'), true);
		assert.strictEqual(workspaceUpdates.some((update) => update.moduleRoot === 'csm'), true);
	});

	test('refreshSidebarWorkspaceState caches the complete workspace context', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		let capturedContext: Record<string, unknown> | undefined;
		let cachedContext: Record<string, unknown> | undefined;

		controller.availableModules = [];
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
				modules: {},
			}),
			listModuleDirectories: async () => [],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
		};
		controller.cacheStore = {
			setWorkspaceContextCache: async (context: Record<string, unknown>) => {
				cachedContext = context;
			},
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		// 完整刷新结果写入缓存，且同步渲染到视图
		assert.strictEqual(cachedContext?.workspaceLabel, 'repo');
		assert.strictEqual(cachedContext?.moduleRoot, 'csm');
		assert.strictEqual(capturedContext?.workspaceLabel, 'repo');
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
						locked: false,
					},
				},
			}),
			listModuleDirectories: async () => ['custom-module', 'module-a'],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		assert.strictEqual(capturedContext?.moduleRoot, 'csm');
		assert.strictEqual(capturedContext?.gitAvailable, true);
		assert.deepStrictEqual((capturedContext?.managedModules as Array<{ path: string }>)?.map((entry) => entry.path), ['csm/module-a']);
		assert.deepStrictEqual((capturedContext?.unmanagedFolders as Array<{ path: string }>)?.map((entry) => entry.path), ['csm/custom-module']);
		assert.strictEqual((capturedContext?.managedModules as Array<{ locked: boolean }>)[0]?.locked, false);
		assert.strictEqual((capturedContext?.managedModules as Array<{ moduleEntry: { name: string } }>)[0]?.moduleEntry.name, 'module-a');
	});

	test('refreshSidebarWorkspaceState auto-syncs untracked git submodules into the yaml config', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		let capturedContext: Record<string, unknown> | undefined;
		let syncCalled = false;
		let writtenConfig: LocalModuleConfig | undefined;

		const baseConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		};
		const syncedConfig: LocalModuleConfig = {
			...baseConfig,
			modules: {
				local__module_sub: {
					key: 'local__module_sub',
					name: 'module-sub',
					owner: '',
					source: 'https://github.com/org/module-sub',
					method: 'submodule',
					path: 'csm/module-sub',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};

		controller.treeDataProvider = createViewProvider({
			setWorkspaceContext: (context) => {
				capturedContext = context as unknown as Record<string, unknown>;
			},
		});
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => baseConfig,
			listModuleDirectories: async () => ['module-sub'],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, _cfg: LocalModuleConfig) => {
				syncCalled = true;
				writtenConfig = syncedConfig;
				return { config: syncedConfig, addedCount: 1 };
			},
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		assert.strictEqual(syncCalled, true);
		assert.ok(writtenConfig);
		// After auto-sync, module-sub appears as managed, not unmanaged
		assert.deepStrictEqual(
			(capturedContext?.managedModules as Array<{ path: string }>)?.map((entry) => entry.path),
			['csm/module-sub'],
		);
		assert.deepStrictEqual(capturedContext?.unmanagedFolders, []);
		const infos = mocked.__getMessageLog().filter((m) => m.level === 'info').map((m) => m.text);
		assert.ok(infos.some((text) => text.includes('Auto-added 1 existing git module folder')));
	});

	test('refreshSidebarWorkspaceState auto-syncs untracked nested git module directories into the yaml config', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		let capturedContext: Record<string, unknown> | undefined;
		let syncCalled = false;

		const baseConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		};
		const syncedConfig: LocalModuleConfig = {
			...baseConfig,
			modules: {
				local__nested_repo: {
					key: 'local__nested_repo',
					name: 'nested-repo',
					owner: '',
					source: 'https://github.com/org/nested-repo',
					method: 'submodule',
					path: 'csm/nested-repo',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};

		controller.treeDataProvider = createViewProvider({
			setWorkspaceContext: (context) => {
				capturedContext = context as unknown as Record<string, unknown>;
			},
		});
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => baseConfig,
			listModuleDirectories: async () => ['nested-repo'],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, _cfg: LocalModuleConfig) => {
				syncCalled = true;
				return { config: syncedConfig, addedCount: 1 };
			},
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		assert.strictEqual(syncCalled, true);
		assert.deepStrictEqual(
			(capturedContext?.managedModules as Array<{ path: string }>)?.map((entry) => entry.path),
			['csm/nested-repo'],
		);
		assert.deepStrictEqual(capturedContext?.unmanagedFolders, []);
	});

	test('formatCurrentVersionLabel 对 branch 版本来源显示追踪的分支名（issue #90）', () => {
		const controller = createController() as any;
		const baseEntry = {
			key: 'org__module_a',
			name: 'module-a',
			owner: 'org',
			source: 'https://github.com/org/module-a',
			method: 'submodule',
			path: 'csm/module-a',
			ref: 'abc1234',
			branch: 'develop',
		};
		const withVersionRef = controller.formatCurrentVersionLabel({
			...baseEntry,
			versionKind: 'branch',
			versionRef: 'develop',
		});
		assert.strictEqual(withVersionRef, 'develop');

		const withoutVersionRef = controller.formatCurrentVersionLabel({
			...baseEntry,
			versionKind: 'branch',
		});
		assert.strictEqual(withoutVersionRef, 'develop', '缺少 versionRef 时回退 entry.branch');

		const commitKind = controller.formatCurrentVersionLabel({
			...baseEntry,
			versionKind: 'commit',
			versionRef: 'abc1234',
		});
		assert.ok(commitKind.includes('abc123'), 'commit 类型仍显示短 SHA');
	});

	test('refreshSidebarWorkspaceState 为 git 仓库创建 .git watcher（issue #90）', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		controller.availableModules = [];
		controller.treeDataProvider = createViewProvider();
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			listModuleDirectories: async () => [],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
			syncModuleLockStates: async () => undefined,
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		const watchers = mocked.__getFileSystemWatchers();
		assert.strictEqual(watchers.length, 1, '应为 git 仓库创建唯一 watcher');
		assert.strictEqual(watchers[0].disposed, false);

		// 重复刷新不应重建 watcher
		await controller.refreshSidebarWorkspaceState();
		assert.strictEqual(mocked.__getFileSystemWatchers().length, 1, '相同 repoRoot 下复用 watcher');
	});

	test('git 变更去抖后自动重算侧边栏工作区状态（issue #90）', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		controller.availableModules = [];
		controller.treeDataProvider = createViewProvider();
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			listModuleDirectories: async () => [],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
			syncModuleLockStates: async () => undefined,
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();
		const watcher = mocked.__getFileSystemWatchers()[0];
		let refreshCount = 0;
		const originalRefresh = controller.refreshSidebarWorkspaceState.bind(controller);
		controller.refreshSidebarWorkspaceState = async () => {
			refreshCount += 1;
			return originalRefresh();
		};

		// 多次变更应合并为一次去抖刷新
		watcher.__fire('change');
		watcher.__fire('change');
		watcher.__fire('create');
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.strictEqual(refreshCount, 0, '去抖窗口内不应立即刷新');
		await new Promise((resolve) => setTimeout(resolve, 1800));
		assert.strictEqual(refreshCount, 1, '去抖结束后应刷新一次');
	});

	test('workspace 非 git 仓库时清理 .git watcher（issue #90）', async () => {
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
		}) as any;
		controller.availableModules = [];
		controller.treeDataProvider = createViewProvider();
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			loadConfig: async () => ({
				version: '2',
				root: 'csm',
				configPath: 'd:/repo/csm/csm-modules.yaml',
				modules: {},
			}),
			listModuleDirectories: async () => [],
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
			syncModuleLockStates: async () => undefined,
		};
		controller.computeStaleModuleKeys = async () => [];
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();
		const watchers = mocked.__getFileSystemWatchers();
		assert.strictEqual(watchers[0].disposed, false);

		// 工作区不再是 git 仓库：watcher 应被 dispose
		controller.workspaceModuleService.resolveGitRepositoryRoot = async () => undefined;
		await controller.refreshSidebarWorkspaceState();
		assert.strictEqual(watchers[0].disposed, true, '非 git 仓库时应清理 watcher');
		assert.strictEqual(mocked.__getFileSystemWatchers().length, 1, '清理后不再创建新 watcher');
	});

	test('mapAppliedModuleKeys matches applied module across config variants', () => {
		const controller = createController() as any;
		const onlineEntry: CsmModuleEntry = {
			id: 1,
			owner: 'NEVSTOP-LAB',
			name: 'CSM-HAL-Serial',
			description: '',
			topics: [],
			visibility: 'private',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/NEVSTOP-LAB/CSM-HAL-Serial',
		};
		controller.availableModules = [onlineEntry];

		const entryTemplate: LocalModuleConfig['modules'][string] = {
			key: 'NEVSTOP-LAB__CSM-HAL-Serial',
			name: 'CSM-HAL-Serial',
			owner: 'NEVSTOP-LAB',
			source: 'https://github.com/NEVSTOP-LAB/CSM-HAL-Serial',
			method: 'copy',
			path: 'csm/HAL/serial',
			ref: 'abc123',
			branch: 'main',
		};
		const makeConfig = (entry: LocalModuleConfig['modules'][string]): LocalModuleConfig => ({
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				'NEVSTOP-LAB__CSM-HAL-Serial': entry,
			},
		});

		// 变体 1：扩展 apply 写入的标准条目
		assert.deepStrictEqual(controller.mapAppliedModuleKeys(makeConfig(entryTemplate)), ['NEVSTOP-LAB/CSM-HAL-Serial']);

		// 变体 2：source 带 .git 后缀
		assert.deepStrictEqual(
			controller.mapAppliedModuleKeys(makeConfig({ ...entryTemplate, source: 'https://github.com/NEVSTOP-LAB/CSM-HAL-Serial.git' })),
			['NEVSTOP-LAB/CSM-HAL-Serial'],
		);

		// 变体 3：submodule 自动同步解析出空 owner（SSH/本地 URL），source 为 https
		assert.deepStrictEqual(
			controller.mapAppliedModuleKeys(makeConfig({ ...entryTemplate, owner: '', source: 'https://github.com/NEVSTOP-LAB/CSM-HAL-Serial' })),
			['NEVSTOP-LAB/CSM-HAL-Serial'],
		);

		// 变体 4：GitHub 仓库转移——config 保留转移前的旧 owner/source，在线模块已是新 owner
		assert.deepStrictEqual(
			controller.mapAppliedModuleKeys(makeConfig({ ...entryTemplate, owner: 'nevstop', source: 'https://github.com/nevstop/CSM-HAL-Serial' })),
			['NEVSTOP-LAB/CSM-HAL-Serial'],
		);

		// 变体 5：submodule 自动同步，owner 为空且 source 为 SSH URL（normalizeModuleSource 支持 SSH 格式）
		assert.deepStrictEqual(
			controller.mapAppliedModuleKeys(makeConfig({ ...entryTemplate, owner: '', source: 'git@github.com:NEVSTOP-LAB/CSM-HAL-Serial.git' })),
			['NEVSTOP-LAB/CSM-HAL-Serial'],
		);
	});

	test('mapAppliedModuleKeys does not mis-match duplicate repository names across owners', () => {
		const controller = createController() as any;
		controller.availableModules = [
			{
				id: 1,
				owner: 'NEVSTOP-LAB',
				name: 'CSM-HAL-Serial',
				description: '',
				topics: [],
				visibility: 'private',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/NEVSTOP-LAB/CSM-HAL-Serial',
			},
			{
				id: 2,
				owner: 'other-org',
				name: 'CSM-HAL-Serial',
				description: '',
				topics: [],
				visibility: 'public',
				defaultBranch: 'main',
				repoUrl: 'https://github.com/other-org/CSM-HAL-Serial',
			},
		];
		const config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				'nevstop__CSM-HAL-Serial': {
					key: 'nevstop__CSM-HAL-Serial',
					name: 'CSM-HAL-Serial',
					owner: 'nevstop',
					source: 'https://github.com/nevstop/CSM-HAL-Serial',
					method: 'submodule',
					path: 'csm/HAL/serial',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		// 在线列表存在同名不同 owner 的仓库时，禁止凭仓库名 fallback 匹配（避免误配）
		assert.deepStrictEqual(controller.mapAppliedModuleKeys(config), []);
	});

	test('backfillAppliedModuleVersionInfos caches commit info for applied modules missing from version cache', async () => {
		const controller = createController() as any;
		controller.versionCache = {};
		const config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				'org__module-a': {
					key: 'org__module-a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'copy',
					path: 'csm/module-a',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		let resolveCalls = 0;
		let sidebarRefreshed = false;

		controller.getPreferredWorkspaceFolder = () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
		};
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.versionService = {
			resolveCommitInfo: async () => {
				resolveCalls += 1;
				return { commitInfo: 'Fix serial bug', date: '2026-01-01' };
			},
		};
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
			return 0;
		};

		await controller.backfillAppliedModuleVersionInfos('token');

		assert.strictEqual(resolveCalls, 1);
		assert.deepStrictEqual(controller.versionCache['org/module-a'], {
			ref: 'abc123',
			commitInfo: 'Fix serial bug',
			date: '2026-01-01',
		});
		assert.strictEqual(sidebarRefreshed, true);
	});

	test('backfillAppliedModuleVersionInfos skips cached, release and tag modules', async () => {
		const controller = createController() as any;
		controller.versionCache = {
			'org/module-cached': {
				ref: 'def456',
				commitInfo: 'Already cached',
				date: '2026-01-02',
			},
		};
		const config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {
				'org__module-cached': {
					key: 'org__module-cached',
					name: 'module-cached',
					owner: 'org',
					source: 'https://github.com/org/module-cached',
					method: 'copy',
					path: 'csm/module-cached',
					ref: 'def456',
					branch: 'main',
				},
				'org__module-release': {
					key: 'org__module-release',
					name: 'module-release',
					owner: 'org',
					source: 'https://github.com/org/module-release',
					method: 'release',
					path: 'csm/module-release',
					ref: '',
					branch: 'main',
					versionKind: 'release',
					releaseName: 'v1.0.0',
				},
				'org__module-tag': {
					key: 'org__module-tag',
					name: 'module-tag',
					owner: 'org',
					source: 'https://github.com/org/module-tag',
					method: 'copy',
					path: 'csm/module-tag',
					ref: 'tagsha',
					branch: 'main',
					versionKind: 'tag',
					versionRef: 'v2.0.0',
				},
			},
		};
		let resolveCalls = 0;

		controller.getPreferredWorkspaceFolder = () => ({ name: 'repo', uri: vscode.Uri.file('d:/repo') });
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
		};
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.versionService = {
			resolveCommitInfo: async () => {
				resolveCalls += 1;
				return { commitInfo: 'Should not be called', date: undefined };
			},
		};
		controller.refreshSidebarWorkspaceState = async () => 0;

		await controller.backfillAppliedModuleVersionInfos('token');

		// 已有缓存 / release / tag 模块都不需要补全
		assert.strictEqual(resolveCalls, 0);
		assert.deepStrictEqual(controller.versionCache['org/module-cached'], {
			ref: 'def456',
			commitInfo: 'Already cached',
			date: '2026-01-02',
		});
	});

	test('refreshSidebarWorkspaceState warns and continues when local module lock sync fails', async () => {
		const loggedWarnings: string[] = [];
		const controller = createController(undefined, {
			viewProvider: createViewProvider(),
			logger: {
				name: 'test',
				appendLine: () => undefined,
				append: () => undefined,
				clear: () => undefined,
				dispose: () => undefined,
				replace: () => undefined,
				show: () => undefined,
				hide: () => undefined,
				info: () => undefined,
				warn: (message: string) => {
					loggedWarnings.push(message);
				},
				error: () => undefined,
				debug: () => undefined,
				trace: () => undefined,
			} as any,
		}) as any;
		let capturedContext: unknown;

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
						locked: true,
					},
				},
			}),
			syncSubmoduleEntriesToConfig: async (_repoRoot: string, cfg: LocalModuleConfig) => ({ config: cfg, addedCount: 0 }),
			syncModuleLockStates: async () => {
				throw new Error('chmod denied');
			},
			listModuleDirectories: async () => [],
		};
		controller.computeStaleModuleKeys = async () => [];
		controller.treeDataProvider = {
			setWorkspaceContext: (context: unknown) => {
				capturedContext = context;
			},
			setModules: () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResultForPattern(configSearchPattern, [vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);

		await controller.refreshSidebarWorkspaceState();

		assert.ok(loggedWarnings.some((text) => text.includes('Failed to synchronize local module lock states: chmod denied')));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.deepStrictEqual(errors, []);
		assert.ok(capturedContext);
		assert.strictEqual((capturedContext as { workspaceLabel: string }).workspaceLabel, 'repo');
		assert.strictEqual((capturedContext as { moduleRoot: string }).moduleRoot, 'csm');
		assert.strictEqual((capturedContext as { gitAvailable: boolean }).gitAvailable, true);
		assert.deepStrictEqual((capturedContext as { staleModuleKeys: string[] }).staleModuleKeys, []);
		assert.deepStrictEqual((capturedContext as { unmanagedFolders: unknown[] }).unmanagedFolders, []);
		assert.strictEqual((capturedContext as { managedModules: Array<{ name: string; locked: boolean; path: string }> }).managedModules.length, 1);
		assert.strictEqual((capturedContext as { managedModules: Array<{ name: string }> }).managedModules[0].name, 'module-a');
		assert.strictEqual((capturedContext as { managedModules: Array<{ locked: boolean }> }).managedModules[0].locked, true);
		assert.strictEqual((capturedContext as { managedModules: Array<{ path: string }> }).managedModules[0].path, 'csm/module-a');
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
		assert.ok(rendered?.html.includes('csm/'));
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
		assert.ok(infos.some((text) => text.includes('Initialized local CSM module config from existing git module folders')));
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

	test('apply uses the selected namespace when computing the module target path', async () => {
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
		const config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		};
		let appliedTargetPath: string | undefined;

		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, ''),
			normalizeNamespacePath: (value: string) => value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/^\.\//, ''),
			recoverConfigFromExistingSubmodules: async () => undefined,
			loadConfig: async () => config,
			listModuleDirectories: async () => ['shared/feature'],
			getTargetRelativePath: (_config: LocalModuleConfig, _moduleEntry: CsmModuleEntry, namespaceRelativePath?: string) => {
				const namespace = namespaceRelativePath ? `/${namespaceRelativePath}` : '';
				return `csm${namespace}/module-b`;
			},
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, _moduleEntry: CsmModuleEntry, _method: ModuleApplyMethod, _authToken?: string, _onProgress?: (message: string) => void, explicitTargetRelativePath?: string) => {
				appliedTargetPath = explicitTargetRelativePath;
				return {
					key: 'org__module_b',
					name: 'module-b',
					owner: 'org',
					source: entry.repoUrl,
					method: 'copy',
					path: explicitTargetRelativePath ?? 'csm/module-b',
					ref: 'abc123',
					branch: entry.defaultBranch,
				};
			},
			withAppliedModule: (currentConfig: LocalModuleConfig, moduleEntry: LocalModuleConfig['modules'][string]) => ({
				...currentConfig,
				modules: {
					...currentConfig.modules,
					[moduleEntry.key]: moduleEntry,
				},
			}),
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setQuickPickResponse({ namespacePath: 'shared/feature' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(appliedTargetPath, 'csm/shared/feature/module-b');
	});

	test('apply namespace scan excludes already-managed module directories', async () => {
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
		const config: LocalModuleConfig = {
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
					path: 'csm/ns/module-a',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		let capturedOptions: { excludedRelativePaths?: string[] } | undefined;
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			normalizeNamespacePath: (value: string) => value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/^\.\//, ''),
			recoverConfigFromExistingSubmodules: async () => undefined,
			loadConfig: async () => config,
			listModuleDirectories: async (_repoRoot: string, _root: string, options?: { excludedRelativePaths?: string[] }) => {
				capturedOptions = options;
				return ['shared/feature'];
			},
			getTargetRelativePath: (_config: LocalModuleConfig, _moduleEntry: CsmModuleEntry, namespaceRelativePath?: string) => {
				const namespace = namespaceRelativePath ? `/${namespaceRelativePath}` : '';
				return `csm${namespace}/module-b`;
			},
			targetExists: async () => false,
			applyModule: async (_repoRoot: string, _config: LocalModuleConfig, _moduleEntry: CsmModuleEntry, _method: ModuleApplyMethod, _authToken?: string, _onProgress?: (message: string) => void, explicitTargetRelativePath?: string) => ({
				key: 'org__module_b',
				name: 'module-b',
				owner: 'org',
				source: entry.repoUrl,
				method: 'copy',
				path: explicitTargetRelativePath ?? 'csm/module-b',
				ref: 'abc123',
				branch: entry.defaultBranch,
			}),
			withAppliedModule: (currentConfig: LocalModuleConfig, moduleEntry: LocalModuleConfig['modules'][string]) => ({
				...currentConfig,
				modules: {
					...currentConfig.modules,
					[moduleEntry.key]: moduleEntry,
				},
			}),
			writeConfig: async () => undefined,
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([vscode.Uri.file('d:/repo/csm/csm-modules.yaml')]);
		mocked.__setQuickPickResponse({ method: 'copy' });
		mocked.__setQuickPickResponse({ namespacePath: 'shared/feature' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.deepStrictEqual(capturedOptions?.excludedRelativePaths, ['ns/module-a']);
	});

	test('mapUnmanagedFolders excludes managed module directories from scanning', async () => {
		const controller = createController() as any;
		let capturedOptions: { excludedRelativePaths?: string[]; excludedDirectoryNames?: string[] } | undefined;
		controller.workspaceModuleService = {
			listModuleDirectories: async (_repoRoot: string, _root: string, options?: { excludedRelativePaths?: string[]; excludedDirectoryNames?: string[] }) => {
				capturedOptions = options;
				return ['ns/other'];
			},
		};
		const config: LocalModuleConfig = {
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
					path: 'csm/ns/module-a',
					ref: 'abc123',
					branch: 'main',
					locked: false,
				},
			},
		};
		const result = await controller.mapUnmanagedFolders('d:/repo', 'csm', config);
		assert.deepStrictEqual(capturedOptions?.excludedRelativePaths, ['ns/module-a']);
		assert.ok(capturedOptions?.excludedDirectoryNames?.includes('node_modules'));
		assert.deepStrictEqual(result.map((entry: { path: string }) => entry.path), ['csm/ns/other']);
	});

	test('mapUnmanagedFolders respects configured excluded directories', async () => {
		const controller = createController() as any;
		let capturedOptions: { excludedDirectoryNames?: string[] } | undefined;
		controller.workspaceModuleService = {
			listModuleDirectories: async (_repoRoot: string, _root: string, options?: { excludedDirectoryNames?: string[] }) => {
				capturedOptions = options;
				return [];
			},
		};
		mocked.__setConfigurationValue('csmModules.moduleScanExcludedDirectories', ['vendor', 'third_party']);
		await controller.mapUnmanagedFolders('d:/repo', 'csm', {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		});
		assert.deepStrictEqual(capturedOptions?.excludedDirectoryNames, ['vendor', 'third_party']);
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
		mocked.__setQuickPickResponse({ versionSource: 'latest', label: 'Use default branch (main)' });
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		assert.strictEqual(appliedRoot, 'd:/plain-workspace');
		assert.strictEqual(writtenConfig?.modules.org__module_non_git?.method, 'copy');
		// 第一次 QuickPick 是引入方式选择：非 git 工作区下 submodule 不可用
		const methodPick = mocked.__getQuickPickHistory()[0];
		const methodPickItems = methodPick?.items as Array<{ label?: string; method?: string; kind?: vscode.QuickPickItemKind }> | undefined;
		assert.ok(methodPickItems?.some((item) => item.label?.includes('submodule')));
		assert.ok(!methodPickItems?.some((item) => item.method === 'submodule'));
		assert.strictEqual(methodPickItems?.[0]?.kind, vscode.QuickPickItemKind.Separator);
		const methodPickOptions = methodPick?.options as { prompt?: string } | undefined;
		assert.ok(methodPickOptions?.prompt?.includes('not a Git repository'));
		// 第二次 QuickPick 是版本来源选择（单选，issue #37）
		const versionPick = mocked.__getQuickPickHistory()[1];
		const versionPickOptions = versionPick?.options as { placeHolder?: string } | undefined;
		assert.ok(versionPickOptions?.placeHolder?.includes('Choose a version source for org/module-non-git'));
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(!errors.some((text) => text.includes('not a Git repository')));
	});

	test('apply uses GitHub Release as the apply method and downloads its assets', async () => {
		const controller = createController() as any;
		const entry: CsmModuleEntry = {
			id: 10,
			owner: 'org',
			name: 'module-ver',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-ver',
		};
		const initialConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
			modules: {},
		};
		let receivedMethod: ModuleApplyMethod | undefined;
		let receivedSelection: unknown;
		let writtenConfig: LocalModuleConfig | undefined;
		let cachedVersionInfo: unknown;

		controller.availableModules = [entry];
		controller.versionService = {
			listBranches: async () => [],
			listTags: async () => [],
			listReleases: async () => [
				{
					name: 'Release v1.0',
					tagName: 'v1.0',
					publishedAt: '2026-06-01T00:00:00Z',
					assets: [
						{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/module-ver/releases/download/v1.0/module-v1.0.zip' },
					],
				},
			],
			listCommits: async () => [],
			resolveCommitInfo: async () => ({ commitInfo: 'release commit', date: '2026-06-01T00:00:00Z' }),
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => 'd:/repo',
			normalizeRootPath: (value: string) => value,
			recoverConfigFromExistingSubmodules: async () => undefined,
			initializeConfig: async () => initialConfig,
			loadConfig: async () => initialConfig,
			getTargetRelativePath: (config: LocalModuleConfig, moduleEntry: CsmModuleEntry) => `${config.root}/${moduleEntry.name}`,
			targetExists: async () => false,
			applyModule: async (
				_repoRoot: string,
				_config: LocalModuleConfig,
				moduleEntry: CsmModuleEntry,
				method: ModuleApplyMethod,
				_authToken?: string,
				_onProgress?: (message: string) => void,
				_explicitTargetRelativePath?: string,
				versionSelection?: unknown,
			) => {
				receivedMethod = method;
				receivedSelection = versionSelection;
				return {
					key: 'org__module_ver',
					name: moduleEntry.name,
					owner: moduleEntry.owner,
					source: moduleEntry.repoUrl,
					method: 'release' as const,
					path: `csm/${moduleEntry.name}`,
					ref: '',
					branch: moduleEntry.defaultBranch,
					versionKind: 'release',
					versionRef: 'v1.0',
					releaseName: 'Release v1.0',
				};
			},
			withAppliedModule: (config: LocalModuleConfig, moduleEntry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: { ...config.modules, [moduleEntry.key]: moduleEntry },
			}),
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		controller.cacheStore.setModuleVersionCache = async (cache: unknown) => {
			cachedVersionInfo = cache;
		};
		mocked.__setWorkspaceFolders([{ name: 'repo', uri: vscode.Uri.file('d:/repo') }]);
		mocked.__setFindFilesResult([]);
		mocked.__setConfigurationValue('csmModules.defaultModuleRoot', 'csm');
		mocked.__setInformationMessageResponse('Use csm/');
		// 引入方式：GitHub Release
		mocked.__setQuickPickResponse({ method: 'release' });
		// Release 列表：显示标题，不显示 commit MD5
		mocked.__setQuickPickResponse({
			label: 'Release v1.0 · v1.0',
			release: {
				name: 'Release v1.0',
				tagName: 'v1.0',
				publishedAt: '2026-06-01T00:00:00Z',
				assets: [
					{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/module-ver/releases/download/v1.0/module-v1.0.zip' },
				],
			},
		});
		mocked.__setWarningMessageResponse('Apply');

		await controller.applyToWorkspaceCommand(entry);

		// applyModule 收到 method='release' 与 release 选择（含附件与 release 名）
		assert.strictEqual(receivedMethod, 'release');
		assert.ok(receivedSelection);
		const selection = receivedSelection as { kind: string; versionRef: string; branch: string; releaseName?: string; releaseAssets?: unknown[]; label: string };
		assert.strictEqual(selection.kind, 'release');
		assert.strictEqual(selection.versionRef, 'v1.0');
		assert.strictEqual(selection.branch, 'main');
		assert.strictEqual(selection.releaseName, 'Release v1.0');
		assert.strictEqual(selection.releaseAssets?.length, 1);
		// 确认框显示 tag 名（不是标题）
		assert.ok(mocked.__getLastWarningPrompt()?.message.includes('at version v1.0'));
		assert.ok(!mocked.__getLastWarningPrompt()?.message.includes('at version Release v1.0'));
		// Release 列表项显示标题（而非 commit MD5）
		const releasePick = mocked.__getQuickPickHistory()[1];
		const releaseItems = releasePick?.items as Array<{ label?: string; description?: string }> | undefined;
		assert.ok(releaseItems?.[0]?.label?.includes('Release v1.0'));
		assert.ok(!releaseItems?.[0]?.label?.match(/[0-9a-f]{40}/i));
		// 应用成功后写入 method='release' 与 releaseName；Release 附件方式不缓存提交信息
		assert.strictEqual(writtenConfig?.modules.org__module_ver?.method, 'release');
		assert.strictEqual(writtenConfig?.modules.org__module_ver?.versionKind, 'release');
		assert.strictEqual(writtenConfig?.modules.org__module_ver?.releaseName, 'Release v1.0');
		assert.strictEqual(cachedVersionInfo, undefined);
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

		assert.deepStrictEqual(starRequests, [
			{
				owner: 'org',
				repo: 'module-star',
				token: 'token',
				starred: true,
			},
			{
				owner: 'NEVSTOP-LAB',
				repo: 'Communicable-State-Machine',
				token: 'token',
				starred: true,
			},
		]);
		assert.strictEqual(renderedModules[renderedModules.length - 1]?.[0]?.starred, true);
	});

	test('recordLocalModuleCommand records an unmanaged folder as method=local and writes config', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-local-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'local-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		let sidebarRefreshed = false;
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
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
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};

		await controller.recordLocalModuleCommand({
			id: 'csm/local-module',
			kind: 'unmanaged',
			name: 'local-module',
			path: 'csm/local-module',
		});

		assert.deepStrictEqual(writtenConfig?.modules['local-module'], {
			key: 'local-module',
			name: 'local-module',
			owner: '',
			source: '',
			method: 'local',
			path: 'csm/local-module',
			ref: '',
			branch: '',
			locked: false,
		});
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Recorded local-module as a local module.')));
	});

	test('recordLocalModuleCommand lets the user pick an ancestor folder as the module directory for nested folders', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-nested-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'patha', 'pathb', 'module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			listModuleDirectories: async () => [],
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
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		// 用户选择祖先目录 csm/patha/pathb 作为模块目录
		mocked.__setQuickPickResponse({
			root: {
				id: 'csm/patha/pathb',
				kind: 'unmanaged',
				name: 'pathb',
				path: 'csm/patha/pathb',
			},
		});

		await controller.recordLocalModuleCommand({
			id: 'csm/patha/pathb/module',
			kind: 'unmanaged',
			name: 'module',
			path: 'csm/patha/pathb/module',
		});

		assert.deepStrictEqual(writtenConfig?.modules['pathb'], {
			key: 'pathb',
			name: 'pathb',
			owner: '',
			source: '',
			method: 'local',
			path: 'csm/patha/pathb',
			ref: '',
			branch: '',
			locked: false,
		});
		const quickPick = mocked.__getLastQuickPick();
		assert.ok(quickPick, '应弹出目录层级选择器');
		const quickPickOptions = quickPick?.options as { placeHolder?: string } | undefined;
		assert.ok(String(quickPickOptions?.placeHolder).includes('Choose the folder level to record as the local module'), '选择器使用记录本地模块文案');
	});

	test('recordLocalModuleCommand blocks an ancestor folder that contains managed modules', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-managed-under-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'patha', 'pathb', 'module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'org__managed': {
					key: 'org__managed',
					name: 'managed',
					owner: 'org',
					source: 'https://github.com/org/managed',
					method: 'copy',
					path: 'csm/patha/pathb/managed',
					ref: 'abc',
					branch: 'main',
					locked: true,
				},
			},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			listModuleDirectories: async () => [],
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
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		// 用户选择祖先目录 csm/patha/pathb，其下含已管理模块 managed
		mocked.__setQuickPickResponse({
			root: {
				id: 'csm/patha/pathb',
				kind: 'unmanaged',
				name: 'pathb',
				path: 'csm/patha/pathb',
			},
		});

		await controller.recordLocalModuleCommand({
			id: 'csm/patha/pathb/module',
			kind: 'unmanaged',
			name: 'module',
			path: 'csm/patha/pathb/module',
		});

		assert.strictEqual(writtenConfig, undefined, '含已管理模块的祖先目录不应写入记录');
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('Cannot record csm/patha/pathb as a local module because it contains managed CSM modules.')));
	});

	test('recordLocalModuleCommand aborts when the module directory selection is cancelled', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-cancel-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'patha', 'pathb', 'module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			listModuleDirectories: async () => [],
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
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		// 取消选择器（返回 undefined）
		mocked.__setQuickPickResponse(undefined);

		await controller.recordLocalModuleCommand({
			id: 'csm/patha/pathb/module',
			kind: 'unmanaged',
			name: 'module',
			path: 'csm/patha/pathb/module',
		});

		assert.strictEqual(writtenConfig, undefined, '取消选择器后不应写入记录');
	});

	test('recordLocalModuleCommand warns when the folder is already recorded', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-conflict-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'local-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'local-module': {
					key: 'local-module',
					name: 'local-module',
					owner: '',
					source: '',
					method: 'local',
					path: 'csm/local-module',
					ref: '',
					branch: '',
					locked: false,
				},
			},
		};
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;

		await controller.recordLocalModuleCommand({
			id: 'csm/local-module',
			kind: 'unmanaged',
			name: 'local-module',
			path: 'csm/local-module',
		});

		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('The folder csm/local-module is already recorded as a module.')));
	});

	test('recordLocalModuleCommand warns when the folder is missing on disk', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-record-missing-'));
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
		};
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;

		await controller.recordLocalModuleCommand({
			id: 'csm/missing',
			kind: 'unmanaged',
			name: 'missing',
			path: 'csm/missing',
		});

		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('The local folder csm/missing no longer exists.')));
	});

	test('removeLocalModuleRecordCommand removes only the config record and keeps the folder', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-remove-local-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'local-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'local-module': {
					key: 'local-module',
					name: 'local-module',
					owner: '',
					source: '',
					method: 'local',
					path: 'csm/local-module',
					ref: '',
					branch: '',
					locked: false,
				},
			},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		let sidebarRefreshed = false;
		controller.workspaceModuleService = {
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			withoutModule: (config: LocalModuleConfig, moduleKey: string) => {
				const { [moduleKey]: _omitted, ...rest } = config.modules;
				return { ...config, modules: rest };
			},
			writeConfig: async (config: LocalModuleConfig) => {
				writtenConfig = config;
			},
		};
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file(workspaceRoot) },
			repoRoot: workspaceRoot,
			workspaceRoot,
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setWarningMessageResponse('Remove Record');

		await controller.removeLocalModuleRecordCommand({
			id: 'local-module',
			kind: 'local',
			name: 'local-module',
			path: 'csm/local-module',
			source: '',
			method: 'local',
			branch: '',
			ref: '',
			repoUrl: '',
			description: '',
			visibility: 'public',
			topics: [],
			moduleEntry: {} as CsmModuleEntry,
			stale: false,
		});

		assert.deepStrictEqual(writtenConfig?.modules, {});
		assert.strictEqual(sidebarRefreshed, true);
		assert.ok(fs.existsSync(path.join(workspaceRoot, 'csm', 'local-module')), '移除记录后目录内容保留');
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Removed local module record for local-module.')));
	});

	test('createLocalFolderRepositoryCommand runs the GitHub creation wizard with default topics', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-'));
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
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
			owner: undefined,
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
					locked: true,
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
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-sync-fail-'));
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
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-copy-fallback-'));
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
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
					locked: true,
				},
			},
		});
	});

	test('createLocalFolderRepositoryCommand upgrades a local module (method: local) to managed and removes the local record', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-local-upgrade-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'local-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'local-module': {
					key: 'local-module',
					name: 'local-module',
					owner: '',
					source: '',
					method: 'local',
					path: 'csm/local-module',
					ref: '',
					branch: '',
					locked: false,
				},
			},
		};
		let writtenConfig: LocalModuleConfig | undefined;
		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			publishLocalFolder: async (options: { remoteUrl: string; defaultBranch?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async (options: { targetRelativePath: string; branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withoutModule: (config: LocalModuleConfig, moduleKey: string) => {
				const { [moduleKey]: _omitted, ...rest } = config.modules;
				return { ...config, modules: rest };
			},
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
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets']);
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/local-module',
			kind: 'unmanaged',
			name: 'local-module',
			path: 'csm/local-module',
		});

		// 原 local 记录被移除，写入 submodule 已管理条目
		assert.deepStrictEqual(writtenConfig?.modules['local-module'], undefined);
		assert.deepStrictEqual(writtenConfig?.modules['tester__shared-module'], {
			key: 'tester__shared-module',
			name: 'shared-module',
			owner: 'tester',
			source: 'https://github.com/tester/shared-module',
			method: 'submodule',
			path: 'csm/local-module',
			ref: 'def456',
			branch: 'main',
			locked: true,
		});
	});

	test('createLocalFolderRepositoryCommand waits for catalog refresh before resolving', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-refresh-order-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let releaseCatalogRefresh: (() => void) | undefined;
		let loadStarted = false;
		let completed = false;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			publishLocalFolder: async (options: { remoteUrl: string; defaultBranch?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
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
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => {
			loadStarted = true;
			await new Promise<void>((resolve) => {
				releaseCatalogRefresh = resolve;
			});
		};
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		const pending = controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		}).then(() => {
			completed = true;
		});

		// 命令发布前会经过真实 fs.stat 与多级 await 链，固定轮数的 setImmediate 循环
		// 在 CI 负载下可能不足以等到命令到达 loadModules 挂起点；改为在截止时间内轮询，
		// 直到 loadModules 被调用（loadStarted）或命令意外提前完成（completed）。
		const waitDeadline = Date.now() + 5000;
		while (!loadStarted && !completed && Date.now() < waitDeadline) {
			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		assert.strictEqual(loadStarted, true);
		assert.strictEqual(completed, false);
		releaseCatalogRefresh?.();
		await pending;
		assert.strictEqual(completed, true);
	});

	test('createLocalFolderRepositoryCommand asks for repository root level when module is nested', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-nested-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'NI'), { recursive: true });
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'Agilent'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let createdRequest: { name: string } | undefined;
		let publishedRequest: { folderPath: string } | undefined;
		let writtenConfig: LocalModuleConfig | undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
			createRepository: async (_token: string, options: { name: string; description?: string; private: boolean; topics: string[] }) => {
				createdRequest = { name: options.name };
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
			listModuleDirectories: async (_repoRoot: string, rootRelativePath: string) => rootRelativePath === 'csm/DMM' ? ['NI', 'Agilent'] : [],
			publishLocalFolder: async (options: { folderPath: string; remoteUrl: string; defaultBranch?: string }) => {
				publishedRequest = { folderPath: options.folderPath };
				return {
					branch: options.defaultBranch ?? 'main',
					remoteName: 'origin',
					remoteUrl: options.remoteUrl,
					headRef: 'abc123',
					createdCommit: true,
				};
			},
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
		// 第一次 QuickPick：层级选择（选择当前模块 NI）；第二次：可见性
		mocked.__setQuickPickResponse({
			label: 'NI',
			description: 'csm/DMM/NI',
			root: { id: 'csm/DMM/NI', kind: 'unmanaged', name: 'NI', path: 'csm/DMM/NI' },
		});
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/DMM/NI',
			kind: 'unmanaged',
			name: 'NI',
			path: 'csm/DMM/NI',
		});

		// 层级选择提供当前模块与祖先目录两个候选，祖先目录 detail 展示包含的模块数
		const rootSelection = mocked.__getQuickPickHistory()[0];
		assert.strictEqual(rootSelection.items.length, 2);
		assert.strictEqual((rootSelection.items[0] as { label: string }).label, 'NI');
		assert.strictEqual((rootSelection.items[1] as { label: string }).label, 'DMM');
		assert.ok(String((rootSelection.items[1] as { detail: string }).detail).includes('2'));
		assert.deepStrictEqual(createdRequest, { name: 'shared-module' });
		assert.strictEqual(publishedRequest?.folderPath, path.join(workspaceRoot, 'csm', 'DMM', 'NI'));
		assert.strictEqual(writtenConfig?.modules['tester__shared-module']?.path, 'csm/DMM/NI');
	});

	test('createLocalFolderRepositoryCommand publishes the ancestor folder when a parent level is chosen', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-ancestor-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'NI'), { recursive: true });
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'Agilent'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let publishedRequest: { folderPath: string } | undefined;
		let writtenConfig: LocalModuleConfig | undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
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
			listModuleDirectories: async (_repoRoot: string, rootRelativePath: string) => rootRelativePath === 'csm/DMM' ? ['NI', 'Agilent'] : [],
			publishLocalFolder: async (options: { folderPath: string; remoteUrl: string; defaultBranch?: string }) => {
				publishedRequest = { folderPath: options.folderPath };
				return {
					branch: options.defaultBranch ?? 'main',
					remoteName: 'origin',
					remoteUrl: options.remoteUrl,
					headRef: 'abc123',
					createdCommit: true,
				};
			},
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
		// 层级选择选择祖先目录 DMM
		mocked.__setQuickPickResponse({
			label: 'DMM',
			description: 'csm/DMM',
			root: { id: 'csm/DMM', kind: 'unmanaged', name: 'DMM', path: 'csm/DMM' },
		});
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/DMM/NI',
			kind: 'unmanaged',
			name: 'NI',
			path: 'csm/DMM/NI',
		});

		assert.strictEqual(publishedRequest?.folderPath, path.join(workspaceRoot, 'csm', 'DMM'));
		assert.strictEqual(writtenConfig?.modules['tester__shared-module']?.path, 'csm/DMM');
		assert.strictEqual(writtenConfig?.modules['tester__shared-module']?.method, 'submodule');
	});

	test('createLocalFolderRepositoryCommand blocks an ancestor root that contains managed modules', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-managed-under-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'NI'), { recursive: true });
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'Agilent'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'tester__managed': {
					key: 'tester__managed',
					name: 'managed',
					owner: 'tester',
					source: 'https://github.com/tester/managed',
					method: 'copy',
					path: 'csm/DMM/managedX',
					ref: 'abc123',
					branch: 'main',
					locked: false,
				},
			},
		};
		let createdCount = 0;
		let publishedCount = 0;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
			createRepository: async () => {
				createdCount += 1;
				return {
					id: 1,
					name: 'shared-module',
					full_name: 'tester/shared-module',
					description: '',
					private: true,
					default_branch: 'main',
					html_url: 'https://github.com/tester/shared-module',
					topics: [],
				};
			},
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			listModuleDirectories: async (_repoRoot: string, rootRelativePath: string) => rootRelativePath === 'csm/DMM' ? ['NI', 'Agilent'] : [],
			publishLocalFolder: async () => {
				publishedCount += 1;
				return {
					branch: 'main',
					remoteName: 'origin',
					remoteUrl: 'https://github.com/tester/shared-module.git',
					headRef: 'abc123',
					createdCommit: true,
				};
			},
			convertPublishedFolderToSubmodule: async () => ({
				branch: 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;
		// 层级选择选择祖先目录 DMM，随后因含已管理模块被阻止
		mocked.__setQuickPickResponse({
			label: 'DMM',
			description: 'csm/DMM',
			root: { id: 'csm/DMM', kind: 'unmanaged', name: 'DMM', path: 'csm/DMM' },
		});

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/DMM/NI',
			kind: 'unmanaged',
			name: 'NI',
			path: 'csm/DMM/NI',
		});

		assert.strictEqual(createdCount, 0);
		assert.strictEqual(publishedCount, 0);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('csm/DMM') && text.includes('managed CSM modules')));
	});

	test('createLocalFolderRepositoryCommand aborts when the repository root selection is cancelled', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-root-cancel-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'DMM', 'NI'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let createdCount = 0;
		let publishedCount = 0;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [],
			getOrganizationMembership: async () => undefined,
			createRepository: async () => {
				createdCount += 1;
				return {
					id: 1,
					name: 'shared-module',
					full_name: 'tester/shared-module',
					description: '',
					private: true,
					default_branch: 'main',
					html_url: 'https://github.com/tester/shared-module',
					topics: [],
				};
			},
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			listModuleDirectories: async () => [],
			publishLocalFolder: async () => {
				publishedCount += 1;
				return {
					branch: 'main',
					remoteName: 'origin',
					remoteUrl: 'https://github.com/tester/shared-module.git',
					headRef: 'abc123',
					createdCommit: true,
				};
			},
			convertPublishedFolderToSubmodule: async () => ({
				branch: 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;
		// 层级选择被取消
		mocked.__setQuickPickResponse(undefined);

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/DMM/NI',
			kind: 'unmanaged',
			name: 'NI',
			path: 'csm/DMM/NI',
		});

		assert.strictEqual(createdCount, 0);
		assert.strictEqual(publishedCount, 0);
	});

	test('createLocalFolderRepositoryCommand lets the user pick an organization and creates the repository there', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-org-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		const membershipChecks: string[] = [];
		let createdRequest:
			| { token: string; owner?: string; name: string; private: boolean; topics: string[] }
			| undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [
				{ login: 'org-a', name: 'Org A' },
				{ login: 'org-b' },
			],
			getOrganizationMembership: async (_token: string, org: string) => {
				membershipChecks.push(org);
				return org === 'org-a' ? { state: 'active', role: 'member' } : { state: 'pending', role: 'member' };
			},
			createRepository: async (token: string, options: { owner?: string; name: string; description?: string; private: boolean; topics: string[] }) => {
				createdRequest = { token, owner: options.owner, name: options.name, private: options.private, topics: options.topics };
				return {
					id: 1,
					name: options.name,
					full_name: `${options.owner ?? 'tester'}/${options.name}`,
					description: options.description ?? '',
					private: options.private,
					default_branch: 'main',
					html_url: `https://github.com/${options.owner ?? 'tester'}/${options.name}`,
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
			publishLocalFolder: async (options: { remoteUrl: string; defaultBranch?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		// 第一次 QuickPick：归属选择（选择组织 org-a）；第二次：可见性
		mocked.__setQuickPickResponse({ label: 'org-a', owner: { kind: 'org', login: 'org-a' } });
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		// 两个组织都做了成员关系检查；org-a active 可选，org-b pending 不可选
		assert.deepStrictEqual(membershipChecks, ['org-a', 'org-b']);
		// 归属 QuickPick 列出个人账号 + 有权限组织（仅 org-a）
		const ownerSelection = mocked.__getQuickPickHistory()[0];
		assert.strictEqual(ownerSelection.items.length, 2);
		assert.strictEqual((ownerSelection.items[0] as { label: string }).label, '@tester');
		assert.strictEqual((ownerSelection.items[1] as { label: string }).label, 'org-a');
		// 创建到组织
		assert.deepStrictEqual(createdRequest, {
			token: 'token',
			owner: 'org-a',
			name: 'shared-module',
			private: true,
			topics: ['labview-csm', 'csm-modsets', 'custom-topic'],
		});
		// 确认对话框展示归属 owner/name
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('org-a/shared-module')));
	});

	test('createLocalFolderRepositoryCommand skips the owner selection when no organization can create repositories', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-no-org-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let createdRequest: { owner?: string; name: string } | undefined;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => ({ login: 'tester', name: 'Tester' }),
			getUserOrganizations: async () => [
				{ login: 'org-a', name: 'Org A' },
			],
			getOrganizationMembership: async () => undefined,
			createRepository: async (_token: string, options: { owner?: string; name: string; description?: string; private: boolean; topics: string[] }) => {
				createdRequest = { owner: options.owner, name: options.name };
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
			publishLocalFolder: async (options: { remoteUrl: string; defaultBranch?: string }) => ({
				branch: options.defaultBranch ?? 'main',
				remoteName: 'origin',
				remoteUrl: options.remoteUrl,
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async (options: { branch?: string }) => ({
				branch: options.branch ?? 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;
		mocked.__setInputBoxResponses(['shared-module', 'Demo repo', 'labview-csm, csm-modsets custom-topic']);
		// 仅一个 QuickPick：可见性（归属选择被跳过，默认个人账号）
		mocked.__setQuickPickResponse({ label: 'Private', visibility: 'private' });
		mocked.__setWarningMessageResponse('Create Repository');

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.deepStrictEqual(createdRequest, { owner: undefined, name: 'shared-module' });
		// 归属选择未弹出：QuickPick 历史中只有可见性选择
		const history = mocked.__getQuickPickHistory();
		assert.strictEqual(history.length, 1);
		assert.strictEqual((history[0].items[0] as { visibility?: string }).visibility, 'private');
	});

	test('createLocalFolderRepositoryCommand aborts when fetching owner candidates fails', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-share-module-owner-fail-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const existingConfig: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let createdCount = 0;

		controller.authService = {
			getSessionSilently: async () => createSession('token', 'tester'),
			getSessionInteractively: async () => createSession('token', 'tester'),
		};
		controller.githubService = {
			fetchModules: async () => ({ modules: [] }),
			fetchReadme: async () => '',
			getCurrentUser: async () => {
				throw new Error('GitHub current user request failed: 500');
			},
			createRepository: async () => {
				createdCount += 1;
				return {
					id: 1,
					name: 'shared-module',
					full_name: 'tester/shared-module',
					description: '',
					private: true,
					default_branch: 'main',
					html_url: 'https://github.com/tester/shared-module',
					topics: [],
				};
			},
		};
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getGitIdentity: async () => ({
				name: 'Tester',
				email: 'tester@example.com',
			}),
			publishLocalFolder: async () => ({
				branch: 'main',
				remoteName: 'origin',
				remoteUrl: '',
				headRef: 'abc123',
				createdCommit: true,
			}),
			convertPublishedFolderToSubmodule: async () => ({
				branch: 'main',
				headRef: 'def456',
			}),
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withAppliedModule: (config: LocalModuleConfig, entry: LocalModuleConfig['modules'][string]) => ({
				...config,
				modules: {
					...config.modules,
					[entry.key]: entry,
				},
			}),
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'repo', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => existingConfig;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		controller.loadModules = async () => undefined;

		await controller.createLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		// 归属获取失败：中断创建流程，不创建仓库
		assert.strictEqual(createdCount, 0);
		const errors = mocked.__getMessageLog().filter((message) => message.level === 'error').map((message) => message.text);
		assert.ok(errors.some((text) => text.includes('GitHub is temporarily unavailable (HTTP 500)')));
	});

	test('linkLocalFolderRepositoryCommand records an unmanaged folder against an online repository', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-link-module-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const moduleToLink: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let resolvedRefRequest:
			| { cwd: string; repoUrl: string; branch: string; authToken?: string }
			| undefined;
		let loadOptions:
			| { interactiveAuth: boolean; showSuccessMessage: boolean; showErrorMessage: boolean; preserveVisibleModules?: boolean }
			| undefined;
		let sidebarRefreshed = false;

		controller.availableModules = [];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			resolveRemoteBranchRef: async (cwd: string, repoUrl: string, branch: string, authToken?: string) => {
				resolvedRefRequest = { cwd, repoUrl, branch, authToken };
				return 'abc123';
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		controller.loadModules = async (options: { interactiveAuth: boolean; showSuccessMessage: boolean; showErrorMessage: boolean; preserveVisibleModules?: boolean }) => {
			loadOptions = options;
			controller.availableModules = [moduleToLink];
		};
		mocked.__setQuickPickResponse({ moduleEntry: moduleToLink });
		mocked.__setWarningMessageResponse('Link Repository');

		await controller.linkLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.deepStrictEqual(resolvedRefRequest, {
			cwd: workspaceRoot,
			repoUrl: 'https://github.com/org/module-a',
			branch: 'main',
			authToken: undefined,
		});
		assert.deepStrictEqual(loadOptions, {
			interactiveAuth: false,
			showSuccessMessage: false,
			showErrorMessage: true,
			preserveVisibleModules: true,
		});
		assert.deepStrictEqual(config.modules, {
			'org__module-a': {
				key: 'org__module-a',
				name: 'module-a',
				owner: 'org',
				source: 'https://github.com/org/module-a',
				method: 'copy',
				path: 'csm/custom-module',
				ref: 'abc123',
				branch: 'main',
				locked: true,
			},
		});
		assert.strictEqual(sidebarRefreshed, true);
		const infos = mocked.__getMessageLog().filter((message) => message.level === 'info').map((message) => message.text);
		assert.ok(infos.some((text) => text.includes('Linked csm/custom-module to org/module-a.')));
	});

	test('linkLocalFolderRepositoryCommand keeps existing git submodule metadata instead of rewriting it as copy', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-link-existing-submodule-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const moduleToLink: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'local__custom-module': {
					key: 'local__custom-module',
					name: 'custom-module',
					owner: '',
					source: 'git@github.com:org/module-a.git',
					method: 'submodule',
					path: 'csm/custom-module',
					ref: 'old-ref',
					branch: 'main',
					locked: true,
				},
			},
		};
		let resolvedRemoteRef = false;
		let sidebarRefreshed = false;

		controller.availableModules = [moduleToLink];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getExistingSubmoduleConfigEntry: async () => ({
				key: 'local__custom-module',
				name: 'custom-module',
				owner: '',
				source: 'git@github.com:org/module-a.git',
				method: 'submodule',
				path: 'csm/custom-module',
				ref: 'def456',
				branch: 'develop',
				locked: true,
			}),
			resolveRemoteBranchRef: async () => {
				resolvedRemoteRef = true;
				return 'abc123';
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
			withoutModule: (currentConfig: LocalModuleConfig, moduleKey: string) => {
				const { [moduleKey]: _removed, ...rest } = currentConfig.modules;
				config = {
					...currentConfig,
					modules: rest,
				};
				return config;
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'git-workspace', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => {
			sidebarRefreshed = true;
		};
		mocked.__setQuickPickResponse({ moduleEntry: moduleToLink });
		mocked.__setWarningMessageResponse('Link Repository');

		await controller.linkLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.strictEqual(resolvedRemoteRef, false);
		assert.deepStrictEqual(config.modules, {
			'org__module-a': {
				key: 'org__module-a',
				name: 'module-a',
				owner: 'org',
				source: 'git@github.com:org/module-a.git',
				method: 'submodule',
				path: 'csm/custom-module',
				ref: 'def456',
				branch: 'develop',
				locked: true,
			},
		});
		assert.strictEqual(sidebarRefreshed, true);
	});

	test('linkLocalFolderRepositoryCommand reuses existing nested git repository metadata instead of remote head state', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-link-existing-nested-repo-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const moduleToLink: CsmModuleEntry = {
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		};
		let config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {},
		};
		let resolvedRemoteRef = false;

		controller.availableModules = [moduleToLink];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => workspaceRoot,
			getExistingSubmoduleConfigEntry: async () => ({
				key: 'local__custom-module',
				name: 'custom-module',
				owner: '',
				source: 'git@github.com:org/module-a.git',
				method: 'submodule',
				path: 'csm/custom-module',
				ref: 'def456',
				branch: 'feature/test',
				locked: true,
			}),
			resolveRemoteBranchRef: async () => {
				resolvedRemoteRef = true;
				return 'abc123';
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			setModuleLocked: async (_workspaceRoot: string, entry: LocalModuleConfig['modules'][string], locked: boolean) => ({
				...entry,
				locked,
			}),
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
		controller.resolveWorkspaceFolder = async () => ({ name: 'git-workspace', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		mocked.__setQuickPickResponse({ moduleEntry: moduleToLink });
		mocked.__setWarningMessageResponse('Link Repository');

		await controller.linkLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.strictEqual(resolvedRemoteRef, false);
		assert.deepStrictEqual(config.modules, {
			'org__module-a': {
				key: 'org__module-a',
				name: 'module-a',
				owner: 'org',
				source: 'git@github.com:org/module-a.git',
				method: 'submodule',
				path: 'csm/custom-module',
				ref: 'def456',
				branch: 'feature/test',
				locked: true,
			},
		});
	});

	test('linkLocalFolderRepositoryCommand refuses to overwrite a different managed path for the same repository', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(getTempRoot(), 'csm-link-module-conflict-'));
		fs.mkdirSync(path.join(workspaceRoot, 'csm', 'custom-module'), { recursive: true });
		const controller = createController() as any;
		const config: LocalModuleConfig = {
			version: '2',
			root: 'csm',
			configPath: path.join(workspaceRoot, 'csm', 'csm-modules.yaml'),
			modules: {
				'org__module-a': {
					key: 'org__module-a',
					name: 'module-a',
					owner: 'org',
					source: 'https://github.com/org/module-a',
					method: 'copy',
					path: 'csm/existing-module',
					ref: 'abc123',
					branch: 'main',
				},
			},
		};
		let resolvedRemoteRef = false;

		controller.availableModules = [{
			id: 1,
			owner: 'org',
			name: 'module-a',
			description: 'demo',
			topics: ['csm-modsets'],
			visibility: 'public',
			defaultBranch: 'main',
			repoUrl: 'https://github.com/org/module-a',
		}];
		controller.workspaceModuleService = {
			resolveGitRepositoryRoot: async () => undefined,
			resolveRemoteBranchRef: async () => {
				resolvedRemoteRef = true;
				return 'def456';
			},
			normalizeRootPath: (value: string) => value.replace(/\\/g, '/'),
			getModuleKey: (entry: CsmModuleEntry) => `${entry.owner}__${entry.name}`,
			withAppliedModule: () => config,
			writeConfig: async () => undefined,
		};
		controller.resolveWorkspaceFolder = async () => ({ name: 'plain-workspace', uri: vscode.Uri.file(workspaceRoot) });
		controller.tryLoadSidebarLocalModuleConfig = async () => config;
		controller.refreshSidebarWorkspaceState = async () => undefined;
		mocked.__setQuickPickResponse({ moduleEntry: controller.availableModules[0] });
		mocked.__setWarningMessageResponse('Link Repository');

		await controller.linkLocalFolderRepositoryCommand({
			id: 'csm/custom-module',
			kind: 'unmanaged',
			name: 'custom-module',
			path: 'csm/custom-module',
		});

		assert.strictEqual(resolvedRemoteRef, false);
		const warnings = mocked.__getMessageLog().filter((message) => message.level === 'warn').map((message) => message.text);
		assert.ok(warnings.some((text) => text.includes('Repository org/module-a is already recorded at csm/existing-module.')));
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
		assert.ok(infos.some((text) => text.includes('Recovered local CSM module config from existing git module folders')));
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

	test('extended webview context commands forward to matching module/folder actions', async () => {
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
		controller.availableModules = [entry];

		const openedRepoNames: string[] = [];
		const toggledStarNames: string[] = [];
		const toggledLockIds: string[] = [];
		const toggledSwitchIds: string[] = [];
		const linkedFolderPaths: string[] = [];
		const createdFolderPaths: string[] = [];
		const recordedFolderPaths: string[] = [];
		const removedRecordIds: string[] = [];

		controller.openRepositoryCommand = async (target?: CsmModuleEntry) => {
			if (target) {
				openedRepoNames.push(target.name);
			}
		};
		controller.toggleStarCommand = async (target?: CsmModuleEntry) => {
			if (target) {
				toggledStarNames.push(target.name);
			}
		};
		controller.toggleLocalModuleLockCommand = async (target: LocalManagedModuleEntry) => {
			toggledLockIds.push(target.id);
		};
		controller.switchLocalModuleMethodCommand = async (target: LocalManagedModuleEntry) => {
			toggledSwitchIds.push(target.id);
		};
		controller.linkLocalFolderRepositoryCommand = async (folder: LocalUnmanagedFolderEntry) => {
			linkedFolderPaths.push(folder.path);
		};
		controller.createLocalFolderRepositoryCommand = async (folder: LocalUnmanagedFolderEntry) => {
			createdFolderPaths.push(folder.path);
		};
		controller.recordLocalModuleCommand = async (folder: LocalUnmanagedFolderEntry) => {
			recordedFolderPaths.push(folder.path);
		};
		controller.removeLocalModuleRecordCommand = async (target: LocalManagedModuleEntry) => {
			removedRecordIds.push(target.id);
		};
		controller.resolveWorkspaceContext = async () => ({
			workspaceFolder: { name: 'repo', uri: vscode.Uri.file('d:/repo') },
			repoRoot: 'd:/repo',
			workspaceRoot: 'd:/repo',
		});
		controller.tryLoadSidebarLocalModuleConfig = async () => ({
			version: '2',
			root: 'csm',
			configPath: 'd:/repo/csm/csm-modules.yaml',
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
					locked: true,
				},
				local_module: {
					key: 'local_module',
					name: 'local_module',
					owner: '',
					source: '',
					method: 'local',
					path: 'csm/local_module',
					ref: '',
					branch: '',
					locked: false,
				},
			},
		});

		await controller.contextOpenRepositoryCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard' });
		await controller.contextStarModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard', moduleStarred: false });
		await controller.contextUnstarModuleCommand({ moduleKey: 'org/module-a', webviewSection: 'moduleCard', moduleStarred: true });
		await controller.contextLinkLocalRepositoryCommand({ localItemId: 'csm/module-b', localItemPath: 'csm/module-b', webviewSection: 'workspaceCard', workspaceCardKind: 'unmanaged' });
		await controller.contextCreateLocalRepositoryCommand({ localItemId: 'csm/module-b', localItemPath: 'csm/module-b', webviewSection: 'workspaceCard', workspaceCardKind: 'unmanaged' });
		await controller.contextLockLocalModuleCommand({ localItemId: 'org__module_copy', localItemPath: 'csm/module-copy', webviewSection: 'workspaceCard', workspaceCardKind: 'managed' });
		await controller.contextUnlockLocalModuleCommand({ localItemId: 'org__module_copy', localItemPath: 'csm/module-copy', webviewSection: 'workspaceCard', workspaceCardKind: 'managed' });
		await controller.contextSwitchLocalModuleMethodCommand({ localItemId: 'org__module_copy', localItemPath: 'csm/module-copy', webviewSection: 'workspaceCard', workspaceCardKind: 'managed' });
		await controller.contextRecordLocalModuleCommand({ localItemId: 'csm/module-b', localItemPath: 'csm/module-b', webviewSection: 'workspaceCard', workspaceCardKind: 'unmanaged' });
		await controller.contextRemoveLocalModuleRecordCommand({ localItemId: 'local_module', localItemPath: 'csm/local_module', webviewSection: 'workspaceCard', workspaceCardKind: 'local' });

		assert.deepStrictEqual(openedRepoNames, ['module-a']);
		assert.deepStrictEqual(toggledStarNames, ['module-a', 'module-a']);
		assert.deepStrictEqual(toggledLockIds, ['org__module_copy', 'org__module_copy']);
		assert.deepStrictEqual(toggledSwitchIds, ['org__module_copy']);
		assert.deepStrictEqual(linkedFolderPaths, ['csm/module-b']);
		assert.deepStrictEqual(createdFolderPaths, ['csm/module-b']);
		assert.deepStrictEqual(recordedFolderPaths, ['csm/module-b']);
		assert.deepStrictEqual(removedRecordIds, ['local_module']);
	});

	test('extended webview context commands resolve nothing without identifiers', async () => {
		const controller = createController() as any;
		let opened = false;
		let starred = false;
		let locked = false;
		let switched = false;
		let linked = false;
		let created = false;

		controller.openRepositoryCommand = async () => { opened = true; };
		controller.toggleStarCommand = async () => { starred = true; };
		controller.toggleLocalModuleLockCommand = async () => { locked = true; };
		controller.switchLocalModuleMethodCommand = async () => { switched = true; };
		controller.linkLocalFolderRepositoryCommand = async () => { linked = true; };
		controller.createLocalFolderRepositoryCommand = async () => { created = true; };

		await controller.contextOpenRepositoryCommand({ webviewSection: 'moduleCard' });
		await controller.contextStarModuleCommand({ webviewSection: 'moduleCard' });
		await controller.contextUnstarModuleCommand({ webviewSection: 'moduleCard' });
		await controller.contextLockLocalModuleCommand({ webviewSection: 'workspaceCard' });
		await controller.contextUnlockLocalModuleCommand({ webviewSection: 'workspaceCard' });
		await controller.contextSwitchLocalModuleMethodCommand({ webviewSection: 'workspaceCard' });
		await controller.contextLinkLocalRepositoryCommand({ webviewSection: 'workspaceCard' });
		await controller.contextCreateLocalRepositoryCommand({ webviewSection: 'workspaceCard' });

		assert.strictEqual(opened, false);
		assert.strictEqual(starred, false);
		assert.strictEqual(locked, false);
		assert.strictEqual(switched, false);
		assert.strictEqual(linked, false);
		assert.strictEqual(created, false);
	});

	test('forkedReposHandling "exclude" (default) hides all fork modules from cache', async () => {
		let visibleModuleCount = 0;
		let visibleModuleNames: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'org', name: 'csmu',
				description: 'original', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/csmu',
				fork: false, pushedAt: '2026-01-01T00:00:00Z',
			},
			{
				id: 2, owner: 'forker', name: 'csmu',
				description: 'fork of csmu', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/forker/csmu',
				fork: true, pushedAt: '2026-06-01T00:00:00Z',
			},
			{
				id: 3, owner: 'other', name: 'standalone-fork',
				description: 'standalone fork', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/other/standalone-fork',
				fork: true, pushedAt: '2026-05-01T00:00:00Z',
			},
		], '2026-05-20T08:00:00.000Z'));

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleCount = modules.length;
					visibleModuleNames = modules.map((m) => m.name);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		// "exclude" default: only non-fork modules visible (id=1 csmu)
		assert.strictEqual(visibleModuleCount, 1);
		assert.deepStrictEqual(visibleModuleNames, ['csmu']);
	});

	test('forkedReposHandling "include" shows all fork modules', async () => {
		let visibleModuleCount = 0;
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'org', name: 'csmu',
				description: 'original', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/csmu',
				fork: false, pushedAt: '2026-01-01T00:00:00Z',
			},
			{
				id: 2, owner: 'forker', name: 'csmu',
				description: 'fork', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/forker/csmu',
				fork: true, pushedAt: '2026-06-01T00:00:00Z',
			},
			{
				id: 3, owner: 'other', name: 'standalone-fork',
				description: 'standalone fork', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/other/standalone-fork',
				fork: true, pushedAt: '2026-05-01T00:00:00Z',
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.forkedReposHandling', 'include');

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleCount = modules.length;
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		// "include": all 3 modules visible
		assert.strictEqual(visibleModuleCount, 3);
	});

	test('forkedReposHandling "latest" keeps only the most recently pushed per name', async () => {
		let visibleModuleNames: string[] = [];
		let visibleOwners: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'org', name: 'csmu',
				description: 'original (older)', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/csmu',
				fork: false, pushedAt: '2026-01-01T00:00:00Z',
			},
			{
				id: 2, owner: 'forker', name: 'csmu',
				description: 'fork (newer)', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/forker/csmu',
				fork: true, pushedAt: '2026-06-01T00:00:00Z',
			},
			{
				id: 3, owner: 'other', name: 'other-module',
				description: 'only version', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/other/other-module',
				fork: false, pushedAt: '2026-03-01T00:00:00Z',
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.forkedReposHandling', 'latest');

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleNames = modules.map((m) => m.name);
					visibleOwners = modules.map((m) => m.owner);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		// "latest": csmu fork (newer) wins, other-module alone
		assert.strictEqual(visibleModuleNames.length, 2);
		assert.ok(visibleModuleNames.includes('csmu'));
		assert.ok(visibleModuleNames.includes('other-module'));
		// csmu should be the fork version (newer pushedAt)
		const csmuEntry = visibleOwners[visibleModuleNames.indexOf('csmu')];
		assert.strictEqual(csmuEntry, 'forker');
	});

	test('forkedReposHandling "latest" treats undefined pushedAt as earliest', async () => {
		let visibleOwners: string[] = [];
		let visibleModuleNames: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'org', name: 'csmu',
				description: 'original (has pushedAt)', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/csmu',
				fork: false, pushedAt: '2026-01-01T00:00:00Z',
			},
			{
				id: 2, owner: 'forker', name: 'csmu',
				description: 'fork (no pushedAt)', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/forker/csmu',
				fork: true, pushedAt: undefined,
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.forkedReposHandling', 'latest');

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleModuleNames = modules.map((m) => m.name);
					visibleOwners = modules.map((m) => m.owner);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		// "latest": original wins because fork has no pushedAt (treated as epoch 0)
		assert.strictEqual(visibleModuleNames.length, 1);
		assert.strictEqual(visibleOwners[0], 'org');
	});

	test('hiddenOwners excludes repositories from specified owners (case-insensitive)', async () => {
		let visibleOwners: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'OrgA', name: 'module-a',
				description: 'a', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/OrgA/module-a',
			},
			{
				id: 2, owner: 'orgb', name: 'module-b',
				description: 'b', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/orgb/module-b',
			},
			{
				id: 3, owner: 'OrgC', name: 'module-c',
				description: 'c', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/OrgC/module-c',
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.hiddenOwners', ['orga', 'ORGC']);

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleOwners = modules.map((m) => m.owner);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		assert.strictEqual(visibleOwners.length, 1);
		assert.deepStrictEqual(visibleOwners, ['orgb']);
	});

	test('filterTopics excludes repositories containing specified topics', async () => {
		let visibleNames: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'org', name: 'module-a',
				description: 'a', topics: ['csm-modsets', 'deprecated'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-a',
			},
			{
				id: 2, owner: 'org', name: 'module-b',
				description: 'b', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-b',
			},
			{
				id: 3, owner: 'org', name: 'module-c',
				description: 'c', topics: ['csm-modsets', 'LEGACY'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/org/module-c',
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.filterTopics', ['deprecated', 'legacy']);

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleNames = modules.map((m) => m.name);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		assert.strictEqual(visibleNames.length, 1);
		assert.deepStrictEqual(visibleNames, ['module-b']);
	});

	test('filter pipeline combines hiddenOwners, filterTopics, fork exclude, and archived', async () => {
		let visibleNames: string[] = [];
		const memento = new FakeMemento();
		await memento.update('csmModules.cache.modules', createCachedSnapshot([
			{
				id: 1, owner: 'good', name: 'mod-ok',
				description: '', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/good/mod-ok',
				fork: false, archived: false,
			},
			{
				id: 2, owner: 'blocked-owner', name: 'mod-blocked-by-owner',
				description: '', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/blocked-owner/mod-blocked-by-owner',
				fork: false, archived: false,
			},
			{
				id: 3, owner: 'good', name: 'mod-deprecated-topic',
				description: '', topics: ['csm-modsets', 'deprecated'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/good/mod-deprecated-topic',
				fork: false, archived: false,
			},
			{
				id: 4, owner: 'good', name: 'mod-fork',
				description: '', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/good/mod-fork',
				fork: true, archived: false,
			},
			{
				id: 5, owner: 'good', name: 'mod-archived',
				description: '', topics: ['csm-modsets'],
				visibility: 'public', defaultBranch: 'main',
				repoUrl: 'https://github.com/good/mod-archived',
				fork: false, archived: true,
			},
		], '2026-05-20T08:00:00.000Z'));

		mocked.__setConfigurationValue('csmModules.hiddenOwners', ['blocked-owner']);
		mocked.__setConfigurationValue('csmModules.filterTopics', ['deprecated']);

		const controller = createController(memento, {
			authService: {
				getSessionSilently: async () => createSession('token', 'tester'),
				getSessionInteractively: async () => createSession('token', 'tester'),
				signOut: async () => undefined,
			},
			githubService: { fetchModules: async () => ({ modules: [] }), fetchReadme: async () => '' },
			viewProvider: createViewProvider({
				setModules: (modules: CsmModuleEntry[]) => {
					visibleNames = modules.map((m) => m.name);
				},
			}),
		});

		controller.register([]);
		await controller.logoutCommand();

		// Only mod-ok survives all filters:
		// - blocked-owner filtered by hiddenOwners
		// - deprecated topic filtered by filterTopics
		// - fork filtered by default forkedReposHandling "exclude"
		// - archived filtered by default hideArchivedRepos true
		assert.strictEqual(visibleNames.length, 1);
		assert.deepStrictEqual(visibleNames, ['mod-ok']);
	});
});
