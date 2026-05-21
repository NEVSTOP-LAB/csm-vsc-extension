import { CsmModuleEntry, GitHubRepoSummary } from './types';
import { GITHUB } from './constants';
import { Logger, getLogger } from './logger';

const GITHUB_API_BASE = GITHUB.apiBase;
const MODULE_TOPIC = GITHUB.moduleTopic;
const PER_PAGE = GITHUB.perPage;

interface GitHubSearchResponse<T> {
	items?: T[];
}

function hasModuleTopic(repo: GitHubRepoSummary): boolean {
	return (repo.topics ?? []).some((topic) => topic.toLowerCase() === MODULE_TOPIC);
}

function normalizeSearchRepo(repo: GitHubRepoSummary): GitHubRepoSummary {
	return {
		...repo,
		topics: repo.topics && repo.topics.length > 0 ? repo.topics : [MODULE_TOPIC],
	};
}

function dedupeRepos(repos: GitHubRepoSummary[]): GitHubRepoSummary[] {
	const seen = new Set<string>();
	const deduped: GitHubRepoSummary[] = [];
	for (const repo of repos) {
		const key = repo.full_name || String(repo.id);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(repo);
	}
	return deduped;
}

export function mapRepoToModuleEntry(repo: GitHubRepoSummary): CsmModuleEntry {
	const [owner] = repo.full_name.split('/');
	return {
		id: repo.id,
		owner: owner ?? '',
		name: repo.name,
		description: repo.description ?? '',
		topics: repo.topics ?? [],
		visibility: repo.private ? 'private' : 'public',
		defaultBranch: repo.default_branch,
		repoUrl: repo.html_url,
		updatedAt: repo.updated_at,
	};
}

function parseNextPage(linkHeader: string | null): string | undefined {
	if (!linkHeader) {
		return undefined;
	}
	const parts = linkHeader.split(',').map((part) => part.trim());
	for (const part of parts) {
		const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
		if (match && match[2] === 'next') {
			return match[1];
		}
	}
	return undefined;
}

export class GitHubModuleService {
	constructor(private readonly logger: Logger = getLogger()) {}

	private async requestJson<T>(url: string, token?: string, etag?: string): Promise<{ data: T; next?: string; etag?: string; notModified?: boolean }> {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'User-Agent': GITHUB.userAgent,
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		if (etag) {
			headers['If-None-Match'] = etag;
		}
		const response = await fetch(url, { headers });
		if (response.status === 304) {
			return { data: [] as unknown as T, notModified: true, etag: response.headers.get('etag') ?? etag };
		}
		if (!response.ok) {
			this.logger.warn(`GitHub API request to ${url} failed with HTTP ${response.status}`);
			throw new Error(`GitHub API request failed: ${response.status}`);
		}
		const data = (await response.json()) as T;
		return {
			data,
			next: parseNextPage(response.headers.get('link')),
			etag: response.headers.get('etag') ?? undefined,
		};
	}

	public async fetchModules(token?: string, options: { etag?: string } = {}): Promise<{ modules: CsmModuleEntry[]; etag?: string; notModified?: boolean }> {
		const searchQuery = encodeURIComponent(`topic:${MODULE_TOPIC}`);
		const initialUrl = `${GITHUB_API_BASE}/search/repositories?per_page=${PER_PAGE}&q=${searchQuery}`;
		// Conditional request: send If-None-Match only on the first page; if 304, short-circuit.
		const firstResult = await this.requestJson<GitHubSearchResponse<GitHubRepoSummary>>(initialUrl, token, options.etag);
		if (firstResult.notModified) {
			return { modules: [], etag: firstResult.etag, notModified: true };
		}
		const repos: GitHubRepoSummary[] = [...(firstResult.data.items ?? []).map(normalizeSearchRepo)];
		let url = firstResult.next ?? '';
		while (url) {
			const result = await this.requestJson<GitHubSearchResponse<GitHubRepoSummary>>(url, token);
			repos.push(...(result.data.items ?? []).map(normalizeSearchRepo));
			url = result.next ?? '';
		}
		const modules = dedupeRepos(repos).filter(hasModuleTopic).map(mapRepoToModuleEntry).sort((a, b) => a.name.localeCompare(b.name));
		return { modules, etag: firstResult.etag };
	}

	public async fetchReadme(owner: string, repo: string, token?: string): Promise<string> {
		const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`;
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.raw+json',
			'User-Agent': GITHUB.userAgent,
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		const response = await fetch(url, {
			headers,
		});
		if (response.status === 404) {
			return '';
		}
		if (!response.ok) {
			this.logger.warn(`GitHub README request for ${owner}/${repo} failed with HTTP ${response.status}`);
			throw new Error(`GitHub README request failed: ${response.status}`);
		}
		return response.text();
	}
}
