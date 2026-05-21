import { ModuleSortDirection, ModuleSortField, ModuleSortState } from './interfaces';
import { CsmModuleEntry } from './types';

export const MODULE_SORT_FIELDS: readonly ModuleSortField[] = ['name', 'owner', 'updatedAt', 'applied'];
export const MODULE_SORT_DIRECTIONS: readonly ModuleSortDirection[] = ['asc', 'desc'];
export const DEFAULT_MODULE_SORT_STATE: ModuleSortState = {
	field: 'name',
	direction: 'asc',
};

const EMPTY_APPLIED_KEYS = new Set<string>();

export function isModuleSortField(value: unknown): value is ModuleSortField {
	return typeof value === 'string' && MODULE_SORT_FIELDS.includes(value as ModuleSortField);
}

export function isModuleSortDirection(value: unknown): value is ModuleSortDirection {
	return typeof value === 'string' && MODULE_SORT_DIRECTIONS.includes(value as ModuleSortDirection);
}

export function normalizeModuleSortState(sortState?: Partial<ModuleSortState>): ModuleSortState {
	return {
		field: isModuleSortField(sortState?.field) ? sortState.field : DEFAULT_MODULE_SORT_STATE.field,
		direction: isModuleSortDirection(sortState?.direction) ? sortState.direction : DEFAULT_MODULE_SORT_STATE.direction,
	};
}

export function sortModules(
	modules: CsmModuleEntry[],
	sortState: Partial<ModuleSortState> | undefined,
	options: {
		appliedModuleKeys?: ReadonlySet<string> | string[];
	} = {},
): CsmModuleEntry[] {
	const normalizedState = normalizeModuleSortState(sortState);
	const appliedModuleKeys = normalizeAppliedModuleKeys(options.appliedModuleKeys);
	return [...modules].sort((left, right) => compareModules(left, right, normalizedState, appliedModuleKeys));
}

function normalizeAppliedModuleKeys(appliedModuleKeys?: ReadonlySet<string> | string[]): ReadonlySet<string> {
	if (!appliedModuleKeys) {
		return EMPTY_APPLIED_KEYS;
	}
	return appliedModuleKeys instanceof Set ? appliedModuleKeys : new Set(appliedModuleKeys);
}

function compareModules(
	left: CsmModuleEntry,
	right: CsmModuleEntry,
	sortState: ModuleSortState,
	appliedModuleKeys: ReadonlySet<string>,
): number {
	switch (sortState.field) {
		case 'owner': {
			const ownerCompare = applyDirection(left.owner.localeCompare(right.owner), sortState.direction);
			return ownerCompare !== 0 ? ownerCompare : compareIdentity(left, right);
		}
		case 'updatedAt': {
			const updatedAtCompare = compareUpdatedAt(left.updatedAt, right.updatedAt, sortState.direction);
			return updatedAtCompare !== 0 ? updatedAtCompare : compareIdentity(left, right);
		}
		case 'applied': {
			const leftApplied = appliedModuleKeys.has(getModuleKey(left)) ? 1 : 0;
			const rightApplied = appliedModuleKeys.has(getModuleKey(right)) ? 1 : 0;
			const appliedCompare = applyDirection(leftApplied - rightApplied, sortState.direction);
			return appliedCompare !== 0 ? appliedCompare : compareIdentity(left, right);
		}
		case 'name':
		default: {
			const nameCompare = applyDirection(left.name.localeCompare(right.name), sortState.direction);
			return nameCompare !== 0 ? nameCompare : left.owner.localeCompare(right.owner);
		}
	}
}

function compareUpdatedAt(
	leftUpdatedAt: string | undefined,
	rightUpdatedAt: string | undefined,
	direction: ModuleSortDirection,
): number {
	const leftTime = parseTimestamp(leftUpdatedAt);
	const rightTime = parseTimestamp(rightUpdatedAt);
	if (leftTime === undefined && rightTime === undefined) {
		return 0;
	}
	if (leftTime === undefined) {
		return 1;
	}
	if (rightTime === undefined) {
		return -1;
	}
	if (leftTime === rightTime) {
		return 0;
	}
	return direction === 'desc' ? rightTime - leftTime : leftTime - rightTime;
}

function parseTimestamp(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compareIdentity(left: CsmModuleEntry, right: CsmModuleEntry): number {
	const nameCompare = left.name.localeCompare(right.name);
	if (nameCompare !== 0) {
		return nameCompare;
	}
	return left.owner.localeCompare(right.owner);
}

function applyDirection(compareResult: number, direction: ModuleSortDirection): number {
	return direction === 'desc' ? -compareResult : compareResult;
}

function getModuleKey(entry: CsmModuleEntry): string {
	return `${entry.owner}/${entry.name}`;
}