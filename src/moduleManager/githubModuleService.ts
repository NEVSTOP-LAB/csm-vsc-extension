import { CsmModuleEntry, GitHubRepoSummary } from './types';
import { GITHUB } from './constants';
import { Logger, getLogger } from './logger';

const GITHUB_API_BASE = GITHUB.apiBase;
const MODULE_TOPIC = GITHUB.moduleTopic;
const PER_PAGE = GITHUB.perPage;

function hasModuleTopic(repo: GitHubRepoSummary): boolean {
	return (repo.topics ?? []).some((topic) => topic.toLowerCase() === MODULE_TOPIC);
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

	private async requestJson<T>(url: string, token: string, etag?: string): Promise<{ data: T; next?: string; etag?: string; notModified?: boolean }> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': GITHUB.userAgent,
		};
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

	public async fetchModules(token: string, options: { etag?: string } = {}): Promise<{ modules: CsmModuleEntry[]; etag?: string; notModified?: boolean }> {
		const initialUrl = `${GITHUB_API_BASE}/user/repos?per_page=${PER_PAGE}&affiliation=owner,collaborator,organization_member`;
		// Conditional request: send If-None-Match only on the first page; if 304, short-circuit.
		const firstResult = await this.requestJson<GitHubRepoSummary[]>(initialUrl, token, options.etag);
		if (firstResult.notModified) {
			return { modules: [], etag: firstResult.etag, notModified: true };
		}
		const repos: GitHubRepoSummary[] = [...firstResult.data];
		let url = firstResult.next ?? '';
		while (url) {
			const result = await this.requestJson<GitHubRepoSummary[]>(url, token);
			repos.push(...result.data);
			url = result.next ?? '';
		}
		const modules = repos.filter(hasModuleTopic).map(mapRepoToModuleEntry).sort((a, b) => a.name.localeCompare(b.name));
		return { modules, etag: firstResult.etag };
	}

	public async fetchReadme(owner: string, repo: string, token: string): Promise<string> {
		const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`;
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.raw+json',
				'User-Agent': GITHUB.userAgent,
			},
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
