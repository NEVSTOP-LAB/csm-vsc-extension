import * as assert from 'assert';
import {
    DEFAULT_MODULE_SORT_STATE,
    isModuleSortField,
    isModuleSortDirection,
    normalizeModuleSortState,
    sortModules,
} from '../moduleManager/sort';
import type { CsmModuleEntry } from '../moduleManager/types';
import type { ModuleSortField, ModuleSortDirection } from '../moduleManager/interfaces';

function makeModule(overrides: Partial<CsmModuleEntry> = {}): CsmModuleEntry {
    return {
        id: overrides.id ?? 1,
        owner: overrides.owner ?? 'test-owner',
        name: overrides.name ?? 'test-module',
        description: overrides.description ?? '',
        topics: overrides.topics ?? [],
        visibility: overrides.visibility ?? 'public',
        defaultBranch: overrides.defaultBranch ?? 'main',
        repoUrl: overrides.repoUrl ?? 'https://github.com/test-owner/test-module',
        updatedAt: overrides.updatedAt,
        starred: overrides.starred,
        readme: overrides.readme,
    };
}

suite('sort — 类型守卫', () => {

    test('isModuleSortField 识别有效字段', () => {
        assert.strictEqual(isModuleSortField('name'), true);
        assert.strictEqual(isModuleSortField('owner'), true);
        assert.strictEqual(isModuleSortField('updatedAt'), true);
        assert.strictEqual(isModuleSortField('applied'), true);
    });

    test('isModuleSortField 拒绝无效字段', () => {
        assert.strictEqual(isModuleSortField('invalid'), false);
        assert.strictEqual(isModuleSortField(123), false);
        assert.strictEqual(isModuleSortField(undefined), false);
        assert.strictEqual(isModuleSortField(null), false);
    });

    test('isModuleSortDirection 识别有效方向', () => {
        assert.strictEqual(isModuleSortDirection('asc'), true);
        assert.strictEqual(isModuleSortDirection('desc'), true);
    });

    test('isModuleSortDirection 拒绝无效方向', () => {
        assert.strictEqual(isModuleSortDirection('up'), false);
        assert.strictEqual(isModuleSortDirection(''), false);
        assert.strictEqual(isModuleSortDirection(undefined), false);
    });
});

suite('sort — normalizeModuleSortState', () => {

    test('undefined 返回默认值', () => {
        const result = normalizeModuleSortState(undefined);
        assert.deepStrictEqual(result, DEFAULT_MODULE_SORT_STATE);
    });

    test('空对象返回默认值', () => {
        const result = normalizeModuleSortState({});
        assert.deepStrictEqual(result, DEFAULT_MODULE_SORT_STATE);
    });

    test('无效字段回退到默认值', () => {
        const result = normalizeModuleSortState({ field: 'invalid' as ModuleSortField, direction: 'asc' });
        assert.strictEqual(result.field, 'name');
        assert.strictEqual(result.direction, 'asc');
    });

    test('无效方向回退到默认值', () => {
        const result = normalizeModuleSortState({ field: 'name', direction: 'up' as ModuleSortDirection });
        assert.strictEqual(result.field, 'name');
        assert.strictEqual(result.direction, 'asc');
    });

    test('有效输入正常返回', () => {
        const result = normalizeModuleSortState({ field: 'owner', direction: 'desc' });
        assert.strictEqual(result.field, 'owner');
        assert.strictEqual(result.direction, 'desc');
    });
});

suite('sort — sortModules', () => {

    const modules: CsmModuleEntry[] = [
        makeModule({ name: 'ccc', owner: 'org-b', updatedAt: '2024-01-01T00:00:00Z' }),
        makeModule({ name: 'aaa', owner: 'org-a', updatedAt: '2025-01-01T00:00:00Z' }),
        makeModule({ name: 'bbb', owner: 'org-c', updatedAt: '2023-01-01T00:00:00Z' }),
    ];

    test('按名称升序排列', () => {
        const result = sortModules(modules, { field: 'name', direction: 'asc' });
        assert.strictEqual(result[0].name, 'aaa');
        assert.strictEqual(result[1].name, 'bbb');
        assert.strictEqual(result[2].name, 'ccc');
    });

    test('按名称降序排列', () => {
        const result = sortModules(modules, { field: 'name', direction: 'desc' });
        assert.strictEqual(result[0].name, 'ccc');
        assert.strictEqual(result[1].name, 'bbb');
        assert.strictEqual(result[2].name, 'aaa');
    });

    test('按 owner 升序排列', () => {
        const result = sortModules(modules, { field: 'owner', direction: 'asc' });
        assert.strictEqual(result[0].owner, 'org-a');
        assert.strictEqual(result[1].owner, 'org-b');
        assert.strictEqual(result[2].owner, 'org-c');
    });

    test('按更新时间降序排列', () => {
        const result = sortModules(modules, { field: 'updatedAt', direction: 'desc' });
        assert.strictEqual(result[0].name, 'aaa');  // 2025
        assert.strictEqual(result[1].name, 'ccc');  // 2024
        assert.strictEqual(result[2].name, 'bbb');  // 2023
    });

    test('缺少 updatedAt 的模块排在最后', () => {
        const withMissing = [
            ...modules,
            makeModule({ name: 'zzz', updatedAt: undefined }),
        ];
        const result = sortModules(withMissing, { field: 'updatedAt', direction: 'asc' });
        assert.strictEqual(result[result.length - 1].name, 'zzz');
    });

    test('按 applied 排列', () => {
        const appliedKeys = new Set(['org-a/aaa']);
        const result = sortModules(modules, { field: 'applied', direction: 'desc' }, { appliedModuleKeys: appliedKeys });
        assert.strictEqual(result[0].name, 'aaa');  // applied first
    });

    test('undefined sortState 使用默认排序', () => {
        const result = sortModules(modules, undefined);
        assert.strictEqual(result[0].name, 'aaa');
        assert.strictEqual(result[1].name, 'bbb');
        assert.strictEqual(result[2].name, 'ccc');
    });
});
