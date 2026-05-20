export interface CsmModuleEntry {
	id: number;
	owner: string;
	name: string;
	description: string;
	visibility: 'public' | 'private';
	defaultBranch: string;
	repoUrl: string;
	readme?: string;
}

export interface ModuleCacheSnapshot {
	lastRefreshAt: string;
	modules: CsmModuleEntry[];
}

export interface GitHubRepoSummary {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	default_branch: string;
	html_url: string;
	topics?: string[];
}
