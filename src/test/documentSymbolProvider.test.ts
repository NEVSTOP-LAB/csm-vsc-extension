/**
 * documentSymbolProvider.test.ts
 *
 * Unit tests for CSMScriptDocumentSymbolProvider.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside the provider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// Load the compiled provider (vscode is already intercepted by setup.js)
const { CSMScriptDocumentSymbolProvider } = require(
    path.resolve(__dirname, '../documentSymbolProvider'),
) as { CSMScriptDocumentSymbolProvider: new () => { provideDocumentSymbols(doc: DocLike, token: null): SymbolLike[] } };

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
    const provider = new CSMScriptDocumentSymbolProvider();
    return provider.provideDocumentSymbols(makeDoc(lines), null);
}

function names(syms: SymbolLike[]): string[] {
    return syms.map(s => s.name);
}

// VS Code SymbolKind constants (from vscode-mock — Array=17, Function=11)
// We read them from the mock to avoid hard-coding magic numbers.
import * as vscode from 'vscode';
const KIND_ARRAY    = vscode.SymbolKind.Array;
const KIND_FUNCTION = vscode.SymbolKind.Function;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('DocumentSymbolProvider — basic detection', () => {

    test('empty document returns no symbols', () => {
        assert.deepStrictEqual(getSymbols([]), []);
    });

    test('comment-only document returns no symbols', () => {
        assert.deepStrictEqual(names(getSymbols(['// just a comment', '// another'])), []);
    });

    test('single anchor is detected', () => {
        const syms = getSymbols(['<entry>']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, '<entry>');
        assert.strictEqual(syms[0].kind, KIND_FUNCTION);
    });

    test('single section header is detected', () => {
        const syms = getSymbols(['[COMMAND_ALIAS]']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'COMMAND_ALIAS');
        assert.strictEqual(syms[0].kind, KIND_ARRAY);
    });

    test('section header with inline comment is detected', () => {
        const syms = getSymbols(['[COMMAND_ALIAS] // alias definitions']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'COMMAND_ALIAS');
        assert.strictEqual(syms[0].kind, KIND_ARRAY);
    });

    test('section header with inner spaces is detected and trimmed', () => {
        const syms = getSymbols(['[ COMMAND_ALIAS ]']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'COMMAND_ALIAS');
        assert.strictEqual(syms[0].kind, KIND_ARRAY);
    });

    test('anchor with inline comment is detected', () => {
        const syms = getSymbols(['<entry> // main flow starts here']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, '<entry>');
    });

    test('anchor name with hyphens is detected', () => {
        const syms = getSymbols(['<error-handler>']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, '<error-handler>');
    });

    test('anchor name with underscores is detected', () => {
        // Anchor names must start with a letter [A-Za-z], but can contain underscores after the first character.
        const syms = getSymbols(['<loop_checkpoint>']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, '<loop_checkpoint>');
    });
});

suite('DocumentSymbolProvider — control-flow keywords excluded', () => {

    const cfKeywords = [
        '<if ${x}=1>',
        '<else>',
        '<end_if>',
        '<while ${n}<5>',
        '<end_while>',
        '<do_while>',
        '<end_do_while ${n}<1>',
        '<foreach item in ${list}>',
        '<end_foreach>',
        '<include sub.csmscript>',
    ];

    for (const kw of cfKeywords) {
        test(`control-flow "${kw}" is NOT a symbol`, () => {
            assert.deepStrictEqual(getSymbols([kw]), []);
        });
    }
});

suite('DocumentSymbolProvider — multiple symbols', () => {

    test('multiple anchors all appear in order', () => {
        const lines = [
            '<entry>',
            'ECHO >> start',
            '<error_handler>',
            'ECHO >> error',
            '<cleanup>',
            'ECHO >> done',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), ['<entry>', '<error_handler>', '<cleanup>']);
    });

    test('mix of sections and anchors', () => {
        const lines = [
            '[COMMAND_ALIAS]',
            'ConnectDB = API: Connect -@ DB',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            '<entry>',
            'ECHO >> go',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), ['COMMAND_ALIAS', 'AUTO_ERROR_HANDLE', '<entry>']);
    });

    test('section headers have ARRAY kind, anchors have FUNCTION kind', () => {
        const lines = ['[COMMAND_ALIAS]', '<entry>'];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].kind, KIND_ARRAY);
        assert.strictEqual(syms[1].kind, KIND_FUNCTION);
    });
});

suite('DocumentSymbolProvider — symbol ranges', () => {

    test('single symbol spans the whole document', () => {
        const lines = ['<entry>', 'ECHO >> a', 'ECHO >> b'];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 2);
    });

    test('first symbol ends just before second symbol starts', () => {
        const lines = [
            '<entry>',     // line 0
            'ECHO >> a',   // line 1
            '<cleanup>',   // line 2
            'ECHO >> b',   // line 3
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 1);  // line before <cleanup>
        assert.strictEqual(syms[1].range.start.line, 2);
        assert.strictEqual(syms[1].range.end.line, 3);
    });

    test('selection range is only the symbol definition line', () => {
        const lines = ['<entry>', 'ECHO >> a'];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].selectionRange.start.line, 0);
        assert.strictEqual(syms[0].selectionRange.end.line, 0);
    });

    test('blank lines between symbols are attributed to the preceding symbol', () => {
        const lines = [
            '<entry>',    // 0
            '',           // 1
            '<cleanup>',  // 2
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].range.end.line, 1);
    });
});

suite('DocumentSymbolProvider — full-script sample', () => {

    test('full coverage script produces correct outline', () => {
        const lines = [
            '[COMMAND_ALIAS]',
            'ConnectDB = API: Connect -@ DB',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            '[INI_VAR_SPACE]',
            'Enable = TRUE',
            '[TAGDB_VAR_SPACE]',
            'Enable = TRUE',
            '<entry>',
            'ECHO >> start',
            '<if ${ok}=1>',
            'ECHO >> yes',
            '<end_if>',
            '<error_handler>',
            'ECHO >> err',
            '<cleanup>',
            'ECHO >> done',
        ];
        const expected = [
            'COMMAND_ALIAS',
            'AUTO_ERROR_HANDLE',
            'INI_VAR_SPACE',
            'TAGDB_VAR_SPACE',
            '<entry>',
            '<error_handler>',
            '<cleanup>',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), expected);
    });
});
