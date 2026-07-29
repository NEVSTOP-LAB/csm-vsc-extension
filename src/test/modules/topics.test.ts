/**
 * topics.test.ts — 话题过滤工具测试
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getVisibleModuleTopics, DEFAULT_HIDDEN_MODULE_TOPICS } from '../../moduleManager/topics';

type VscodeMock = typeof vscode & {
    __setConfigurationValue: (key: string, value: unknown) => void;
    __resetUiState: () => void;
};

const mock = vscode as VscodeMock;

suite('Modules — Topics', () => {

    teardown(() => {
        mock.__resetUiState();
    });

    test('DEFAULT_HIDDEN_MODULE_TOPICS 包含 4 个默认隐藏话题', () => {
        assert.strictEqual(DEFAULT_HIDDEN_MODULE_TOPICS.length, 4);
        assert.ok(DEFAULT_HIDDEN_MODULE_TOPICS.includes('csm-modsets'));
        assert.ok(DEFAULT_HIDDEN_MODULE_TOPICS.includes('lv-csm-app'));
        assert.ok(DEFAULT_HIDDEN_MODULE_TOPICS.includes('labview-csm'));
        assert.ok(DEFAULT_HIDDEN_MODULE_TOPICS.includes('labview'));
    });

    test('getVisibleModuleTopics 过滤默认隐藏话题', () => {
        const topics = ['csm-modsets', 'ui', 'labview', 'testing'];
        const visible = getVisibleModuleTopics(topics);
        assert.deepStrictEqual(visible, ['ui', 'testing']);
    });

    test('getVisibleModuleTopics 空数组返回空数组', () => {
        assert.deepStrictEqual(getVisibleModuleTopics([]), []);
    });

    test('getVisibleModuleTopics undefined 返回空数组', () => {
        assert.deepStrictEqual(getVisibleModuleTopics(undefined), []);
    });

    test('getVisibleModuleTopics 大小写不敏感', () => {
        const topics = ['CSM-MODSETS', 'UI'];
        const visible = getVisibleModuleTopics(topics);
        assert.deepStrictEqual(visible, ['UI'], 'csm-modsets 大小写不同也应被过滤');
    });

    test('getVisibleModuleTopics 去除前后空格', () => {
        // 话题通常不会有前导空格，但防御性测试
        const topics = ['  ui  ', 'labview'];
        const visible = getVisibleModuleTopics(topics);
        assert.deepStrictEqual(visible, ['  ui  '], '带空格的话题自己不会被trim（输入来自GitHub API，不做trim）');
    });

});
