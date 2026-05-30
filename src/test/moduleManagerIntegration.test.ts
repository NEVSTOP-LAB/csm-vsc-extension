/**
 * Integration tests for the moduleManager package (review item 6.3).
 *
 * These tests run inside a real VS Code instance via the @vscode/test-cli
 * runner (`npm run test`) and verify that command registration happens at
 * activation time. They are a starting point for end-to-end coverage and
 * complement the standalone Mocha unit tests in this folder.
 *
 * NOTE: These tests intentionally avoid the local `setup.ts` shim — when
 * running under @vscode/test-cli the real `vscode` module is provided by
 * the host process, so we must not stub it out.
 */
import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'mocha';
import { WorkspaceModuleService } from '../moduleManager';

// Lazy-require so this file is a no-op when executed without a real VS Code host
// (e.g. by the standalone setup-shimmed mocha runner).
function getRealVscode(): typeof import('vscode') | undefined {
	try {
		const mod = require('vscode');
		// The shim used by setup.ts re-exports objects but typically lacks
		// `commands.getCommands` returning a real Promise<string[]>.
		if (mod && mod.commands && typeof mod.commands.getCommands === 'function') {
			return mod;
		}
	} catch {
		// running outside VS Code — skip
	}
	return undefined;
}

function resolveGitBinary(): string {
	const configuredGit = path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'cmd', 'git.exe');
	return fs.existsSync(configuredGit) ? configuredGit : 'git';
}

function runGit(cwd: string, args: string[]): string {
	return execFileSync(resolveGitBinary(), args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

async function makeTreeWritable(targetPath: string): Promise<void> {
	let stat;
	try {
		stat = await fsPromises.lstat(targetPath);
	} catch {
		return;
	}

	if (stat.isSymbolicLink()) {
		return;
	}

	if (stat.isDirectory()) {
		const entries = await fsPromises.readdir(targetPath, { withFileTypes: true });
		for (const entry of entries) {
			await makeTreeWritable(path.join(targetPath, entry.name));
		}
	}

	await fsPromises.chmod(targetPath, stat.isDirectory() ? 0o700 : 0o600).catch(() => undefined);
}

async function removeWritableTree(targetPath: string): Promise<void> {
	await makeTreeWritable(targetPath);
	await fsPromises.rm(targetPath, { recursive: true, force: true });
}

async function activateDevelopmentExtension(vscode: typeof import('vscode')): Promise<void> {
	const pkgPath = path.resolve(__dirname, '../../package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { publisher?: string; name?: string };
	const extensionId = `${String(pkg.publisher ?? '').toLowerCase()}.${String(pkg.name ?? '').toLowerCase()}`;
	const extension = vscode.extensions.getExtension(extensionId);
	assert.ok(extension, `expected development extension "${extensionId}" to be discoverable`);
	await extension?.activate();
}

suite('Module Manager Integration Tests', () => {
	test('module manager commands are registered with the VS Code command registry', async function () {
		const vscode = getRealVscode();
		if (!vscode) {
			this.skip();
			return;
		}
		await activateDevelopmentExtension(vscode);

		const allCommands = await vscode.commands.getCommands(true);
		const expected = [
			'csmModules.login',
			'csmModules.logout',
			'csmModules.refresh',
			'csmModules.initializeWorkspace',
			'csmModules.openReadme',
			'csmModules.applyToWorkspace',
			'csmModules.removeModule',
			'csmModules.updateModule',
			'csmModules.contextApplyModule',
			'csmModules.contextOpenReadme',
			'csmModules.contextRemoveModule',
			'csmModules.contextUpdateModule',
			'csmModules.contextSelectModule',
			'csmModules.contextClearModuleSelection',
			'csmModules.setSortOrder',
		];
		for (const command of expected) {
			assert.ok(allCommands.includes(command), `expected command "${command}" to be registered`);
		}
	});

	test('copied nested git repositories are adopted into real submodules in a real VS Code host', async function () {
		this.timeout(30000);
		const vscode = getRealVscode();
		if (!vscode) {
			this.skip();
			return;
		}
		await activateDevelopmentExtension(vscode);

		const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'csm-host-smoke-nested-submodule-'));
		const moduleRepo = path.join(tempRoot, 'module-repo');
		const workspaceRepo = path.join(tempRoot, 'workspace-repo');
		const service = new WorkspaceModuleService();
		try {
			await fsPromises.mkdir(moduleRepo, { recursive: true });
			runGit(moduleRepo, ['init', '--initial-branch=main']);
			runGit(moduleRepo, ['config', 'user.name', 'Test User']);
			runGit(moduleRepo, ['config', 'user.email', 'test@example.com']);
			await fsPromises.writeFile(path.join(moduleRepo, 'README.md'), '# host smoke\n', 'utf8');
			runGit(moduleRepo, ['add', 'README.md']);
			runGit(moduleRepo, ['commit', '-m', 'init module']);
			runGit(moduleRepo, ['remote', 'add', 'origin', moduleRepo]);
			const nestedRef = runGit(moduleRepo, ['rev-parse', 'HEAD']);

			await fsPromises.mkdir(path.join(workspaceRepo, 'csm'), { recursive: true });
			runGit(workspaceRepo, ['init', '--initial-branch=main']);
			runGit(workspaceRepo, ['config', 'user.name', 'Test User']);
			runGit(workspaceRepo, ['config', 'user.email', 'test@example.com']);
			await fsPromises.cp(moduleRepo, path.join(workspaceRepo, 'csm', 'host-smoke-module'), { recursive: true });

			const config = await service.recoverConfigFromExistingSubmodules(workspaceRepo);
			assert.ok(config, 'expected recoverConfigFromExistingSubmodules to create a config');
			const entry = config?.modules['local__host-smoke-module'];
			assert.ok(entry, 'expected nested repo entry to be recovered');
			assert.strictEqual(entry?.method, 'submodule');
			assert.strictEqual(entry?.path, 'csm/host-smoke-module');
			assert.strictEqual(entry?.source, moduleRepo);
			assert.strictEqual(entry?.ref, nestedRef);
			assert.strictEqual(entry?.branch, 'main');

			const gitmodulesText = await fsPromises.readFile(path.join(workspaceRepo, '.gitmodules'), 'utf8');
			assert.ok(gitmodulesText.includes('csm/host-smoke-module'));
			const submoduleStatus = runGit(workspaceRepo, ['submodule', 'status', '--', 'csm/host-smoke-module']);
			assert.ok(submoduleStatus.includes('csm/host-smoke-module'));
			assert.ok(submoduleStatus.includes(nestedRef.slice(0, 7)) || submoduleStatus.includes(nestedRef));
		} finally {
			await removeWritableTree(tempRoot);
		}
	});
});
