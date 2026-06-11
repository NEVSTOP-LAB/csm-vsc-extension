// ---------------------------------------------------------------------------
// src/logFold/types.ts — 日志折叠模块核心类型定义
// ---------------------------------------------------------------------------

/**
 * 归一化后的行签名。
 *
 * `paramMask` 记录归一化过程中被替换的字符区间（半开 [start, end)），
 * 用于 L3 参数化确认阶段回溯原始参数值。
 */
export interface LineSignature {
    /** 剥离时间戳并归一化参数后的文本 */
    normalized: string;
    /**
     * 每个元素 [start, end) 标记 `normalized` 中被归一化替换的区间。
     * 该区间在 `normalized` 中对应占位符（如 `{*}`、`{url}`、`{n}`），
     * 回溯原始行时可根据此区间定位原始参数位置。
     */
    paramMask: Array<[number, number]>;
    /**
     * 归一化文本在原始行中的起始偏移量。
     * 即：rawLine.substring(strippedOffset) 去掉时间戳后得到归一化前的文本。
     * 用于将 paramMask 坐标映射回原始行。
     */
    strippedOffset: number;
}

/**
 * 重复检测模式类型。
 *
 *  - exact:               单条消息精确重复（去时间戳后完全相同）
 *  - parameterized:       消息模板相同但参数值变化
 *  - block-exact:         多行块精确重复
 *  - block-exact:         多行块精确重复
 *  - interleaved:         多条消息以各自频率交错出现
 */
export type RepeatPattern =
    | 'exact'
    | 'parameterized'
    | 'block-exact'
    | 'interleaved';

/**
 * 一个检测到的重复折叠区域。
 */
export interface FoldRegion {
    /** 折叠起始行号（0-based，包含） */
    startLine: number;
    /** 折叠结束行号（0-based，包含） */
    endLine: number;
    /** 该区域中重复出现的次数（含首条，即总条数） */
    repeatCount: number;
    /** 重复模式 */
    pattern: RepeatPattern;
    /**
     * 采样行内容（保留原始文本，带时间戳）。
     * 用于装饰器渲染展开状态下的比对信息。
     * - 前若干条 + 末尾一条。
     */
    sampleLines: string[];
    /** 归一化后的签名文本（用于折叠概要标签匹配） */
    signature: string;
    /**
     * 参数化模式下各次出现中变化的值列表。
     * `paramsByOccurrence[i]` 对应第 i 次出现的参数值数组。
     * 仅在 pattern 含 "parameterized" 时填充。
     */
    paramsByOccurrence?: string[][];
}

/**
 * 用户可配置的折叠选项（从 VS Code settings 映射）。
 */
export interface FoldOptions {
    /** 是否启用折叠功能 */
    enabled: boolean;
    /** 最少连续重复几次才触发折叠（默认 3） */
    minRepeatCount: number;
    /** 块匹配时最大的块行数（默认 20） */
    maxBlockLines: number;
    /** 是否启用参数归一化（默认 true） */
    smartParams: boolean;
    /** 装饰器样式：compact（仅次数）或 detailed（含时间和频率） */
    decorationStyle: 'compact' | 'detailed';
}

/**
 * 默认折叠配置。
 */
export const DEFAULT_FOLD_OPTIONS: FoldOptions = {
    enabled: true,
    minRepeatCount: 3,
    maxBlockLines: 20,
    smartParams: true,
    decorationStyle: 'compact',
};
