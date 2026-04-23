/**
 * csmlogHoverProvider.test.ts
 *
 * Unit tests for the CSMLogHoverProvider lookup logic.
 * Runs standalone (no VS Code process needed).
 *
 * The `vscode` module is intercepted by out/test/setup.js (--require),
 * so require('vscode') inside csmlogHoverProvider resolves to our stub.
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
    return { lineAt: (n: number) => ({ text: lines[n] }), lineCount: lines.length, uri: { toString: () => `file:///test-${id}.csmlog` }, version: 1 };
}
function pos(character: number): FakePosition {
    return { line: 0, character };
}

// Load the compiled provider (vscode is already intercepted by setup.js)
const { CSMLogHoverProvider } = require(
    path.resolve(__dirname, '../csmlogHoverProvider')
) as { CSMLogHoverProvider: new () => { provideHover: (doc: FakeDocument, pos: FakePosition) => FakeHover | undefined } };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function hover(line: string, col: number): string | undefined {
    const provider = new CSMLogHoverProvider();
    const result = provider.provideHover(makeDoc([line]), pos(col));
    if (!result) { return undefined; }
    const md = Array.isArray(result.contents) ? result.contents[0] : result.contents;
    return md ? (md as FakeMarkdownString).value : undefined;
}

function assertContains(text: string | undefined, fragment: string) {
    assert.ok(text !== undefined, `Expected hover but got undefined`);
    const normalized = text.replace(/\u00a0|&nbsp;/g, ' ');
    assert.ok(
        normalized.includes(fragment),
        `Expected hover to contain "${fragment}"\n  Got: ${text?.substring(0, 200)}`
    );
}

// ---------------------------------------------------------------------------
// Sample log lines (matching src/test/fixtures/sample.csmlog)
// ---------------------------------------------------------------------------
const LINE_STATE_CHANGE   = '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize';
const LINE_SYNC_MSG       = '2026/03/20 17:32:59.426 [17:32:59.425] [Sync Message] -SendMsgAPI2BA5CB1425E8 | VI Reference -@ AI';
const LINE_ASYNC_MSG      = '2026/03/20 17:32:59.697 [17:32:59.697] [Async Message] AI | API: Start >> -><interrupt> -> Measure';
const LINE_MOD_CREATED    = '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002';
const LINE_MOD_DESTROYED  = '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI';
const LINE_ERROR          = '2026/03/20 17:33:05.264 [17:33:05.264] [Error] AI | Target Error <- MeasureModule';
const LINE_USER_LOG       = '2026/03/20 17:33:05.260 [User Log] TestRunner | Measurement cycle complete: ${result:OK}';
const LINE_REGISTER       = '2026/03/20 17:33:05.261 [17:33:05.261] [Register] Measure | API: DataReady -><register>';
const LINE_UNREGISTER     = '2026/03/20 17:33:05.262 [17:33:05.262] [Unregister] Measure | API: DataReady -><unregister>';
const LINE_INTERRUPT      = '2026/03/20 17:33:05.263 [17:33:05.263] [Interrupt] AI | Interrupt Signal -><interrupt>';
const LINE_STATUS         = '2026/03/20 17:33:05.264 [17:33:05.264] [Status] Measure | Status: Ready -><status>';
const LINE_NO_REP_ASYNC   = '2026/03/20 17:33:05.264 [17:33:05.264] [No-Rep Async Message] AI | API: Notify ->| Logger';
const LINE_REL_ONLY_STATE = '[18:09:45.933] [State Change] App | Response <- Measure >>>> Macro: Exit';
const LINE_FILE_LOGGER    = '2026/03/11 18:09:47.330  System started successfully';
const LINE_CONFIG_ENABLE  = '- PeriodicLog.Enable | 1';
const LINE_CONFIG_THRESH  = '- PeriodicLog.Threshold(#/s) | 2.00';
const LINE_CONFIG_PERIOD  = '- PeriodicLog.CheckPeriod(s) | 1.00';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('CSMLogHoverProvider – event types', () => {
    test('[State Change] hover contains "状态变化"', () => {
        const col = LINE_STATE_CHANGE.indexOf('[State Change]') + 2;
        assertContains(hover(LINE_STATE_CHANGE, col), '状态变化');
    });

    test('[Sync Message] hover contains "同步消息"', () => {
        const col = LINE_SYNC_MSG.indexOf('[Sync Message]') + 2;
        assertContains(hover(LINE_SYNC_MSG, col), '同步消息');
    });

    test('[Async Message] hover contains "异步消息"', () => {
        const col = LINE_ASYNC_MSG.indexOf('[Async Message]') + 2;
        assertContains(hover(LINE_ASYNC_MSG, col), '异步消息');
    });

    test('[Module Created] hover contains "模块创建"', () => {
        const col = LINE_MOD_CREATED.indexOf('[Module Created]') + 2;
        assertContains(hover(LINE_MOD_CREATED, col), '模块创建');
    });

    test('[Module Destroyed] hover contains "模块销毁"', () => {
        const col = LINE_MOD_DESTROYED.indexOf('[Module Destroyed]') + 2;
        assertContains(hover(LINE_MOD_DESTROYED, col), '模块销毁');
    });

    test('[Error] hover contains "错误事件"', () => {
        const col = LINE_ERROR.indexOf('[Error]') + 2;
        assertContains(hover(LINE_ERROR, col), '错误事件');
    });

    test('[User Log] hover contains "用户自定义日志"', () => {
        const col = LINE_USER_LOG.indexOf('[User Log]') + 2;
        assertContains(hover(LINE_USER_LOG, col), '用户自定义日志');
    });

    test('[Register] hover contains "广播注册"', () => {
        const col = LINE_REGISTER.indexOf('[Register]') + 2;
        assertContains(hover(LINE_REGISTER, col), '广播注册');
    });

    test('[Unregister] hover contains "广播取消注册"', () => {
        const col = LINE_UNREGISTER.indexOf('[Unregister]') + 2;
        assertContains(hover(LINE_UNREGISTER, col), '广播取消注册');
    });

    test('[Interrupt] hover contains "中断广播"', () => {
        const col = LINE_INTERRUPT.indexOf('[Interrupt]') + 2;
        assertContains(hover(LINE_INTERRUPT, col), '中断广播');
    });

    test('[Status] hover contains "状态广播"', () => {
        const col = LINE_STATUS.indexOf('[Status]') + 2;
        assertContains(hover(LINE_STATUS, col), '状态广播');
    });

    test('[No-Rep Async Message] hover contains "无应答异步消息"', () => {
        const col = LINE_NO_REP_ASYNC.indexOf('[No-Rep Async Message]') + 2;
        assertContains(hover(LINE_NO_REP_ASYNC, col), '无应答异步消息');
    });
});

suite('CSMLogHoverProvider – timestamps', () => {
    test('full date timestamp hover contains "处理时间"', () => {
        // Cursor at column 5 (inside "2026/03/20 17:32:59.426")
        assertContains(hover(LINE_STATE_CHANGE, 5), '处理时间');
    });

    test('relative timestamp hover contains "源时间"', () => {
        // Cursor inside "[17:32:59.425]"
        const col = LINE_STATE_CHANGE.indexOf('[17:32:59.425]') + 3;
        assertContains(hover(LINE_STATE_CHANGE, col), '源时间');
    });

    test('file logger timestamp hover contains "处理时间"', () => {
        assertContains(hover(LINE_FILE_LOGGER, 5), '处理时间');
    });

    test('file logger message area returns undefined', () => {
        // Cursor past the timestamp in the plain-text area
        const col = LINE_FILE_LOGGER.indexOf('System');
        assert.strictEqual(hover(LINE_FILE_LOGGER, col), undefined);
    });
});

suite('CSMLogHoverProvider – timestamp hover without relative timestamp', () => {
    const LINE_NO_REL_TS = '2026/03/11 18:09:40.589 [Error] AI | Target Error <- Mod';

    test('absolute timestamp hover still works when no relative timestamp', () => {
        assertContains(hover(LINE_NO_REL_TS, 5), '处理时间');
    });

    test('event-type hover fires where relative timestamp would have been', () => {
        // Column inside [Error] — event-type hover should trigger, not timestamp hover
        const col = LINE_NO_REL_TS.indexOf('[Error]') + 1;
        assertContains(hover(LINE_NO_REL_TS, col), '错误事件');
    });

    test('no hover returned for column between absolute ts end and event type', () => {
        // Column 23 is the space between the absolute timestamp and [Error]
        // It falls outside all named zones — no hover expected
        assert.strictEqual(hover(LINE_NO_REL_TS, 23), undefined);
    });
});

suite('CSMLogHoverProvider – relative timestamp only lines', () => {
    test('relative timestamp hover works on line without absolute timestamp', () => {
        const col = LINE_REL_ONLY_STATE.indexOf('[18:09:45.933]') + 3;
        assertContains(hover(LINE_REL_ONLY_STATE, col), '源时间');
    });

    test('event-type hover works on line without absolute timestamp', () => {
        const col = LINE_REL_ONLY_STATE.indexOf('[State Change]') + 2;
        assertContains(hover(LINE_REL_ONLY_STATE, col), '状态变化');
    });

    test('origin marker hover still works on line without absolute timestamp', () => {
        const col = LINE_REL_ONLY_STATE.indexOf('<-');
        assertContains(hover(LINE_REL_ONLY_STATE, col), '来源');
    });
});
suite('CSMLogHoverProvider – config line keys', () => {
    test('PeriodicLog.Enable hover contains "周期性日志"', () => {
        const col = LINE_CONFIG_ENABLE.indexOf('PeriodicLog.Enable') + 5;
        assertContains(hover(LINE_CONFIG_ENABLE, col), '周期性日志');
    });

    test('PeriodicLog.Threshold hover contains "频率阈值"', () => {
        const col = LINE_CONFIG_THRESH.indexOf('PeriodicLog.Threshold') + 5;
        assertContains(hover(LINE_CONFIG_THRESH, col), '频率阈值');
    });

    test('PeriodicLog.CheckPeriod hover contains "检查间隔"', () => {
        const col = LINE_CONFIG_PERIOD.indexOf('PeriodicLog.CheckPeriod') + 5;
        assertContains(hover(LINE_CONFIG_PERIOD, col), '检查间隔');
    });
});

suite('CSMLogHoverProvider – log origin marker', () => {
    test('<- hover contains "来源"', () => {
        const col = LINE_ERROR.indexOf('<-');
        assertContains(hover(LINE_ERROR, col), '来源');
    });
});

suite('CSMLogHoverProvider – CSM delegation', () => {
    test('-> in log content triggers async-call hover', () => {
        // LINE_ASYNC_MSG: "... | API: Start >> -><interrupt> -> Measure"
        // The standalone '->' operator appears after '<interrupt>'
        const col = LINE_ASYNC_MSG.lastIndexOf('->');
        assertContains(hover(LINE_ASYNC_MSG, col), '异步调用');
    });

    test('-@ in log content triggers sync-call hover', () => {
        // LINE_SYNC_MSG: "... | VI Reference -@ AI"
        const col = LINE_SYNC_MSG.indexOf('-@');
        assertContains(hover(LINE_SYNC_MSG, col), '同步调用');
    });

    test('${var} in log content triggers variable-reference hover', () => {
        // LINE_USER_LOG: "... | Measurement cycle complete: ${result:OK}"
        const col = LINE_USER_LOG.indexOf('${');
        assertContains(hover(LINE_USER_LOG, col), '变量引用');
    });
});

suite('CSMLogHoverProvider – no spurious hovers', () => {
    test('module name zone returns undefined', () => {
        // "AI" is the module name in LINE_STATE_CHANGE, between ']' and '|'
        const eventTypeEnd = LINE_STATE_CHANGE.indexOf('[State Change]') + '[State Change]'.length;
        const pipeIdx = LINE_STATE_CHANGE.indexOf('|');
        const moduleCol = Math.floor((eventTypeEnd + pipeIdx) / 2);
        assert.strictEqual(hover(LINE_STATE_CHANGE, moduleCol), undefined);
    });

    test('plain text line returns undefined', () => {
        assert.strictEqual(hover('This is a plain text line', 5), undefined);
    });

    test('empty line returns undefined', () => {
        assert.strictEqual(hover('', 0), undefined);
    });
});
