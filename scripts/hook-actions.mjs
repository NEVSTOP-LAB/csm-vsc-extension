/**
 * hook-actions.mjs
 * 从 local-finish-hook.mjs 提取的共享函数，供 copilot-stop-hook.mjs 和 local-finish-hook.mjs 共用。
 * 所有函数通过 cwd 参数接收工作目录，避免依赖模块级全局变量。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

// ---- 工具函数 ----

function quote(value) {
	return `"${String(value).replace(/"/g, '\\"')}"`;
}

function escapePowerShellLiteral(value) {
	return String(value).replace(/'/g, "''");
}

export function logPhase(title) {
	console.log(`\n[hook] === ${title} ===`);
}

// ---- VS Code CLI ----

export function resolveCodeCommand() {
	if (process.env.VSCODE_CLI) {
		return process.env.VSCODE_CLI;
	}
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		const vscodeRoot = path.join(localAppData, 'Programs', 'Microsoft VS Code');
		const codeCli = path.join(vscodeRoot, 'bin', 'code.cmd');
		if (fs.existsSync(codeCli)) {
			return codeCli;
		}
		const codeExe = path.join(vscodeRoot, 'Code.exe');
		if (fs.existsSync(codeExe)) {
			return codeExe;
		}
	}
	return 'code';
}

// ---- npm Runner ----

function resolveNpmRunnerOnce() {
	const npmExecPath = process.env.npm_execpath;
	if (npmExecPath) {
		if (path.extname(npmExecPath).toLowerCase() === '.js') {
			return {
				command: process.execPath,
				baseArgs: [npmExecPath],
			};
		}
		return {
			command: npmExecPath,
			baseArgs: [],
		};
	}

	if (process.platform === 'win32') {
		const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
		const npmCmd = path.join(programFiles, 'nodejs', 'npm.cmd');
		if (fs.existsSync(npmCmd)) {
			return {
				command: npmCmd,
				baseArgs: [],
			};
		}
	}

	return {
		command: 'npm',
		baseArgs: [],
	};
}

let _npmRunner;

function getNpmRunner() {
	if (!_npmRunner) {
		_npmRunner = resolveNpmRunnerOnce();
	}
	return _npmRunner;
}

// ---- 命令执行 ----

export function runFile(command, args, cwd) {
	const renderedArgs = args.map((arg) => quote(arg)).join(' ');
	console.log(`[hook] ${quote(command)} ${renderedArgs}`);
	if (process.platform === 'win32' && ['.cmd', '.bat'].includes(path.extname(command).toLowerCase())) {
		const powerShellExe = path.join(
			process.env.SystemRoot ?? 'C:\\Windows',
			'System32',
			'WindowsPowerShell',
			'v1.0',
			'powershell.exe',
		);
		const argumentList = args.map((arg) => `'${escapePowerShellLiteral(arg)}'`).join(', ');
		const script = `& '${escapePowerShellLiteral(command)}' @(${argumentList})`;
		execFileSync(powerShellExe, ['-NoProfile', '-NonInteractive', '-Command', script], {
			stdio: 'inherit',
			cwd,
		});
		return;
	}
	execFileSync(command, args, { stdio: 'inherit', cwd });
}

export function runNpm(args, cwd) {
	const runner = getNpmRunner();
	runFile(runner.command, [...runner.baseArgs, ...args], cwd);
}

export function runNpmScript(scriptName, cwd) {
	runNpm(['run', scriptName], cwd);
}

function runVsCodeInstall(command, args, cwd) {
	if (process.platform !== 'win32') {
		runFile(command, args, cwd);
		return;
	}

	const powerShellExe = path.join(
		process.env.SystemRoot ?? 'C:\\Windows',
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe',
	);
	const argumentList = args.map((arg) => `'${escapePowerShellLiteral(arg)}'`).join(', ');
	const script = `Start-Process -FilePath '${escapePowerShellLiteral(command)}' -ArgumentList @(${argumentList}) -NoNewWindow -Wait`;
	runFile(powerShellExe, ['-NoProfile', '-NonInteractive', '-Command', script], cwd);
}

// ---- 版本 ----

export function getCurrentVersion(cwd) {
	const packageJsonPath = path.join(cwd, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	if (typeof pkg.version !== 'string' || !pkg.version.trim()) {
		throw new Error('package.json version is missing');
	}
	return pkg.version.trim();
}

// ---- 构建与打包 ----

/**
 * 仅编译（不 bump 版本、不运行测试）。
 * 用于 Stop hook 的快速验证场景。
 */
export function compileOnly(cwd) {
	const runner = getNpmRunner();
	console.log(`[hook] npm runner: ${runner.command}`);
	logPhase('Compile');
	runNpmScript('compile', cwd);
}

/**
 * VSIX 打包 + 安装 + 验证。
 * 用于 Stop hook 和 local-finish-hook 共用。
 */
export function installVsix(version, cwd) {
	const vsixFile = `csm-vsc-support-${version}.vsix`;
	const vsixDir = path.join(cwd, 'tmp');
	fs.mkdirSync(vsixDir, { recursive: true });
	const vsixPath = path.join(vsixDir, vsixFile);
	const extensionsDir = process.env.VSCODE_EXTENSIONS_DIR || path.join(os.homedir(), '.vscode', 'extensions');
	const codeCommand = resolveCodeCommand();
	const nodeCommand = process.execPath;

	logPhase('VSIX Packaging');
	runNpm(['exec', '--yes', '--package', '@vscode/vsce@3.7.1', '--', 'vsce', 'package', '--no-dependencies', '-o', vsixPath], cwd);

	console.log(`[hook] VS Code CLI: ${codeCommand}`);
	console.log(`[hook] Extensions dir: ${extensionsDir}`);
	try {
		runVsCodeInstall(codeCommand, ['--extensions-dir', extensionsDir, '--install-extension', vsixPath, '--force'], cwd);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to install ${vsixFile}. Packaged VSIX remains at ${vsixPath}. Set VSCODE_CLI if VS Code CLI cannot be resolved. ${message}`);
	}

	logPhase('VSIX Verification');
	try {
		runFile(nodeCommand, ['scripts/verify-local-install.mjs', '--extensions-dir', extensionsDir, '--version', version], cwd);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Installed VSIX verification failed for ${vsixFile} in ${extensionsDir}. ${message}`);
	}
}
