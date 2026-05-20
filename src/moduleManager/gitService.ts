import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Logger, getLogger } from './logger';

const execFileAsync = promisify(execFile);

function formatCommandError(error: unknown): string {
	if (error && typeof error === 'object') {
		const stderr = 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '').trim() : '';
		const message = 'message' in error ? String((error as { message?: unknown }).message ?? '').trim() : '';
		return stderr || message || 'Unknown command failure.';
	}
	return 'Unknown command failure.';
}

export interface GitExecOptions {
	cwd: string;
	args: string[];
	authToken?: string;
	repoUrl?: string;
}

/**
 * Thin wrapper around the system `git` CLI.
 *
 * Encapsulates:
 *   - Resolving the configured `git.path` from VS Code settings (with PATH fallback).
 *   - Passing OAuth tokens via `GIT_ASKPASS` instead of `-c http.extraheader=...`,
 *     keeping the secret out of the process command line (review item 4.1).
 *   - Producing consistent error messages so callers can surface them to users.
 *
 * The class is intentionally small and side-effect free so it can be mocked in tests
 * (see `IGitRunner` below) — replacing the systemic dependency on `child_process` in
 * `WorkspaceModuleService` (review item 2.3).
 */
export interface IGitRunner {
	exec(options: GitExecOptions): Promise<string>;
	isAvailable(): Promise<boolean>;
}

export class GitService implements IGitRunner {
	private askpassScriptPath: string | undefined;

	constructor(private readonly logger: Logger = getLogger()) {}

	public async isAvailable(): Promise<boolean> {
		try {
			await execFileAsync(this.resolveGitBinary(), ['--version']);
			return true;
		} catch (error) {
			this.logger.warn(`Git binary check failed: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	public async exec(options: GitExecOptions): Promise<string> {
		const { cwd, args, authToken, repoUrl } = options;
		const env = { ...process.env };
		const cleanupTasks: Array<() => Promise<void>> = [];

		if (authToken && this.usesHttpsRemote(repoUrl)) {
			const askpass = await this.ensureAskpassScript();
			env.GIT_ASKPASS = askpass;
			env.GIT_TERMINAL_PROMPT = '0';
			// The askpass script reads the token from a per-invocation env var so the
			// secret never appears in argv or in any persistent file.
			env.CSM_GIT_TOKEN = authToken;
			env.CSM_GIT_USERNAME = 'x-access-token';
		}

		try {
			const { stdout } = await execFileAsync(this.resolveGitBinary(), args, {
				cwd,
				encoding: 'utf8',
				env,
			});
			return stdout.trim();
		} catch (error) {
			throw new Error(formatCommandError(error));
		} finally {
			for (const task of cleanupTasks) {
				try {
					await task();
				} catch {
					// best effort
				}
			}
		}
	}

	private resolveGitBinary(): string {
		try {
			const configured = vscode.workspace.getConfiguration('git').get<string | string[]>('path');
			if (typeof configured === 'string' && configured) {
				return configured;
			}
			if (Array.isArray(configured) && configured.length > 0 && configured[0]) {
				return configured[0];
			}
		} catch {
			// VS Code workspace API may be unavailable in some contexts (e.g. tests)
		}
		return 'git';
	}

	private usesHttpsRemote(repoUrl: string | undefined): boolean {
		if (!repoUrl) {
			return false;
		}
		try {
			return new URL(repoUrl).protocol === 'https:';
		} catch {
			return false;
		}
	}

	private async ensureAskpassScript(): Promise<string> {
		if (this.askpassScriptPath) {
			return this.askpassScriptPath;
		}
		const isWindows = process.platform === 'win32';
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csm-git-askpass-'));
		const scriptPath = path.join(dir, isWindows ? 'askpass.cmd' : 'askpass.sh');
		const scriptBody = isWindows
			? '@echo off\r\nif /I "%~1"=="Username for *" (echo %CSM_GIT_USERNAME%) else (echo %CSM_GIT_TOKEN%)\r\n'
			: '#!/usr/bin/env sh\ncase "$1" in\n  Username*) printf %s "$CSM_GIT_USERNAME" ;;\n  *) printf %s "$CSM_GIT_TOKEN" ;;\nesac\n';
		await fs.writeFile(scriptPath, scriptBody, { encoding: 'utf8', mode: 0o700 });
		if (!isWindows) {
			await fs.chmod(scriptPath, 0o700);
		}
		this.askpassScriptPath = scriptPath;
		return scriptPath;
	}
}
