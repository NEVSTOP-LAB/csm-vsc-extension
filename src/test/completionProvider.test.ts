/**
 * completionProvider.test.ts
 *
 * Unit tests for the CSMScriptCompletionProvider.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside completionProvider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Type stubs (matching vscode-mock.ts shapes)
// ---------------------------------------------------------------------------
interface FakePosition { line: number; character: number }
interface FakeDocument {
    lineAt(line: number): { text: string };
    lineCount: number;
    uri: { toString(): string };
    version: number;
}
interface FakeCompletionItem { label: string; kind?: number; detail?: string; insertText?: { value: string } | string; range?: { start: { line: number; character: number }; end: { line: number; character: number } } }

let _docSeq = 0;
function makeDoc(lines: string[]): FakeDocument {
    const id = _docSeq++;
    return { lineAt: (n: number) => ({ text: lines[n] }), lineCount: lines.length, uri: { toString: () => `file:///test-${id}.csmscript` }, version: 1 };
}
function pos(character: number): FakePosition {
    return { line: 0, character };
}

// Load the compiled provider (vscode is already intercepted by setup.js)
const { CSMScriptCompletionProvider } = require(
    path.resolve(__dirname, '../completionProvider')
) as {
    CSMScriptCompletionProvider: new () => {
        provideCompletionItems: (doc: FakeDocument, pos: FakePosition) => FakeCompletionItem[]
    }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function complete(line: string, col?: number): FakeCompletionItem[] {
    const provider = new CSMScriptCompletionProvider();
    const character = col ?? line.length;
    return provider.provideCompletionItems(makeDoc([line]), pos(character));
}

/**
 * Completion helper for multi-line documents.
 * `activeLine` is the 0-based index of the line where completion is triggered.
 * `col` defaults to the end of that line.
 */
function completeMulti(lines: string[], activeLine: number, col?: number): FakeCompletionItem[] {
    const provider = new CSMScriptCompletionProvider();
    const character = col ?? lines[activeLine].length;
    return provider.provideCompletionItems(makeDoc(lines), { line: activeLine, character });
}

function labels(items: FakeCompletionItem[]): string[] {
    return items.map(i => i.label);
}

function findItem(items: FakeCompletionItem[], label: string): FakeCompletionItem | undefined {
    return items.find(i => i.label === label);
}

function assertHasLabel(items: FakeCompletionItem[], label: string) {
    assert.ok(
        labels(items).includes(label),
        `Expected "${label}" in completions.\n  Got: ${labels(items).join(', ')}`,
    );
}

