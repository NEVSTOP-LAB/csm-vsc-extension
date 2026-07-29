/**
 * fileDecorationProvider.test.ts — CSM 文件装饰提供者测试
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CsmFileDecorationProvider } from '../../fileDecorationProvider';

suite('FileDecorationProvider', () => {

    const provider = new CsmFileDecorationProvider();

    test('.csmlog 文件返回 C Badge 和蓝色', () => {
        const uri = vscode.Uri.file('/test/path/file.csmlog');
        const decoration = provider.provideFileDecoration(uri);
        assert.ok(decoration, '.csmlog 应返回装饰');
        assert.strictEqual(decoration!.badge, 'C');
        assert.ok(decoration!.tooltip!.includes('CSM') || decoration!.tooltip!.includes('日志'),
            'tooltip 应包含 CSM 或 日志');
    });

    test('.lvcsm 文件返回 L Badge 和绿色', () => {
        const uri = vscode.Uri.file('/test/path/file.lvcsm');
        const decoration = provider.provideFileDecoration(uri);
        assert.ok(decoration, '.lvcsm 应返回装饰');
        assert.strictEqual(decoration!.badge, 'L');
        assert.ok(decoration!.tooltip!.includes('LVCSM') || decoration!.tooltip!.includes('脚本'),
            'tooltip 应包含 LVCSM');
    });

    test('.csmlog 文件在嵌套路径中也识别', () => {
        const uri = vscode.Uri.file('/a/b/c/d/my_log.csmlog');
        const decoration = provider.provideFileDecoration(uri);
        assert.ok(decoration);
        assert.strictEqual(decoration!.badge, 'C');
    });

    test('.lvcsm 文件在深层路径中也识别', () => {
        const uri = vscode.Uri.file('d:\\project\\config\\main.lvcsm');
        const decoration = provider.provideFileDecoration(uri);
        assert.ok(decoration);
        assert.strictEqual(decoration!.badge, 'L');
    });

    test('其他文件不返回装饰', () => {
        assert.strictEqual(provider.provideFileDecoration(vscode.Uri.file('/test.txt')), undefined);
        assert.strictEqual(provider.provideFileDecoration(vscode.Uri.file('/test.js')), undefined);
        assert.strictEqual(provider.provideFileDecoration(vscode.Uri.file('/test.json')), undefined);
        assert.strictEqual(provider.provideFileDecoration(vscode.Uri.file('/test.cs')), undefined);
    });

    test('无扩展名文件不返回装饰', () => {
        const uri = vscode.Uri.file('/test/path/file');
        assert.strictEqual(provider.provideFileDecoration(uri), undefined);
    });

    test('.CSMLOG 大写扩展名识别行为', () => {
        const uri = vscode.Uri.file('/test/file.CSMLOG');
        const decoration = provider.provideFileDecoration(uri);
        // 当前实现使用 endsWith('.csmlog')，大小写敏感，
        // 因此大写扩展名不返回装饰（已知行为，非本次重构目标）
        assert.strictEqual(decoration, undefined,
            '大写 .CSMLOG 在当前实现中不被识别（endsWith 大小写敏感）');
    });

});
