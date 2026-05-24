import { t } from './messages';

/**
 * Centralized constants for the Module Manager feature.
 *
 * Keeping command IDs, view IDs, configuration keys, cache keys, and
 * VS Code context keys in one place makes them easier to discover and refactor.
 */

export const VIEW_IDS = {
	moduleSidebar: 'csmModules.view',
	localWorkspace: 'csmModules.workspaceView',
} as const;

export const COMMAND_IDS = {
	login: 'csmModules.login',
	logout: 'csmModules.logout',
	refresh: 'csmModules.refresh',
	initializeWorkspace: 'csmModules.initializeWorkspace',
	openReadme: 'csmModules.openReadme',
	applyToWorkspace: 'csmModules.applyToWorkspace',
	removeModule: 'csmModules.removeModule',
	updateModule: 'csmModules.updateModule',
	contextApplyModule: 'csmModules.contextApplyModule',
	contextOpenReadme: 'csmModules.contextOpenReadme',
	contextRemoveModule: 'csmModules.contextRemoveModule',
	contextUpdateModule: 'csmModules.contextUpdateModule',
	contextSelectModule: 'csmModules.contextSelectModule',
	contextClearModuleSelection: 'csmModules.contextClearModuleSelection',
	setSortOrder: 'csmModules.setSortOrder',
} as const;

export const CONFIG_SECTIONS = {
	moduleManager: 'csmModules',
} as const;

export const CONFIG_KEYS = {
	defaultModuleRoot: 'defaultModuleRoot',
} as const;

export const STORAGE_KEYS = {
	moduleCache: 'csmModules.cache.modules',
	readmeCache: 'csmModules.cache.readme',
	moduleEtag: 'csmModules.cache.modulesEtag',
	moduleAuth: 'csmModules.auth.lastKnown',
	moduleSortState: 'csmModules.sort.state',
} as const;

export const CONTEXT_KEYS = {
	canInitializeWorkspace: 'csmModules.canInitializeWorkspace',
	signedIn: 'csmModules.signedIn',
	hasSelection: 'csmModules.hasSelection',
	selectionHasApplied: 'csmModules.selectionHasApplied',
	selectionHasUnapplied: 'csmModules.selectionHasUnapplied',
} as const;

export const OUTPUT_CHANNEL_NAME = t('outputChannelName');

export const GITHUB = {
	apiBase: 'https://api.github.com',
	moduleTopic: 'csm-modsets',
	perPage: 100,
	userAgent: 'csm-vsc-support',
	requiredScopes: ['read:user', 'repo'] as const,
	providerId: 'github',
} as const;
