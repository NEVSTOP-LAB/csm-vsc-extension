// ---------------------------------------------------------------------------
// hoverData/config.ts — CSM 日志配置项的 Hover 提示数据
// ---------------------------------------------------------------------------

import type { HoverEntry } from './types';

export const configKeyEntries: Record<string, HoverEntry> = {
    'PERIODICLOG.ENABLE': {
        summary: '`PeriodicLog.Enable` — 周期性日志启用开关',
        detail: [
            '控制是否启用周期性日志压缩机制。',
            '',
            '| 值 | 含义 |',
            '|----|------|',
            '| `1` | 启用（重复日志将被合并，减少日志量） |',
            '| `0` | 禁用（每条日志均单独记录） |',
        ].join('\n'),
    },
    'PERIODICLOG.THRESHOLD(#/S)': {
        summary: '`PeriodicLog.Threshold(#/s)` — 周期日志压缩频率阈值',
        detail: [
            '触发日志压缩的频率阈值，单位：**次/秒（#/s）**。',
            '',
            '当某类日志的发生频率超过此阈值时，日志系统将启动周期性合并，',
            '避免高频重复日志淹没有效信息。',
            '',
            '**默认值：** `2.00`',
        ].join('\n'),
    },
    'PERIODICLOG.CHECKPERIOD(S)': {
        summary: '`PeriodicLog.CheckPeriod(s)` — 周期日志检查间隔',
        detail: [
            '日志系统定期检查是否需要触发周期性压缩的时间间隔，单位：**秒（s）**。',
            '',
            '**默认值：** `1.00`',
        ].join('\n'),
    },
};
