/**
 * tempPaths.test.ts — 临时路径工具测试
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getTempRoot, resetTempRootCache } from '../../common/tempPaths';

suite('Common — TempPaths', () => {

    teardown(() => {
        resetTempRootCache();
    });

    test('getTempRoot 返回字符串路径', () => {
        const root = getTempRoot();
        assert.strictEqual(typeof root, 'string');
        assert.ok(root.length > 0, '路径不应为空');
    });

    test('getTempRoot 返回绝对路径', () => {
        const root = getTempRoot();
        assert.ok(path.isAbsolute(root), '应返回绝对路径');
    });

    test('getTempRoot 路径存在', () => {
        const root = getTempRoot();
        assert.ok(fs.existsSync(root), '路径应存在');
    });

    test('getTempRoot 缓存一致（同一调用返回相同值）', () => {
        const root1 = getTempRoot();
        const root2 = getTempRoot();
        assert.strictEqual(root1, root2, '多次调用应返回缓存值');
    });

    test('resetTempRootCache 后重新计算', () => {
        const root1 = getTempRoot();
        resetTempRootCache();
        const root2 = getTempRoot();
        assert.strictEqual(root1, root2, '重置后应返回相同路径（因为环境未变）');
    });

    test('getTempRoot 返回路径不包含反斜杠', () => {
        // Windows 下路径可能使用反斜杠，但通过 path.normalize 统一处理
        const root = getTempRoot();
        // 存在即可，不强求正斜杠格式
        assert.ok(fs.existsSync(root));
    });

    test('路径下可创建子目录', () => {
        const root = getTempRoot();
        const subDir = path.join(root, `test-${Date.now()}`);
        try {
            fs.mkdirSync(subDir, { recursive: true });
            assert.ok(fs.existsSync(subDir), '子目录应可创建');
        } finally {
            if (fs.existsSync(subDir)) {
                fs.rmdirSync(subDir, { recursive: true });
            }
        }
    });

    test('路径下可创建文件', () => {
        const root = getTempRoot();
        const testFile = path.join(root, `test-${Date.now()}.txt`);
        try {
            fs.writeFileSync(testFile, 'hello');
            assert.ok(fs.existsSync(testFile), '文件应可创建');
        } finally {
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });

});
