// ---------------------------------------------------------------------------
// src/logFold/normalizer.ts — 行签名归一化引擎
// ---------------------------------------------------------------------------

import { LineSignature } from './types';
import {
    CSMLOG_DATETIME_PATTERN,
    CSMLOG_RELATIVE_TS_PATTERN,
} from '../common/constants';

// ---------------------------------------------------------------------------
// 正则定义
// ---------------------------------------------------------------------------

/** 完整日期时间戳（行首） */
const RE_DATE_TS = new RegExp(`^${CSMLOG_DATETIME_PATTERN}`);
/** 相对时间戳 [HH:MM:SS.mmm] */
const RE_REL_TS = new RegExp(CSMLOG_RELATIVE_TS_PATTERN, 'g');

/**
 * CSM 参数块：{key;value;...}  或  {key:value,...}
 * 匹配花括号包裹的任意内容（非贪婪）。
 */
const RE_PARAM_BRACE = /\{[^}]*\}/g;

/**
 * `>>` 引导的值：`>> 具体值` 直到行尾或 `<-` 前。
 * 匹配 `>>` 后面的非 `<-` 字符序列。
 */
const RE_ARROW_VALUE = />>\s+([^<\n]+?)(?=\s*<-|$)/g;

/**
 * URL 编码字符串（连续的 %XX 序列）。
 * 匹配包含 `%` 后跟 2 位十六进制的连续片段。
 */
const RE_URL_ENCODED = /(?:%[0-9A-Fa-f]{2}){3,}/g;

/**
 * 行尾纯数字参数（至少 2 位数字，避免匹配单个数字如状态码）。
 * 在归一化后、去时间戳的尾部找数字。
 */
const RE_TRAILING_NUMBERS = /(?<=\s)(\d{2,}(?:\.\d+)?)\s*$/g;

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 对一行 CSM 日志文本进行归一化，产出 `LineSignature`。
 *
 * 处理步骤：
 *  1. 剥离时间戳（完整日期 + 相对时间戳）
 *  2. 保留事件类型锚点（如 `[State Change]`）
 *  3. 四级参数归一化
 *  4. 产出 paramMask（记录哪些区间被替换）
 *
 * @param raw 原始日志行
 * @returns 归一化后的签名，若行无有效内容则返回 null
 */
export function normalizeLine(raw: string): LineSignature | null {
    // 空行或纯空白 → 不作为重复候选
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }
    // 配置行 → 不作为重复候选
    if (trimmed.startsWith('-') && trimmed.includes('|')) {
        return { normalized: raw, paramMask: [] };
    }

    const paramMask: Array<[number, number]> = [];
    let text = raw;

    // ---- 1. 剥离完整日期时间戳 ----
    const dateMatch = text.match(RE_DATE_TS);
    if (dateMatch) {
        text = text.slice(dateMatch[0].length);
    }

    // ---- 2. 剥离相对时间戳 ----
    text = text.replace(RE_REL_TS, (match) => {
        const idx = text.indexOf(match);
        // 同时去除可能的前导空白
        if (idx > 0 && text[idx - 1] === ' ') {
            // 不记录时间戳替换到 mask — 它是被完全移除的
            text = text.substring(0, idx) + text.substring(idx + match.length);
            return '';
        }
        return '';
    });
    // 实际上上面的 replace 在回调里改 text 不太好，改为简洁做法：
    // 重新做：直接全局去除时间戳
    text = raw;
    if (dateMatch) {
        text = text.slice(dateMatch[0].length);
    }
    text = text.replace(RE_REL_TS, '').replace(/\s{2,}/g, ' ');

    // ---- 3. 去除首尾空白，但保留内部空白 ----
    text = text.trim();
    if (text.length === 0) {
        return null;
    }

    // ---- 4. 四级参数归一化 ----
    // 记录当前文本位置（全局偏移），用于构建 paramMask
    // 由于我们一直在修改 text，mask 记录的是当前 text 中的区间

    // 4a. URL 编码 → {url}
    text = text.replace(RE_URL_ENCODED, (match) => {
        const start = text.indexOf(match);
        paramMask.push([start, start + match.length]);
        return '{url}';
    });

    // 4b. 花括号参数块 → {*}
    text = text.replace(RE_PARAM_BRACE, (match) => {
        const start = text.indexOf(match);
        if (start === -1) { return match; } // 安全兜底
        paramMask.push([start, start + match.length]);
        return '{*}';
    });

    // 4c. `>>` 引导值 → `>> *`
    text = text.replace(RE_ARROW_VALUE, (match) => {
        const prefix = '>> ';
        const value = match.slice(prefix.length);
        const start = text.indexOf(value);
        if (start === -1) { return match; }
        paramMask.push([start, start + value.length]);
        return `${prefix}*`;
    });

    // 4d. 行尾纯数字 → {n}
    // 使用循环替换，因为 replace 在每次替换后 text 变了
    let safety = 0;
    while (RE_TRAILING_NUMBERS.test(text) && safety < 20) {
        safety++;
        text = text.replace(RE_TRAILING_NUMBERS, (_match, digits) => {
            const idx = text.lastIndexOf(digits);
            if (idx === -1) { return _match; }
            paramMask.push([idx, idx + digits.length]);
            return '{n}';
        });
    }

    // ---- 5. 折叠多余空白 ----
    text = text.replace(/\s{2,}/g, ' ').trim();

    return { normalized: text, paramMask };
}
