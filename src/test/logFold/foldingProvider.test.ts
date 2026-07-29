/**
 * foldingProvider.test.ts — FoldingRangeProvider 逻辑测试（增强版）
 *
 * 在原有 mock 文档测试基础上，补充实际折叠逻辑测试。
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { CSMLogFoldingRangeProvider } from '../../logFold/foldingProvider';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Mock VS Code 文档，实现 FoldingRangeProvider 所需的接口。 */
interface MockDocument {
    lineAt(index: number): { text: string };
    lineCount: number;
    uri: { toString(): string; fsPath: string };
    version: number;
    getText(): string;
}

function makeDoc(lines: string[], uriStr?: string): MockDocument {
    const uri = uriStr ?? 'file:///test-fold.csmlog';
    return {
        lineAt: (i: number) => ({ text: lines[i] ?? '' }),
        lineCount: lines.length,
        uri: {
            toString: () => uri,
            fsPath: uri.replace('file://', ''),
        },
        version: 1,
        getText: () => lines.join('\n'),
    };
}

/** 最小 FoldingContext mock */
const mockContext: vscode.FoldingContext = {};

/** 最小 CancellationToken mock */
const mockToken: vscode.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
};

type VscodeMock = typeof vscode & {
    __setConfigurationValue: (key: string, value: unknown) => void;
    __resetUiState: () => void;
};

const mock = vscode as VscodeMock;

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

suite('LogFold — FoldingRangeProvider', () => {

    let provider: CSMLogFoldingRangeProvider;

    setup(() => {
        // 设置默认的折叠配置
        mock.__setConfigurationValue('csmlog.folding.minRepeatCount', 3);
        mock.__setConfigurationValue('csmlog.folding.maxBlockLines', 20);
        mock.__setConfigurationValue('csmlog.folding.smartParams', true);
        mock.__setConfigurationValue('csmlog.folding.decorationStyle', 'compact');
        provider = new CSMLogFoldingRangeProvider();
    });

    teardown(() => {
        mock.__resetUiState();
    });

    // ----- Mock 文档基础测试 -----
    
    test('mock 文档构造正确', () => {
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

    // ----- 实际折叠逻辑测试 -----

    test('重复日志行产生折叠区域', async () => {
        const lines: string[] = [];
        // 5 行相同内容（超过 minRepeatCount=3）
        for (let i = 0; i < 5; i++) {
            lines.push(`2025/01/01 00:00:0${i}.000 [State Change] ModuleA | Same message`);
        }
        const doc = makeDoc(lines);
        const ranges = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument,
            mockContext,
            mockToken,
        );
        assert.ok(ranges, '应返回折叠范围');
        assert.ok(Array.isArray(ranges) && ranges.length > 0,
            `应有至少一个折叠区域，实际: ${ranges ? ranges.length : 0}`);
    });

    test('不重复的行不产生折叠区域', async () => {
        const lines: string[] = [
            '2025/01/01 00:00:01.000 [State Change] ModuleA | Message 1',
            '2025/01/01 00:00:02.000 [State Change] ModuleB | Message 2',
            '2025/01/01 00:00:03.000 [State Change] ModuleC | Message 3',
        ];
        const doc = makeDoc(lines);
        const ranges = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument,
            mockContext,
            mockToken,
        );
        // 各行都不相同，应无折叠区
        assert.ok(!ranges || ranges.length === 0,
            `不应有折叠区域，实际: ${ranges ? ranges.length : 0}`);
    });

    test('少于 minRepeatCount 的重复不触发折叠', async () => {
        // 设置 minRepeatCount=5
        mock.__setConfigurationValue('csmlog.folding.minRepeatCount', 5);
        provider = new CSMLogFoldingRangeProvider();

        const lines: string[] = [];
        // 只有 3 行相同
        for (let i = 0; i < 3; i++) {
            lines.push(`2025/01/01 00:00:0${i}.000 [State Change] ModuleA | Same`);
        }
        const doc = makeDoc(lines);
        const ranges = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument,
            mockContext,
            mockToken,
        );
        assert.ok(!ranges || ranges.length === 0,
            `少于阈值不应触发折叠，实际: ${ranges ? ranges.length : 0}`);
    });

    test('折叠区域起止行号正确', async () => {
        const lines: string[] = [];
        // 前2行 + 5行相同 + 后2行
        lines.push('2025/01/01 00:00:01.000 [State Change] A | Start');
        lines.push('2025/01/01 00:00:02.000 [State Change] A | Start');
        for (let i = 0; i < 5; i++) {
            lines.push(`2025/01/01 00:00:0${i + 3}.000 [State Change] B | Repeated`);
        }
        lines.push('2025/01/01 00:00:08.000 [State Change] C | End');
        lines.push('2025/01/01 00:00:09.000 [State Change] C | End');

        const doc = makeDoc(lines);
        const ranges = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument,
            mockContext,
            mockToken,
        );
        assert.ok(ranges && ranges.length > 0, '应有折叠区域');
        if (ranges && ranges.length > 0) {
            const r = ranges[0];
            assert.ok(r.start >= 2, `折叠起始应>=2（第3行开始重复），实际: ${r.start}`);
            assert.ok(r.end >= r.start + 3, `折叠结束应>=起始+3，实际: ${r.start}-${r.end}`);
        }
    });

    test('缓存机制：相同版本使用缓存', async () => {
        const lines: string[] = [];
        for (let i = 0; i < 5; i++) {
            lines.push(`2025/01/01 00:00:0${i}.000 [State Change] A | Same`);
        }
        const doc = makeDoc(lines, 'file:///test-cache.csmlog');

        const ranges1 = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument, mockContext, mockToken,
        );
        const ranges2 = await provider.provideFoldingRanges(
            doc as unknown as vscode.TextDocument, mockContext, mockToken,
        );
        // 两次调用应返回相同结果
        assert.deepStrictEqual(ranges1, ranges2, '缓存应返回相同结果');
    });

});
