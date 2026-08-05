import * as vscode from 'vscode';
import { GITHUB } from './constants';
import { Logger, getLogger } from './logger';

const GITHUB_PROVIDER_ID = GITHUB.providerId;
// 仅在 verifyScopes 中用于报告缺失的权限；getSession 不再强求这些 scope。
// 原因：请求的 scope 与 VS Code 现有会话不完全匹配时，每次 getSession 都会弹出
// 授权窗口，导致启动/操作时反复弹窗。改为复用 VS Code 现有的 GitHub 会话，
// 具体操作所需的权限由 verifyScopes 在登录后检查并提示（不弹授权窗）。
const REQUIRED_SCOPES = [...GITHUB.requiredScopes];
const VS_CODE_SIGN_OUT_COMMAND = '_signOutOfAccount';

export class AuthService {
	constructor(private readonly logger: Logger = getLogger()) { }

	public async getSessionSilently(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			// 空 scopes：复用现有 GitHub 会话，绝不触发授权/登录弹窗
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, [], { createIfNone: false });
		} catch (error) {
			this.logger.warn(`Silent GitHub session lookup failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	public async getSessionInteractively(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			// 空 scopes：复用现有会话；仅当完全没有 GitHub 会话时才弹出登录窗口
			return await vscode.authentication.getSession(GITHUB_PROVIDER_ID, [], { createIfNone: true });
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
