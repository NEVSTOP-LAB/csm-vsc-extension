import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import semver from 'semver';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const readmePath = path.join(root, 'README.md');
const changelogPath = path.join(root, 'CHANGELOG.md');

function quote(value) {
	return `"${String(value).replace(/"/g, '\\"')}"`;
}

function quoteForCmd(value) {
	return `"${String(value).replace(/"/g, '""')}"`;
}

function logPhase(title) {
	console.log(`\n[hook] === ${title} ===`);
}

function resolveCodeCommand() {
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

function resolveNpmRunner() {
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

const npmRunner = resolveNpmRunner();

function runFile(command, args) {
	const renderedArgs = args.map((arg) => quote(arg)).join(' ');
	console.log(`[hook] ${quote(command)} ${renderedArgs}`);
	if (process.platform === 'win32' && ['.cmd', '.bat'].includes(path.extname(command).toLowerCase())) {
		const cmdExe = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
		const commandLine = `"${[quoteForCmd(command), ...args.map((arg) => quoteForCmd(arg))].join(' ')}"`;
		execFileSync(cmdExe, ['/d', '/s', '/c', commandLine], { stdio: 'inherit', cwd: root });
		return;
	}
	execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

function runNpm(args) {
	runFile(npmRunner.command, [...npmRunner.baseArgs, ...args]);
}

function runNpmScript(scriptName) {
	runNpm(['run', scriptName]);
}

function escapePowerShellLiteral(value) {
	return String(value).replace(/'/g, "''");
}

function runVsCodeInstall(command, args) {
	if (process.platform !== 'win32') {
		runFile(command, args);
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
	runFile(powerShellExe, ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function getDefaultChangelogSection() {
	return [
		'### 变更',
		'',
		'- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力',
		'- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装',
	].join('\n');
}

function updateVersionAndDocs() {
	const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const nextVersion = semver.inc(pkg.version, 'patch');
	if (!nextVersion) {
		throw new Error(`Cannot bump version from ${pkg.version}`);
	}
	pkg.version = nextVersion;
	fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

	const readme = fs.readFileSync(readmePath, 'utf8');
	const versionLine = `- 当前开发版本：${nextVersion}`;
	if (readme.includes('- 当前开发版本：')) {
		fs.writeFileSync(readmePath, readme.replace(/- 当前开发版本：.*/u, versionLine), 'utf8');
	} else {
		const marker = '## 安装要求';
		if (!readme.includes(marker)) {
			throw new Error('README marker not found for version insertion');
		}
		fs.writeFileSync(readmePath, readme.replace(marker, `${versionLine}\n\n${marker}`), 'utf8');
	}

	const changelog = fs.readFileSync(changelogPath, 'utf8');
	const today = new Date().toISOString().slice(0, 10);
	const heading = `## [${nextVersion}] - ${today}`;
	if (!changelog.includes(heading)) {
		const unreleasedMarker = '## [未发布] / [Unreleased]';
		const unreleasedPattern = /## \[未发布\] \/ \[Unreleased\]\r?\n([\s\S]*?)(?=\r?\n## \[|$)/;
		const unreleasedMatch = changelog.match(unreleasedPattern);
		if (!changelog.includes(unreleasedMarker) || !unreleasedMatch) {
			throw new Error('CHANGELOG unreleased marker not found');
		}
		const unreleasedBody = unreleasedMatch[1]?.trim();
		const sectionBody = unreleasedBody || getDefaultChangelogSection();
		const section = `${heading}\n\n${sectionBody}\n`;
		fs.writeFileSync(
			changelogPath,
			changelog.replace(unreleasedPattern, `${unreleasedMarker}\n\n${section}\n`),
			'utf8',
		);
	}

	return nextVersion;
}

function installVsix(version) {
	const vsixFile = `csm-vsc-support-${version}.vsix`;
	const vsixPath = path.join(root, vsixFile);
	const extensionsDir = process.env.VSCODE_EXTENSIONS_DIR || path.join(os.homedir(), '.vscode', 'extensions');
	const codeCommand = resolveCodeCommand();
	const nodeCommand = process.execPath;

	logPhase('VSIX Packaging');
	runNpm(['exec', '--yes', '--package', '@vscode/vsce@3.7.1', '--', 'vsce', 'package', '--no-dependencies']);

	console.log(`[hook] VS Code CLI: ${codeCommand}`);
	console.log(`[hook] Extensions dir: ${extensionsDir}`);
	try {
		runVsCodeInstall(codeCommand, ['--extensions-dir', extensionsDir, '--install-extension', vsixPath, '--force']);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to install ${vsixFile}. Packaged VSIX remains at ${vsixPath}. Set VSCODE_CLI if VS Code CLI cannot be resolved. ${message}`);
	}

	logPhase('VSIX Verification');
	try {
		runFile(nodeCommand, ['scripts/verify-local-install.mjs', '--extensions-dir', extensionsDir, '--version', version]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Installed VSIX verification failed for ${vsixFile} in ${extensionsDir}. ${message}`);
	}
}

function main() {
	const skipVsix = process.argv.includes('--skip-vsix');
	const forceVsix = process.argv.includes('--force-vsix');
	const needsVsix = !skipVsix;
	if (forceVsix) {
		console.log('[hook] --force-vsix is now redundant; VSIX build/install runs by default.');
	}
	console.log(`[hook] npm runner: ${npmRunner.command}`);
	if (needsVsix) {
		console.log('[hook] VSIX build/install is enabled for this run.');
	} else {
		console.log('[hook] VSIX build/install skipped (--skip-vsix).');
	}

	logPhase('Version & Docs');
	const version = updateVersionAndDocs();
	logPhase('Type Check');
	runNpmScript('check-types');
	logPhase('Lint');
	runNpmScript('lint');
	logPhase('Compile');
	runNpmScript('compile');
	if (needsVsix) {
		installVsix(version);
	}
	logPhase('Test Compile');
	runNpmScript('compile-tests');
	try {
		logPhase('Test');
		runNpmScript('test');
	} catch {
		console.warn('[hook] npm test failed. Continuing to VSIX packaging for local verification.');
	}
	console.log(`[hook] Completed local finish hook with version ${version}`);
}

main();
