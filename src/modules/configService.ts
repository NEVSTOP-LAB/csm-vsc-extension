import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { LocalModuleConfig, LocalModuleConfigEntry } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CONFIG_VERSION = '3';
const SECTION_ROOT = 'csmModules';

/**
 * `version` 字段语义：配置文件自身的 schema 版本（非负整数，如 "1" / "2" / "3"）。
 * 与插件版本彻底解耦——插件升级不会改写配置文件（避免无意义的 git 变更）。
 * 仅当配置格式发生变更（含不兼容变更）时递增该版本号，并配套迁移 / 重建逻辑。
 * 旧配置（缺失 version / 旧插件版本如 "0.0.26" / 低于当前 schema 版本）加载时自动迁移到当前版本。
 */

export const DEFAULT_LOCAL_MODULE_ROOT = 'csm';
export const LOCAL_MODULE_CONFIG_FILE = 'csm-modules.yaml';
export const LEGACY_LOCAL_MODULE_CONFIG_FILE = 'csm-modules.lvcsm';

// ---------------------------------------------------------------------------
// Internal shape
// ---------------------------------------------------------------------------

interface ParsedConfigShape {
	version?: string;
	root?: string;
	modules: Record<string, LocalModuleConfigEntry>;
	needsLockedMigration?: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toPosixPath(value: string): string {
	return value.replace(/\\/g, '/');
}

/**
 * Normalize a user-supplied relative path (e.g. "csm" or "./csm/")
 * to a clean posix relative path without leading/trailing slashes.
 */
export function normalizeRootPath(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error('A relative directory is required.');
	}

	const slashNormalized = trimmed.replace(/\\/g, '/');
	if (path.posix.isAbsolute(slashNormalized) || path.win32.isAbsolute(trimmed)) {
		throw new Error('Use a directory relative to the repository root.');
	}

	const normalized = path.posix.normalize(slashNormalized).replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
	if (!normalized || normalized === '.') {
		throw new Error('The directory cannot be the repository root.');
	}
	if (normalized.startsWith('..') || normalized.includes('/../')) {
		throw new Error('The directory must stay inside the repository root.');
	}

	return normalized;
}

