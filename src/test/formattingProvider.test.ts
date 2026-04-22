/**
 * formattingProvider.test.ts
 *
 * Unit tests for the CSMScript formatCSMScript() function.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside formattingProvider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// Load the compiled provider (vscode is already intercepted by setup.js)
const { formatCSMScript } = require(
    path.resolve(__dirname, '../formattingProvider'),
) as { formatCSMScript: (text: string, opts: { insertSpaces: boolean; tabSize: number }) => string };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Format with 2-space indent (default). */
function fmt(text: string, tabSize = 2, insertSpaces = true): string {
    return formatCSMScript(text, { tabSize, insertSpaces });
}

/** Join lines with '\n'. */
function lines(...args: string[]): string {
    return args.join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('FormattingProvider — basics', () => {

    test('empty document', () => {
        assert.strictEqual(fmt(''), '');
    });

    test('single blank line preserved', () => {
        assert.strictEqual(fmt('\n'), '\n');
    });

    test('trailing whitespace is removed', () => {
        assert.strictEqual(fmt('ECHO >> foo   '), 'ECHO >> foo');
        assert.strictEqual(fmt('ECHO >> foo\t'), 'ECHO >> foo');
    });

    test('blank lines inside content are preserved', () => {
        assert.strictEqual(fmt(lines('ECHO >> a', '', 'ECHO >> b')), lines('ECHO >> a', '', 'ECHO >> b'));
    });

    test('CRLF line endings are preserved', () => {
        const input = '<if ${x}=1>\r\nECHO >> yes\r\n<end_if>';
        const output = fmt(input);
        assert.ok(output.includes('\r\n'), 'CRLF should be preserved');
        assert.strictEqual(output, '<if ${x}=1>\r\n  ECHO >> yes\r\n<end_if>');
    });

    test('tab indentation when insertSpaces=false', () => {
        const input = lines('<if ${x}=1>', 'ECHO >> yes', '<end_if>');
        const output = fmt(input, 4, false);
        assert.strictEqual(output, lines('<if ${x}=1>', '\tECHO >> yes', '<end_if>'));
    });

    test('tabSize=4 respected', () => {
        const input = lines('<if ${x}=1>', 'ECHO >> yes', '<end_if>');
        const output = fmt(input, 4, true);
        assert.strictEqual(output, lines('<if ${x}=1>', '    ECHO >> yes', '<end_if>'));
    });
});

suite('FormattingProvider — anchors & special lines', () => {

    test('anchor definition is placed at column 0', () => {
        assert.strictEqual(fmt('  <entry>'), '<entry>');
        assert.strictEqual(fmt('    <error-handler>'), '<error-handler>');
        assert.strictEqual(fmt('\t<cleanup>'), '<cleanup>');
    });

    test('anchor with inline comment at column 0', () => {
        assert.strictEqual(fmt('  <setup> // phase 1'), '<setup> // phase 1');
    });

    test('underscore-leading name is NOT treated as an anchor (indented as regular line)', () => {
        // Old regex accepted <_name>; new one must not
        const input = lines('<if ${ok}=1>', '<_underscore>', '<end_if>');
        const expected = lines('<if ${ok}=1>', '  <_underscore>', '<end_if>');
        assert.strictEqual(fmt(input), expected);
    });

    test('bare <include> is NOT treated as an anchor (indented as regular line)', () => {
        const input = lines('<if ${ok}=1>', '<include>', '<end_if>');
        const expected = lines('<if ${ok}=1>', '  <include>', '<end_if>');
        assert.strictEqual(fmt(input), expected);
    });

    test('INI section header at column 0, indent reset to 0', () => {
        assert.strictEqual(fmt('  [COMMAND_ALIAS]'), '[COMMAND_ALIAS]');
        assert.strictEqual(fmt('  [AUTO_ERROR_HANDLE]'), '[AUTO_ERROR_HANDLE]');
    });

    test('INI section header line with trailing text is not treated as a section header', () => {
        // A line like "[SECTION] trailing" should NOT reset indent or go to column 0
        const input = lines('<if ${x}=1>', '[SECTION] trailing-text', '<end_if>');
        const expected = lines('<if ${x}=1>', '  [SECTION] trailing-text', '<end_if>');
        assert.strictEqual(fmt(input), expected);
    });

    test('comment-only line gets current indentation', () => {
        const input = lines('<if ${x}=1>', '// inside comment', '<end_if>');
        const expected = lines('<if ${x}=1>', '  // inside comment', '<end_if>');
        assert.strictEqual(fmt(input), expected);
    });

    test('top-level comment has no indentation', () => {
        assert.strictEqual(fmt('// top comment'), '// top comment');
    });
});

suite('FormattingProvider — control-flow indentation', () => {

    test('if / end_if', () => {
        const input = lines(
            '<if ${x}=1>',
            'ECHO >> yes',
            '<end_if>',
        );
        const expected = lines(
            '<if ${x}=1>',
            '  ECHO >> yes',
            '<end_if>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('if / else / end_if', () => {
        const input = lines(
            '<if ${x}=1>',
            'ECHO >> yes',
            '<else>',
            'ECHO >> no',
            '<end_if>',
        );
        const expected = lines(
            '<if ${x}=1>',
            '  ECHO >> yes',
            '<else>',
            '  ECHO >> no',
            '<end_if>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('while / end_while', () => {
        const input = lines(
            '<while ${n:0}<5>',
            'ECHO >> loop',
            '<end_while>',
        );
        const expected = lines(
            '<while ${n:0}<5>',
            '  ECHO >> loop',
            '<end_while>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('do_while / end_do_while', () => {
        const input = lines(
            '<do_while>',
            'ECHO >> body',
            '<end_do_while ${n:0}<5>',
        );
        const expected = lines(
            '<do_while>',
            '  ECHO >> body',
            '<end_do_while ${n:0}<5>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('foreach / end_foreach', () => {
        const input = lines(
            '<foreach item in ${list:a;b;c}>',
            'ECHO >> ${item}',
            '<end_foreach>',
        );
        const expected = lines(
            '<foreach item in ${list:a;b;c}>',
            '  ECHO >> ${item}',
            '<end_foreach>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('nested while inside if', () => {
        const input = lines(
            '<if ${ok}=1>',
            '<while ${n}<3>',
            'ECHO >> work',
            '<end_while>',
            '<end_if>',
        );
        const expected = lines(
            '<if ${ok}=1>',
            '  <while ${n}<3>',
            '    ECHO >> work',
            '  <end_while>',
            '<end_if>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('deeply nested: while > do_while', () => {
        const input = lines(
            '<while ${n:0}<5>',
            'ECHO >> outer',
            '<do_while>',
            'ECHO >> inner',
            '<end_do_while ${n:0}<1>',
            'BREAK',
            '<end_while>',
        );
        const expected = lines(
            '<while ${n:0}<5>',
            '  ECHO >> outer',
            '  <do_while>',
            '    ECHO >> inner',
            '  <end_do_while ${n:0}<1>',
            '  BREAK',
            '<end_while>',
        );
        assert.strictEqual(fmt(input), expected);
    });

    test('indent level never goes below 0', () => {
        // Malformed: extra end_if with no matching if
        const input = lines('ECHO >> a', '<end_if>', 'ECHO >> b');
        const expected = lines('ECHO >> a', '<end_if>', 'ECHO >> b');
        assert.strictEqual(fmt(input), expected);
    });
});

suite('FormattingProvider — already-formatted code is unchanged', () => {

    test('already-indented if/else/end_if unchanged', () => {
        const code = lines(
            '<if ${x}=1>',
            '  ECHO >> yes',
            '<else>',
            '  ECHO >> no',
            '<end_if>',
        );
        assert.strictEqual(fmt(code), code);
    });

    test('anchor at column 0 unchanged', () => {
        const code = lines(
            '<setup>',
            'API: Init >> param -@ Module',
            '',
            '<cleanup>',
            'API: Close -@ Module',
        );
        assert.strictEqual(fmt(code), code);
    });
});

suite('FormattingProvider — full script sample', () => {

    test('predefinition section + script section', () => {
        const input = lines(
            '[COMMAND_ALIAS]',
            'MyCmd = API: DoThing -@ Worker',
            '',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            '',
            '<entry>',
            'MyCmd',
            '<if ${result}=1>',
            'ECHO >> pass',
            '<else>',
            'ECHO >> fail',
            '<end_if>',
        );
        const expected = lines(
            '[COMMAND_ALIAS]',
            'MyCmd = API: DoThing -@ Worker',
            '',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            '',
            '<entry>',
            'MyCmd',
            '<if ${result}=1>',
            '  ECHO >> pass',
            '<else>',
            '  ECHO >> fail',
            '<end_if>',
        );
        assert.strictEqual(fmt(input), expected);
    });
});

suite('FormattingProvider — include directive', () => {

    test('<include path> is indented like a regular command', () => {
        const input = lines(
            '<if ${x}=1>',
            '<include sub-sequence.csmscript>',
            '<end_if>',
        );
        const expected = lines(
            '<if ${x}=1>',
            '  <include sub-sequence.csmscript>',
            '<end_if>',
        );
        assert.strictEqual(fmt(input), expected);
    });
});
