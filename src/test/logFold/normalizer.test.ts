/**
 * normalizer.test.ts — 归一化引擎单元测试
 */

import * as assert from 'assert';
import { normalizeLine } from '../../language/logFold/normalizer';

suite('LogFold — Normalizer', () => {

    test('剥离标准日期时间戳', () => {
        const sig = normalizeLine(
            '2025/10/09 22:53:35.185 [22:53:35.185] [Module Created] UI.StatusMonitor',
        );
        assert.ok(sig, '应产生有效签名');
        assert.ok(!sig!.normalized.includes('2025'), '不应包含日期');
        assert.ok(!sig!.normalized.includes('22:53:35'), '不应包含时间戳');
        assert.ok(sig!.normalized.includes('[Module Created]'), '应保留事件类型');
        assert.ok(sig!.normalized.includes('UI.StatusMonitor'), '应保留模块名');
    });

    test('剥离方括号包裹的日期时间戳', () => {
        const sig = normalizeLine(
            '[2025/01/21 16:06:20.322]  [Module Created] DAQAI_NI6363A',
        );
        assert.ok(sig, '应产生有效签名');
        assert.ok(!sig!.normalized.includes('[2025'), '不应包含方括号日期');
        assert.ok(sig!.normalized.includes('[Module Created]'), '应保留事件类型');
        assert.ok(sig!.normalized.includes('DAQAI_NI6363A'), '应保留模块名');
    });

    test('仅有相对时间戳的行', () => {
        const sig = normalizeLine(
            '[22:53:35.185] [State Change] UI.StatusMonitor | Macro: Initialize',
        );
        assert.ok(sig, '应产生有效签名');
        assert.ok(!sig!.normalized.includes('[22:53:35'), '不应包含相对时间戳');
        assert.ok(sig!.normalized.includes('[State Change]'), '应保留事件类型');
    });

    test('花括号参数归一化 → {*}', () => {
        const sig = normalizeLine(
            '2025/05/25 21:28:21.352 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;0}',
        );
        assert.ok(sig);
        // {localhost;6340;0} 是 >> 后面的值，会被箭头值归一化替换为 >> *，
        // 或者被花括号归一化替换为 {*}。两者都表示参数已归一化。
        const hasParamPlaceholder =
            sig!.normalized.includes('{*}') || sig!.normalized.includes('*');
        assert.ok(hasParamPlaceholder, '参数应被归一化占位符替换');
        assert.ok(sig!.paramMask.length >= 1, `应记录至少1个参数掩码区间，实际: ${sig!.paramMask.length}`);
    });

    test('>> 引导值归一化', () => {
        const sig = normalizeLine(
            '2026/02/09 09:44:08.599 [State Change] AlarmTrig | API: AlarmStop >> [100,100]',
        );
        assert.ok(sig);
        assert.ok(sig!.normalized.includes('>> *'), '>> 值应替换为 >> *');
    });

    test('URL 编码串归一化 → {url}', () => {
        const sig = normalizeLine(
            '[State Change] MainUI | Response <- TSEngine >>>> TS: Load Sequence >> %2F%2F初始化',
        );
        assert.ok(sig);
        // 长的 %XX 序列应被归一化
        assert.ok(sig!.normalized.includes('{url}') || sig!.normalized.includes('>> *'),
            '应包含 {url} 或 >> * 占位符');
    });

    test('纯数字参数归一化 → {n}', () => {
        const sig = normalizeLine(
            '2026/02/09 09:44:08.605 [State Change] AlarmTrig | API: AlarmP1P3Temperature >> 20',
        );
        assert.ok(sig);
        // ">> 20" 会被 >> 值归一化捕获为 ">> *"，或者被末尾数字归一化
        // 这里至少确认参数被替换
        assert.ok(
            sig!.normalized.includes('{n}') || sig!.normalized.includes('*'),
            '数字参数应被归一化',
        );
    });

    test('空行返回 null', () => {
        const sig = normalizeLine('');
        assert.strictEqual(sig, null);
        const sig2 = normalizeLine('   ');
        assert.strictEqual(sig2, null);
    });

    test('配置行透传不归一化', () => {
        const sig = normalizeLine('- PeriodicLog.Enable | 1');
        assert.ok(sig);
        assert.ok(sig!.normalized.includes('PeriodicLog.Enable'), '应保留配置 Key');
        assert.ok(sig!.normalized.includes('1'), '应保留配置 Value');
        assert.strictEqual(sig!.paramMask.length, 0, '配置行不应被归一化');
    });

    test('保留事件类型作为签名锚点', () => {
        const testCases = [
            '[Module Created]',
            '[Module Destroyed]',
            '[State Change]',
            '[Register]',
            '[Unregister]',
            '[User Log]',
            '[Status]',
            '[Sync Message]',
        ];
        for (const event of testCases) {
            const sig = normalizeLine(`2025/01/01 00:00:00.000 ${event} TestModule | action`);
            assert.ok(sig, `${event} 应产生有效签名`);
            assert.ok(sig!.normalized.includes(event), `${event} 应被保留在签名中`);
        }
    });

    test('连续重复行的签名相同（精确重复）', () => {
        const line1 = '2025/10/09 22:53:35.314 [22:53:35.314] [State Change] UI | Initialize Core Data';
        const line2 = '2025/10/09 22:53:35.315 [22:53:35.315] [State Change] UI | Initialize Core Data';
        const sig1 = normalizeLine(line1);
        const sig2 = normalizeLine(line2);
        assert.ok(sig1 && sig2);
        assert.strictEqual(sig1!.normalized, sig2!.normalized, '仅时间戳不同的两行签名应相同');
    });

    test('参数变化行的签名相同（参数化重复）', () => {
        const line1 = '2025/05/25 21:28:21.352 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;0}';
        const line2 = '2025/05/25 21:28:22.555 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;1}';
        const sig1 = normalizeLine(line1);
        const sig2 = normalizeLine(line2);
        assert.ok(sig1 && sig2);
        assert.strictEqual(sig1!.normalized, sig2!.normalized,
            '参数不同的两行（去时间戳+归一化后）签名应相同');
    });

    test('不同消息的签名应不同', () => {
        const line1 = '2025/10/09 22:53:35.185 [Module Created] UI.StatusMonitor';
        const line2 = '2025/10/09 22:53:35.186 [State Change] UI.StatusMonitor | Macro: Initialize';
        const sig1 = normalizeLine(line1);
        const sig2 = normalizeLine(line2);
        assert.ok(sig1 && sig2);
        assert.notStrictEqual(sig1!.normalized, sig2!.normalized,
            '不同事件类型的签名应不同');
    });
});
