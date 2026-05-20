export { ModuleManagerController } from './moduleManagerController';
export { mapRepoToModuleEntry } from './githubModuleService';
export { ModuleCacheStore } from './cacheStore';
export {
	WorkspaceModuleService,
	DEFAULT_LOCAL_MODULE_ROOT,
	LOCAL_MODULE_CONFIG_FILE,
	LEGACY_LOCAL_MODULE_CONFIG_FILE,
} from './workspaceModuleService';
export type {
	CsmModuleEntry,
	GitHubRepoSummary,
	LocalModuleConfig,
	LocalModuleConfigEntry,
	ModuleApplyMethod,
	ModuleCacheSnapshot,
} from './types';
