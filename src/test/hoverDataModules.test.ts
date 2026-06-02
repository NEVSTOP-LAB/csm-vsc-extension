import * as assert from 'assert';
import { eventTypeEntries } from '../hoverData/events';
import { timestampEntries } from '../hoverData/timestamps';
import { configKeyEntries } from '../hoverData/config';
import { markerEntries } from '../hoverData/markers';
import { getHoverDb } from '../hoverData/db';
import { __setLanguageOverrideForTests } from '../i18n';

suite('hoverData — 事件类型条目', () => {

    test('包含所有 12 种事件类型', () => {
        const keys = Object.keys(eventTypeEntries);
        assert.strictEqual(keys.length, 12);
    });

    test('每种事件类型都有 summary 和 detail', () => {
        for (const [key, entry] of Object.entries(eventTypeEntries)) {
            assert.ok(entry.summary.length > 0, `${key} 缺少 summary`);
            assert.ok(entry.detail && entry.detail.length > 0, `${key} 缺少 detail`);
        }
    });

    test('事件类型在统一 DB 中可查询', () => {
        const db = getHoverDb();
        assert.ok(db['[ERROR]']);
        assert.ok(db['[STATE CHANGE]']);
        assert.ok(db['[MODULE CREATED]']);
        assert.ok(db['[MODULE DESTROYED]']);
    });

    test('事件类型英文翻译不同于中文', () => {
        __setLanguageOverrideForTests('en');
        const enDb = getHoverDb();
        const enSummary = enDb['[ERROR]']?.summary ?? '';
        assert.ok(enSummary.includes('Error Event'), `英文 summary 应包含 'Error Event'，实际：${enSummary}`);
        __setLanguageOverrideForTests(undefined);
    });
});

suite('hoverData — 时间戳条目', () => {

    test('包含日期和相对时间两种条目', () => {
        const keys = Object.keys(timestampEntries);
        assert.strictEqual(keys.length, 2);
        assert.ok(timestampEntries['__TIMESTAMP_DATE__']);
        assert.ok(timestampEntries['__TIMESTAMP_TIME__']);
    });

    test('时间戳条目在统一 DB 中可查询', () => {
        const db = getHoverDb();
        assert.ok(db['__TIMESTAMP_DATE__']);
        assert.ok(db['__TIMESTAMP_TIME__']);
    });
});

suite('hoverData — 配置键条目', () => {

    test('包含 3 个 PeriodicLog 配置项', () => {
        const keys = Object.keys(configKeyEntries);
        assert.strictEqual(keys.length, 3);
    });

    test('配置键在统一 DB 中可查询', () => {
        const db = getHoverDb();
        assert.ok(db['PERIODICLOG.ENABLE']);
        assert.ok(db['PERIODICLOG.THRESHOLD(#/S)']);
        assert.ok(db['PERIODICLOG.CHECKPERIOD(S)']);
    });
});

suite('hoverData — 标记条目', () => {

    test('包含 <- 日志来源标记', () => {
        const keys = Object.keys(markerEntries);
        assert.strictEqual(keys.length, 1);
        assert.ok(markerEntries['<-']);
    });

    test('<- 标记在统一 DB 中可查询', () => {
        const db = getHoverDb();
        const entry = db['<-'];
        assert.ok(entry);
        assert.ok(entry.summary.includes('<-'));
    });
});

suite('hoverData — 统一 DB 完整性', () => {

    test('DB 包含操作符条目', () => {
        const db = getHoverDb();
        // 至少应包含核心操作符
        assert.ok(db['->'], '缺少 -> 操作符');
        assert.ok(db['-@'], '缺少 -@ 操作符');
        assert.ok(db['->|'], '缺少 ->| 操作符');
    });

    test('DB 包含命令条目', () => {
        const db = getHoverDb();
        assert.ok(db['GOTO'], '缺少 GOTO');
        assert.ok(db['WAIT'], '缺少 WAIT');
        assert.ok(db['BREAK'], '缺少 BREAK');
    });

    test('DB 包含控制流条目', () => {
        const db = getHoverDb();
        assert.ok(db['<IF'], '缺少 <IF');
        assert.ok(db['<WHILE'], '缺少 <WHILE');
    });

    test('DB 条目数不少于预期', () => {
        const db = getHoverDb();
        // 操作符(~20) + 命令(~40) + 控制流(~20) + 系统状态(~10) + 事件(12) + 时间戳(2) + 配置(3) + 标记(1) >= 100
        const count = Object.keys(db).length;
        assert.ok(count >= 100, `统一 DB 至少应有 100 个条目，实际：${count}`);
    });
});
