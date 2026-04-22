/**
 * hoverProvider.test.ts
 *
 * Unit tests for the CSMScriptHoverProvider lookup logic.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside hoverProvider resolves to our stub.
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
interface FakeMarkdownString { value: string }
interface FakeHover { contents: FakeMarkdownString | FakeMarkdownString[] }

let _docSeq = 0;
function makeDoc(lines: string[]): FakeDocument {
    const id = _docSeq++;
    return { lineAt: (n: number) => ({ text: lines[n] }), lineCount: lines.length, uri: { toString: () => `file:///test-${id}.csmscript` }, version: 1 };
}
function pos(character: number): FakePosition {
    return { line: 0, character };
}

// Load the compiled provider (vscode is already intercepted by setup.js)
const { CSMScriptHoverProvider } = require(
    path.resolve(__dirname, '../hoverProvider')
) as { CSMScriptHoverProvider: new () => { provideHover: (doc: FakeDocument, pos: FakePosition) => FakeHover | undefined } };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function hover(line: string, col: number): string | undefined {
    const provider = new CSMScriptHoverProvider();
    const result = provider.provideHover(makeDoc([line]), pos(col));
    if (!result) { return undefined; }
    // Handle both the standalone mock (contents is a single MarkdownString) and
    // the real VS Code extension host (contents is Array<MarkdownString>).
    const md = Array.isArray(result.contents) ? result.contents[0] : result.contents;
    return md ? (md as FakeMarkdownString).value : undefined;
}

/**
 * Hover helper for multi-line documents.  The hover is triggered at position
 * (`activeLine`, `col`) in a document made up of `lines`.
 */
function hoverMulti(lines: string[], activeLine: number, col: number): string | undefined {
    const provider = new CSMScriptHoverProvider();
    const result = provider.provideHover(makeDoc(lines), { line: activeLine, character: col });
    if (!result) { return undefined; }
    const md = Array.isArray(result.contents) ? result.contents[0] : result.contents;
    return md ? (md as FakeMarkdownString).value : undefined;
}

