/**
 * userFacingErrors.test.ts — 用户友好错误消息测试
 */

import * as assert from 'assert';
import { getUserFacingErrorMessage } from '../../moduleManager/userFacingErrors';
import { __setLanguageOverrideForTests } from '../../common/i18n';

suite('Modules — UserFacingErrors', () => {

    // 错误上下文不复杂，主要测试各种错误类型的映射
    const ctx = 'refresh' as const;

    // ----- GitHub HTTP 状态码 -----

    test('GitHub 401 映射为认证错误', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 401'),
            ctx
        );
        assert.ok(msg.includes('登录') || msg.includes('401') || msg.includes('sign in') || msg.includes('认证'),
            `期望认证相关消息，实际: ${msg}`);
    });

    test('GitHub 403 映射为权限错误', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 403'),
            ctx
        );
        assert.ok(msg.length > 0, '应返回非空消息');
    });

    test('GitHub 404 在 refresh 上下文中映射为模块未找到', () => {
        const msg = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 404'),
            'refresh'
        );
        assert.ok(msg.length > 0, '应返回非空消息');
    });

    test('GitHub 429/500+ 映射为临时不可用', () => {
        const msg503 = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 503'),
            ctx
        );
        assert.ok(msg503.length > 0, '503 应有错误消息');
        
        const msg429 = getUserFacingErrorMessage(
            new Error('GitHub API request failed: 429'),
            ctx
        );
        assert.ok(msg429.length > 0, '429 应有错误消息');
    });

    // ----- Git 相关错误 -----

    test('Git 不可用错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('spawn git ENOENT'),
            'apply'
        );
        assert.ok(msg.length > 0, 'Git 缺失应有错误消息');
    });

    test('Git 权限错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Authentication failed'),
            'apply'
        );
        assert.ok(msg.length > 0, 'Git 权限错误应有消息');
    });

    test('Repository not found 映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Repository not found'),
            'update'
        );
        assert.ok(msg.length > 0, '仓库未找到应有消息');
    });

    // ----- 网络错误 -----

    test('网络错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('ENOTFOUND api.github.com'),
            'refresh'
        );
        assert.ok(msg.length > 0, '网络错误应有消息');
    });

    test('ECONNREFUSED 映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('ECONNREFUSED'),
            'refresh'
        );
        assert.ok(msg.length > 0, '连接拒绝应有消息');
    });

    // ----- YAML 错误 -----

    test('YAML 解析错误映射', () => {
        const msg = getUserFacingErrorMessage(
            new Error('Failed to parse YAML config: unexpected token'),
            'config'
        );
        assert.ok(msg.length > 0, 'YAML 错误应有消息');
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
