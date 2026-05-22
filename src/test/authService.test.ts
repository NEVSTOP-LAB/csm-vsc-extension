import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthService } from '../moduleManager/authService';

type VscodeAuthMock = typeof vscode & {
	__setAuthenticationGetSession: (handler: (providerId: string, scopes: string[], options: { createIfNone: boolean }) => Promise<unknown>) => void;
	__resetAuthenticationGetSession: () => void;
};

suite('AuthService Tests', () => {
	const mockedVscode = vscode as VscodeAuthMock;

	teardown(() => {
		mockedVscode.__resetAuthenticationGetSession();
	});

	test('getSessionSilently returns undefined on provider error', async () => {
		mockedVscode.__setAuthenticationGetSession(async () => {
			throw new Error('network down');
		});

		const service = new AuthService();
		const session = await service.getSessionSilently();
		assert.strictEqual(session, undefined);
	});

	test('getSessionInteractively requests session with createIfNone=true', async () => {
		let observedCreateIfNone = false;
		const fakeSession = {
			accessToken: 'token',
			account: { id: '1', label: 'tester' },
			scopes: ['read:user', 'repo'],
			id: 'session-1',
		};
		mockedVscode.__setAuthenticationGetSession(async (_providerId, _scopes, options) => {
			observedCreateIfNone = options.createIfNone;
			return fakeSession;
		});

		const service = new AuthService();
		const session = await service.getSessionInteractively();
		assert.ok(session);
		assert.strictEqual(session?.accessToken, 'token');
		assert.strictEqual(observedCreateIfNone, true);
	});

	test('signOut invokes the VS Code account sign-out command with the active GitHub account', async () => {
		let observedArgs: unknown;
		const disposable = vscode.commands.registerCommand('_signOutOfAccount', async (args: unknown) => {
			observedArgs = args;
		});

		try {
			const service = new AuthService();
			await service.signOut('tester');
		} finally {
			disposable.dispose();
		}

		assert.deepStrictEqual(observedArgs, {
			providerId: 'github',
			accountLabel: 'tester',
		});
	});
});
