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
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';

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

suite('Module Manager Integration Tests', () => {
	test('module manager commands are registered with the VS Code command registry', async function () {
		const vscode = getRealVscode();
		if (!vscode) {
			this.skip();
			return;
		}
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { publisher?: string; name?: string };
		const extensionId = `${String(pkg.publisher ?? '').toLowerCase()}.${String(pkg.name ?? '').toLowerCase()}`;
		const extension = vscode.extensions.getExtension(extensionId);
		assert.ok(extension, `expected development extension "${extensionId}" to be discoverable`);
		await extension?.activate();

		const allCommands = await vscode.commands.getCommands(true);
		const expected = [
			'csmModules.login',
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
});