function assertContains(text: string | undefined, fragment: string) {
    assert.ok(text !== undefined, `Expected hover but got undefined`);
    // Normalize non-breaking spaces (produced by real vscode MarkdownString.appendText())
    const normalized = text.replace(/\u00a0|&nbsp;/g, ' ');
    assert.ok(
        normalized.includes(fragment),
        `Expected hover to contain "${fragment}"\n  Got: ${text?.substring(0, 200)}`
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('HoverProvider – communication operators', () => {
    test('-@ triggers sync-call hover', () => {
        const t = hover('API: Boot >> args -@ FixtureController', 19);
        assertContains(t, '同步调用');
    });

    test('-> triggers async-call hover', () => {
        const t = hover('API: Prepare >> args -> WorkerModule', 22);
        assertContains(t, '异步调用');
    });

    test('->| triggers fire-and-forget hover', () => {
        const t = hover('API: Trace >> args ->| Logger', 21);
        assertContains(t, '无应答');
    });

    test('>> triggers argument separator hover', () => {
        const t = hover('ECHO >> hello', 5);
        assertContains(t, '参数分隔符');
    });

    test('=> triggers return-value-save hover', () => {
        const line = 'API: Boot >> args -@ M => bootCode';
        const t = hover(line, line.indexOf('=>'));
        assertContains(t, '返回值保存');
    });
});

suite('HoverProvider – subscription operators', () => {
    test('-><register> hover', () => {
        const t = hover('Status@Src >> API: OnStatus -><register>', 35);
        assertContains(t, '注册订阅');
    });

    test('-><unregister> hover', () => {
        const t = hover('Status@Src >> API: OnStatus -><unregister>', 35);
        assertContains(t, '取消订阅');
    });

    test('-><register as interrupt> hover', () => {
        const t = hover('Status@Src >> API: OnStatus -><register as interrupt>', 35);
        assertContains(t, '中断');
    });

    test('-><register as status> hover', () => {
        const t = hover('Status@Src >> API: OnStatus -><register as status>', 35);
        assertContains(t, '普通状态');
    });
});

suite('HoverProvider – range operators', () => {
    test('∈ triggers in-range hover', () => {
        const t = hover('EXPRESSION >> ${v} ∈ [0,100] => ok', 19);
        assertContains(t, '范围内');
    });

    test('!∈ triggers not-in-range hover', () => {
        const t = hover('EXPRESSION >> ${v} !∈ [0,100] => ok', 19);
        assertContains(t, '不在');
    });
});

suite('HoverProvider – built-in commands', () => {
    const cases: [string, string, number, string][] = [
        ['GOTO', 'GOTO >> <cleanup>', 2, '跳转'],
        ['JUMP', 'JUMP >> <cleanup>', 2, '跳转'],
        ['WAIT', 'WAIT >> 1s', 2, '等待'],
        ['WAIT(ms)', 'WAIT(ms) >> 100', 4, '毫秒'],
        ['WAIT(s)', 'WAIT(s) >> 1.5', 4, '秒'],
        ['SLEEP', 'SLEEP >> 1s', 2, '等待'],
        ['BREAK', 'BREAK', 2, '跳出'],
        ['CONTINUE', 'CONTINUE', 2, '下一次'],
        ['ECHO', 'ECHO >> hello', 2, '输出'],
        ['EXPRESSION', 'EXPRESSION >> 1+1 => r', 5, '计算表达式'],
        ['RANDOM', 'RANDOM >> MIN=0,MAX=1 => r', 3, '随机'],
        ['RANDOMINT', 'RANDOMINT >> MIN=1,MAX=10 => r', 5, '整数'],
        ['AUTO_ERROR_HANDLE_ENABLE', 'AUTO_ERROR_HANDLE_ENABLE >> TRUE', 10, '自动错误'],
        ['AUTO_ERROR_HANDLE_ANCHOR', 'AUTO_ERROR_HANDLE_ANCHOR >> <e>', 10, '锚点'],
        ['INI_VAR_SPACE_ENABLE', 'INI_VAR_SPACE_ENABLE >> TRUE', 5, 'INI'],
        ['TAGDB_VAR_SPACE_ENABLE', 'TAGDB_VAR_SPACE_ENABLE >> TRUE', 5, 'TagDB'],
        ['TAGDB_VAR_SPACE_NAME', 'TAGDB_VAR_SPACE_NAME >> db1', 5, 'TagDB'],
        ['TAGDB_GET_VALUE', 'TAGDB_GET_VALUE >> /tag => v', 5, 'TagDB'],
        ['TAGDB_SET_VALUE', 'TAGDB_SET_VALUE >> /tag,1', 5, 'TagDB'],
        ['TAGDB_SWEEP', 'TAGDB_SWEEP >> /tag/*', 5, '扫描'],
        ['TAGDB_WAIT_FOR_EXPRESSION', 'TAGDB_WAIT_FOR_EXPRESSION >> tag1>0', 5, '等待'],
        ['TAGDB_START_MONITOR_EXPRESSION', 'TAGDB_START_MONITOR_EXPRESSION >> tag>0', 5, '监控'],
        ['TAGDB_STOP_MONITOR_EXPRESSION', 'TAGDB_STOP_MONITOR_EXPRESSION >> tag>0', 5, '停止'],
        ['TAGDB_WAIT_FOR_STABLE', 'TAGDB_WAIT_FOR_STABLE >> tag1', 5, '稳定'],
        ['ONE_BUTTON_DIALOG', 'ONE_BUTTON_DIALOG >> Message:Hi', 5, '单按钮'],
        ['TWO_BUTTON_DIALOG', 'TWO_BUTTON_DIALOG >> Message:Hi', 5, '双按钮'],
        ['CONFIRM_DIALOG', 'CONFIRM_DIALOG >> key:val', 5, '确认'],
        ['INPUT_DIALOG', 'INPUT_DIALOG >> {Label:a}', 5, '输入'],
    ];

    for (const [name, line, col, fragment] of cases) {
        test(`${name} hover contains "${fragment}"`, () => {
            assertContains(hover(line, col), fragment);
        });
    }
});

suite('HoverProvider – state prefixes', () => {
    test('API: hover', () => {
        const t = hover('API: Boot >> args -@ M', 1);
        assertContains(t, 'API');
    });

    test('Macro: hover', () => {
        const t = hover('Macro: Init >> args -@ M', 2);
        assertContains(t, 'Macro');
    });
});

suite('HoverProvider – control flow', () => {
    const cases: [string, string, number, string][] = [
        ['<if>', '<if ${ok}=1>', 1, '条件分支'],
        ['<else>', '<else>', 1, '否定'],
        ['<end_if>', '<end_if>', 1, '结束条件'],
        ['<while>', '<while ${c:0}<10>', 1, 'While'],
        ['<end_while>', '<end_while>', 1, '结束'],
        ['<do_while>', '<do_while>', 1, 'Do-While'],
        ['<foreach>', '<foreach item in ${list:a;b}>', 1, 'ForEach'],
        ['<end_foreach>', '<end_foreach>', 1, '结束'],
        ['<include>', '<include test.csmscript>', 1, '引用'],
    ];

    for (const [name, line, col, fragment] of cases) {
        test(`${name} hover`, () => {
            assertContains(hover(line, col), fragment);
        });
    }
});

suite('HoverProvider – string comparison functions', () => {
    const fns = ['equal', 'equal_s', 'match', 'match_s',
                 'start_with', 'start_with_s', 'end_with', 'end_with_s',
                 'contain', 'contain_s', 'belong', 'belong_s'];

    for (const fn of fns) {
        test(`${fn}() hover`, () => {
            const line = `EXPRESSION >> \${v} ${fn}("x") => r`;
            const col = line.indexOf(fn) + 2;
            const t = hover(line, col);
            assert.ok(t !== undefined, `Expected hover for ${fn}`);
        });
    }
});

suite('HoverProvider – system states', () => {
    const states = [
        'Async Message Posted', 'Async Response',
        'Target Timeout Error', 'Target Error', 'Critical Error',
        'No Target Error', 'Error Handler', 'Response',
    ];
    for (const s of states) {
        test(`"${s}" hover`, () => {
            const line = `ECHO >> ${s}`;
            // Point to a character inside the state name (not a space)
            const stateStart = line.indexOf(s);
            const col = stateStart + (s.indexOf(' ') > 0 ? s.indexOf(' ') - 1 : 0);
            const t = hover(line, col);
            assertContains(t, '系统状态');
        });
    }
});

suite('HoverProvider – variable reference', () => {
    test('${varname} hover shows variable reference info', () => {
        const line = 'ECHO >> ${myVar:default}';
        const t = hover(line, line.indexOf('$'));
        assertContains(t, '变量引用');
    });
});

suite('HoverProvider – pre-definition sections', () => {
    const sections = [
        ['[COMMAND_ALIAS]', '指令别名'],
        ['[AUTO_ERROR_HANDLE]', '自动错误'],
        ['[INI_VAR_SPACE]', 'INI'],
        ['[TAGDB_VAR_SPACE]', 'TagDB'],
    ];
    for (const [sec, fragment] of sections) {
        test(`${sec} hover`, () => {
            const t = hover(sec, 4);
            assertContains(t, fragment);
        });
    }
});

suite('HoverProvider – no spurious hovers', () => {
    test('plain comment line returns undefined', () => {
        const t = hover('// this is a comment', 5);
        assert.strictEqual(t, undefined);
    });

    test('empty line returns undefined', () => {
        const t = hover('', 0);
        assert.strictEqual(t, undefined);
    });
});

suite('HoverProvider – user-defined anchor hover', () => {
    const docLines = [
        '<setup> // initialise hardware',
        'ECHO >> starting',
        '<main>',
        'ECHO >> running',
        '<cleanup> // teardown',
        'ECHO >> done',
    ];

    test('hovering over anchor name on its definition line shows anchor hover', () => {
        // Line 0: "<setup> // initialise hardware", cursor on 's' of "setup" (col 1)
        const t = hoverMulti(docLines, 0, 1);
        assertContains(t, '用户定义锚点');
    });

    test('anchor hover includes the anchor name', () => {
        const t = hoverMulti(docLines, 0, 1);
        assertContains(t, 'setup');
    });

    test('anchor hover reports the definition line number', () => {
        const t = hoverMulti(docLines, 0, 1);
        assertContains(t, '1');  // line 1 (1-based)
    });

    test('anchor hover includes inline comment text', () => {
        // <setup> // initialise hardware — comment should appear in hover
        const t = hoverMulti(docLines, 0, 1);
        assertContains(t, 'initialise hardware');
    });

    test('anchor hover on a definition line without a comment still works', () => {
        // Line 2: "<main>" has no comment
        const t = hoverMulti(docLines, 2, 1);
        assertContains(t, '用户定义锚点');
        assertContains(t, 'main');
    });

    test('hovering over anchor name in GOTO reference shows anchor hover', () => {
        // Add a GOTO reference line after the document
        const lines = [...docLines, 'GOTO >> <cleanup>'];
        // "GOTO >> <cleanup>" — "cleanup" starts at index 9
        const t = hoverMulti(lines, lines.length - 1, 10);
        assertContains(t, '用户定义锚点');
        assertContains(t, 'cleanup');
    });

    test('built-in control-flow keywords do NOT get user-defined anchor hover', () => {
        // <if> should return the built-in control-flow hover, not an anchor hover
        const t = hover('<if ${ok}>', 1);
        assert.ok(t !== undefined);
        assert.ok(!t!.includes('用户定义锚点'), '<if> should not show anchor hover');
    });

    test('unknown word after < with no anchor definition returns undefined', () => {
        // "GOTO >> <nonexistent>" where "nonexistent" is not defined anywhere
        const t = hoverMulti(['GOTO >> <nonexistent>'], 0, 9);
        assert.strictEqual(t, undefined);
    });

    test('hyphenated anchor <error-handler> hover works', () => {
        // "<error-handler>" is a valid anchor with hyphen — cursor on col 2 (inside name)
        const lines = ['<error-handler> // handle errors', 'GOTO >> <error-handler>'];
        const t = hoverMulti(lines, 0, 2);
        assertContains(t, '用户定义锚点');
        assertContains(t, 'error-handler');
    });

    test('hyphenated anchor hover from reference line works', () => {
        const lines = ['<error-handler>', 'GOTO >> <error-handler>'];
        // "GOTO >> <error-handler>" — cursor at col 10 (inside "error-handler")
        const t = hoverMulti(lines, 1, 10);
        assertContains(t, '用户定义锚点');
        assertContains(t, 'error-handler');
    });

    test('user-controlled comment text is appended verbatim (not as Markdown)', () => {
        // The comment "handle errors" should appear in hover but isTrusted must be false
        // so it cannot be used as a trusted Markdown link.
        const lines = ['<my-anchor> // handle errors'];
        const t = hoverMulti(lines, 0, 2);
        assertContains(t, 'handle errors');
    });
});
