import * as vscode from 'vscode';
import { ModuleSortState } from './types';
import { normalizeModuleSortState } from './sort';
import { CsmModuleEntry, ModuleAuthSnapshot, ModuleCacheSnapshot, ModuleVersionCacheEntry } from './types';
import { STORAGE_KEYS } from './constants';

const MODULE_CACHE_KEY = STORAGE_KEYS.moduleCache;
const README_CACHE_KEY = STORAGE_KEYS.readmeCache;
const MODULE_ETAG_KEY = STORAGE_KEYS.moduleEtag;
const MODULE_AUTH_KEY = STORAGE_KEYS.moduleAuth;
const MODULE_SORT_STATE_KEY = STORAGE_KEYS.moduleSortState;
const MODULE_LV_VERSION_KEY = STORAGE_KEYS.moduleLvVersion;
const RECENT_NAMESPACE_BY_WORKSPACE_KEY = STORAGE_KEYS.recentNamespaceByWorkspace;
const MODULE_VERSION_CACHE_KEY = STORAGE_KEYS.moduleVersionCache;
const MODULE_CACHE_SCHEMA_VERSION = 1;

function isModuleSnapshotShape(value: unknown): value is ModuleCacheSnapshot {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const snapshot = value as Partial<ModuleCacheSnapshot>;
	return typeof snapshot.lastRefreshAt === 'string' && Array.isArray(snapshot.modules);
}

function normalizeSnapshot(snapshot: ModuleCacheSnapshot): ModuleCacheSnapshot {
	return {
		schemaVersion: snapshot.schemaVersion ?? MODULE_CACHE_SCHEMA_VERSION,
		lastRefreshAt: snapshot.lastRefreshAt,
		modules: snapshot.modules,
		refreshAccountId: typeof snapshot.refreshAccountId === 'string' ? snapshot.refreshAccountId : undefined,
		refreshAccountLabel: typeof snapshot.refreshAccountLabel === 'string' ? snapshot.refreshAccountLabel : undefined,
	};
}

function isModuleAuthSnapshotShape(value: unknown): value is ModuleAuthSnapshot {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const snapshot = value as Partial<ModuleAuthSnapshot>;
	return typeof snapshot.accountId === 'string' && typeof snapshot.accountLabel === 'string';
}

export class ModuleCacheStore {
	constructor(private readonly globalState: vscode.Memento) { }

	public getModuleSortState(): ModuleSortState {
		const value = this.globalState.get<unknown>(MODULE_SORT_STATE_KEY);
		if (!value || typeof value !== 'object') {
			return normalizeModuleSortState();
		}
		return normalizeModuleSortState(value as Partial<ModuleSortState>);
	}

	public async setModuleSortState(sortState: ModuleSortState): Promise<void> {
		await this.globalState.update(MODULE_SORT_STATE_KEY, normalizeModuleSortState(sortState));
	}

	public getModuleSnapshot(): ModuleCacheSnapshot | undefined {
		const rawSnapshot = this.globalState.get<unknown>(MODULE_CACHE_KEY);
		if (!isModuleSnapshotShape(rawSnapshot)) {
			return undefined;
		}
		return normalizeSnapshot(rawSnapshot);
	}

	public async setModuleSnapshot(
		modules: CsmModuleEntry[],
		options: { lastRefreshAt?: string; refreshAccountId?: string; refreshAccountLabel?: string } = {},
	): Promise<ModuleCacheSnapshot> {
		const snapshot: ModuleCacheSnapshot = {
			schemaVersion: MODULE_CACHE_SCHEMA_VERSION,
			lastRefreshAt: options.lastRefreshAt ?? new Date().toISOString(),
			modules,
			refreshAccountId: options.refreshAccountId,
			refreshAccountLabel: options.refreshAccountLabel,
		};
		await this.globalState.update(MODULE_CACHE_KEY, snapshot);
		return snapshot;
	}

	public getAuthSnapshot(): ModuleAuthSnapshot | undefined {
		const rawSnapshot = this.globalState.get<unknown>(MODULE_AUTH_KEY);
		if (!isModuleAuthSnapshotShape(rawSnapshot)) {
			return undefined;
		}
		return rawSnapshot;
	}

	public async setAuthSnapshot(snapshot: ModuleAuthSnapshot | undefined): Promise<void> {
		await this.globalState.update(MODULE_AUTH_KEY, snapshot);
	}

