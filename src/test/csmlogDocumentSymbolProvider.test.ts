/**
 * csmlogDocumentSymbolProvider.test.ts
 *
 * Unit tests for CSMLogDocumentSymbolProvider.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside the provider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// Load the compiled provider (vscode is already intercepted by setup.js)
const { CSMLogDocumentSymbolProvider } = require(
    path.resolve(__dirname, '../csmlogDocumentSymbolProvider'),
) as { CSMLogDocumentSymbolProvider: new () => { provideDocumentSymbols(doc: DocLike, token: null): SymbolLike[] } };

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
    const provider = new CSMLogDocumentSymbolProvider();
    return provider.provideDocumentSymbols(makeDoc(lines), null);
}

function names(syms: SymbolLike[]): string[] {
    return syms.map(s => s.name);
}

// VS Code SymbolKind constants (from vscode-mock)
import * as vscode from 'vscode';
const KIND_PROPERTY    = vscode.SymbolKind.Property;
const KIND_CONSTRUCTOR = vscode.SymbolKind.Constructor;
const KIND_EVENT       = vscode.SymbolKind.Event;
const KIND_KEY         = vscode.SymbolKind.Key;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('CSMLogDocumentSymbolProvider — basic detection', () => {

    test('empty document returns no symbols', () => {
        assert.deepStrictEqual(getSymbols([]), []);
    });

    test('plain log lines produce no symbols', () => {
        const lines = [
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',
            '2026/03/20 17:32:59.426 [17:32:59.425] [Sync Message] -SendMsgAPI | VI Reference -@ AI',
            '2026/03/20 17:32:59.697 [17:32:59.697] [Async Message] AI | API: Start >> -><interrupt> -> Measure',
        ];
        assert.deepStrictEqual(getSymbols(lines), []);
    });
});

suite('CSMLogDocumentSymbolProvider — config lines', () => {

    test('single config line is detected', () => {
        const syms = getSymbols(['- PeriodicLog.Enable | 1']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'PeriodicLog.Enable');
        assert.strictEqual(syms[0].kind, KIND_PROPERTY);
    });

    test('config line with parenthesized key', () => {
        const syms = getSymbols(['- PeriodicLog.Threshold(#/s) | 2.00']);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'PeriodicLog.Threshold(#/s)');
    });

    test('multiple config lines', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',
            '- PeriodicLog.Threshold(#/s) | 2.00',
            '- PeriodicLog.CheckPeriod(s) | 1.00',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), [
            'PeriodicLog.Enable',
            'PeriodicLog.Threshold(#/s)',
            'PeriodicLog.CheckPeriod(s)',
        ]);
    });
});

suite('CSMLogDocumentSymbolProvider — module lifecycle', () => {

    test('Module Created is detected', () => {
        const syms = getSymbols([
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',
        ]);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Module Created: AI');
        assert.strictEqual(syms[0].kind, KIND_CONSTRUCTOR);
    });

    test('Module Destroyed is detected', () => {
        const syms = getSymbols([
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',
        ]);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Module Destroyed: AI');
        assert.strictEqual(syms[0].kind, KIND_EVENT);
    });

    test('Module lifecycle without relative timestamp is detected', () => {
        const syms = getSymbols([
            '2026/03/20 17:33:05.250 [Module Destroyed] AI',
        ]);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Module Destroyed: AI');
        assert.strictEqual(syms[0].kind, KIND_EVENT);
    });

    test('Module lifecycle without module name uses placeholder', () => {
        const syms = getSymbols([
            '2026/03/20 17:33:05.250 [Module Destroyed]',
        ]);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Module Destroyed: <unknown-module>');
        assert.strictEqual(syms[0].kind, KIND_EVENT);
    });

    test('multiple modules in order', () => {
        const lines = [
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',
            '2026/03/20 17:32:59.490 [17:32:59.490] [Module Created] Measure |  > MAL-TEST.vi:5620002',
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',
            '2026/03/20 17:33:05.251 [17:33:05.251] [Module Destroyed] Measure',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), [
            'Module Created: AI',
            'Module Created: Measure',
            'Module Destroyed: AI',
            'Module Destroyed: Measure',
        ]);
    });
});

suite('CSMLogDocumentSymbolProvider — logger system messages', () => {

    test('Logger system message is detected', () => {
        const syms = getSymbols([
            '2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs are still in the queue.',
        ]);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, '<Logger Thread Exit>');
        assert.strictEqual(syms[0].kind, KIND_KEY);
    });

    test('different logger labels', () => {
        const lines = [
            '2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs are still in the queue.',
            '2026/03/11 18:10:00.000 <System Shutdown> graceful exit',
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), [
            '<Logger Thread Exit>',
            '<System Shutdown>',
        ]);
    });
});

suite('CSMLogDocumentSymbolProvider — mixed document', () => {

    test('config, modules, logger and plain lines produce correct outline', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',                                                              // 0  config
            '- PeriodicLog.Threshold(#/s) | 2.00',                                                   // 1  config
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',     // 2  module created
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',          // 3  plain (ignored)
            '2026/03/20 17:32:59.490 [17:32:59.490] [Module Created] Measure |  > MAL-TEST.vi',      // 4  module created
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',                          // 5  module destroyed
            '2026/03/20 17:33:05.251 [17:33:05.251] [Module Destroyed] Measure',                     // 6  module destroyed
            '2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs are still in the queue.',            // 7  logger
        ];
        assert.deepStrictEqual(names(getSymbols(lines)), [
            'PeriodicLog.Enable',
            'PeriodicLog.Threshold(#/s)',
            'Module Created: AI',
            'Module Created: Measure',
            'Module Destroyed: AI',
            'Module Destroyed: Measure',
            '<Logger Thread Exit>',
        ]);
    });

    test('all symbol kinds are correct', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',
            '2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs are still in the queue.',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].kind, KIND_PROPERTY);
        assert.strictEqual(syms[1].kind, KIND_CONSTRUCTOR);
        assert.strictEqual(syms[2].kind, KIND_EVENT);
        assert.strictEqual(syms[3].kind, KIND_KEY);
    });
});

suite('CSMLogDocumentSymbolProvider — symbol ranges', () => {

    test('single symbol spans the whole document', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 1);
    });

    test('first symbol ends just before second symbol starts', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',                                                             // 0
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',         // 1
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',    // 2
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',                         // 3
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms.length, 3);
        // Config symbol: line 0 → line 1 (before Module Created)
        assert.strictEqual(syms[0].range.start.line, 0);
        assert.strictEqual(syms[0].range.end.line, 1);
        // Module Created: line 2 → line 2 (before Module Destroyed)
        assert.strictEqual(syms[1].range.start.line, 2);
        assert.strictEqual(syms[1].range.end.line, 2);
        // Module Destroyed: line 3 → line 3 (last line)
        assert.strictEqual(syms[2].range.start.line, 3);
        assert.strictEqual(syms[2].range.end.line, 3);
    });

    test('selection range is only the symbol definition line', () => {
        const lines = [
            '- PeriodicLog.Enable | 1',
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',
        ];
        const syms = getSymbols(lines);
        assert.strictEqual(syms[0].selectionRange.start.line, 0);
        assert.strictEqual(syms[0].selectionRange.end.line, 0);
    });
});

suite('CSMLogDocumentSymbolProvider — edge cases', () => {

    test('file logger lines (no event bracket) are not symbols', () => {
        const lines = [
            '2026/03/11 18:09:47.330  System started successfully',
            '2026/03/11 18:09:48.100  Configuration loaded from config.ini',
        ];
        assert.deepStrictEqual(getSymbols(lines), []);
    });

    test('User Log, Error, Register etc. are not symbols', () => {
        const lines = [
            '2026/03/20 17:33:05.260 [User Log] TestRunner | Measurement cycle complete',
            '2026/03/20 17:33:05.270 [17:33:05.270] [Error] AI | Target Error <- MeasureModule',
            '2026/03/20 17:33:05.261 [17:33:05.261] [Register] Measure | API: DataReady -><register>',
            '2026/03/20 17:33:05.263 [17:33:05.263] [Interrupt] AI | Interrupt Signal -><interrupt>',
            '2026/03/20 17:33:05.264 [17:33:05.264] [Status] Measure | Status: Ready -><status>',
        ];
        assert.deepStrictEqual(getSymbols(lines), []);
    });

    test('blank lines produce no symbols', () => {
        assert.deepStrictEqual(getSymbols(['', '  ', '\t']), []);
    });
});
