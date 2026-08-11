import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import { getTempRoot } from '../common/tempPaths';
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
	private failAskpassScriptPath: string | undefined;

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
		const { cwd } = options;
		const env = await this.buildEnv(options);
		const args = await this.getEffectiveArgs(options, options.args);

		try {
			const { stdout } = await execFileAsync(this.resolveGitBinary(), args, {
				cwd,
				encoding: 'utf8',
				env,
			});
			return stdout.trim();
		} catch (error) {
			throw new Error(formatCommandError(error));
		}
	}

	/**
	 * 构造 git 进程的实际命令行参数：注入扩展 token 时，在参数最前追加
	 * `-c credential.helper=`（空值）以清空所有来源（系统/全局/本地）的
	 * credential helper（如 Git Credential Manager）。
	 *
	 * 原因（review 建议）：git 会先查询 credential.helper，若 GCM 等静默返回
	 * 了另一账号的缓存凭据，`GIT_ASKPASS` 根本不会执行——导致操作误用旧账号
	 * 或因权限不匹配失败。实验验证：`-c credential.helper=` 空值能让 git 不再
	 * 执行任何 helper（trace 确认），而 `GIT_CONFIG_COUNT` 环境变量注入空值
	 * 会报 `missing config value`，因此只能通过命令行参数清空。
	 */
	public async getEffectiveArgs(options: { authToken?: string; repoUrl?: string }, args: string[]): Promise<string[]> {
		if (options.authToken && this.usesHttpsRemote(options.repoUrl)) {
			return ['-c', 'credential.helper=', ...args];
		}
		return args;
	}

	/**
	 * 构造 git 进程的环境变量：复用已登录账号的权限、绝不弹授权窗。
	 *
	 * - GIT_TERMINAL_PROMPT=0：git 永不进入交互式凭据提示（terminal prompt）。
	 * - GCM_INTERACTIVE=never：禁止 Git Credential Manager 弹出 GUI/浏览器授权窗。
	 *   已存储的凭据仍会被静默复用（不弹窗）；缺少凭据时 git 直接失败，
	 *   由调用方把错误转成提示，而不是弹出 GitHub 权限验证窗口。
	 * - 携带 token 且为 https 远程时：GIT_ASKPASS 指向扩展自己的 token askpass
	 *   （secret 不出现于命令行，也不写入任何持久化文件）。
	 * - 其余情况：GIT_ASKPASS 覆盖为扩展自己的“非交互式失败 askpass”。
	 *   绝不保留继承的 GIT_ASKPASS（如 VS Code git 集成注入的 askpass，
	 *   凭据缺失时会通过 IPC 触发 VS Code 登录/凭据 UI——即弹窗源）。
	 *   已配置的 credential helper（如 GCM 缓存）仍会先被静默查询、有缓存即复用。
	 *
	 * 独立成方法以便单元测试直接断言环境（避免在 Windows 上启动假 git 子进程）。
	 */
	public async buildEnv(options: { authToken?: string; repoUrl?: string }): Promise<NodeJS.ProcessEnv> {
		const { authToken, repoUrl } = options;
		const env = { ...process.env };
		env.GIT_TERMINAL_PROMPT = '0';
		env.GCM_INTERACTIVE = 'never';

		if (authToken && this.usesHttpsRemote(repoUrl)) {
			const askpass = await this.ensureAskpassScript();
			env.GIT_ASKPASS = askpass;
			// The askpass script reads the token from a per-invocation env var so the
			// secret never appears in argv or in any persistent file.
			env.CSM_GIT_TOKEN = authToken;
			env.CSM_GIT_USERNAME = 'x-access-token';
		} else {
			env.GIT_ASKPASS = await this.ensureFailAskpassScript();
		}

		return env;
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
		const dir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-git-askpass-'));
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

	/**
	 * 非交互式失败 askpass：不注入 token 时用它覆盖继承的 `GIT_ASKPASS`。
	 *
	 * 继承的 askpass（如 VS Code git 集成注入的脚本）在凭据缺失时可能触发
	 * VS Code 登录/凭据 UI（即“GitHub 权限验证窗口”）。用本脚本覆盖后，git
	 * 调用 askpass 会立即以非零退出，凭据获取失败并转成普通错误提示——绝不弹窗。
	 */
	private async ensureFailAskpassScript(): Promise<string> {
		if (this.failAskpassScriptPath) {
			return this.failAskpassScriptPath;
		}
		const isWindows = process.platform === 'win32';
		const dir = await fs.mkdtemp(path.join(getTempRoot(), 'csm-git-failaskpass-'));
		const scriptPath = path.join(dir, isWindows ? 'fail-askpass.cmd' : 'fail-askpass.sh');
		const scriptBody = isWindows
			? '@echo off\r\nexit /b 1\r\n'
			: '#!/usr/bin/env sh\nexit 1\n';
		await fs.writeFile(scriptPath, scriptBody, { encoding: 'utf8', mode: 0o700 });
		if (!isWindows) {
			await fs.chmod(scriptPath, 0o700);
		}
		this.failAskpassScriptPath = scriptPath;
		return scriptPath;
	}
}
