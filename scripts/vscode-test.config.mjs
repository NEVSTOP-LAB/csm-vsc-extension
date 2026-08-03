import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// Only run tests that require a real VS Code host.
	// Mock-dependent unit tests (moduleManagerController, moduleManager,
	// authService, moduleManagerBoundary, githubModuleService, hoverData, etc.)
	// are run as standalone Mocha tests in the "grammar-tests" CI step.
	// 配置文件位于 scripts/，files 与 extensionDevelopmentPath 均相对配置目录解析，
	// 因此使用 .. 指回项目根目录。
	files: [
		'../out/test/extension.test.js',
		'../out/test/moduleManagerIntegration.test.js',
		'../out/test/logFold/normalizer.test.js',
		'../out/test/logFold/detector.test.js',
		'../out/test/logFold/foldingProvider.test.js',
		'../out/test/logFold/performance.test.js',
	],
	extensionDevelopmentPath: ['..'],
});
