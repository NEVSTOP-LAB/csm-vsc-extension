// ---------------------------------------------------------------------------
// modules/versionService.ts — 模块版本来源服务（issue #37）
//
// 负责为用户「更新模块」流程提供版本来源数据：
//   - 分支 / 标签 / 提交：优先走 GitHub REST API，失败时用 git CLI 兜底
//   - Release：仅 GitHub REST API（git CLI 无 release 概念，兜底为空列表）
//   - 提交信息解析（更新成功后缓存展示用）
// ---------------------------------------------------------------------------

import * as fs from 'fs/promises';
import * as path from 'path';
import { getTempRoot } from '../common/tempPaths';
import { GitHubBranchInfo, GitHubCommitInfo, GitHubModuleService, GitHubReleaseInfo, GitHubTagInfo } from './githubModuleService';
import { GitService, IGitRunner } from './gitService';
import { Logger, getLogger } from './logger';
import { ModuleBranchInfo, ModuleCommitInfo, ModuleReleaseInfo, ModuleTagInfo } from './types';

/** GitHub 自动生成的源码附件名（排除用） */
function isSourceCodeAsset(name: string): boolean {
	return name.toLowerCase().includes('source code');
}

/**
 * ModuleVersionService 所需的 GitHub API 子集（便于测试注入 mock）。
 */
export interface ModuleVersionGitHubService {
	fetchCommits(owner: string, repo: string, branch: string, token?: string, perPage?: number): Promise<GitHubCommitInfo[]>;
	fetchTags(owner: string, repo: string, token?: string, perPage?: number): Promise<GitHubTagInfo[]>;
	fetchReleases(owner: string, repo: string, token?: string, perPage?: number): Promise<GitHubReleaseInfo[]>;
	fetchBranches(owner: string, repo: string, token?: string, perPage?: number): Promise<GitHubBranchInfo[]>;
	fetchCommit(owner: string, repo: string, sha: string, token?: string): Promise<GitHubCommitInfo | undefined>;
}

export class ModuleVersionService {
	constructor(
		private readonly githubService: ModuleVersionGitHubService,
		private readonly gitRunner: IGitRunner = new GitService(),
		private readonly logger: Logger = getLogger(),
	) { }

	/**
	 * 获取仓库全部分支列表。优先 GitHub API，失败时用 `git ls-remote --heads` 兜底。
	 */
	public async listBranches(owner: string, repo: string, repoUrl: string, token?: string): Promise<ModuleBranchInfo[]> {
		try {
			const branches = await this.githubService.fetchBranches(owner, repo, token);
			return branches.map((branch) => ({ name: branch.name, sha: branch.commit?.sha ?? '' }));
		} catch (error) {
			this.logger.warn(`GitHub branches API failed for ${owner}/${repo}, falling back to git ls-remote: ${error instanceof Error ? error.message : String(error)}`);
			return this.listBranchesViaGit(repoUrl, token);
		}
	}

	/**
	 * 获取仓库最近标签列表。优先 GitHub API，失败时用 `git ls-remote --tags` 兜底。
	 */
	public async listTags(owner: string, repo: string, repoUrl: string, token?: string): Promise<ModuleTagInfo[]> {
		try {
			const tags = await this.githubService.fetchTags(owner, repo, token);
			return tags.map((tag) => ({ name: tag.name, sha: tag.commit?.sha ?? '' }));
		} catch (error) {
			this.logger.warn(`GitHub tags API failed for ${owner}/${repo}, falling back to git ls-remote: ${error instanceof Error ? error.message : String(error)}`);
			return this.listTagsViaGit(repoUrl, token);
		}
	}

