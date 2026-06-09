/**
 * csmlogFoldingRangeProvider.test.ts
 *
 * Unit tests for CSMLogFoldingRangeProvider.
 * Runs standalone with vscode-mock (setup.ts intercepts require('vscode')).
 */

import * as assert from 'assert';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Doc stub matching the provider's expected interface
// ---------------------------------------------------------------------------

interface DocLike {
    lineCount: number;
    lineAt(i: number): { text: string };
}

interface RangeLike {
    start: number;
    end: number;
    kind?: number;
}

function makeDoc(lines: string[]): DocLike {
    return {
        lineCount: lines.length,
        lineAt(i: number) {
            return { text: lines[i] };
        },
    };
}

// ---------------------------------------------------------------------------
// Load the provider (vscode is intercepted by setup.ts)
// ---------------------------------------------------------------------------

const { CSMLogFoldingRangeProvider } = require(
    path.resolve(__dirname, '../csmlogFoldingRangeProvider'),
) as { CSMLogFoldingRangeProvider: new () => { provideFoldingRanges(doc: DocLike, ctx: null, token: null): RangeLike[] } };

// vscode mock provides __setConfigurationValue — use require to avoid TS type errors
const vscodeMock = require('vscode') as { __setConfigurationValue: (key: string, value: unknown) => void };

const setConfig = vscodeMock.__setConfigurationValue;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRanges(lines: string[]): RangeLike[] {
    const provider = new CSMLogFoldingRangeProvider();
    return provider.provideFoldingRanges(makeDoc(lines), null, null);
}

teardown(() => {
    // Reset dedup config to enabled defaults for each test
    setConfig('csmModules.dedup.enabled', true);
    setConfig('csmModules.dedup.minRepeatCount', 3);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('CSMLogFoldingRangeProvider', () => {

    test('returns empty for empty document', () => {
        assert.deepStrictEqual(getRanges([]), []);
    });

    test('returns empty when disabled', () => {
        setConfig('csmModules.dedup.enabled', false);
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
            '2026/03/20 17:32:59.428 [Error] AI | Same error',
        ];
        assert.deepStrictEqual(getRanges(lines), []);
    });

    test('returns empty when no repeats', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Error A',
            '2026/03/20 17:32:59.427 [Error] AI | Error B',
            '2026/03/20 17:32:59.428 [Error] AI | Error C',
        ];
        assert.deepStrictEqual(getRanges(lines), []);
    });

    test('returns one folding range for 3 repeated lines', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
            '2026/03/20 17:32:59.428 [Error] AI | Same error',
        ];
        const ranges = getRanges(lines);
        assert.strictEqual(ranges.length, 1);
        // 首末行可见，仅中间行折叠
        assert.strictEqual(ranges[0].start, 1);
        assert.strictEqual(ranges[0].end, 1);
        assert.strictEqual(ranges[0].kind, 3); // FoldingRangeKind.Region = 3
    });

    test('returns empty for 2 repeated lines (minRepeat=3 default)', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
        ];
        assert.deepStrictEqual(getRanges(lines), []);
    });

    test('returns one folding range when minRepeatCount=2', () => {
        setConfig('csmModules.dedup.minRepeatCount', 2);
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
        ];
        const ranges = getRanges(lines);
        assert.strictEqual(ranges.length, 1);
        // 仅 2 行：首行可见，末行折叠
        assert.strictEqual(ranges[0].start, 1);
        assert.strictEqual(ranges[0].end, 1);
    });

    test('returns multiple folding ranges for separate groups', () => {
        const lines = [
            // Group A (lines 0-2)
            '2026/03/20 17:32:59.426 [Error] AI | Error A',
            '2026/03/20 17:32:59.427 [Error] AI | Error A',
            '2026/03/20 17:32:59.428 [Error] AI | Error A',
            // Different (line 3)
            '2026/03/20 17:32:59.429 [Error] AI | Error B',
            // Group B (lines 4-6)
            '2026/03/20 17:32:59.430 [Error] AI | Error C',
            '2026/03/20 17:32:59.431 [Error] AI | Error C',
            '2026/03/20 17:32:59.432 [Error] AI | Error C',
        ];
        const ranges = getRanges(lines);
        assert.strictEqual(ranges.length, 2);
        // 每组 3 行：首末可见，中间行折叠
        assert.strictEqual(ranges[0].start, 1);
        assert.strictEqual(ranges[0].end, 1);
        assert.strictEqual(ranges[1].start, 5);
        assert.strictEqual(ranges[1].end, 5);
    });

    test('config line interrupts repeat chain', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
            '- PeriodicLog.Enable | 1',
            '2026/03/20 17:32:59.428 [Error] AI | Same error',
            '2026/03/20 17:32:59.429 [Error] AI | Same error',
        ];
        const ranges = getRanges(lines);
        // 2 on each side, default minRepeat=3 → none
        assert.strictEqual(ranges.length, 0);
    });

    test('merges parameterized duplicates (default behavior)', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | timeout after 5000ms',
            '2026/03/20 17:32:59.427 [Error] AI | timeout after 3000ms',
            '2026/03/20 17:32:59.428 [Error] AI | timeout after 1000ms',
        ];
        const ranges = getRanges(lines);
        assert.strictEqual(ranges.length, 1);
    });
});
