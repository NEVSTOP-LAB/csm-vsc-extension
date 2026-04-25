/**
 * lvcsmDocumentSymbolProvider.test.ts
 *
 * Unit tests for LvcsmDocumentSymbolProvider.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside the provider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// Load the compiled provider (vscode is already intercepted by setup.js)
const { LvcsmDocumentSymbolProvider } = require(
    path.resolve(__dirname, '../lvcsmDocumentSymbolProvider'),
) as { LvcsmDocumentSymbolProvider: new () => { provideDocumentSymbols(doc: DocLike, token: null): SymbolLike[] } };

// ---------------------------------------------------------------------------
// Minimal stubs matching the vscode-mock shape
// ---------------------------------------------------------------------------

interface DocLike {
    lineCount: number;
    lineAt(i: number): { text: string; range: RangeLike };
}

interface RangeLike {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

interface SymbolLike {
    name: string;
    kind: number;
    range: RangeLike;
    selectionRange: RangeLike;
    detail: string;
}

function makeDoc(lines: string[]): DocLike {
    return {
        lineCount: lines.length,
        lineAt(i: number) {
            const text = lines[i];
            return {
                text,
                range: {
                    start: { line: i, character: 0 },
                    end:   { line: i, character: text.length },
                },
            };
        },
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSymbols(lines: string[]): SymbolLike[] {
    const provider = new LvcsmDocumentSymbolProvider();
    return provider.provideDocumentSymbols(makeDoc(lines), null);
}

function names(syms: SymbolLike[]): string[] {
    return syms.map(s => s.name);
}

// VS Code SymbolKind constants (from vscode-mock)
import * as vscode from 'vscode';
const KIND_MODULE = vscode.SymbolKind.Module;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('LvcsmDocumentSymbolProvider — basic detection', () => {

    test('empty document returns no symbols', () => {
        assert.deepStrictEqual(getSymbols([]), []);
    });

    test('lines without section headers produce no symbols', () => {
        const lines = [
            'key = value',
            '; comment',
            '# another comment',
            'another_key=123',
        ];
        assert.deepStrictEqual(getSymbols(lines), []);
    });
});

suite('LvcsmDocumentSymbolProvider — section detection', () => {

    test('single section header is detected', () => {
        const syms = getSymbols(['[MySection]']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'MySection');
        assert.strictEqual(syms[0].kind, KIND_MODULE);
    });

    test('section name with spaces is captured correctly', () => {
        const syms = getSymbols(['[My Section Name]']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'My Section Name');
    });

    test('multiple section headers are all detected', () => {
        const lines = [
            '[SectionA]',
            'key1 = value1',
            '[SectionB]',
            'key2 = value2',
            '[SectionC]',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), ['SectionA', 'SectionB', 'SectionC']);
    });

    test('all detected symbols have kind Module', () => {
        const lines = ['[Alpha]', '[Beta]'];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].kind, KIND_MODULE);
        assert.strictEqual(syms[1].kind, KIND_MODULE);
    });
});

suite('LvcsmDocumentSymbolProvider — symbol ranges', () => {

    test('single section spans the whole document', () => {
        const lines = [
            '[OnlySection]',
            'key = value',
            'another = data',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 2);
    });

    test('first section ends just before second section starts', () => {
        const lines = [
            '[SectionA]',   // 0
            'key = value',  // 1
            '[SectionB]',   // 2
            'other = data', // 3
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 2);
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 1);
        assert.strictEqual(syms[1].range.start.line, 2);
        assert.strictEqual(syms[1].range.end.line, 3);
    });

    test('selection range is only the section header line', () => {
        const lines = [
            '[SectionA]',
            'key = value',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].selectionRange.start.line, 0);
        assert.strictEqual(syms[0].selectionRange.end.line, 0);
    });
});

suite('LvcsmDocumentSymbolProvider — edge cases', () => {

    test('blank lines between sections do not create symbols', () => {
        const lines = [
            '[SectionA]',
            '',
            '  ',
            '[SectionB]',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), ['SectionA', 'SectionB']);
    });

    test('comment lines do not create symbols', () => {
        const lines = [
            '; This is a comment',
            '# Another comment',
            '[RealSection]',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'RealSection');
    });

    test('key=value lines do not create symbols', () => {
        const lines = [
            'key = value',
            '[Section]',
            'another = 123',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Section');
    });
});
