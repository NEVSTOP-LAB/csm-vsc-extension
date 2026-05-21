/**
 * Centralized constants for the Module Manager feature.
 *
 * Keeping command IDs, view IDs, configuration keys, cache keys, and
 * VS Code context keys in one place makes them easier to discover and refactor.
 */

export const VIEW_IDS = {
	moduleSidebar: 'csmModules.view',
} as const;

export const COMMAND_IDS = {
	login: 'csmModules.login',
	refresh: 'csmModules.refresh',
	initializeWorkspace: 'csmModules.initializeWorkspace',
	openReadme: 'csmModules.openReadme',
	applyToWorkspace: 'csmModules.applyToWorkspace',
	removeModule: 'csmModules.removeModule',
	updateModule: 'csmModules.updateModule',
	setSortOrder: 'csmModules.setSortOrder',
} as const;

export const CONFIG_SECTION = 'csmModules.cache';
export const CONFIG_KEYS = {
	cacheTtlMinutes: 'ttlMinutes',
} as const;

export const STORAGE_KEYS = {
	moduleCache: 'csmModules.cache.modules',
	readmeCache: 'csmModules.cache.readme',
	moduleEtag: 'csmModules.cache.modulesEtag',
} as const;

export const CONTEXT_KEYS = {
	canInitializeWorkspace: 'csmModules.canInitializeWorkspace',
	signedIn: 'csmModules.signedIn',
	hasSelection: 'csmModules.hasSelection',
} as const;

export const OUTPUT_CHANNEL_NAME = 'CSM Modules';

export const GITHUB = {
	apiBase: 'https://api.github.com',
	moduleTopic: 'csm-modsets',
	perPage: 100,
	userAgent: 'csm-vsc-support',
	requiredScopes: ['read:user', 'repo'] as const,
	providerId: 'github',
} as const;
