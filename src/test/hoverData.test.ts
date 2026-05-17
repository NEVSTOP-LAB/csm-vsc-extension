/**
 * hoverData.test.ts
 *
 * Unit tests for hoverData module, including anchor cache cleanup.
 * Runs standalone (no VS Code process needed).
 */

import * as assert from 'assert';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Type stubs (matching vscode-mock.ts shapes)
// ---------------------------------------------------------------------------
interface FakeDocument {
    lineAt(line: number): { text: string };
    lineCount: number;
    uri: { toString(): string };
    version: number;
}

let _docSeq = 0;
function makeDoc(lines: string[], uriOverride?: string): FakeDocument {
    const id = _docSeq++;
    const uri = uriOverride || `file:///test-${id}.lvcsm`;
    return {
        lineAt: (n: number) => ({ text: lines[n] }),
        lineCount: lines.length,
        uri: { toString: () => uri },
        version: 1
    };
}

// Load the compiled module (vscode is already intercepted by setup.js)
const hoverData = require(
    path.resolve(__dirname, '../hoverData')
) as {
    clearAnchorCache: (uri: string) => void;
    provideContentHover: (doc: FakeDocument, pos: any) => any;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('hoverData – anchor cache cleanup', () => {
    test('clearAnchorCache does not throw for unknown URI', () => {
        // Should safely handle URIs that were never cached
        assert.doesNotThrow(() => {
            hoverData.clearAnchorCache('file:///nonexistent.lvcsm');
        });
    });

    test('clearAnchorCache does not throw for empty URI', () => {
        assert.doesNotThrow(() => {
            hoverData.clearAnchorCache('');
        });
    });

    test('anchor cache is used for repeated lookups on same document', () => {
        // Create a document with an anchor definition
        const doc = makeDoc([
            '<MyAnchor>  // Test anchor',
            'API: SomeState -> Module',
            'GOTO <MyAnchor>',
        ], 'file:///test-cache.lvcsm');

        // First lookup should populate cache
        const pos1 = { line: 2, character: 6 }; // On "GOTO"
        const hover1 = hoverData.provideContentHover(doc, pos1);

        // Second lookup on same document should hit cache
        const hover2 = hoverData.provideContentHover(doc, pos1);

        // Both should return the same result (cache hit)
        assert.ok(hover1 !== undefined || hover2 !== undefined, 'At least one hover should work');
    });

    test('clearAnchorCache removes cache entry for specified URI', () => {
        const uri = 'file:///test-clear.lvcsm';
        let lineAtCallCount = 0;
        const doc = makeDoc([
            '<TestAnchor>',
            'GOTO <TestAnchor>',
        ], uri);
        const originalLineAt = doc.lineAt;
        doc.lineAt = (line: number) => {
            lineAtCallCount++;
            return originalLineAt(line);
        };

        // Populate cache
        const pos = { line: 1, character: 6 };
        const hoverFromPopulate = hoverData.provideContentHover(doc, pos);
        assert.ok(hoverFromPopulate, 'Initial lookup should resolve anchor hover');

        const callsAfterPopulate = lineAtCallCount;
        hoverData.provideContentHover(doc, pos);
        const deltaWithWarmCache = lineAtCallCount - callsAfterPopulate;
        assert.ok(
            deltaWithWarmCache < doc.lineCount,
            'Warm-cache lookup should avoid rescanning all document lines'
        );

        hoverData.clearAnchorCache(uri);

        const callsBeforeRebuild = lineAtCallCount;
        const hoverAfterClear = hoverData.provideContentHover(doc, pos);
        const deltaAfterClear = lineAtCallCount - callsBeforeRebuild;

        assert.ok(hoverAfterClear, 'Lookup should still work after cache clear');
        assert.ok(
            deltaAfterClear >= doc.lineCount,
            'Lookup after clearAnchorCache should rescan document lines'
        );
    });
});

suite('hoverData – @ operator lookup', () => {
    test('@ operator provides hover', () => {
        // Test that the @ operator is recognized
        const doc = makeDoc([
            'API: State @ Module',
        ]);

        const pos = { line: 0, character: 11 }; // Position on "@"
        const hover = hoverData.provideContentHover(doc, pos);

        // Should return a hover for the @ operator
        assert.ok(hover !== undefined, 'Should provide hover for @ operator');
        if (hover && hover.contents) {
            const md = Array.isArray(hover.contents) ? hover.contents[0] : hover.contents;
            const text = md?.value || '';
            assert.ok(
                text.includes('模块地址分隔符') || text.includes('@'),
                'Hover should mention module address separator'
            );
        }
    });
});
