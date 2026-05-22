import * as assert from 'assert';
import { GitHubModuleService } from '../moduleManager/githubModuleService';

type FetchFn = typeof globalThis.fetch;

suite('GitHubModuleService Tests', () => {
	let originalFetch: FetchFn;

	function createHeaders(values: Record<string, string | undefined> = {}): Headers {
		return {
			get: (name: string) => values[name.toLowerCase()] ?? values[name] ?? null,
		} as Headers;
	}

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
			headers: createHeaders(),
		}) as Response) as FetchFn;

		const service = new GitHubModuleService();
		await assert.rejects(() => service.fetchModules(), /503/);
	});

	test('fetchModules searches public topic repos without authentication', async () => {
		const requests: Array<{ url: string; headers: Record<string, string> }> = [];
		globalThis.fetch = (async (input, init) => {
			requests.push({
				url: String(input),
				headers: (init?.headers ?? {}) as Record<string, string>,
			});
			return {
				ok: true,
				status: 200,
				headers: createHeaders({ etag: '"etag-public"' }),
				json: async () => ({
					items: [
						{
							id: 1,
							name: 'module-a',
							full_name: 'org/module-a',
							description: 'demo',
							private: false,
							default_branch: 'main',
							html_url: 'https://github.com/org/module-a',
							updated_at: '2026-05-21T00:00:00Z',
						},
					],
				}),
			} as Response;
		}) as FetchFn;

		const service = new GitHubModuleService();
		const result = await service.fetchModules();

		assert.strictEqual(requests.length, 1);
		assert.strictEqual(requests[0]?.url, 'https://api.github.com/search/repositories?per_page=100&q=topic%3Acsm-modsets');
		assert.strictEqual(requests[0]?.headers.Authorization, undefined);
		assert.strictEqual(result.etag, '"etag-public"');
		assert.strictEqual(result.modules.length, 1);
		assert.deepStrictEqual(result.modules[0]?.topics, ['csm-modsets']);
		assert.strictEqual(result.modules[0]?.visibility, 'public');
	});

	test('fetchModules uses authentication when available so private matches are included', async () => {
		let authorizationHeader: string | undefined;
		globalThis.fetch = (async (_input, init) => {
			authorizationHeader = ((init?.headers ?? {}) as Record<string, string>).Authorization;
			return {
				ok: true,
				status: 200,
				headers: createHeaders(),
				json: async () => ({
					items: [
						{
							id: 2,
							name: 'module-private',
							full_name: 'org/module-private',
							description: 'private demo',
							private: true,
							default_branch: 'main',
							html_url: 'https://github.com/org/module-private',
							updated_at: '2026-05-21T00:00:00Z',
							topics: ['csm-modsets', 'private-demo'],
						},
						{
							id: 1,
							name: 'module-public',
							full_name: 'org/module-public',
							description: 'public demo',
							private: false,
							default_branch: 'main',
							html_url: 'https://github.com/org/module-public',
							updated_at: '2026-05-21T00:00:00Z',
							topics: ['csm-modsets'],
						},
					],
				}),
			} as Response;
		}) as FetchFn;

		const service = new GitHubModuleService();
		const result = await service.fetchModules('token');

		assert.strictEqual(authorizationHeader, 'Bearer token');
		assert.deepStrictEqual(result.modules.map((module) => `${module.owner}/${module.name}:${module.visibility}`), [
			'org/module-private:private',
			'org/module-public:public',
		]);
	});

	test('fetchReadme returns empty string for 404', async () => {
		globalThis.fetch = (async () => ({
			ok: false,
			status: 404,
			headers: createHeaders(),
			text: async () => '',
		}) as Response) as FetchFn;

		const service = new GitHubModuleService();
		const readme = await service.fetchReadme('owner', 'repo', 'token');
		assert.strictEqual(readme, '');
	});
});
