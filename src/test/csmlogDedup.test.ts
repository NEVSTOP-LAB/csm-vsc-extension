/**
 * csmlogDedup.test.ts
 *
 * Unit tests for the CSM log deduplication engine (csmlogDedup.ts).
 * Runs standalone with the vscode-mock (setup.ts intercepts require('vscode')).
 */

import * as assert from 'assert';
import * as path from 'path';

// Load the compiled module (vscode is intercepted by setup.ts)
const {
    extractSignature,
    normalizeSignature,
    detectRepeatedGroups,
    truncateSignature,
} = require(
    path.resolve(__dirname, '../common/csmlogDedup'),
) as {
    extractSignature: (line: string) => string | null;
    normalizeSignature: (sig: string) => string;
    detectRepeatedGroups: (doc: DocLike, minRepeat: number) => GroupLike[];
    truncateSignature: (sig: string, maxLen?: number) => string;
};

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

interface DocLike {
    lineCount: number;
    lineAt(i: number): { text: string };
}

interface GroupLike {
    startLine: number;
    endLine: number;
    count: number;
    signature: string;
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
// extractSignature
// ---------------------------------------------------------------------------

suite('extractSignature', () => {

    test('strips absolute timestamp only', () => {
        const sig = extractSignature('2026/03/20 17:32:59.426 [State Change] AI | Macro: Initialize');
        assert.strictEqual(sig, '[State Change] AI | Macro: Initialize');
    });

    test('strips absolute and relative timestamps', () => {
        const sig = extractSignature('2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro');
        assert.strictEqual(sig, '[State Change] AI | Macro');
    });

    test('strips absolute and full bracketed second timestamp', () => {
        // 真实日志格式：两个完整时间戳（后者带方括号）
        const sig = extractSignature('2025/05/25 21:28:21.954 [2025/05/25 21:28:21.954] [User Log] tcp-client | Try to Connect');
        assert.strictEqual(sig, '[User Log] tcp-client | Try to Connect');
    });

    test('strips absolute and full bracketed second timestamp (hyphen date)', () => {
        const sig = extractSignature('2025-05-25 21:28:21.954 [2025-05-25 21:28:21.954] [User Log] tcp-client | Try to Connect');
        assert.strictEqual(sig, '[User Log] tcp-client | Try to Connect');
    });

    test('strips bracketed absolute timestamp', () => {
        const sig = extractSignature('[2026/03/20 17:32:59.426] [Error] AI | Error message');
        assert.strictEqual(sig, '[Error] AI | Error message');
    });

    test('strips bracketed absolute + relative timestamps', () => {
        const sig = extractSignature('[2026/03/20 17:32:59.426] [17:32:59.425] [User Log] Module | Content');
        assert.strictEqual(sig, '[User Log] Module | Content');
    });

    test('returns null for config line', () => {
        const sig = extractSignature('- PeriodicLog.Enable | 1');
        assert.strictEqual(sig, null);
    });

    test('returns null for empty line', () => {
        const sig = extractSignature('');
        assert.strictEqual(sig, null);
    });

    test('returns null for line without timestamp', () => {
        const sig = extractSignature('Some random text without timestamp');
        assert.strictEqual(sig, null);
    });

    test('returns null for timestamp-only line (empty body)', () => {
        const sig = extractSignature('2026/03/20 17:32:59.426   ');
        assert.strictEqual(sig, null);
    });

    test('handles file logger line (no event bracket)', () => {
        const sig = extractSignature('2026/03/20 17:32:59.426  Plain text output');
        assert.strictEqual(sig, 'Plain text output');
    });

    test('handles Logger system message', () => {
        const sig = extractSignature('2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs');
        assert.strictEqual(sig, '<Logger Thread Exit> 0 logs');
    });
});

// ---------------------------------------------------------------------------
// normalizeSignature
// ---------------------------------------------------------------------------

suite('normalizeSignature', () => {

    test('replaces digit sequences with #', () => {
        const result = normalizeSignature('[Error] AI | timeout after 5000ms');
        assert.strictEqual(result, '[Error] AI | timeout after #ms');
    });

    test('handles multiple number sequences', () => {
        const result = normalizeSignature('[Sync Message] API | Value 123 at index 456');
        assert.strictEqual(result, '[Sync Message] API | Value # at index #');
    });

    test('handles no numbers', () => {
        const result = normalizeSignature('[Status] Module | OK');
        assert.strictEqual(result, '[Status] Module | OK');
    });

    test('handles only numbers', () => {
        const result = normalizeSignature('12345 67890');
        assert.strictEqual(result, '# #');
    });
});

// ---------------------------------------------------------------------------
// detectRepeatedGroups
// ---------------------------------------------------------------------------

suite('detectRepeatedGroups', () => {

    test('returns empty for empty document', () => {
        const groups = detectRepeatedGroups(makeDoc([]), 3);
        assert.deepStrictEqual(groups, []);
    });

    test('returns empty when no lines repeat', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Error A',
            '2026/03/20 17:32:59.427 [Error] AI | Error B',
            '2026/03/20 17:32:59.428 [Error] AI | Error C',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.deepStrictEqual(groups, []);
    });

    test('returns empty when repeat count is below threshold', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.deepStrictEqual(groups, []);
    });