	public async clearAuthSnapshot(): Promise<void> {
		await this.globalState.update(MODULE_AUTH_KEY, undefined);
	}

	public isModuleSnapshotExpired(snapshot: ModuleCacheSnapshot | undefined, ttlMinutes: number): boolean {
		if (!snapshot || snapshot.modules.length === 0) {
			return true;
		}
		const parsedTimestamp = Date.parse(snapshot.lastRefreshAt);
		if (Number.isNaN(parsedTimestamp)) {
			return true;
		}
		const effectiveTtlMinutes = Math.max(1, Math.floor(ttlMinutes));
		const ageMs = Date.now() - parsedTimestamp;
		return ageMs >= effectiveTtlMinutes * 60 * 1000;
	}

	public getReadmeCache(): Record<string, string> {
		const cache = this.globalState.get<unknown>(README_CACHE_KEY, {});
		if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
			return {};
		}
		return cache as Record<string, string>;
	}

	public async setReadmeCache(cache: Record<string, string>): Promise<void> {
		await this.globalState.update(README_CACHE_KEY, cache);
	}

	/**
	 * Drop any legacy README payloads stored in GlobalState. README content is now
	 * persisted exclusively on the filesystem via {@link ReadmeAssetCache}.
	 */
	public async clearReadmeCache(): Promise<void> {
		await this.globalState.update(README_CACHE_KEY, undefined);
	}

	public getModuleEtag(): string | undefined {
		const value = this.globalState.get<unknown>(MODULE_ETAG_KEY);
		return typeof value === 'string' ? value : undefined;
	}

	public async setModuleEtag(etag: string | undefined): Promise<void> {
		await this.globalState.update(MODULE_ETAG_KEY, etag);
	}

	/**
	 * 获取远程 LabVIEW 版本缓存（moduleKey → 版本显示名）。
	 * 用于暂存通过 GitHub API 检测到的仓库版本信息，避免每次刷新重复请求。
	 */
	public getLvVersionCache(): Record<string, string> {
		const value = this.globalState.get<unknown>(MODULE_LV_VERSION_KEY);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}
		return value as Record<string, string>;
	}

	/**
	 * 更新远程 LabVIEW 版本缓存。
	 * @param cache 部分更新的 moduleKey → 版本显示名映射
	 */
	public async setLvVersionCache(cache: Record<string, string>): Promise<void> {
		await this.globalState.update(MODULE_LV_VERSION_KEY, cache);
	}

	public getRecentNamespaceByWorkspace(): Record<string, string> {
		const value = this.globalState.get<unknown>(RECENT_NAMESPACE_BY_WORKSPACE_KEY);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}
		return value as Record<string, string>;
	}

	public async setRecentNamespaceByWorkspace(cache: Record<string, string>): Promise<void> {
		await this.globalState.update(RECENT_NAMESPACE_BY_WORKSPACE_KEY, cache);
	}

	/**
	 * 获取模块当前版本提交信息缓存（key=`owner/name`，value=`{ ref, commitInfo, date }`）。
	 * 在更新/选择版本成功时写入，侧边栏展示时优先读缓存，避免每次在线查询（issue #37）。
	 */
	public getModuleVersionCache(): Record<string, ModuleVersionCacheEntry> {
		const value = this.globalState.get<unknown>(MODULE_VERSION_CACHE_KEY);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}
		return value as Record<string, ModuleVersionCacheEntry>;
	}

	/** 更新模块当前版本提交信息缓存（整体替换）。 */
	public async setModuleVersionCache(cache: Record<string, ModuleVersionCacheEntry>): Promise<void> {
		await this.globalState.update(MODULE_VERSION_CACHE_KEY, cache);
	}

	public async clear(): Promise<void> {
		await this.globalState.update(MODULE_CACHE_KEY, undefined);
		await this.globalState.update(README_CACHE_KEY, undefined);
		await this.globalState.update(MODULE_ETAG_KEY, undefined);
		await this.globalState.update(MODULE_AUTH_KEY, undefined);
		await this.globalState.update(MODULE_SORT_STATE_KEY, undefined);
		await this.globalState.update(MODULE_LV_VERSION_KEY, undefined);
		await this.globalState.update(RECENT_NAMESPACE_BY_WORKSPACE_KEY, undefined);
		await this.globalState.update(MODULE_VERSION_CACHE_KEY, undefined);
	}
}
