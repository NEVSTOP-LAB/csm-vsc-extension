// ---------------------------------------------------------------------------
// src/language/logFold/types.ts — 日志折叠模块核心类型定义
// ---------------------------------------------------------------------------

/**
 * 归一化后的行签名。
 */
export interface LineSignature {
    /** 剥离时间戳并归一化参数后的文本 */
    normalized: string;
    /** 每个元素 [start, end) 标记 normalized 中被归一化替换的区间 */
    paramMask: Array<[number, number]>;
    /** 归一化文本在原始行中的起始偏移量 */
    strippedOffset: number;
}

/**
 * 重复检测模式类型。
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
    /** 该区域中重复出现的次数（含首条） */
    repeatCount: number;
    /** 重复模式 */
    pattern: RepeatPattern;
    /** 采样行内容（保留原始文本，带时间戳） */
    sampleLines: string[];
    /** 归一化后的签名文本 */
    signature: string;
    /** 参数化模式下各次出现中变化的参数值列表 */
    paramsByOccurrence?: string[][];
}

/**
 * 用户可配置的折叠选项（从 VS Code settings 映射）。
 */
export interface FoldOptions {
    /** 最少连续重复几次才触发折叠 */
    minRepeatCount: number;
    /** 块匹配时最大的块行数 */
    maxBlockLines: number;
    /** 是否启用参数归一化 */
    smartParams: boolean;
    /** 装饰器样式 */
    decorationStyle: 'compact' | 'detailed';
}

/** 默认折叠配置 */
export const DEFAULT_FOLD_OPTIONS: FoldOptions = {
    minRepeatCount: 3,
    maxBlockLines: 20,
    smartParams: true,
    decorationStyle: 'compact',
};
