export { ModuleManagerController } from './moduleManagerController';
export type { ModuleManagerControllerDeps } from './moduleManagerController';
export { mapRepoToModuleEntry } from './githubModuleService';
export { ModuleCacheStore } from './cacheStore';
export {
	WorkspaceModuleService,
	DEFAULT_LOCAL_MODULE_ROOT,
	LOCAL_MODULE_CONFIG_FILE,
	LEGACY_LOCAL_MODULE_CONFIG_FILE,
} from './workspaceModuleService';
export { GitService } from './gitService';
export { AuthService } from './authService';
export { GitHubModuleService } from './githubModuleService';
export {
	DEFAULT_MODULE_SORT_STATE,
	isModuleSortDirection,
	isModuleSortField,
	MODULE_SORT_DIRECTIONS,
	MODULE_SORT_FIELDS,
	normalizeModuleSortState,
	sortModules,
} from './sort';
export type { IModuleViewProvider, ModuleSortDirection, ModuleSortField, ModuleSortState, SidebarWorkspaceContext } from './interfaces';
export {
	LoginCommand,
	RefreshCommand,
	InitializeWorkspaceCommand,
	OpenReadmeCommand,
	ApplyToWorkspaceCommand,
	RemoveModuleCommand,
	UpdateModuleCommand,
	SetSortOrderCommand,
} from './commands';
export type { CommandTarget } from './commands';
export type {
	CsmModuleEntry,
	GitHubRepoSummary,
	LocalModuleConfig,
	LocalModuleConfigEntry,
	ModuleApplyMethod,
	ModuleCacheSnapshot,
} from './types';
