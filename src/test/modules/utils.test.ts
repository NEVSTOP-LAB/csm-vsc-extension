/**
 * utils.test.ts — 模块管理器工具函数测试
 */

import * as assert from 'assert';
import { getModuleKey, truncate } from '../../modules/utils';
import type { CsmModuleEntry } from '../../modules/types';

/** 创建最小测试用的 CsmModuleEntry */
function makeEntry(owner: string, name: string): CsmModuleEntry {
    return {
        id: 1,
        owner,
        name,
        description: '',
        defaultBranch: 'main',
        repoUrl: `https://github.com/${owner}/${name}`,
        topics: [],
        visibility: 'public',
    };
}

suite('Modules — Utils', () => {

    // ----- getModuleKey -----

    test('getModuleKey 返回 "owner/name" 格式', () => {
        const entry = makeEntry('nevstop', 'csm-core');
        assert.strictEqual(getModuleKey(entry), 'nevstop/csm-core');
    });

    test('getModuleKey 处理不同的 owner 和 name', () => {
        const entry = makeEntry('github', 'actions-runner');
        assert.strictEqual(getModuleKey(entry), 'github/actions-runner');
    });

    test('相同 owner+name 产生相同 key', () => {
        const a = makeEntry('foo', 'bar');
        const b = makeEntry('foo', 'bar');
        assert.strictEqual(getModuleKey(a), getModuleKey(b));
    });

    test('不同 owner+name 产生不同 key', () => {
        const a = makeEntry('foo', 'bar');
        const b = makeEntry('baz', 'qux');
        assert.notStrictEqual(getModuleKey(a), getModuleKey(b));
    });

    // ----- truncate -----

    test('truncate 短文本不变', () => {
        assert.strictEqual(truncate('hello', 10), 'hello');
    });

    test('truncate 精确长度文本不变', () => {
        assert.strictEqual(truncate('hello', 5), 'hello');
    });

    test('truncate 超出长度截断并加 ...', () => {
        assert.strictEqual(truncate('hello world', 8), 'hello...');
    });

    test('truncate 空字符串', () => {
        assert.strictEqual(truncate('', 5), '');
    });

    test('truncate maxLength 为 0 时使用负索引截断', () => {
        // maxLength=0: text.length(5) > 0 → slice(0, -3) = 'he' → 返回 'he...'
        const result = truncate('hello', 0);
        assert.strictEqual(result, 'he...');
    });

});
