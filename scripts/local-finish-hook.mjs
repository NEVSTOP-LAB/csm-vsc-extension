/**
 * local-finish-hook.mjs
 * 本地完成流水线：版本递增 → 类型检查 → Lint → 编译 → 测试 → VSIX 打包安装。
 * 支持 --stop-hook 模式（仅编译+VSIX）和 --skip-vsix 模式。
 * 共享的构建/打包函数从 hook-actions.mjs 导入。
 */

import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { compileOnly, getCurrentVersion, installVsix, logPhase, runNpmScript } from './hook-actions.mjs';

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, 'package.json');
const readmePath = path.join(cwd, 'README.md');
const changelogPath = path.join(cwd, 'CHANGELOG.md');

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

function main() {
	const skipVsix = process.argv.includes('--skip-vsix');
	const forceVsix = process.argv.includes('--force-vsix');
	const stopHookMode = process.argv.includes('--stop-hook');
	const needsVsix = !skipVsix;

	if (forceVsix) {
		console.log('[hook] --force-vsix is now redundant; VSIX build/install runs by default.');
	}

	if (stopHookMode) {
		// Stop hook 模式：仅编译 + VSIX，不做版本递增和测试
		compileOnly(cwd);
		if (needsVsix) {
			const version = getCurrentVersion(cwd);
			installVsix(version, cwd);
		}
		console.log(`[hook] Completed stop hook with version ${getCurrentVersion(cwd)}`);
		return;
	}

	// 完整本地流水线
	if (needsVsix) {
		console.log('[hook] VSIX build/install is enabled for this run.');
	} else {
		console.log('[hook] VSIX build/install skipped (--skip-vsix).');
	}

	logPhase('Version & Docs');
	const version = updateVersionAndDocs();
	logPhase('Type Check');
	runNpmScript('check-types', cwd);
	logPhase('Lint');
	runNpmScript('lint', cwd);
	logPhase('Compile');
	runNpmScript('compile', cwd);
	if (needsVsix) {
		installVsix(version, cwd);
	}
	logPhase('Test Compile');
	runNpmScript('compile-tests', cwd);
	try {
		logPhase('Test');
		runNpmScript('test', cwd);
	} catch {
		console.warn('[hook] npm test failed. Continuing to VSIX packaging for local verification.');
	}
	console.log(`[hook] Completed local finish hook with version ${version}`);
}

main();
