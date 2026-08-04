import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getTempRoot } from '../../common/tempPaths';
import { ModuleVersionService, ModuleVersionGitHubService } from '../../modules/versionService';

function runGit(cwd: string, args: string[]): string {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

async function removeTree(targetPath: string): Promise<void> {
	await fs.rm(targetPath, { recursive: true, force: true });
}

/** GitHub API 全部抛错，强制走 git CLI 兜底 */
function createFailingGithubService(): ModuleVersionGitHubService {
	return {
		fetchCommits: async () => {
			throw new Error('api down');
		},
		fetchTags: async () => {
			throw new Error('api down');
		},
		fetchReleases: async () => {
			throw new Error('api down');
		},
		fetchBranches: async () => {
			throw new Error('api down');
		},
		fetchCommit: async () => {
			throw new Error('api down');
		},
	};
}

suite('ModuleVersionService Tests', () => {
	test('listBranches falls back to git ls-remote --heads when API fails', async () => {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-version-branches-'));
		const repoPath = path.join(tempRoot, 'repo');
		try {
			await fs.mkdir(repoPath, { recursive: true });
			runGit(repoPath, ['init', '--initial-branch=main', '-q']);
			runGit(repoPath, ['config', 'user.name', 'Test User']);
			runGit(repoPath, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(repoPath, 'README.md'), '# hi\n', 'utf8');
			runGit(repoPath, ['add', 'README.md']);
			runGit(repoPath, ['commit', '-m', 'init', '-q']);
			runGit(repoPath, ['branch', 'dev']);

			const service = new ModuleVersionService(createFailingGithubService());
			const branches = await service.listBranches('org', 'repo', repoPath);

			const names = branches.map((b) => b.name).sort();
			assert.deepStrictEqual(names, ['dev', 'main']);
			assert.ok(branches.every((b) => /^[0-9a-f]{40}$/.test(b.sha)));
		} finally {
			await removeTree(tempRoot);
		}
	});

	test('listTags falls back to git ls-remote --tags and skips peeled entries', async () => {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-version-tags-'));
		const repoPath = path.join(tempRoot, 'repo');
		try {
			await fs.mkdir(repoPath, { recursive: true });
			runGit(repoPath, ['init', '--initial-branch=main', '-q']);
			runGit(repoPath, ['config', 'user.name', 'Test User']);
			runGit(repoPath, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(repoPath, 'README.md'), '# hi\n', 'utf8');
			runGit(repoPath, ['add', 'README.md']);
			runGit(repoPath, ['commit', '-m', 'init', '-q']);
			// 轻量标签 + 注解标签
			runGit(repoPath, ['tag', 'v1.0']);
			runGit(repoPath, ['tag', '-a', 'v2.0', '-m', 'annotated']);

			const service = new ModuleVersionService(createFailingGithubService());
			const tags = await service.listTags('org', 'repo', repoPath);

			const names = tags.map((tag) => tag.name).sort();
			assert.deepStrictEqual(names, ['v1.0', 'v2.0']);
			// 注解标签的 sha 指向 tag 对象（非提交对象），但 git 可按 tag 名解析
			assert.ok(tags.every((tag) => /^[0-9a-f]{40}$/.test(tag.sha)));
		} finally {
			await removeTree(tempRoot);
		}
	});

	test('listReleases returns an empty list when API is unavailable', async () => {
		const service = new ModuleVersionService(createFailingGithubService());
		const releases = await service.listReleases('org', 'repo');
		assert.deepStrictEqual(releases, []);
	});

	test('listReleases maps assets and excludes Source code attachments', async () => {
		const githubService: ModuleVersionGitHubService = {
			fetchCommits: async () => [],
			fetchTags: async () => [],
			fetchReleases: async () => [
				{
					id: 1,
					name: 'Release v1.0',
					tag_name: 'v1.0',
					published_at: '2026-06-01T00:00:00Z',
					assets: [
						{ name: 'module-v1.0.zip', browser_download_url: 'https://github.com/org/repo/releases/download/v1.0/module-v1.0.zip', size: 100 },
						{ name: 'Source code (zip)', browser_download_url: 'https://codeload.github.com/org/repo/zip/v1.0' },
						{ name: 'Source code (tar.gz)', browser_download_url: 'https://codeload.github.com/org/repo/tar.gz/v1.0' },
					],
				},
			],
			fetchBranches: async () => [],
			fetchCommit: async () => undefined,
		};
		const service = new ModuleVersionService(githubService);
		const releases = await service.listReleases('org', 'repo');
		assert.strictEqual(releases.length, 1);
		// 只保留非 Source code 附件，并映射为浏览器下载 URL
		assert.deepStrictEqual(releases[0]?.assets, [
			{ name: 'module-v1.0.zip', browserDownloadUrl: 'https://github.com/org/repo/releases/download/v1.0/module-v1.0.zip', size: 100 },
		]);
	});

	test('listCommits falls back to temporary fetch + git log', async () => {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-version-commits-'));
		const repoPath = path.join(tempRoot, 'repo');
		try {
			await fs.mkdir(repoPath, { recursive: true });
			runGit(repoPath, ['init', '--initial-branch=main', '-q']);
			runGit(repoPath, ['config', 'user.name', 'Test User']);
			runGit(repoPath, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(repoPath, 'README.md'), '# v1\n', 'utf8');
			runGit(repoPath, ['add', 'README.md']);
			runGit(repoPath, ['commit', '-m', 'first commit', '-q']);
			const firstSha = runGit(repoPath, ['rev-parse', 'HEAD']);
			await fs.writeFile(path.join(repoPath, 'README.md'), '# v2\n', 'utf8');
			runGit(repoPath, ['add', 'README.md']);
			runGit(repoPath, ['commit', '-m', 'second commit', '-q']);

			const service = new ModuleVersionService(createFailingGithubService());
			const commits = await service.listCommits('org', 'repo', 'main', repoPath);

			assert.strictEqual(commits.length, 2);
			assert.strictEqual(commits[0]?.message, 'second commit');
			assert.strictEqual(commits[1]?.sha, firstSha);
			assert.strictEqual(commits[1]?.message, 'first commit');
			assert.ok(commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha)));
		} finally {
			await removeTree(tempRoot);
		}
	});

	test('resolveCommitInfo resolves via API when available', async () => {
		const githubService: ModuleVersionGitHubService = {
			fetchCommits: async () => [],
			fetchTags: async () => [],
			fetchReleases: async () => [],
			fetchBranches: async () => [],
			fetchCommit: async () => ({
				sha: 'abc123',
				commit: { message: 'fix bug\n\nbody', author: { date: '2026-07-01T00:00:00Z' } },
			}),
		};
		const service = new ModuleVersionService(githubService);
		const result = await service.resolveCommitInfo('org', 'repo', 'abc123', 'https://github.com/org/repo', 'main');
		assert.strictEqual(result.commitInfo, 'fix bug');
		assert.strictEqual(result.date, '2026-07-01T00:00:00Z');
	});

	test('resolveCommitInfo falls back to git log when API fails', async () => {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-version-commitinfo-'));
		const repoPath = path.join(tempRoot, 'repo');
		try {
			await fs.mkdir(repoPath, { recursive: true });
			runGit(repoPath, ['init', '--initial-branch=main', '-q']);
			runGit(repoPath, ['config', 'user.name', 'Test User']);
			runGit(repoPath, ['config', 'user.email', 'test@example.com']);
			await fs.writeFile(path.join(repoPath, 'README.md'), '# v1\n', 'utf8');
			runGit(repoPath, ['add', 'README.md']);
			runGit(repoPath, ['commit', '-m', 'resolve me', '-q']);
			const sha = runGit(repoPath, ['rev-parse', 'HEAD']);

			const service = new ModuleVersionService(createFailingGithubService());
			const result = await service.resolveCommitInfo('org', 'repo', sha, repoPath, 'main');
			assert.strictEqual(result.commitInfo, 'resolve me');
			assert.ok(result.date);
		} finally {
			await removeTree(tempRoot);
		}
	});
});
