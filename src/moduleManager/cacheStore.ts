import * as vscode from 'vscode';
import { CsmModuleEntry, ModuleCacheSnapshot } from './types';

const MODULE_CACHE_KEY = 'csmModules.cache.modules';
const README_CACHE_KEY = 'csmModules.cache.readme';
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
	};
}

export class ModuleCacheStore {
	constructor(private readonly globalState: vscode.Memento) {}

	public getModuleSnapshot(): ModuleCacheSnapshot | undefined {
		const rawSnapshot = this.globalState.get<unknown>(MODULE_CACHE_KEY);
		if (!isModuleSnapshotShape(rawSnapshot)) {
			return undefined;
		}
		return normalizeSnapshot(rawSnapshot);
	}

	public async setModuleSnapshot(modules: CsmModuleEntry[]): Promise<void> {
		const snapshot: ModuleCacheSnapshot = {
			schemaVersion: MODULE_CACHE_SCHEMA_VERSION,
			lastRefreshAt: new Date().toISOString(),
			modules,
		};
		await this.globalState.update(MODULE_CACHE_KEY, snapshot);
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

	public async clear(): Promise<void> {
		await this.globalState.update(MODULE_CACHE_KEY, undefined);
		await this.globalState.update(README_CACHE_KEY, undefined);
	}
}
