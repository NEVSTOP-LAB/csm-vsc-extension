import { CsmModuleEntry, GitHubRepoSummary } from './types';
import { GITHUB } from './constants';

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
	private async requestJson<T>(url: string, token: string): Promise<{ data: T; next?: string }> {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'csm-vsc-support',
			},
		});
		if (!response.ok) {
			throw new Error(`GitHub API request failed: ${response.status}`);
		}
		const data = (await response.json()) as T;
		return {
			data,
			next: parseNextPage(response.headers.get('link')),
		};
	}

	public async fetchModules(token: string): Promise<CsmModuleEntry[]> {
		let url = `${GITHUB_API_BASE}/user/repos?per_page=${PER_PAGE}&affiliation=owner,collaborator,organization_member`;
		const repos: GitHubRepoSummary[] = [];
		while (url) {
			const result = await this.requestJson<GitHubRepoSummary[]>(url, token);
			repos.push(...result.data);
			url = result.next ?? '';
		}
		return repos.filter(hasModuleTopic).map(mapRepoToModuleEntry).sort((a, b) => a.name.localeCompare(b.name));
	}

	public async fetchReadme(owner: string, repo: string, token: string): Promise<string> {
		const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`;
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.raw+json',
				'User-Agent': 'csm-vsc-support',
			},
		});
		if (response.status === 404) {
			return '';
		}
		if (!response.ok) {
			throw new Error(`GitHub README request failed: ${response.status}`);
		}
		return response.text();
	}
}
