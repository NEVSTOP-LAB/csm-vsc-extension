import * as assert from 'assert';
import * as vscode from 'vscode';
import { ModuleManagerController } from '../moduleManager/moduleManagerController';
import { CsmModuleEntry } from '../moduleManager/types';

type VscodeMock = typeof vscode & {
	__getMessageLog: () => Array<{ level: 'info' | 'warn' | 'error'; text: string }>;
	__resetMessageLog: () => void;
	__setWarningMessageResponse: (response: string | undefined) => void;
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

function createController(): ModuleManagerController {
	const context = {
		globalState: new FakeMemento(),
	} as unknown as vscode.ExtensionContext;
	return new ModuleManagerController(context);
}

suite('ModuleManagerController Regression Tests', () => {
	const mocked = vscode as VscodeMock;

	teardown(() => {
		mocked.__resetMessageLog();
		mocked.__setWarningMessageResponse(undefined);
	});

	test('refresh without session sets error and warning message', async () => {
		const controller = createController() as any;
		let setErrorText = '';

		controller.authService = {
			getSessionSilently: async () => undefined,
			getSessionInteractively: async () => undefined,
		};
		controller.treeDataProvider = {
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
			setError: () => undefined,
			setLoading: () => undefined,
			setModules: () => undefined,
		};
		mocked.__resetMessageLog();
		mocked.__setWarningMessageResponse(undefined);

		await controller.refreshCommand();

		assert.strictEqual(fetched, false);
	});
});
