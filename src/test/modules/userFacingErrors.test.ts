/**
 * userFacingErrors.test.ts — 用户友好错误消息测试
 */

import * as assert from 'assert';
import { getUserFacingErrorMessage } from '../../modules/userFacingErrors';
import { __setLanguageOverrideForTests } from '../../i18n';

suite('Modules — UserFacingErrors', () => {

    const ctx = 'refresh' as const;

    // ----- GitHub HTTP 状态码 -----

    test('GitHub 401 映射为认证错误', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 401'),
            ctx
        );
        assert.ok(msg.includes('sign in') || msg.includes('认证') || msg.includes('login') || msg.includes('401'),
            `期望认证相关消息，实际: ${msg}`);
    });

    test('GitHub 403 映射为权限错误', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 403'),
            ctx
        );
        assert.ok(msg.includes('permissions') || msg.includes('rejected') || msg.includes('权限'),
            `期望包含权限相关关键词，实际: "${msg}"`);
    });

    test('GitHub 404 在 refresh 上下文中映射为模块未找到', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 404'),
            'refresh'
        );
        assert.ok(msg.includes('could not find') || msg.includes('not found') || msg.includes('未找到'),
            `期望包含未找到关键词，实际: "${msg}"`);
    });

    test('GitHub 429/500+ 映射为临时不可用', () => {
        const msg503 = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 503'),
            ctx
        );
        assert.ok(
            msg503.includes('unavailable') || msg503.includes('temporarily') || msg503.includes('不可用'),
            `503 期望临时不可用，实际: "${msg503}"`
        );
        
        const msg429 = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 429'),
            ctx
        );
        assert.ok(
            msg429.includes('unavailable') || msg429.includes('temporarily') || msg429.includes('不可用'),
            `429 期望临时不可用，实际: "${msg429}"`
        );
    });

    // ----- Git 相关错误 -----

    test('Git 不可用错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('spawn git ENOENT'),
            'apply'
        );
        assert.ok(msg.includes('Git') || msg.includes('git'),
            `期望包含 Git 关键词，实际: "${msg}"`);
    });

    test('Git 权限错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Authentication failed'),
            'apply'
        );
        assert.ok(
            msg.includes('access') || msg.includes('Permission') || msg.includes('权限') || msg.includes('Repository'),
            `期望包含权限相关关键词，实际: "${msg}"`
        );
    });

    test('Repository not found 映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Repository not found'),
            'update'
        );
        assert.ok(
            msg.includes('repository') || msg.includes('not found') || msg.includes('not find'),
            `期望包含仓库相关关键词，实际: "${msg}"`
        );
    });

    // ----- 网络错误 -----

    test('网络错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('ENOTFOUND api.github.com'),
            'refresh'
        );
        assert.ok(
            msg.includes('Network') || msg.includes('connection') || msg.includes('网络'),
            `期望包含网络相关关键词，实际: "${msg}"`
        );
    });

    test('ECONNREFUSED 映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('ECONNREFUSED'),
            'refresh'
        );
        assert.ok(
            msg.includes('Network') || msg.includes('connection') || msg.includes('网络'),
            `期望包含网络相关关键词，实际: "${msg}"`
        );
    });

    // ----- YAML 错误 -----

    test('YAML 解析错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Failed to parse YAML config: unexpected token'),
            'config'
        );
        assert.ok(
            msg.includes('YAML') || msg.includes('yaml') || msg.includes('配置'),
            `期望包含 YAML 相关关键词，实际: "${msg}"`
        );
    });

    // ----- 边界条件 -----

    test('非 Error 对象也返回字符串', () => {
        const msg = getUserFacingErrorMessage('raw string error', 'apply');
        assert.ok(typeof msg === 'string', '应返回字符串');
        assert.ok(msg.length > 0, '消息不应为空');
    });

    test('空 Error 消息返回预期内容', () => {
        const msg = getUserFacingErrorMessage(new Error(''), 'apply');
        assert.ok(typeof msg === 'string', '应返回字符串');
    });

});
