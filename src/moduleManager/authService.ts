import * as vscode from 'vscode';
import { GITHUB } from './constants';

const GITHUB_PROVIDER_ID = GITHUB.providerId;
const REQUIRED_SCOPES = [...GITHUB.requiredScopes];

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
