import * as vscode from 'vscode';
import { GITHUB } from './constants';
import { Logger, getLogger } from './logger';

const GITHUB_PROVIDER_ID = GITHUB.providerId;
const REQUIRED_SCOPES = [...GITHUB.requiredScopes];
const VS_CODE_SIGN_OUT_COMMAND = '_signOutOfAccount';

export class AuthService {
	constructor(private readonly logger: Logger = getLogger()) {}

	public async getSessionSilently(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, REQUIRED_SCOPES, { createIfNone: false });
		} catch (error) {
			this.logger.warn(`Silent GitHub session lookup failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	public async getSessionInteractively(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, REQUIRED_SCOPES, { createIfNone: true });
		} catch (error) {
			this.logger.warn(`Interactive GitHub session lookup failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	public async signOut(accountLabel: string): Promise<void> {
		try {
			await vscode.commands.executeCommand(VS_CODE_SIGN_OUT_COMMAND, {
				providerId: GITHUB_PROVIDER_ID,
				accountLabel,
			});
		} catch (error) {
			this.logger.warn(`GitHub sign-out failed: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Verify the session has the required OAuth scopes by inspecting the
	 * `X-OAuth-Scopes` response header from the GitHub API. Returns the granted
	 * scopes, or `undefined` if the call could not be made.
	 */
	public async verifyScopes(token: string): Promise<string[] | undefined> {
		try {
			const response = await fetch(`${GITHUB.apiBase}/user`, {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'User-Agent': GITHUB.userAgent,
				},
			});
			if (!response.ok) {
				this.logger.warn(`Token scope verification responded with HTTP ${response.status}`);
				return undefined;
			}
			const header = response.headers.get('x-oauth-scopes') ?? '';
			const granted = header.split(',').map((scope) => scope.trim()).filter(Boolean);
			const missing = REQUIRED_SCOPES.filter((required) => !granted.some((scope) => scope === required || scope.startsWith(`${required}:`)));
			if (missing.length > 0) {
				this.logger.warn(`Token is missing required scopes: ${missing.join(', ')} (granted: ${granted.join(', ') || 'none'})`);
			}
			return granted;
		} catch (error) {
			this.logger.warn(`Token scope verification failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}
