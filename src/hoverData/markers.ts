// ---------------------------------------------------------------------------
// hoverData/markers.ts — 日志标记符号的 Hover 提示数据
// ---------------------------------------------------------------------------

import type { HoverEntry } from './types';

export const markerEntries: Record<string, HoverEntry> = {
    '<-': {
        summary: '`<-` — 日志来源标记 (Log Origin)',
        detail: [
            '出现在日志内容中，表示该事件**来自**某个模块或消息源（反向溯源）。',
            '',
            '这是**日志特有**的方向标记，与脚本中的其他操作符（`->`, `-@`）语义不同，',
            '仅用于日志链路追踪，不表示发送操作。',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.264 [17:33:05.264] [Error] AI | Target Error <- MeasureModule',
            '```',
            '',
            '此处 `<- MeasureModule` 表示该错误来源于 `MeasureModule`。',
        ].join('\n'),
    },
};
