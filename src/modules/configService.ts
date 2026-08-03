import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { LocalModuleConfig, LocalModuleConfigEntry } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CONFIG_VERSION = '2';
const SECTION_ROOT = 'csmModules';

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
		method: module.method === 'copy' ? 'copy' : 'submodule',
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
				method: entry.method === 'copy' ? 'copy' : 'submodule',
				path: typeof entry.path === 'string' ? entry.path : undefined,
				ref: typeof entry.ref === 'string' ? entry.ref : undefined,
				branch: typeof entry.branch === 'string' ? entry.branch : undefined,
				locked: typeof entry.locked === 'boolean' ? entry.locked : undefined,
				versionKind: entry.versionKind === 'branch' || entry.versionKind === 'commit' || entry.versionKind === 'tag' || entry.versionKind === 'release'
					? entry.versionKind
					: undefined,
				versionRef: typeof entry.versionRef === 'string' ? entry.versionRef : undefined,
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
// File I/O functions (stateless — depend only on the filesystem)
// ---------------------------------------------------------------------------

/**
 * Create a new config file on disk and return the in-memory config object.
 */
export async function initializeConfig(repoRoot: string, rootRelativePath: string): Promise<LocalModuleConfig> {
	const root = normalizeRootPath(rootRelativePath);
	const configPath = getConfigPath(repoRoot, root);
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	const config: LocalModuleConfig = {
		version: CONFIG_VERSION,
		root,
		configPath,
		modules: {},
	};
	await writeConfig(config);
	return config;
}

/**
 * Read and parse a config file from disk, returning the in-memory config object.
 */
export async function loadConfig(repoRoot: string, configPath: string): Promise<LocalModuleConfig> {
	const raw = await fs.readFile(configPath, 'utf8');
	const parsed = isLegacyConfigPath(configPath) ? parseLegacyConfig(raw) : parseYamlConfig(raw);
	const derivedRoot = toPosixPath(path.relative(repoRoot, path.dirname(configPath)));
	const root = parsed.root ? normalizeRootPath(parsed.root) : normalizeRootPath(derivedRoot || DEFAULT_LOCAL_MODULE_ROOT);
	const config: LocalModuleConfig = {
		version: CONFIG_VERSION,
		root,
		configPath: getConfigPath(repoRoot, root),
		modules: parsed.modules,
	};
	if (parsed.needsLockedMigration) {
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