function assertNoLabel(items: FakeCompletionItem[], label: string) {
    assert.ok(
        !labels(items).includes(label),
        `Did not expect "${label}" in completions but it was present.`,
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('CompletionProvider – comment lines', () => {
    test('comment line returns no completions', () => {
        const items = complete('// this is a comment', 5);
        assert.strictEqual(items.length, 0);
    });
});

suite('CompletionProvider – default (start of line) completions', () => {
    test('GOTO is offered', () => {
        assertHasLabel(complete(''), 'GOTO');
    });

    test('WAIT is offered', () => {
        assertHasLabel(complete(''), 'WAIT');
    });

    test('ECHO is offered', () => {
        assertHasLabel(complete(''), 'ECHO');
    });

    test('EXPRESSION is offered', () => {
        assertHasLabel(complete(''), 'EXPRESSION');
    });

    test('BREAK is offered', () => {
        assertHasLabel(complete(''), 'BREAK');
    });

    test('CONTINUE is offered', () => {
        assertHasLabel(complete(''), 'CONTINUE');
    });

    test('API: prefix is offered', () => {
        assertHasLabel(complete(''), 'API:');
    });

    test('Macro: prefix is offered', () => {
        assertHasLabel(complete(''), 'Macro:');
    });

    test('TAGDB_GET_VALUE is offered', () => {
        assertHasLabel(complete(''), 'TAGDB_GET_VALUE');
    });

    test('ONE_BUTTON_DIALOG is offered', () => {
        assertHasLabel(complete(''), 'ONE_BUTTON_DIALOG');
    });
});

suite('CompletionProvider – section header context (`[`)', () => {
    test('[COMMAND_ALIAS] is offered after [', () => {
        assertHasLabel(complete('['), '[COMMAND_ALIAS]');
    });

    test('[AUTO_ERROR_HANDLE] is offered after [', () => {
        assertHasLabel(complete('['), '[AUTO_ERROR_HANDLE]');
    });

    test('[AUTO_ERROR_HANDLE] insertText expands to section with Enable and Anchor keys', () => {
        const item = findItem(complete('['), '[AUTO_ERROR_HANDLE]');
        assert.ok(item, 'Expected [AUTO_ERROR_HANDLE] completion item');
        const text = typeof item!.insertText === 'object' ? item!.insertText.value : item!.insertText;
        assert.ok(text?.includes('Enable'), 'insertText should include Enable key');
        assert.ok(text?.includes('Anchor'), 'insertText should include Anchor key');
        // TRUE should appear before FALSE in the choice selector
        assert.ok(text?.includes('TRUE,FALSE'), 'Enable choice should list TRUE before FALSE');
        // snippet anchor default should be <error_handler>
        assert.ok(text?.includes('<error_handler>'), 'Anchor default should be <error_handler>');
    });

    test('[INI_VAR_SPACE] is offered after [', () => {
        assertHasLabel(complete('['), '[INI_VAR_SPACE]');
    });

    test('[INI_VAR_SPACE] insertText expands to section with Enable and Path keys', () => {
        const item = findItem(complete('['), '[INI_VAR_SPACE]');
        assert.ok(item, 'Expected [INI_VAR_SPACE] completion item');
        const text = typeof item!.insertText === 'object' ? item!.insertText.value : item!.insertText;
        assert.ok(text?.includes('Enable'), 'insertText should include Enable key');
        assert.ok(text?.includes('Path'), 'insertText should include Path key');
        // TRUE should appear before FALSE in the choice selector
        assert.ok(text?.includes('TRUE,FALSE'), 'Enable choice should list TRUE before FALSE');
        // path default should be ./config.ini
        assert.ok(text?.includes('./config.ini'), 'Path default should be ./config.ini');
    });

    test('[TAGDB_VAR_SPACE] is offered after [', () => {
        assertHasLabel(complete('['), '[TAGDB_VAR_SPACE]');
    });

    test('[TAGDB_VAR_SPACE] insertText expands to section with Enable and Name keys', () => {
        const item = findItem(complete('['), '[TAGDB_VAR_SPACE]');
        assert.ok(item, 'Expected [TAGDB_VAR_SPACE] completion item');
        const text = typeof item!.insertText === 'object' ? item!.insertText.value : item!.insertText;
        assert.ok(text?.includes('Enable'), 'insertText should include Enable key');
        assert.ok(text?.includes('Name'), 'insertText should include Name key');
        // TRUE should appear before FALSE in the choice selector
        assert.ok(text?.includes('TRUE,FALSE'), 'Enable choice should list TRUE before FALSE');
        // Name default should be csmscript (as per user manual default)
        assert.ok(text?.includes('csmscript'), 'Name default should be csmscript');
    });

    test('commands are NOT offered in section context', () => {
        assertNoLabel(complete('['), 'GOTO');
    });
});

suite('CompletionProvider – control-flow context (`<`)', () => {
    test('<if> is offered after <', () => {
        assertHasLabel(complete('<'), '<if>');
    });

    test('<while> is offered after <', () => {
        assertHasLabel(complete('<'), '<while>');
    });

    test('<foreach> is offered after <', () => {
        assertHasLabel(complete('<'), '<foreach>');
    });

    test('<do_while> is offered after <', () => {
        assertHasLabel(complete('<'), '<do_while>');
    });

    test('<else> is offered after <', () => {
        assertHasLabel(complete('<'), '<else>');
    });

    test('<end_if> is offered after <', () => {
        assertHasLabel(complete('<'), '<end_if>');
    });

    test('<end_while> is offered after <', () => {
        assertHasLabel(complete('<'), '<end_while>');
    });

    test('<end_foreach> is offered after <', () => {
        assertHasLabel(complete('<'), '<end_foreach>');
    });

    test('<include> is offered after <', () => {
        assertHasLabel(complete('<'), '<include>');
    });

    test('<status> broadcast target is offered after <', () => {
        assertHasLabel(complete('<'), '<status>');
    });

    test('<interrupt> broadcast target is offered after <', () => {
        assertHasLabel(complete('<'), '<interrupt>');
    });

    test('<broadcast> broadcast target is offered after <', () => {
        assertHasLabel(complete('<'), '<broadcast>');
    });

    test('<all> broadcast target is offered after <', () => {
        assertHasLabel(complete('<'), '<all>');
    });

    test('commands are NOT offered in control-flow context', () => {
        assertNoLabel(complete('<'), 'GOTO');
    });
});

suite('CompletionProvider – subscription/broadcast context (`->`)', () => {
    const line = 'API: Status >> handler ->';

    test('-><register> is offered after ->', () => {
        assertHasLabel(complete(line), '-><register>');
    });

    test('-><unregister> is offered after ->', () => {
        assertHasLabel(complete(line), '-><unregister>');
    });

    test('-><register as interrupt> is offered after ->', () => {
        assertHasLabel(complete(line), '-><register as interrupt>');
    });

    test('-><register as status> is offered after ->', () => {
        assertHasLabel(complete(line), '-><register as status>');
    });

    test('<status> is offered after ->', () => {
        assertHasLabel(complete(line), '<status>');
    });
});

suite('CompletionProvider – variable reference context (`$`)', () => {
    test('${varname} is offered after $', () => {
        assertHasLabel(complete('ECHO >> $'), '${varname}');
    });

    test('${varname:default} is offered after $', () => {
        assertHasLabel(complete('ECHO >> $'), '${varname:default}');
    });
});

suite('CompletionProvider – EXPRESSION context', () => {
    test('equal() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'equal()');
    });

    test('match() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'match()');
    });

    test('contain() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'contain()');
    });

    test('belong() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'belong()');
    });

    test('start_with() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'start_with()');
    });

    test('end_with() is offered inside EXPRESSION', () => {
        assertHasLabel(complete('EXPRESSION >> ${v} '), 'end_with()');
    });

    test('equal() is offered when EXPRESSION is lowercase (expression >> ...)', () => {
        assertHasLabel(complete('expression >> ${v} '), 'equal()');
    });

    test('match() is offered when EXPRESSION is mixed case (Expression >> ...)', () => {
        assertHasLabel(complete('Expression >> ${v} '), 'match()');
    });

    test('contain() is offered when EXPRESSION is lowercase with leading whitespace', () => {
        assertHasLabel(complete('  expression >> ${v} '), 'contain()');
    });
});

