export interface CsmModuleEntry {
	id: number;
	owner: string;
	name: string;
	description: string;
	topics: string[];
	visibility: 'public' | 'private';
	defaultBranch: string;
	repoUrl: string;
	readme?: string;
}

export type ModuleApplyMethod = 'submodule' | 'copy';

export interface LocalModuleConfigEntry {
	key: string;
	name: string;
	owner: string;
	source: string;
	method: ModuleApplyMethod;
	path: string;
	ref: string;
	branch: string;
}

export interface LocalModuleConfig {
	version: string;
	root: string;
	configPath: string;
	modules: Record<string, LocalModuleConfigEntry>;
}

export interface ModuleCacheSnapshot {
	schemaVersion?: number;
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