/** A module is considered locked unless `locked` is explicitly `false`. */
export function isEntryLocked(entry: Pick<LocalModuleConfigEntry, 'locked'>): boolean {
	return entry.locked !== false;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getConfigPath(repoRoot: string, rootRelativePath: string): string {
	return path.join(repoRoot, ...rootRelativePath.split('/'), LOCAL_MODULE_CONFIG_FILE);
}

export function isLegacyConfigPath(configPath: string): boolean {
	return path.basename(configPath).toLowerCase() === LEGACY_LOCAL_MODULE_CONFIG_FILE.toLowerCase();
}

// ---------------------------------------------------------------------------
// Serialization / deserialization
// ---------------------------------------------------------------------------

function isModuleVersionKind(value: unknown): value is LocalModuleConfigEntry['versionKind'] {
	return value === 'branch' || value === 'commit' || value === 'tag' || value === 'release';
}

export function finalizeModuleSection(module: Partial<LocalModuleConfigEntry>): LocalModuleConfigEntry {
	const entry: LocalModuleConfigEntry = {
		key: module.key ?? '',
		name: module.name ?? '',
		owner: module.owner ?? '',
		source: module.source ?? '',
		method: module.method === 'copy' ? 'copy' : module.method === 'release' ? 'release' : module.method === 'local' ? 'local' : 'submodule',
		path: module.path ?? '',
		ref: module.ref ?? '',
		branch: module.branch ?? '',
		locked: isEntryLocked(module),
	};
	if (isModuleVersionKind(module.versionKind)) {
		entry.versionKind = module.versionKind;
	}
	if (module.versionRef) {
		entry.versionRef = module.versionRef;
	}
	if (module.releaseName) {
		entry.releaseName = module.releaseName;
	}
	if (module.labviewVersion) {
		entry.labviewVersion = module.labviewVersion;
	}
	return entry;
}

export function serializeConfig(config: LocalModuleConfig): string {
	const moduleEntries: Record<string, Record<string, unknown>> = {};
	for (const key of Object.keys(config.modules).sort((left, right) => left.localeCompare(right))) {
		const module = config.modules[key];
		const entry: Record<string, unknown> = {
			name: module.name,
			owner: module.owner,
			source: module.source,
			method: module.method,
			path: module.path,
			ref: module.ref,
			branch: module.branch,
			locked: isEntryLocked(module),
		};
		// Only persist versionKind/versionRef when present (issue #37)
		if (isModuleVersionKind(module.versionKind)) {
			entry.versionKind = module.versionKind;
		}
		if (module.versionRef) {
			entry.versionRef = module.versionRef;
		}
		if (module.releaseName) {
			entry.releaseName = module.releaseName;
		}
		// Only persist labviewVersion when detected, avoid writing empty values
		if (module.labviewVersion) {
			entry.labviewVersion = module.labviewVersion;
		}
		moduleEntries[key] = entry;
	}
	const document = {
		version: config.version || CONFIG_VERSION,
		root: config.root,
		modules: moduleEntries,
	};
	return yaml.dump(document, {
		schema: yaml.JSON_SCHEMA,
		lineWidth: 120,
		noRefs: true,
		sortKeys: false,
		quotingType: '"',
		forceQuotes: true,
	});
}

export function parseYamlConfig(raw: string): ParsedConfigShape {
	let parsed: unknown;
	try {
		parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
	} catch (error) {
		throw new Error(`Failed to parse YAML config: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!parsed || typeof parsed !== 'object') {
		return { modules: {} };
	}

	const obj = parsed as Record<string, unknown>;
	const version = typeof obj.version === 'string' ? obj.version : (obj.version !== undefined && obj.version !== null ? String(obj.version) : undefined);
	const root = typeof obj.root === 'string' ? obj.root : undefined;
	const modules: Record<string, LocalModuleConfigEntry> = {};
	let needsLockedMigration = false;

	const modulesRaw = obj.modules;
	if (modulesRaw && typeof modulesRaw === 'object' && !Array.isArray(modulesRaw)) {
		for (const [key, value] of Object.entries(modulesRaw as Record<string, unknown>)) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				continue;
			}
			const entry = value as Record<string, unknown>;
			if (typeof entry.locked !== 'boolean') {
				needsLockedMigration = true;
			}
			modules[key] = finalizeModuleSection({
				key,
				name: typeof entry.name === 'string' ? entry.name : undefined,
				owner: typeof entry.owner === 'string' ? entry.owner : undefined,
				source: typeof entry.source === 'string' ? entry.source : undefined,
				method: entry.method === 'copy' ? 'copy' : entry.method === 'release' ? 'release' : entry.method === 'local' ? 'local' : 'submodule',
				path: typeof entry.path === 'string' ? entry.path : undefined,
				ref: typeof entry.ref === 'string' ? entry.ref : undefined,
				branch: typeof entry.branch === 'string' ? entry.branch : undefined,
				locked: typeof entry.locked === 'boolean' ? entry.locked : undefined,
				versionKind: entry.versionKind === 'branch' || entry.versionKind === 'commit' || entry.versionKind === 'tag' || entry.versionKind === 'release'
					? entry.versionKind
					: undefined,
				versionRef: typeof entry.versionRef === 'string' ? entry.versionRef : undefined,
				releaseName: typeof entry.releaseName === 'string' ? entry.releaseName : undefined,
				labviewVersion: typeof entry.labviewVersion === 'string' ? entry.labviewVersion : undefined,
			});
		}
	}

	return { version, root, modules, needsLockedMigration };
}

export function parseLegacyConfig(raw: string): ParsedConfigShape {
	const modules: Record<string, LocalModuleConfigEntry> = {};
	let currentSection = '';
	let root: string | undefined;
	let version: string | undefined;
	let currentModule: Partial<LocalModuleConfigEntry> | undefined;

	for (const rawLine of raw.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || line.startsWith(';')) {
			continue;
		}
		const sectionMatch = line.match(/^\[(.+)\]$/);
		if (sectionMatch) {
			if (currentModule?.key) {
				modules[currentModule.key] = finalizeModuleSection(currentModule);
			}
			currentSection = sectionMatch[1] ?? '';
			currentModule = currentSection.startsWith('module.') ? { key: currentSection.slice('module.'.length) } : undefined;
			continue;
		}

		const separator = line.indexOf('=');
		if (separator <= 0) {
			continue;
		}
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();

		if (currentSection === SECTION_ROOT) {
			if (key === 'root') {
				root = value;
			} else if (key === 'version') {
				version = value;
			}
			continue;
		}

		if (currentModule) {
			(currentModule as Record<string, string>)[key] = value;
		}
	}

	if (currentModule?.key) {
		modules[currentModule.key] = finalizeModuleSection(currentModule);
	}

	return { version, root, modules };
}

// ---------------------------------------------------------------------------
// 配置迁移（插件版本写入 version 字段，加载时静默升级旧配置）
// ---------------------------------------------------------------------------

/** 一次配置迁移步骤：从旧版本升级到当前版本时执行。 */
export interface ConfigMigrationStep {
	/** 步骤名（日志 / 测试标识用） */
	name: string;
	/** 判断该步骤是否适用于从 oldVersion 升级 */
	appliesTo(oldVersion: string | undefined): boolean;
	/** 就地迁移 config（迁移完成后统一写回） */
	migrate(config: LocalModuleConfig): void | Promise<void>;
}

/** 解析配置 schema 版本号为非负整数；非纯数字（缺失 / 旧插件版本 / 损坏）返回 undefined。 */
function parseSchemaVersion(value: string): number | undefined {
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) {
		return undefined;
	}
	return Number(trimmed);
}

/**
 * 判断从 oldVersion 升级到 currentVersion 是否需要迁移（issue #94）：
 * 缺失版本、无法解析为整数的旧版本（旧插件版本如 "0.0.26"）、低于当前 schema 版本均需要。
 * 同版本或更高版本（如手写的未来版本）不需要，避免改写文件。
 */
export function shouldMigrateConfig(oldVersion: string | undefined, currentVersion: string): boolean {
	const current = parseSchemaVersion(currentVersion);
	if (current === undefined) {
		return false;
	}
	if (oldVersion === undefined || oldVersion.trim() === '') {
		return true;
	}
	const old = parseSchemaVersion(oldVersion);
	return old === undefined || old < current;
}

/**
 * 默认迁移步骤列表：配置 schema 版本递增时在数组尾部追加步骤即可（issue #94）。
 * 设计新配置时尽量向前兼容（通过迁移步骤保留旧数据）；若某一步骤抛错（无法兼容），
 * loadConfig 会自动备份旧文件并重建为新版本配置。
 */
export const DEFAULT_CONFIG_MIGRATIONS: ConfigMigrationStep[] = [
	{
		name: 'normalize-module-entries',
		// 所有旧版本都执行：补齐后续新增字段的默认值（locked / versionKind 等）
		appliesTo: () => true,
		migrate: (config) => {
			for (const [key, module] of Object.entries(config.modules)) {
				config.modules[key] = finalizeModuleSection(module);
			}
		},
	},
];

/**
 * 按序执行适用的迁移步骤，并把 config.version 更新为当前 schema 版本。
 * 返回已执行步骤名列表。
 */
export async function runConfigMigrations(
	config: LocalModuleConfig,
	oldVersion: string | undefined,
	currentVersion: string,
	steps: ConfigMigrationStep[] = DEFAULT_CONFIG_MIGRATIONS,
): Promise<string[]> {
	const executed: string[] = [];
	for (const step of steps) {
		if (!step.appliesTo(oldVersion)) {
			continue;
		}
		await step.migrate(config);
		executed.push(step.name);
	}
	config.version = currentVersion;
	return executed;
}

// ---------------------------------------------------------------------------
// 配置加载结果（迁移 / 重建）上报
// ---------------------------------------------------------------------------

/** 配置加载时迁移 / 重建的结果信息（供调用方记录日志与提示用户）。 */
export interface ConfigMigrationOutcome {
	/** 是否执行了迁移步骤（向前兼容） */
	migrated: boolean;
	/** 是否因旧配置无法兼容而自动重建（备份旧文件 + 生成空配置） */
	rebuilt: boolean;
	/** 迁移前的旧版本（可能缺失） */
	oldVersion?: string;
	/** 已执行的迁移步骤名列表 */
	executedSteps: string[];
	/** 重建时的备份文件路径（rebuilt=true 时存在） */
	backupPath?: string;
}

/** 生成旧配置备份路径：`<configPath>.bak-<oldVersion>-<timestamp>`。 */
export function buildConfigBackupPath(configPath: string, oldVersion: string | undefined, timestamp = Date.now()): string {
	const suffix = (oldVersion?.trim() || 'unknown').replace(/[^\w.-]/g, '_');
	return `${configPath}.bak-${suffix}-${timestamp}`;
}

async function backupConfigFile(configPath: string, oldVersion: string | undefined): Promise<string> {
	const backupPath = buildConfigBackupPath(configPath, oldVersion);
	await fs.copyFile(configPath, backupPath);
	return backupPath;
}

/** 旧配置无法兼容时：保留 root，重建为空配置（modules 清空，旧数据见备份文件）。 */
function rebuildConfig(original: LocalModuleConfig, currentVersion: string): LocalModuleConfig {
	return {
		version: currentVersion,
		root: original.root,
		configPath: original.configPath,
		modules: {},
	};
}

// ---------------------------------------------------------------------------
// File I/O functions (stateless — depend only on the filesystem)
// ---------------------------------------------------------------------------

/**
 * Create a new config file on disk and return the in-memory config object.
 * `currentVersion`（配置 schema 版本）写入 `version` 字段，供后续加载时判断是否需要迁移。
 */
export async function initializeConfig(repoRoot: string, rootRelativePath: string, currentVersion: string = CONFIG_VERSION): Promise<LocalModuleConfig> {
	const root = normalizeRootPath(rootRelativePath);
	const configPath = getConfigPath(repoRoot, root);
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	const config: LocalModuleConfig = {
		version: currentVersion,
		root,
		configPath,
		modules: {},
	};
	await writeConfig(config);
	return config;
}

/**
 * Read and parse a config file from disk, returning the in-memory config object.
 * 加载时比较配置 schema 版本（issue #94）：旧版本（缺失 / 旧插件版本 / 低于当前 schema 版本）
 * 自动执行迁移步骤并写回当前版本；若迁移步骤失败（旧配置无法兼容），备份旧文件并自动重建为
 * 新版本的空配置。`onMigration` 可选回调上报迁移 / 重建结果，供调用方记录日志与提示用户。
 */
export async function loadConfig(
	repoRoot: string,
	configPath: string,
	currentVersion: string = CONFIG_VERSION,
	onMigration?: (outcome: ConfigMigrationOutcome) => void,
	steps: ConfigMigrationStep[] = DEFAULT_CONFIG_MIGRATIONS,
): Promise<LocalModuleConfig> {
	const raw = await fs.readFile(configPath, 'utf8');
	const parsed = isLegacyConfigPath(configPath) ? parseLegacyConfig(raw) : parseYamlConfig(raw);
	const derivedRoot = toPosixPath(path.relative(repoRoot, path.dirname(configPath)));
	const root = parsed.root ? normalizeRootPath(parsed.root) : normalizeRootPath(derivedRoot || DEFAULT_LOCAL_MODULE_ROOT);
	const config: LocalModuleConfig = {
		version: parsed.version ?? CONFIG_VERSION,
		root,
		configPath: getConfigPath(repoRoot, root),
		modules: parsed.modules,
	};
	const needsMigration = shouldMigrateConfig(parsed.version, currentVersion);
	if (needsMigration) {
		try {
			const executedSteps = await runConfigMigrations(config, parsed.version, currentVersion, steps);
			await writeConfig(config);
			onMigration?.({ migrated: true, rebuilt: false, oldVersion: parsed.version, executedSteps });
		} catch (error) {
			// 旧配置无法兼容（迁移步骤失败）：备份旧文件并自动重建到当前 schema 版本。
			const backupPath = await backupConfigFile(configPath, parsed.version);
			const rebuilt = rebuildConfig(config, currentVersion);
			await writeConfig(rebuilt);
			onMigration?.({ migrated: false, rebuilt: true, oldVersion: parsed.version, executedSteps: [], backupPath });
			return rebuilt;
		}
	} else if (parsed.needsLockedMigration) {
		await writeConfig(config);
	}
	return config;
}

/**
 * Serialize the config object and write it to disk at `config.configPath`.
 */
export async function writeConfig(config: LocalModuleConfig): Promise<void> {
	await fs.mkdir(path.dirname(config.configPath), { recursive: true });
	await fs.writeFile(config.configPath, serializeConfig(config), 'utf8');
}

// ---------------------------------------------------------------------------
// In-memory config mutations (pure, no I/O)
// ---------------------------------------------------------------------------

/**
 * Add (or replace) a module entry in the config's modules map.
 * Returns a new config object — does not mutate or persist.
 */
export function withAppliedModule(config: LocalModuleConfig, entry: LocalModuleConfigEntry): LocalModuleConfig {
	const normalizedEntry: LocalModuleConfigEntry = {
		...entry,
		locked: isEntryLocked(entry),
	};
	return {
		...config,
		modules: {
			...config.modules,
			[normalizedEntry.key]: normalizedEntry,
		},
	};
}

/**
 * Remove a module entry from the config's modules map by key.
 * Returns a new config object — does not mutate or persist.
 */
export function withoutModule(config: LocalModuleConfig, moduleKey: string): LocalModuleConfig {
	const { [moduleKey]: _omitted, ...rest } = config.modules;
	return { ...config, modules: rest };
}
