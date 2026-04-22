/**
 * diagnosticProvider.test.ts
 *
 * Unit tests for the CSMScript analyzeDiagnostics() function.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside diagnosticProvider resolves to our stub.
 */

import * as assert from 'assert';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Type stubs (matching vscode-mock.ts shapes)
// ---------------------------------------------------------------------------
interface FakePosition { line: number; character: number }
interface FakeRange { start: FakePosition; end: FakePosition }
interface FakeDiagnostic {
    range: FakeRange;
    message: string;
    severity: number; // 0=Error, 1=Warning, 2=Information, 3=Hint
    code?: string | number;
    source?: string;
}

// Load the compiled provider (vscode is already intercepted by setup.js)
const { analyzeDiagnostics } = require(
    path.resolve(__dirname, '../diagnosticProvider'),
) as { analyzeDiagnostics: (doc: FakeDocument) => FakeDiagnostic[] };

// ---------------------------------------------------------------------------
// Fake TextDocument helper
// ---------------------------------------------------------------------------
interface FakeDocument {
    languageId: string;
    lineCount: number;
    lineAt(n: number): { text: string };
    uri: string;
}

function makeDoc(lines: string[], languageId = 'csmscript'): FakeDocument {
    return {
        languageId,
        lineCount: lines.length,
        lineAt: (n: number) => ({ text: lines[n] }),
        uri: 'fake://test.csmscript',
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const Error = 0;
const Warning = 1;

function codes(diags: FakeDiagnostic[]): (string | number | undefined)[] {
    return diags.map(d => d.code);
}

function messages(diags: FakeDiagnostic[]): string[] {
    return diags.map(d => d.message);
}

function assertNoDiagnostics(lines: string[], desc: string) {
    const diags = analyzeDiagnostics(makeDoc(lines));
    assert.deepStrictEqual(
        diags,
        [],
        `${desc}: expected no diagnostics but got:\n  ${messages(diags).join('\n  ')}`,
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('DiagnosticProvider – clean code (no diagnostics)', () => {

    test('empty document', () => {
        assertNoDiagnostics([], 'empty document');
    });

    test('plain comment lines', () => {
        assertNoDiagnostics(
            ['// This is a comment', '// Another comment'],
            'plain comments',
        );
    });

    test('simple script line', () => {
        assertNoDiagnostics(
            ['API: Connect >> ${host:localhost} -@ Database'],
            'simple script line',
        );
    });

    test('matched <if> / <end_if>', () => {
        assertNoDiagnostics(
            [
                '<if ${mode} = 1>',
                '  API: DoSth >> arg1 -@ TargetModule',
                '<end_if>',
            ],
            'matched if/end_if',
        );
    });

    test('matched <if> / <else> / <end_if>', () => {
        assertNoDiagnostics(
            [
                '<if ${mode} = 1>',
                '  API: DoSth -@ A',
                '<else>',
                '  API: DoOther -@ B',
                '<end_if>',
            ],
            'matched if/else/end_if',
        );
    });

    test('matched <while> / <end_while>', () => {
        assertNoDiagnostics(
            ['<while ${count} > 0>', '  WAIT >> 100', '<end_while>'],
            'matched while/end_while',
        );
    });

    test('matched <do_while> / <end_do_while>', () => {
        assertNoDiagnostics(
            ['<do_while>', '  WAIT >> 100', '<end_do_while ${count} > 0>'],
            'matched do_while/end_do_while',
        );
    });

    test('matched <foreach> / <end_foreach>', () => {
        assertNoDiagnostics(
            ['<foreach item in ${list}>', '  ECHO >> ${item}', '<end_foreach>'],
            'matched foreach/end_foreach',
        );
    });

    test('nested <if> blocks', () => {
        assertNoDiagnostics(
            [
                '<if ${a} = 1>',
                '  <if ${b} = 2>',
                '    ECHO >> nested',
                '  <end_if>',
                '<end_if>',
            ],
            'nested if blocks',
        );
    });

    test('valid <include path>', () => {
        assertNoDiagnostics(
            ['<include SEQ-PCB-Init.csmscript>'],
            'valid include',
        );
    });

    test('anchor tags are not flagged', () => {
        assertNoDiagnostics(
            ['<entry>', 'ECHO >> started', '<error_handler>', 'Error Handler'],
            'anchor tags',
        );
    });

    test('broadcast targets not flagged', () => {
        assertNoDiagnostics(
            ['DataReady >> data -><status>'],
            'broadcast target inline',
        );
    });

    test('variable reference with default value', () => {
        assertNoDiagnostics(
            ['API: Boot >> ${deviceId:SN-001} -@ Fixture'],
            'variable with default',
        );
    });

    test('pre-definition section content', () => {
        assertNoDiagnostics(
            [
                '[AUTO_ERROR_HANDLE]',
                'Enable = TRUE',
                'Anchor = <error_handler>',
            ],
            'ini section',
        );
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT001: unmatched open tag', () => {

    test('<if> without <end_if>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<if ${x} = 1>', '  ECHO >> hi']));
        assert.strictEqual(diags.length, 1, 'should report one diagnostic');
        assert.strictEqual(diags[0].code, 'CSMSCRIPT001');
        assert.strictEqual(diags[0].severity, Error);
        assert.ok(diags[0].message.includes('<if>'), `message: ${diags[0].message}`);
        assert.ok(diags[0].message.includes('<end_if>'), `message: ${diags[0].message}`);
        // Range should point to line 0
        assert.strictEqual(diags[0].range.start.line, 0);
    });

    test('<while> without <end_while>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<while ${n} > 0>', '  WAIT >> 10']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT001');
        assert.ok(diags[0].message.includes('<while>'));
    });

    test('<do_while> without <end_do_while>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<do_while>', '  WAIT >> 10']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT001');
        assert.ok(diags[0].message.includes('<do_while>'));
    });

    test('<foreach> without <end_foreach>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<foreach x in ${list}>', '  ECHO >> ${x}']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT001');
        assert.ok(diags[0].message.includes('<foreach>'));
    });

    test('multiple unclosed <if> blocks', () => {
        const diags = analyzeDiagnostics(makeDoc([
            '<if ${a} = 1>',
            '  <if ${b} = 2>',
            '    ECHO >> hi',
        ]));
        assert.strictEqual(diags.length, 2, 'should report two CSMSCRIPT001 errors');
        assert.ok(codes(diags).every(c => c === 'CSMSCRIPT001'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT002: unexpected close tag', () => {

    test('<end_if> without <if>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<end_if>']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT002');
        assert.strictEqual(diags[0].severity, Error);
        assert.ok(diags[0].message.includes('<end_if>'));
    });

    test('<end_while> without <while>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<end_while>']));
        assert.strictEqual(diags[0].code, 'CSMSCRIPT002');
    });

    test('<end_foreach> without <foreach>', () => {
        const diags = analyzeDiagnostics(makeDoc(['<end_foreach>']));
        assert.strictEqual(diags[0].code, 'CSMSCRIPT002');
    });

    test('<end_if> after a <while> block', () => {
        const diags = analyzeDiagnostics(makeDoc(['<while ${x} > 0>', '  ECHO >> x', '<end_if>']));
        // <end_if> doesn't match <while>, so CSMSCRIPT002; then <while> remains → CSMSCRIPT001
        const c = codes(diags);
        assert.ok(c.includes('CSMSCRIPT002'), `expected CSMSCRIPT002, got ${c}`);
    });

    test('range points to the closing tag line', () => {
        const diags = analyzeDiagnostics(makeDoc(['ECHO >> hi', '<end_if>']));
        assert.strictEqual(diags[0].range.start.line, 1);
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT003: <else> without <if>', () => {

    test('<else> with no open block', () => {
        const diags = analyzeDiagnostics(makeDoc(['<else>']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT003');
        assert.strictEqual(diags[0].severity, Error);
        assert.ok(diags[0].message.includes('<else>'));
    });

    test('<else> inside <while> block', () => {
        const diags = analyzeDiagnostics(makeDoc([
            '<while ${n} > 0>',
            '  <else>',
            '<end_while>',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT003'));
    });

    test('<else> after <end_if> (block already closed)', () => {
        const diags = analyzeDiagnostics(makeDoc([
            '<if ${x} = 1>',
            '<end_if>',
            '<else>',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT003'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT004: unclosed variable reference', () => {

    test('${var without closing brace', () => {
        const diags = analyzeDiagnostics(makeDoc(['API: Foo >> ${unclosed']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT004');
        assert.strictEqual(diags[0].severity, Warning);
        assert.ok(diags[0].message.includes('${unclosed'));
    });

    test('${ without any content', () => {
        const diags = analyzeDiagnostics(makeDoc(['API: Foo >> ${']));
        assert.strictEqual(diags[0].code, 'CSMSCRIPT004');
    });

    test('closed variable reference is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc(['API: Foo >> ${var}']));
        assert.deepStrictEqual(diags, []);
    });

    test('unclosed ${} in comment is ignored', () => {
        // The ${ appears only in the comment part → stripped before checking
        const diags = analyzeDiagnostics(makeDoc(['ECHO >> hi // ${unclosed']));
        assert.deepStrictEqual(diags, []);
    });

    test('range starts at the ${ position', () => {
        const line = 'API: Foo >> ${unclosed';
        const diags = analyzeDiagnostics(makeDoc([line]));
        assert.strictEqual(diags[0].range.start.character, line.indexOf('${'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT005: missing <include> path', () => {

    test('<include> with no path', () => {
        const diags = analyzeDiagnostics(makeDoc(['<include>']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT005');
        assert.strictEqual(diags[0].severity, Warning);
        assert.ok(diags[0].message.includes('<include>'));
    });

    test('<include> with only spaces', () => {
        const diags = analyzeDiagnostics(makeDoc(['<include   >']));
        assert.strictEqual(diags[0].code, 'CSMSCRIPT005');
    });

    test('<include> with a valid path is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc(['<include SEQ-PCB-Init.csmscript>']));
        assert.deepStrictEqual(diags, []);
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT006: range check and conditional jump on same line', () => {

    test('∈ and ?? on same line', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'GetValue >> -@ sensor => value ∈ [0, 100] ?? goto >> <error_handler>',
        ]));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT006');
        assert.strictEqual(diags[0].severity, Error);
        assert.ok(diags[0].message.includes('∈'));
    });

    test('!∈ and ?? on same line', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'ReadTemp >> -@ sensor => temp !∈ [-40, 85] ?? goto >> <err>',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT006'));
    });

    test('∈ with conditional ?expr? on same line', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'GetVal >> -@ dev => val ∈ [0,10] ?${val}>5? goto >> <high>',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT006'));
    });

    test('∈ alone (no conditional jump) is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'GetValue >> -@ sensor => value ∈ [0, 100]',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT006'));
    });

    test('?? alone (no range check) is not flagged as CSMSCRIPT006', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'GetValue >> -@ sensor ?? goto >> <err>',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT006'));
    });

    test('∈ in a comment is ignored', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'GetValue >> -@ sensor ?? goto >> <err> // value ∈ [0,100]',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT006'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT007: string comparison mixed with && / || in EXPRESSION', () => {

    test('equal() && equal() in EXPRESSION', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'EXPRESSION >> a equal(55) && b equal(55) => check',
        ]));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT007');
        assert.strictEqual(diags[0].severity, Error);
        assert.ok(diags[0].message.includes('&&'));
    });

    test('match() || belong() in EXPRESSION', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'EXPRESSION >> a match(hello) || b belong(x,y) => check',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT007'));
    });

    test('equal_s() mixed with &&', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'expression >> val equal_s(OFF) && flag == 1 => result',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT007'));
    });

    test('single equal() without && is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'EXPRESSION >> val equal(hello) => result',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT007'));
    });

    test('arithmetic && in EXPRESSION without string comparison is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'EXPRESSION >> a > 1 && b < 10 => result',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT007'));
    });

    test('string comparison in non-EXPRESSION line is not flagged', () => {
        // equal() in a different context — should not trigger CSMSCRIPT007
        const diags = analyzeDiagnostics(makeDoc([
            'ECHO >> a equal(55) && b equal(55)',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT007'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – CSMSCRIPT008: rnd() in EXPRESSION', () => {

    test('rnd() in EXPRESSION is flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'EXPRESSION >> rnd() + 1 => result',
        ]));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'CSMSCRIPT008');
        assert.strictEqual(diags[0].severity, Warning);
        assert.ok(diags[0].message.includes('rnd()'));
        assert.ok(diags[0].message.includes('RANDOM'));
    });

    test('rnd() in lowercase expression is flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'expression >> rnd() > 0.5 => valid',
        ]));
        assert.ok(codes(diags).includes('CSMSCRIPT008'));
    });

    test('random() (valid) in EXPRESSION is not flagged as CSMSCRIPT008', () => {
        // RANDOM is a built-in command, not a muparser function — no flag
        const diags = analyzeDiagnostics(makeDoc([
            'RANDOM(DBL) => val',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT008'));
    });

    test('rnd in non-EXPRESSION line is not flagged', () => {
        const diags = analyzeDiagnostics(makeDoc([
            'ECHO >> rnd()',
        ]));
        assert.ok(!codes(diags).includes('CSMSCRIPT008'));
    });
});

// ---------------------------------------------------------------------------

suite('DiagnosticProvider – source and language filter', () => {

    test('all diagnostics carry source=csmscript', () => {
        const diags = analyzeDiagnostics(makeDoc(['<if ${x} = 1>']));
        assert.ok(diags.length > 0);
        assert.ok(diags.every(d => d.source === 'csmscript'));
    });

    test('range column of indented tag', () => {
        // Two leading spaces before <if>
        const diags = analyzeDiagnostics(makeDoc(['  <if ${x} = 1>']));
        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].range.start.character, 2, 'column should skip indentation');
    });

    test('tagRange covers full <while …> tag including > inside condition', () => {
        // Tag is `<while ${n} > 0>` — the condition contains `>` so indexOf would truncate
        const line = '<while ${n} > 0>';
        const diags = analyzeDiagnostics(makeDoc([line, '  WAIT >> 10']));
        assert.strictEqual(diags.length, 1); // unclosed <while>
        // The range should end at the last `>` of the tag (col = line.length)
        assert.strictEqual(diags[0].range.end.character, line.length);
    });
});
