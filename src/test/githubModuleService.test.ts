import * as assert from 'assert';
import { GitHubModuleService } from '../moduleManager/githubModuleService';

type FetchFn = typeof globalThis.fetch;

suite('GitHubModuleService Tests', () => {
	let originalFetch: FetchFn;

	setup(() => {
		originalFetch = globalThis.fetch;
	});

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('fetchModules throws on non-OK response', async () => {
		globalThis.fetch = (async () => ({
			ok: false,
			status: 503,
		}) as Response) as FetchFn;

		const service = new GitHubModuleService();
		await assert.rejects(() => service.fetchModules('token'), /503/);
	});

	test('fetchReadme returns empty string for 404', async () => {
		globalThis.fetch = (async () => ({
			ok: false,
			status: 404,
			text: async () => '',
		}) as Response) as FetchFn;

		const service = new GitHubModuleService();
		const readme = await service.fetchReadme('owner', 'repo', 'token');
		assert.strictEqual(readme, '');
	});
});