suite('CompletionProvider – snippet insertText', () => {
    test('GOTO has snippet insertText', () => {
        const items = complete('');
        const item = findItem(items, 'GOTO');
        assert.ok(item, 'GOTO should be in completions');
        assert.ok(
            item.insertText && typeof item.insertText === 'object' && 'value' in item.insertText,
            'GOTO insertText should be a SnippetString',
        );
    });

    test('EXPRESSION has snippet insertText referencing result variable', () => {
        const items = complete('');
        const item = findItem(items, 'EXPRESSION');
        assert.ok(item, 'EXPRESSION should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(val.includes('=>'), 'EXPRESSION snippet should contain =>');
    });

    test('<if> snippet does NOT start with `<` in bracket context', () => {
        // In `<` context VS Code inserts after the trigger `<` that is already
        // in the buffer. The snippet must therefore NOT repeat the `<`.
        const items = complete('<');
        const item = findItem(items, '<if>');
        assert.ok(item, '<if> should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(!val.startsWith('<'), '<if> snippet in `<` context must not start with `<`');
        assert.ok(val.includes('<end_if>'), '<if> snippet should still include <end_if>');
    });

    test('<while> snippet does NOT start with `<` in bracket context', () => {
        const items = complete('<');
        const item = findItem(items, '<while>');
        assert.ok(item, '<while> should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(!val.startsWith('<'), '<while> snippet in `<` context must not start with `<`');
        assert.ok(val.includes('<end_while>'), '<while> snippet should still include <end_while>');
    });

    test('<else> has explicit insertText without leading `<` in bracket context', () => {
        const items = complete('<');
        const item = findItem(items, '<else>');
        assert.ok(item, '<else> should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : (item.insertText as string | undefined) ?? '';
        assert.ok(!val.startsWith('<'), '<else> snippet in `<` context must not start with `<`');
    });

    test('-><register> snippet does NOT start with `->` in arrow context', () => {
        // After `->`, VS Code inserts at cursor; the snippet must not repeat `->`.
        const line = 'API: Status >> handler ->';
        const item = findItem(complete(line), '-><register>');
        assert.ok(item, '-><register> should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(!val.startsWith('->'), '-><register> snippet must not start with `->`');
        assert.ok(val.startsWith('<register>'), '-><register> snippet should start with `<register>`');
    });

    test('<status> broadcast insertText has leading space in arrow context', () => {
        // CSMScript syntax: `-> <status>` (space before target).
        const line = 'API: Status >> handler ->';
        const item = findItem(complete(line), '<status>');
        assert.ok(item, '<status> should be in completions after ->');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : (item.insertText as string | undefined) ?? '';
        assert.ok(val.startsWith(' '), '<status> in `->` context must start with a space');
    });

    test('${varname} insertText preserves the `$` word char', () => {
        // `$` is a word char in CSMScript's wordPattern so VS Code replaces the
        // word `$`.  The snippet must start with `\$` (literal `$`).
        const items = complete('ECHO >> $');
        const item = findItem(items, '${varname}');
        assert.ok(item, '${varname} should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(val.startsWith('\\${'), '${varname} snippet should start with \\${');
    });

    test('${varname:default} insertText preserves the `$` word char', () => {
        const items = complete('ECHO >> $');
        const item = findItem(items, '${varname:default}');
        assert.ok(item, '${varname:default} should be in completions');
        const val = item.insertText && typeof item.insertText === 'object'
            ? (item.insertText as { value: string }).value
            : '';
        assert.ok(val.startsWith('\\${'), '${varname:default} snippet should start with \\${');
    });
});

suite('CompletionProvider – detail strings', () => {
    test('GOTO has non-empty detail', () => {
        const item = findItem(complete(''), 'GOTO');
        assert.ok(item?.detail, 'GOTO should have a detail string');
    });

    test('[COMMAND_ALIAS] has non-empty detail', () => {
        const item = findItem(complete('['), '[COMMAND_ALIAS]');
        assert.ok(item?.detail, '[COMMAND_ALIAS] should have a detail string');
    });
});

suite('CompletionProvider – user-defined anchor completions', () => {
    const docLines = [
        '<setup>',
        'ECHO >> starting',
        '<main> // main logic',
        'ECHO >> running',
        '<cleanup> // error handler',
        'ECHO >> done',
    ];

    test('user-defined anchor <setup> is offered after < in the same document', () => {
        const items = completeMulti([...docLines, 'GOTO >> <'], docLines.length);
        assertHasLabel(items, '<setup>');
    });

    test('user-defined anchor <main> is offered after <', () => {
        const items = completeMulti([...docLines, 'GOTO >> <'], docLines.length);
        assertHasLabel(items, '<main>');
    });

    test('user-defined anchor <cleanup> is offered after <', () => {
        const items = completeMulti([...docLines, 'GOTO >> <'], docLines.length);
        assertHasLabel(items, '<cleanup>');
    });

    test('control-flow keywords are NOT returned as user-defined anchor items', () => {
        const items = completeMulti([...docLines, 'GOTO >> <'], docLines.length);
        // <if>, <while>, etc. are still offered but as CONTROL_FLOW_COMPLETIONS, not anchors
        // Verify the anchor item for <if> is NOT present (i.e., no anchor item with label <if>)
        const anchorItem = items.find(i => i.label === '<if>' && i.detail === '用户定义锚点');
        assert.ok(!anchorItem, '<if> should not appear as a user-defined anchor');
    });

    test('user-defined anchor insertText does not contain leading <', () => {
        const items = completeMulti([...docLines, '<'], docLines.length);
        const item = findItem(items, '<setup>');
        assert.ok(item, '<setup> should be in completions');
        const val = item!.insertText && typeof item!.insertText === 'object'
            ? (item!.insertText as { value: string }).value
            : String(item!.insertText ?? '');
        assert.strictEqual(val, 'setup>', 'insertText should be "setup>" (no leading <)');
    });

    test('user-defined anchor detail is "用户定义锚点"', () => {
        const items = completeMulti([...docLines, '<'], docLines.length);
        const item = findItem(items, '<setup>');
        assert.ok(item, '<setup> should be in completions');
        assert.strictEqual(item!.detail, '用户定义锚点');
    });

    test('duplicate anchor definitions only appear once', () => {
        const dupeLines = ['<loop>', '<loop>', '<'];
        const items = completeMulti(dupeLines, 2);
        const loopItems = items.filter(i => i.label === '<loop>');
        assert.strictEqual(loopItems.length, 1, '<loop> should appear only once');
    });

    test('no anchor completions in a document with no anchors', () => {
        const noAnchorLines = ['ECHO >> hello', 'GOTO >> <'];
        const items = completeMulti(noAnchorLines, 1);
        const anchorItems = items.filter(i => i.detail === '用户定义锚点');
        assert.strictEqual(anchorItems.length, 0, 'no user-defined anchors should be offered');
    });

    test('hyphenated anchor <error-handler> is offered after <', () => {
        const lines = ['<error-handler>', 'GOTO >> <'];
        const items = completeMulti(lines, 1);
        assertHasLabel(items, '<error-handler>');
    });

    test('hyphenated anchor insertText does not contain leading <', () => {
        const lines = ['<error-handler>', '<'];
        const items = completeMulti(lines, 1);
        const item = findItem(items, '<error-handler>');
        assert.ok(item, '<error-handler> should be in completions');
        const val = item!.insertText && typeof item!.insertText === 'object'
            ? (item!.insertText as { value: string }).value
            : String(item!.insertText ?? '');
        assert.strictEqual(val, 'error-handler>', 'insertText should be "error-handler>" (no leading <)');
    });
});

suite('CompletionProvider – bracket context range (auto-closed `>`)', () => {
    // language-configuration.json has autoClosingPairs for `<` → `>`.
    // When the user types `<`, VS Code inserts `<>` and leaves the cursor
    // between `<` and `>`.  The bracket-context insertText already ends with
    // `>`, so without a corrective range the editor would produce `<end_if>>`
    // (duplicate `>`).  The provider must set item.range to consume the
    // auto-closed `>`.

    test('item.range is set when `>` immediately follows cursor (bare `<>`)', () => {
        // Line: `<>`, cursor at 1 (between `<` and `>`)
        const items = complete('<>', 1);
        const item = findItem(items, '<end_if>');
        assert.ok(item, '<end_if> should be offered');
        assert.ok(item.range, 'item.range must be set to consume the auto-closed `>`');
        assert.strictEqual(item.range!.end.character, 2,
            'range end must be past the auto-closed `>` (char 1 + 1)');
    });

    test('item.range is set when `>` follows cursor after partial word (`<end_if>`)', () => {
        // Line: `<end_if>`, cursor at 7 (after `f`, before `>`)
        const items = complete('<end_if>', 7);
        const item = findItem(items, '<end_if>');
        assert.ok(item, '<end_if> should be offered');
        assert.ok(item.range, 'item.range must be set to consume the auto-closed `>`');
        assert.strictEqual(item.range!.start.character, 1,
            'range start should be at position of first word char after `<`');
        assert.strictEqual(item.range!.end.character, 8,
            'range end should be one past the auto-closed `>`');
    });

    test('item.range is NOT set when no `>` follows cursor', () => {
        // Line: `<end_if`, cursor at end – no auto-closed `>` present
        const items = complete('<end_if');
        const item = findItem(items, '<end_if>');
        assert.ok(item, '<end_if> should be offered');
        assert.ok(!item.range, 'item.range must NOT be set when there is no auto-closed `>`');
    });

    test('range is set for all items in bracket context', () => {
        // Every item returned in the `<>` bracket context should have the same
        // corrective range so none of them produce a duplicate `>`.
        const items = complete('<>', 1);
        for (const item of items) {
            assert.ok(item.range,
                `item "${item.label}" should have range set in auto-closed bracket context`);
        }
    });
});