    test('detects single group of exact duplicates (3 lines, minRepeat=3)', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
            '2026/03/20 17:32:59.428 [Error] AI | Same error',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].startLine, 0);
        assert.strictEqual(groups[0].endLine, 2);
        assert.strictEqual(groups[0].count, 3);
        assert.strictEqual(groups[0].signature, '[Error] AI | Same error');
    });

    test('detects single group with minRepeat=2', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 2);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].count, 2);
    });

    test('detects multiple independent groups', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Error A',
            '2026/03/20 17:32:59.427 [Error] AI | Error A',
            '2026/03/20 17:32:59.428 [Error] AI | Error A',
            '2026/03/20 17:32:59.429 [Error] AI | Error B',
            '2026/03/20 17:32:59.430 [Error] AI | Error B',
            '2026/03/20 17:32:59.431 [Error] AI | Error B',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.strictEqual(groups.length, 2);
        assert.strictEqual(groups[0].startLine, 0);
        assert.strictEqual(groups[0].endLine, 2);
        assert.strictEqual(groups[1].startLine, 3);
        assert.strictEqual(groups[1].endLine, 5);
    });

    test('config lines break repeat chains', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | Same error',
            '2026/03/20 17:32:59.427 [Error] AI | Same error',
            '- PeriodicLog.Enable | 1',
            '2026/03/20 17:32:59.428 [Error] AI | Same error',
            '2026/03/20 17:32:59.429 [Error] AI | Same error',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        // Each side of the config line has only 2 repeats, below threshold of 3
        assert.strictEqual(groups.length, 0);
    });

    test('numeric dedup merges parameterized duplicates', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [Error] AI | timeout after 5000ms',
            '2026/03/20 17:32:59.427 [Error] AI | timeout after 3000ms',
            '2026/03/20 17:32:59.428 [Error] AI | timeout after 1000ms',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].count, 3);
    });

    test('ignores different timestamps in same message (exact)', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [17:32:59.425] [Error] AI | Same error',
            '2026/03/20 17:32:59.500 [17:32:59.499] [Error] AI | Same error',
            '2026/03/20 17:32:59.600 [17:32:59.599] [Error] AI | Same error',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.strictEqual(groups.length, 1);
        // absolute and relative timestamps differ but are stripped; message body is identical
    });

    test('real-world: TCP client with two full timestamps (exact)', () => {
        // 真实场景：每条日志有两个完整时间戳（行首 + 方括号内），消息体相同
        const lines = [
            '2025/05/25 21:28:21.954 [2025/05/25 21:28:21.954] [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;1}',
            '2025/05/25 21:28:22.555 [2025/05/25 21:28:22.555] [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;2}',
            '2025/05/25 21:28:23.158 [2025/05/25 21:28:23.158] [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;3}',
        ];
        const groups = detectRepeatedGroups(makeDoc(lines), 3);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].count, 3);
    });
});

// ---------------------------------------------------------------------------
// truncateSignature
// ---------------------------------------------------------------------------

suite('truncateSignature', () => {

    test('returns short signature unchanged', () => {
        const result = truncateSignature('[Error] AI | Short', 60);
        assert.strictEqual(result, '[Error] AI | Short');
    });

    test('truncates long signature with ellipsis', () => {
        const long = 'A'.repeat(100);
        const result = truncateSignature(long, 60);
        assert.strictEqual(result, 'A'.repeat(57) + '...');
    });

    test('exactly at max length returns unchanged', () => {
        const exact = 'A'.repeat(60);
        const result = truncateSignature(exact, 60);
        assert.strictEqual(result, exact);
        assert.strictEqual(result.length, 60);
    });
});
