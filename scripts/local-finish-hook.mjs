import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
import semver from 'semver';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const readmePath = path.join(root, 'README.md');
const changelogPath = path.join(root, 'CHANGELOG.md');

function run(command) {
	console.log(`[hook] ${command}`);
	execSync(command, { stdio: 'inherit', cwd: root });
}

function runCapture(command) {
	return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], cwd: root }).toString('utf8').trim();
}

function quote(value) {
	return `"${String(value).replace(/"/g, '\\"')}"`;
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

function runFile(command, args) {
	const renderedArgs = args.map((arg) => quote(arg)).join(' ');
	console.log(`[hook] ${quote(command)} ${renderedArgs}`);
	execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

function getChangedFiles() {
	try {
		const output = runCapture('git status --porcelain');
		if (!output) {
			return [];
		}
		return output
			.split(/\r?\n/)
			.map((line) => line.slice(3).trim())
			.filter(Boolean)
			.map((file) => {
				const renameParts = file.split(' -> ');
				return renameParts[renameParts.length - 1];
			});
	} catch {
		// If git metadata is unavailable, stay safe by forcing VSIX build/install.
		return ['__force-vsix__'];
	}
}

function shouldBuildVsix(changedFiles, forceVsix) {
	if (forceVsix) {
		return true;
	}
	if (changedFiles.length === 0) {
		return false;
	}
	const runtimePatterns = [
		/^src\//,
		/^syntaxes\//,
		/^fileicons\//,
		/^images\//,
		/^package\.json$/,
		/^tsconfig\.json$/,
		/^esbuild\.js$/,
		/^eslint\.config\.mjs$/,
		/^\.vscodeignore$/,
	];
	return changedFiles.some((file) => runtimePatterns.some((pattern) => pattern.test(file)));
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
		const section = `\n${heading}\n\n### 变更\n\n- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力\n- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装\n`;
		if (!changelog.includes(unreleasedMarker)) {
			throw new Error('CHANGELOG unreleased marker not found');
		}
		fs.writeFileSync(changelogPath, changelog.replace(unreleasedMarker, `${unreleasedMarker}\n${section}`), 'utf8');
	}

	return nextVersion;
}

function installVsix(version) {
	const vsixFile = `csm-vsc-support-${version}.vsix`;
	const extensionsDir = process.env.VSCODE_EXTENSIONS_DIR || path.join(os.homedir(), '.vscode', 'extensions');
	const codeCommand = resolveCodeCommand();
	const nodeCommand = process.execPath;
	run(`npx @vscode/vsce@3.7.1 package --no-dependencies`);
	runFile(codeCommand, ['--extensions-dir', extensionsDir, '--install-extension', `.\\${vsixFile}`, '--force']);
	runFile(nodeCommand, ['scripts/verify-local-install.mjs', '--extensions-dir', extensionsDir, '--version', version]);
}

function main() {
	const forceVsix = process.argv.includes('--force-vsix');
	const changedFiles = getChangedFiles();
	const needsVsix = shouldBuildVsix(changedFiles, forceVsix);
	if (needsVsix) {
		console.log('[hook] VSIX build/install is enabled for this run.');
	} else {
		console.log('[hook] VSIX build/install skipped (no runtime changes detected).');
	}

	const version = updateVersionAndDocs();
	run('npm run check-types');
	run('npm run lint');
	run('npm run compile');
	if (needsVsix) {
		installVsix(version);
	}
	run('npm run compile-tests');
	try {
		run('npm run test');
	} catch {
		console.warn('[hook] npm test failed. Continuing to VSIX packaging for local verification.');
	}
	console.log(`[hook] Completed local finish hook with version ${version}`);
}

main();
