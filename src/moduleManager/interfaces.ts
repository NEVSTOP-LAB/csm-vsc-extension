import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from './types';

export type ModuleSortField = 'name' | 'owner' | 'updatedAt' | 'applied';
export type ModuleSortDirection = 'asc' | 'desc';
export type ModuleListScope = 'all' | 'workspace' | 'catalog';

export interface ModuleSortState {
	field: ModuleSortField;
	direction: ModuleSortDirection;
}

export interface SidebarWorkspaceContext {
	workspaceLabel?: string;
	moduleRoot?: string;
	gitAvailable?: boolean;
	appliedModuleKeys: string[];
	staleModuleKeys?: string[];
	managedModules?: LocalManagedModuleEntry[];
	unmanagedFolders?: LocalUnmanagedFolderEntry[];
	/** 工作区根目录检测到的 LabVIEW 版本显示名（如 "lv2020"） */
	workspaceLabviewVersion?: string;
}

/**
 * Abstraction over the sidebar/webview implementation so the controller
 * does not have to depend on a concrete `ModuleSidebarViewProvider`
 * (review item 2.2 — improves testability and removes `instanceof` checks).
 */
export interface IModuleViewProvider {
	setAuthenticated(signedIn: boolean, accountLabel?: string): void;
	setLoading(message?: string, forceSkeleton?: boolean): void;
	setError(message: string): void;
	setModules(modules: CsmModuleEntry[]): void;
	setModulesPreview?(modules: CsmModuleEntry[]): void;
	setSelection(moduleKeys: string[]): void;
	setWorkspaceContext(context: SidebarWorkspaceContext): void;
	setCanInitializeWorkspace(canInitializeWorkspace: boolean): void;
	setOfflineMode?(offline: boolean): void;
	setSortOrder?(sortState: ModuleSortState): void;
	setViewDescription?(description?: string): void;
}
