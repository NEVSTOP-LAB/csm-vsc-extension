import * as vscode from 'vscode';
import { CsmModuleEntry, ModuleCacheSnapshot } from './types';

const MODULE_CACHE_KEY = 'csmModules.cache.modules';
const README_CACHE_KEY = 'csmModules.cache.readme';

export class ModuleCacheStore {
	constructor(private readonly globalState: vscode.Memento) {}

	public getModuleSnapshot(): ModuleCacheSnapshot | undefined {
		return this.globalState.get<ModuleCacheSnapshot>(MODULE_CACHE_KEY);
	}

	public async setModuleSnapshot(modules: CsmModuleEntry[]): Promise<void> {
		const snapshot: ModuleCacheSnapshot = {
			lastRefreshAt: new Date().toISOString(),
			modules,
		};
		await this.globalState.update(MODULE_CACHE_KEY, snapshot);
	}

	public getReadmeCache(): Record<string, string> {
		return this.globalState.get<Record<string, string>>(README_CACHE_KEY, {});
	}

	public async setReadmeCache(cache: Record<string, string>): Promise<void> {
		await this.globalState.update(README_CACHE_KEY, cache);
	}

	public async clear(): Promise<void> {
		await this.globalState.update(MODULE_CACHE_KEY, undefined);
		await this.globalState.update(README_CACHE_KEY, undefined);
	}
}
