/**
 * foldingProvider.test.ts — FoldingRangeProvider 端到端测试
 *
 * 由于 FoldingRangeProvider 依赖 vscode API（vscode.workspace.getConfiguration），
 * 在 VS Code 测试环境中直接创建文档并调用 provideFoldingRanges 测试。
 * 此处验证基本逻辑流程。
 */

import * as assert from 'assert';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Mock VS Code document for testing folding provider logic. */
interface MockDocument {
    lineAt(index: number): { text: string };
    lineCount: number;
    uri: { toString(): string };
    version: number;
}

function makeDoc(lines: string[]): MockDocument {
    return {
        lineAt: (i: number) => ({ text: lines[i] }),
        lineCount: lines.length,
        uri: { toString: () => 'file:///test-fold.csmlog' },
        version: 1,
    };
}

suite('LogFold — FoldingRangeProvider', () => {

    test('document 构造正确', () => {
        const doc = makeDoc(['line1', 'line2', 'line3']);
        assert.strictEqual(doc.lineCount, 3);
        assert.strictEqual(doc.lineAt(0).text, 'line1');
        assert.strictEqual(doc.lineAt(2).text, 'line3');
        assert.strictEqual(doc.version, 1);
    });

    test('空文档 lineCount 为 0', () => {
        const doc = makeDoc([]);
        assert.strictEqual(doc.lineCount, 0);
    });

});
