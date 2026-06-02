// ---------------------------------------------------------------------------
// hoverData/timestamps.ts — 时间戳区域的 Hover 提示数据
// ---------------------------------------------------------------------------

import type { HoverEntry } from './types';

export const timestampEntries: Record<string, HoverEntry> = {
    '__TIMESTAMP_DATE__': {
        summary: '`YYYY/MM/DD HH:MM:SS.mmm` — 日志处理时间',
        detail: [
            'CSM 日志系统**记录此条日志时**的时间戳（精确到毫秒）。',
            '',
            '与相对时间戳 `[HH:MM:SS.mmm]` 的差值反映日志队列的处理延迟。',
            '',
            '**格式：** `YYYY/MM/DD HH:MM:SS.mmm`',
        ].join('\n'),
    },
    '__TIMESTAMP_TIME__': {
        summary: '`[HH:MM:SS.mmm]` — 事件源时间',
        detail: [
            '**事件实际发生**时由源模块记录的时间戳（精确到毫秒）。',
            '',
            '用于精确分析事件顺序和时序关系，不受日志队列延迟影响。',
            '',
            '**格式：** `[HH:MM:SS.mmm]`',
        ].join('\n'),
    },
};
