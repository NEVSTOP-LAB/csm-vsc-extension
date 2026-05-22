import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// Only run tests that require a real VS Code host.
	// Mock-dependent unit tests (moduleManagerController, moduleManager,
	// authService, moduleManagerBoundary, githubModuleService, hoverData, etc.)
	// are run as standalone Mocha tests in the "grammar-tests" CI step.
	files: [
		'out/test/extension.test.js',
		'out/test/moduleManagerIntegration.test.js',
	],
});