	/**
	 * 获取仓库最近 GitHub Release 列表（仅 API，失败返回空列表）。
	 * 附件列表会排除 GitHub 自动生成的 `Source code (zip)` / `Source code (tar.gz)`。
	 */
	public async listReleases(owner: string, repo: string, token?: string): Promise<ModuleReleaseInfo[]> {
		try {
			const releases = await this.githubService.fetchReleases(owner, repo, token);
			return releases.map((release) => ({
				name: release.name ?? release.tag_name,
				tagName: release.tag_name,
				publishedAt: release.published_at ?? undefined,
				assets: (release.assets ?? [])
					.filter((asset) => !isSourceCodeAsset(asset.name))
					.map((asset) => ({
						name: asset.name,
						browserDownloadUrl: asset.browser_download_url,
						size: asset.size,
					})),
			}));
		} catch (error) {
			this.logger.warn(`GitHub releases API failed for ${owner}/${repo}, no git fallback available: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	/**
	 * 获取某个分支最近提交列表。优先 GitHub API，失败时临时 fetch + `git log` 兜底。
	 */
	public async listCommits(owner: string, repo: string, branch: string, repoUrl: string, token?: string): Promise<ModuleCommitInfo[]> {
		try {
			const commits = await this.githubService.fetchCommits(owner, repo, branch, token);
			return commits.map((commit) => ({
				sha: commit.sha,
				message: commit.commit?.message?.split('\n')[0] ?? '',
				date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? undefined,
			}));
		} catch (error) {
			this.logger.warn(`GitHub commits API failed for ${owner}/${repo}@${branch}, falling back to git log: ${error instanceof Error ? error.message : String(error)}`);
			return this.listCommitsViaGit(repoUrl, branch, token);
		}
	}

	/**
	 * 尽力解析某次提交的展示信息（提交信息 + 日期），供更新成功后缓存到本地。
	 * 优先 GitHub API，失败时临时 fetch + `git log -1` 兜底。
	 */
	public async resolveCommitInfo(owner: string, repo: string, sha: string, repoUrl: string, branch: string, token?: string): Promise<{ commitInfo?: string; date?: string }> {
		try {
			const commit = await this.githubService.fetchCommit(owner, repo, sha, token);
			if (commit?.sha) {
				return {
					commitInfo: commit.commit?.message?.split('\n')[0] ?? '',
					date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? undefined,
				};
			}
		} catch (error) {
			this.logger.warn(`GitHub commit detail API failed for ${owner}/${repo}@${sha}: ${error instanceof Error ? error.message : String(error)}`);
		}

		try {
			return await this.resolveCommitInfoViaGit(repoUrl, branch, sha, token);
		} catch (error) {
			this.logger.warn(`Failed to resolve commit info via git for ${sha}: ${error instanceof Error ? error.message : String(error)}`);
			return {};
		}
	}

	// ---------------------------------------------------------------------------
	// git CLI 兜底实现
	// ---------------------------------------------------------------------------

	private async listBranchesViaGit(repoUrl: string, token?: string): Promise<ModuleBranchInfo[]> {
		const stdout = await this.runGit('', ['ls-remote', '--heads', repoUrl], token, repoUrl);
		const branches: ModuleBranchInfo[] = [];
		for (const line of stdout.split(/\r?\n/)) {
			const match = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/);
			if (match?.[1] && match[2]) {
				branches.push({ name: match[2], sha: match[1] });
			}
		}
		return branches;
	}

	private async listTagsViaGit(repoUrl: string, token?: string): Promise<ModuleTagInfo[]> {
		const stdout = await this.runGit('', ['ls-remote', '--tags', repoUrl], token, repoUrl);
		const tags: ModuleTagInfo[] = [];
		for (const line of stdout.split(/\r?\n/)) {
			const match = line.match(/^([0-9a-f]{40})\s+refs\/tags\/(.+)$/);
			if (!match?.[1] || !match[2]) {
				continue;
			}
			// 跳过注解标签的 peeled 条目（refs/tags/<name>^{}），保留主条目
			if (match[2].endsWith('^{}')) {
				continue;
			}
			tags.push({ name: match[2], sha: match[1] });
		}
		return tags;
	}

	private async listCommitsViaGit(repoUrl: string, branch: string, token?: string): Promise<ModuleCommitInfo[]> {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-versions-'));
		try {
			await this.runGit(tempRoot, ['init', '-q'], token, repoUrl);
			await this.runGit(tempRoot, ['remote', 'add', 'origin', repoUrl], token, repoUrl);
			await this.runGit(tempRoot, ['fetch', '--depth', '20', 'origin', branch], token, repoUrl);
			const stdout = await this.runGit(tempRoot, ['log', '-n', '20', '--format=%H%x09%s%x09%aI', 'FETCH_HEAD'], token, repoUrl);
			const commits: ModuleCommitInfo[] = [];
			for (const line of stdout.split(/\r?\n/)) {
				const [sha, message, date] = line.split('\t');
				if (sha && /^[0-9a-f]{40}$/.test(sha)) {
					commits.push({ sha, message: message ?? '', date: date || undefined });
				}
			}
			return commits;
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private async resolveCommitInfoViaGit(repoUrl: string, branch: string, sha: string, token?: string): Promise<{ commitInfo?: string; date?: string }> {
		const tempRoot = await fs.mkdtemp(path.join(getTempRoot(), 'csm-commitinfo-'));
		try {
			await this.runGit(tempRoot, ['init', '-q'], token, repoUrl);
			await this.runGit(tempRoot, ['remote', 'add', 'origin', repoUrl], token, repoUrl);
			await this.runGit(tempRoot, ['fetch', '--depth', '1', 'origin', branch], token, repoUrl);
			const stdout = await this.runGit(tempRoot, ['log', '-n', '1', '--format=%H%x09%s%x09%aI', sha], token, repoUrl);
			const [resolvedSha, message, date] = stdout.split('\t');
			if (!resolvedSha || !/^[0-9a-f]{40}$/.test(resolvedSha)) {
				return {};
			}
			return { commitInfo: message || undefined, date: date || undefined };
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	private runGit(cwd: string, args: string[], authToken?: string, repoUrl?: string): Promise<string> {
		// `git ls-remote` 不需要仓库工作目录，但 execFile 需要合法的 cwd
		const effectiveCwd = cwd || process.cwd();
		return this.gitRunner.exec({ cwd: effectiveCwd, args, authToken, repoUrl });
	}
}
