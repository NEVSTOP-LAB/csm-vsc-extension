// ---------------------------------------------------------------------------
// src/logFold/normalizer.ts — 行签名归一化引擎
// ---------------------------------------------------------------------------

import { LineSignature } from './types';
import {
    CSMLOG_DATETIME_PATTERN,
    CSMLOG_RELATIVE_TS_PATTERN,
} from '../../common/constants';

// ---------------------------------------------------------------------------
// 正则定义（无全局标志 — 在 replace 回调中使用 offset 参数定位）
// ---------------------------------------------------------------------------

/** 完整日期时间戳（行首） */
const RE_DATE_TS = new RegExp(`^${CSMLOG_DATETIME_PATTERN}`);
/** 相对时间戳 [HH:MM:SS.mmm]（全局，用于剥离） */
const RE_REL_TS = new RegExp(CSMLOG_RELATIVE_TS_PATTERN, 'g');

/**
 * CSM 参数块：{key;value;...}  或  {key:value,...}
 * 匹配花括号包裹的任意内容（非贪婪）。使用全局标志以匹配多个。
 */
const RE_PARAM_BRACE = /\{[^}]*\}/g;

/**
 * `>>` 引导的值：`>> 具体值` 直到行尾或 `<-` 前。
 */
const RE_ARROW_VALUE = />>\s+([^<\n]+?)(?=\s*<-|$)/g;

/**
 * URL 编码字符串（连续的 %XX 序列）。
 */
const RE_URL_ENCODED = /(?:%[0-9A-Fa-f]{2}){3,}/g;

/**
 * 行尾纯数字参数（至少 2 位数字）。
 * 注意：为避免 lastIndex 问题，不使用全局标志；改为在循环中手动应用。
 */
const RE_TRAILING_NUMBERS = /(?<=\s)(\d{2,}(?:\.\d+)?)\s*$/;

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 对一行 CSM 日志文本进行归一化，产出 `LineSignature`。
 *
 * 处理步骤：
 *  1. 剥离时间戳（完整日期 + 相对时间戳）
 *  2. 保留事件类型锚点（如 `[State Change]`）
 *  3. 四级参数归一化（使用 replace 回调的 offset 参数精确定位）
 *  4. 产出 paramMask（记录被替换区间，相对于剥离时间戳后的文本）
 *
 * @param raw 原始日志行
 * @returns 归一化后的签名，若行无有效内容则返回 null
 */
export function normalizeLine(raw: string): LineSignature | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }
    // 配置行 → 不作为重复候选
    if (trimmed.startsWith('-') && trimmed.includes('|')) {
        return { normalized: raw, paramMask: [], strippedOffset: 0 };
    }

    const paramMask: Array<[number, number]> = [];

    // ---- 1. 剥离完整日期时间戳 ----
    let text = raw;
    const dateMatch = text.match(RE_DATE_TS);
    if (dateMatch) {
        text = text.slice(dateMatch[0].length);
    }

    // ---- 2. 剥离相对时间戳 ----
    text = text.replace(RE_REL_TS, '').replace(/\s{2,}/g, ' ');

    // ---- 3. 去除首尾空白 ----
    text = text.trim();
    if (text.length === 0) {
        return null;
    }

    // ---- 4. 四级参数归一化 ----
    // 关键：使用 replace 回调的 offset 参数精准定位，
    // 避免 text.indexOf(match) 在处理重复子串时返回错误位置。

    // 4a. URL 编码 → {url}
    text = replaceWithOffsets(text, RE_URL_ENCODED, '{url}', paramMask);

    // 4b. 花括号参数块 → {*}
    text = replaceWithOffsets(text, RE_PARAM_BRACE, '{*}', paramMask);

    // 4c. `>>` 引导值 → `>> *`
    // RE_ARROW_VALUE 捕获整个 `>> value` 序列，只替换值部分
    text = text.replace(RE_ARROW_VALUE, (match, _value, offset: number) => {
        const prefixLen = '>> '.length;
        const valueStart = offset + prefixLen;
        const valueLen = match.length - prefixLen;
        paramMask.push([valueStart, valueStart + valueLen]);
        return '>> *';
    });

    // 4d. 行尾纯数字 → {n}
    // 使用循环 + 非全局正则避免 lastIndex 问题
    let safety = 0;
    while (RE_TRAILING_NUMBERS.test(text) && safety < 10) {
        safety++;
        text = text.replace(RE_TRAILING_NUMBERS, (_match, digits, offset: number) => {
            // offset 是整个正则匹配的起始位置，digit group 偏移为 offset + match.indexOf(digits)
            const digitStart = offset + _match.indexOf(digits);
            paramMask.push([digitStart, digitStart + digits.length]);
            return '{n}';
        });
    }

    // ---- 5. 折叠多余空白 ----
    text = text.replace(/\s{2,}/g, ' ').trim();

    // strippedOffset: 归一化文本在原始行中的起始偏移
    // （即被剥离的日期时间戳长度）
    const strippedOffset = dateMatch ? dateMatch[0].length : 0;

    return { normalized: text, paramMask, strippedOffset };
}

// ---------------------------------------------------------------------------
// 辅助: 通用的正则替换 + offset 追踪
// ---------------------------------------------------------------------------

/**
 * 对文本中所有匹配项进行替换，同时使用 replace 回调的 offset 参数
 * 准确记录每个替换区间的 [start, end)。
 */
function replaceWithOffsets(
    input: string,
    regex: RegExp,
    replacement: string,
    mask: Array<[number, number]>,
): string {
    return input.replace(regex, (match, ...rest: unknown[]) => {
        const offset: number = rest[rest.length - 2] as number;
        mask.push([offset, offset + match.length]);
        return replacement;
    });
}
