import * as vscode from 'vscode';
import { HoverEntry, provideContentHover } from './hoverData';

/** Lookup key → hover entry (upper-case keys for case-insensitive matching). */
const CSMLOG_HOVER_DB: Record<string, HoverEntry> = {

    // -----------------------------------------------------------------------
    // Event types (priority order, high → low)
    // -----------------------------------------------------------------------
    '[ERROR]': {
        summary: '`[Error]` — 错误事件 (Priority 1)',
        detail: [
            '**优先级最高**的日志事件，表示模块发生了运行时错误。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Error] ModuleName | 错误描述 <- 来源',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.264 [17:33:05.264] [Error] AI | Target Error <- MeasureModule',
            '```',
        ].join('\n'),
    },
    '[USER LOG]': {
        summary: '`[User Log]` — 用户自定义日志 (Priority 2)',
        detail: [
            '由用户脚本通过 CSM Global Log API 主动写入的日志信息。',
            '相对时间戳字段可选（该事件类型可能无源时间）。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [User Log] ModuleName | 用户信息',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.260 [User Log] TestRunner | Measurement cycle complete: ${result:OK}',
            '```',
        ].join('\n'),
    },
    '[MODULE CREATED]': {
        summary: '`[Module Created]` — 模块创建 (Priority 3)',
        detail: [
            'CSM 模块启动并完成初始化，进入运行状态。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Module Created] ModuleName | VI 信息',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002',
            '```',
        ].join('\n'),
    },
    '[MODULE DESTROYED]': {
        summary: '`[Module Destroyed]` — 模块销毁 (Priority 3)',
        detail: [
            'CSM 模块已停止运行并被销毁。',
            '此事件后通常无管道符和内容字段。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Module Destroyed] ModuleName',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI',
            '```',
        ].join('\n'),
    },
    '[REGISTER]': {
        summary: '`[Register]` — 广播注册 (Priority 4)',
        detail: [
            '模块向 CSM 框架注册，订阅某个广播信号（Status 或 Interrupt）。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Register] ModuleName | API: SignalName -><register>',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.261 [17:33:05.261] [Register] Measure | API: DataReady -><register>',
            '```',
        ].join('\n'),
    },
    '[UNREGISTER]': {
        summary: '`[Unregister]` — 广播取消注册 (Priority 4)',
        detail: [
            '模块取消订阅某个广播信号。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Unregister] ModuleName | API: SignalName -><unregister>',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.262 [17:33:05.262] [Unregister] Measure | API: DataReady -><unregister>',
            '```',
        ].join('\n'),
    },
    '[INTERRUPT]': {
        summary: '`[Interrupt]` — 中断广播 (Priority 5)',
        detail: [
            '模块发出中断广播信号，所有订阅了该信号（以中断方式）的模块将被打断。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Interrupt] ModuleName | SignalName -><interrupt>',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.263 [17:33:05.263] [Interrupt] AI | Interrupt Signal -><interrupt>',
            '```',
        ].join('\n'),
    },
    '[SYNC MESSAGE]': {
        summary: '`[Sync Message]` — 同步消息 (Priority 6)',
        detail: [
            '同步消息发送：发送方等待接收方处理完成后才继续执行（对应 `-@` 操作符）。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Sync Message] Sender | Content -@ Receiver',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:32:59.426 [17:32:59.425] [Sync Message] -SendMsgAPI | VI Reference -@ AI',
            '```',
        ].join('\n'),
    },
    '[ASYNC MESSAGE]': {
        summary: '`[Async Message]` — 异步消息 (Priority 6)',
        detail: [
            '异步消息发送：发送方不等待接收方处理，继续执行（对应 `->` 操作符）。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Async Message] Sender | Content -> Receiver',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:32:59.697 [17:32:59.697] [Async Message] AI | API: Start >> -><interrupt> -> Measure',
            '```',
        ].join('\n'),
    },
    '[NO-REP ASYNC MESSAGE]': {
        summary: '`[No-Rep Async Message]` — 无返回异步消息 (Priority 6)',
        detail: [
            '无应答异步消息（Fire-and-Forget）：发送方不等待任何应答（对应 `->|` 操作符）。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [No-Rep Async Message] Sender | Content ->| Receiver',
            '```',
        ].join('\n'),
    },
    '[STATUS]': {
        summary: '`[Status]` — 状态广播 (Priority 7)',
        detail: [
            '模块发出 Status 广播信号，所有订阅了该信号（以普通状态方式）的模块将收到通知。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Status] ModuleName | SignalName -><status>',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:33:05.264 [17:33:05.264] [Status] Measure | Status: Ready -><status>',
            '```',
        ].join('\n'),
    },
    '[STATE CHANGE]': {
        summary: '`[State Change]` — 状态变化 (Priority 8)',
        detail: [
            '**最常见**的日志事件，记录模块状态机执行的每一个状态变化。',
            '',
            '**格式**',
            '```',
            'YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [State Change] ModuleName | StateName',
            '```',
            '',
            '**示例**',
            '```csmlog',
            '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize',
            '2026/03/20 17:32:59.426 [17:32:59.426] [State Change] AI | Data: Initialize',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Timestamp zones (identified by a synthetic key in the lookup logic)
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Config line keys
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Log origin direction marker
    // -----------------------------------------------------------------------
    '<-': {
        summary: '`<-` — 日志来源标记 (Log Origin)',
        detail: [
            '出现在日志内容中，表示该事件**来自**某个模块或消息源（反向溯源）。',
            '',
            '这是**日志特有**的方向标记，与 脚本中的其他操作符（`->`, `-@`）语义不同，',
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

// ---------------------------------------------------------------------------
// Regex patterns for log line structure
// ---------------------------------------------------------------------------

/** Full date timestamp: YYYY/MM/DD HH:MM:SS.mmm */
const RE_DATE_TS = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/;

/** Config line: - Key | Value */
const RE_CONFIG_LINE = /^-\s+([^|]+?)\s+\|\s+(.+)$/;

/** File logger line: timestamp followed by 2+ spaces (no [relative ts] or [event]) */
const RE_FILE_LOGGER = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s{2,}(?!\[)/;

// ---------------------------------------------------------------------------
// Line zone detection
// ---------------------------------------------------------------------------

interface LogLineZones {
    /** Start and end of the full date timestamp in the line. */
    dateTs?: [number, number];
    /** Start and end of the relative timestamp [HH:MM:SS.mmm]. */
    relTs?: [number, number];
    /** Start and end of the event-type bracket expression. */
    eventType?: [number, number];
    /** Start of the content section (after '|'). -1 if no pipe. */
    contentStart: number;
}

/**
 * Parse a standard log line and return the character ranges for each zone.
 * Returns `null` when the line does not match the expected log format.
 */
function parseLogLineZones(line: string): LogLineZones | null {
    let pos = 0;
    let dateTs: [number, number] | undefined;
    let relTs: [number, number] | undefined;

    // Start may be either full date timestamp or relative timestamp only
    const dateTsMatch = line.match(RE_DATE_TS);
    if (dateTsMatch) {
        dateTs = [0, dateTsMatch[0].length];
        pos = dateTs[1];

        // Optional relative timestamp [HH:MM:SS.mmm] after date timestamp
        const afterDate = line.slice(pos);
        const relTsSpaceMatch = afterDate.match(/^\s+(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/);
        if (relTsSpaceMatch) {
            const start = pos + relTsSpaceMatch[0].indexOf('[');
            const end = start + relTsSpaceMatch[1].length;
            relTs = [start, end];
            pos += relTsSpaceMatch[0].length;
        }
    } else {
        // Relative timestamp only line: [HH:MM:SS.mmm] [Event] Module | ...
        const relTsOnlyMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/);
        if (!relTsOnlyMatch) { return null; }
        relTs = [0, relTsOnlyMatch[0].length];
        pos = relTs[1];
    }

    // Optional event type [EventType]
    let eventType: [number, number] | undefined;
    const afterRelTs = line.slice(pos);
    const eventTypeSpaceMatch = afterRelTs.match(/^\s+(\[[^\]]+\])/);
    if (eventTypeSpaceMatch) {
        const start = pos + eventTypeSpaceMatch[0].indexOf('[');
        const end = start + eventTypeSpaceMatch[1].length;
        eventType = [start, end];
        pos += eventTypeSpaceMatch[0].length;
    }

    // Find the pipe separator
    const pipeIdx = line.indexOf('|', pos);

    return { dateTs, relTs, eventType, contentStart: pipeIdx === -1 ? -1 : pipeIdx + 1 };
}

// ---------------------------------------------------------------------------
// Helper: build a vscode.Hover from a HoverEntry
// ---------------------------------------------------------------------------

function buildHover(entry: HoverEntry): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportHtml = false;
    md.appendMarkdown(`**${entry.summary}**`);
    if (entry.detail) {
        md.appendMarkdown('\n\n---\n\n');
        md.appendMarkdown(entry.detail);
    }
    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// HoverProvider
// ---------------------------------------------------------------------------

export class CSMLogHoverProvider implements vscode.HoverProvider {

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        const line = document.lineAt(position.line).text;
        const col = position.character;

        // 1. Config line: "- Key | Value"
        const configMatch = line.match(RE_CONFIG_LINE);
        if (configMatch && line.startsWith('-')) {
            const keyStart = line.indexOf(configMatch[1]);
            const keyEnd = keyStart + configMatch[1].length;
            if (col >= keyStart && col < keyEnd) {
                const key = configMatch[1].trim().toUpperCase();
                const entry = CSMLOG_HOVER_DB[key];
                if (entry) { return buildHover(entry); }
            }
            // Cursor is on value or outside key — no hover
            return undefined;
        }

        // 2. File logger line (no event type)
        if (RE_FILE_LOGGER.test(line)) {
            // Only hover over the timestamp portion
            const dateTsMatch = line.match(RE_DATE_TS);
            if (dateTsMatch && col < dateTsMatch[0].length) {
                return buildHover(CSMLOG_HOVER_DB['__TIMESTAMP_DATE__']!);
            }
            return undefined;
        }

        // 3. Standard log entry line
        const zones = parseLogLineZones(line);
        if (!zones) { return undefined; }

        const { dateTs, relTs, eventType, contentStart } = zones;

        // Zone: full date timestamp
        if (dateTs && col >= dateTs[0] && col < dateTs[1]) {
            return buildHover(CSMLOG_HOVER_DB['__TIMESTAMP_DATE__']!);
        }

        // Zone: relative timestamp
        if (relTs && col >= relTs[0] && col < relTs[1]) {
            return buildHover(CSMLOG_HOVER_DB['__TIMESTAMP_TIME__']!);
        }

        // Zone: event type bracket
        if (eventType && col >= eventType[0] && col < eventType[1]) {
            const rawType = line.substring(eventType[0], eventType[1]).toUpperCase();
            const entry = CSMLOG_HOVER_DB[rawType];
            if (entry) { return buildHover(entry); }
            // Unknown event type — no hover
            return undefined;
        }

        // Zone: content (after '|') — delegate to content hover
        if (contentStart !== -1 && col >= contentStart) {
            // Check for '<-' log origin marker first
            const contentSection = line.slice(contentStart);
            const originMatch = contentSection.match(/(<-)\s+/);
            if (originMatch) {
                const originStart = contentStart + contentSection.indexOf('<-');
                const originEnd = originStart + 2;
                if (col >= originStart && col < originEnd) {
                    return buildHover(CSMLOG_HOVER_DB['<-']!);
                }
            }
            // Delegate to content hover for operators, commands, variables, etc.
            return provideContentHover(document, position);
        }

        // Zone: module name (between event type and '|') — no hover
        return undefined;
    }
}
