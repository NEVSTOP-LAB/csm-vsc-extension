// ---------------------------------------------------------------------------
// common/constants.ts — 跨模块共享的 CSM 日志正则与常量
// ---------------------------------------------------------------------------

/**
 * 完整日期时间戳：YYYY/MM/DD HH:MM:SS.mmm
 *
 * 使用 String.raw 确保反斜杠在正则和字符串拼接中一致。
 */
export const CSMLOG_DATETIME_PATTERN = String.raw`\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}`;

/**
 * 完整日期时间戳 RegExp（锚定行首）。
 */
export const RE_DATE_TS = new RegExp(`^${CSMLOG_DATETIME_PATTERN}`);

/**
 * 相对时间戳：[HH:MM:SS.mmm]
 */
export const CSMLOG_RELATIVE_TS_PATTERN = String.raw`\[\d{2}:\d{2}:\d{2}\.\d{3}\]`;

/**
 * 可选的前置空白 + 相对时间戳（用于拼接在日期时间戳后面）。
 */
export const CSMLOG_OPTIONAL_RELATIVE_TIMESTAMP_PATTERN = String.raw`(?:\s+${CSMLOG_RELATIVE_TS_PATTERN})?`;

/**
 * 配置行：- Key | Value
 */
export const CONFIG_LINE_REGEX = /^-\s+([^|]+?)\s+\|\s+(.+)$/;

/**
 * 配置行（仅匹配 Key 部分，用于 DocumentSymbol）。
 */
export const CONFIG_KEY_REGEX = /^-\s+([^|]+?)\s+\|\s+.+$/;

/**
 * File Logger 行：日期时间戳后跟 2+ 空格（无 [相对时间戳] 或 [事件类型]）。
 */
export const RE_FILE_LOGGER = new RegExp(`^${CSMLOG_DATETIME_PATTERN}\\s{2,}(?!\\[)`);

/**
 * 生命周期事件：[Module Created] / [Module Destroyed]
 */
export const CSMLOG_LIFECYCLE_EVENT_PATTERN = String.raw`\[(Module Created|Module Destroyed)\]`;

/**
 * 可选的模块名（事件后面，在 `|` 之前）。
 */
export const CSMLOG_OPTIONAL_MODULE_NAME_PATTERN = String.raw`(?:\s+([^|]+?)(?:\s+\||$))?`;

/**
 * 模块生命周期行完整正则。
 */
export const MODULE_LIFECYCLE_REGEX = new RegExp(
    `^${CSMLOG_DATETIME_PATTERN}${CSMLOG_OPTIONAL_RELATIVE_TIMESTAMP_PATTERN}\\s+${CSMLOG_LIFECYCLE_EVENT_PATTERN}${CSMLOG_OPTIONAL_MODULE_NAME_PATTERN}`,
);

/**
 * Logger 系统消息行：时间戳后跟 `<Label>`。
 */
export const LOGGER_MESSAGE_REGEX = new RegExp(`^${CSMLOG_DATETIME_PATTERN}\\s+<([^>]+)>`);

/**
 * INI section 头：[SectionName]
 */
export const INI_SECTION_REGEX = /^\s*\[([^\]]+)\]/;
