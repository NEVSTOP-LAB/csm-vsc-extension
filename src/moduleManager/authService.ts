import * as vscode from 'vscode';

const GITHUB_PROVIDER_ID = 'github';
const REQUIRED_SCOPES = ['read:user', 'repo'];

export class AuthService {
	public async getSessionSilently(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, REQUIRED_SCOPES, { createIfNone: false });
		} catch {
			return undefined;
		}
	}

	public async getSessionInteractively(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, REQUIRED_SCOPES, { createIfNone: true });
		} catch {
			return undefined;
		}
	}
}
