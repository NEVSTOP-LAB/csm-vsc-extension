// ---------------------------------------------------------------------------
// common/csmlogDedup.ts — CSM 日志重复检测引擎
// ---------------------------------------------------------------------------
// 功能：
//   1. 从日志行中提取"消息签名"（剥离时间戳）。
//   2. 按配置的归一化级别对签名进行归一化。
//   3. 扫描文档，检测连续重复的日志行组。
//
// 用于：
//   - CSMLogFoldingRangeProvider（编辑器内折叠）
//   - CSMLogDocumentSymbolProvider（大纲中显示重复组）
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { RE_DATE_TS, CONFIG_LINE_REGEX } from './constants';

/**
 * 重复组描述。
 */
export interface RepeatedGroup {
    /** 组起始行（0-based）。 */
    startLine: number;
    /** 组结束行（0-based，含）。 */
    endLine: number;
    /** 重复次数：单行时为连续行数，多行时为块重复次数。 */
    count: number;
    /** 归一化后的消息签名（用于显示）。 */
    signature: string;
    /** 重复块大小（行数）：1 = 单行重复，>1 = 多行块重复。 */
    blockSize: number;
}

/**
 * 从日志行中提取"消息签名"（剥离时间戳字段）。
 *
 * CSM 日志行可能包含 1~2 个时间戳字段：
 *   格式 A:  YYYY/MM/DD HH:MM:SS.mmm [Event] ...
 *   格式 B:  YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Event] ...    （相对时间戳）
 *   格式 C:  YYYY/MM/DD HH:MM:SS.mmm [YYYY/MM/DD HH:MM:SS.mmm] [Event] ... （完整时间戳）
 *   格式 D:  [YYYY/MM/DD HH:MM:SS.mmm] ...                            （方括号包裹）
 *
 * 本函数剥离所有前置时间戳后返回消息体。
 *
 * @param line — 日志行文本
 * @returns 去除时间戳后的消息体，若非日志行则返回 `null`
 */
export function extractSignature(line: string): string | null {
    // 配置行不参与去重
    if (CONFIG_LINE_REGEX.test(line)) { return null; }

    // 行首绝对时间戳匹配（含可选的方括号包裹）
    const dateMatch = line.match(RE_DATE_TS);
    if (!dateMatch) { return null; }

    let pos = dateMatch[0].length;

    // 尝试剥离第二个时间戳字段
    const afterDate = line.slice(pos);

    // 1) 相对时间戳：[HH:MM:SS.mmm]
    const relMatch = afterDate.match(/^\s+\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    if (relMatch) {
        pos += relMatch[0].length;
    } else {
        // 2) 完整方括号时间戳：[YYYY/MM/DD HH:MM:SS.mmm] 或 [YYYY-MM-DD HH:MM:SS.mmm]
        const fullBracketMatch = afterDate.match(/^\s+\[\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\]/);
        if (fullBracketMatch) {
            pos += fullBracketMatch[0].length;
        }
    }

    const signature = line.slice(pos).trimStart();
    // 空签名（如纯时间戳行）不参与去重
    return signature.length > 0 ? signature : null;
}

/**
 * 对消息签名进行归一化（将连续数字替换为 '#' 占位符）。
 * 采用宽松匹配策略，使仅参数值不同的消息被识别为重复。
 *
 * @param sig — 消息签名（已剥离时间戳）
 * @returns 归一化后的签名
 */
export function normalizeSignature(sig: string): string {
    return sig.replace(/\d+/g, '#');
}

/**
 * 检测文档中的连续重复日志组。
 *
 * 逐行扫描，计算归一化签名。连续相同签名且数量 ≥ `minRepeat`
 * 的行组成一个 `RepeatedGroup`。配置行和非日志行会自然断开重复链。
 *
 * @param document — VS Code 文本文档
 * @param minRepeat — 最小连续重复次数阈值
 * @param level — 归一化级别
 * @returns 检测到的重复组列表（按行号升序）
 */
export function detectRepeatedGroups(
    document: vscode.TextDocument,
    minRepeat: number,
): RepeatedGroup[] {
    const groups: RepeatedGroup[] = [];
    const lineCount = document.lineCount;

    let runStart = -1;
    let runSig: string | null = null;
    let runCount = 0;

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i).text;
        const rawSig = extractSignature(line);
        const sig = rawSig !== null ? normalizeSignature(rawSig) : null;

        if (sig !== null && sig === runSig) {
            // 延续当前重复序列
            runCount++;
        } else {
            // 序列中断——如果前一序列达到阈值，记录为一组
            if (runCount >= minRepeat && runSig !== null && runStart >= 0) {
                groups.push({
                    startLine: runStart,
                    endLine: runStart + runCount - 1,
                    count: runCount,
                    signature: runSig,
                    blockSize: 1,
                });
            }
            // 开始新序列（或重置）
            if (sig !== null) {
                runStart = i;
                runSig = sig;
                runCount = 1;
            } else {
                runStart = -1;
                runSig = null;
                runCount = 0;
            }
        }
    }

    // 处理文档末尾的最后一组
    if (runCount >= minRepeat && runSig !== null && runStart >= 0) {
        groups.push({
            startLine: runStart,
            endLine: runStart + runCount - 1,
            count: runCount,
            signature: runSig,
            blockSize: 1,
        });
    }

    return groups;
}

/**
 * 多行块重复检测：识别连续重复的多行日志块。
 *
 * 与单行检测不同，此函数将连续的 N 行视为一个"块"，
 * 检测该块是否在文档中连续重复出现。
 *
 * 算法：对每个起始位置，尝试 2~20 行的块大小，
 * 检查是否能找到至少 `minRepeatBlocks` 次连续重复。
 * 优先匹配最小的有效块，以找到最基础的重复单元。
 *
 * @param document — VS Code 文本文档
 * @param minRepeatBlocks — 最小块重复次数（默认 2，即至少出现两次）
 * @returns 检测到的多行重复组列表
 */
export function detectMultiLineRepeatedGroups(
    document: vscode.TextDocument,
    minRepeatBlocks: number = 2,
): RepeatedGroup[] {
    const lineCount = document.lineCount;
    const MAX_BLOCK = 20;

    // 1) 预计算所有行的归一化签名
    const sigs: (string | null)[] = [];
    for (let i = 0; i < lineCount; i++) {
        const rawSig = extractSignature(document.lineAt(i).text);
        sigs.push(rawSig !== null ? normalizeSignature(rawSig) : null);
    }

    const groups: RepeatedGroup[] = [];
    const covered = new Set<number>();  // 已被多行组覆盖的行

    for (let i = 0; i < lineCount; i++) {
        if (covered.has(i) || sigs[i] === null) { continue; }

        let bestL = 0;
        let bestReps = 0;

        // 从小到大尝试块大小，优先匹配最小的有效块（最基础的重复单元）
        for (let L = 2; L <= Math.min(MAX_BLOCK, lineCount - i); L++) {
            // 第一块必须全部为非 null
            let blockValid = true;
            for (let k = 0; k < L; k++) {
                if (sigs[i + k] === null) { blockValid = false; break; }
            }
            if (!blockValid) { continue; }

            // 计算连续重复次数
            let reps = 1;
            let offset = i + L;

            while (offset + L <= lineCount) {
                let match = true;
                for (let k = 0; k < L; k++) {
                    if (sigs[i + k] !== sigs[offset + k]) {
                        match = false;
                        break;
                    }
                }
                if (!match) { break; }
                reps++;
                offset += L;
            }

            if (reps >= minRepeatBlocks) {
                bestL = L;
                bestReps = reps;
                break;  // 找到最小有效块，停止搜索更大的 L
            }
        }

        if (bestL >= 2 && bestReps >= minRepeatBlocks) {
            const endLine = i + bestL * bestReps - 1;
            groups.push({
                startLine: i,
                endLine,
                count: bestReps,
                signature: sigs[i]!,  // 第一行签名（用于显示摘要）
                blockSize: bestL,
            });
            // 标记已覆盖行，避免重复检测
            for (let line = i; line <= endLine; line++) {
                covered.add(line);
            }
        }
    }

    return groups;
}

/**
 * 统一重复检测：先执行多行块重复检测，再对未覆盖的行执行单行检测。
 *
 * 多行组覆盖的行不再参与单行检测，避免重复和重叠。
 *
 * @param document — VS Code 文本文档
 * @param minRepeat — 最小连续重复次数阈值（单行）
 * @param minRepeatBlocks — 最小块重复次数（多行，默认 2）
 * @returns 合并后的所有重复组（按行号升序）
 */
export function detectAllRepeatedGroups(
    document: vscode.TextDocument,
    minRepeat: number,
    minRepeatBlocks: number = 2,
): RepeatedGroup[] {
    // 1) 多行块检测
    const multiGroups = detectMultiLineRepeatedGroups(document, minRepeatBlocks);

    // 2) 过滤"伪多行组"：块内所有行签名相同 → 单行检测更能表达重复本质
    const filteredMulti = multiGroups.filter((g) => {
        if (g.blockSize <= 1) { return true; }
        const firstSig = sigsOf(document, g.startLine);
        for (let i = 1; i < g.blockSize; i++) {
            if (sigsOf(document, g.startLine + i) !== firstSig) { return true; }
        }
        return false; // 块内全部相同 → 留给单行检测
    });

    // 3) 收集多行组已覆盖的行
    const covered = new Set<number>();
    for (const g of filteredMulti) {
        for (let line = g.startLine; line <= g.endLine; line++) {
            covered.add(line);
        }
    }

    // 4) 对未覆盖的行运行单行检测
    const singleGroups = detectRepeatedGroupsExcluding(document, minRepeat, covered);

    // 5) 合并并按行号排序
    return [...filteredMulti, ...singleGroups].sort((a, b) => a.startLine - b.startLine);
}

/**
 * 获取指定行的归一化签名（内部缓存辅助）。
 */
function sigsOf(document: vscode.TextDocument, line: number): string | null {
    const rawSig = extractSignature(document.lineAt(line).text);
    return rawSig !== null ? normalizeSignature(rawSig) : null;
}

/**
 * 单行重复检测（排除指定行）。
 * 内部函数，由 detectAllRepeatedGroups 调用。
 */
function detectRepeatedGroupsExcluding(
    document: vscode.TextDocument,
    minRepeat: number,
    excludeLines: Set<number>,
): RepeatedGroup[] {
    const groups: RepeatedGroup[] = [];
    const lineCount = document.lineCount;

    let runStart = -1;
    let runSig: string | null = null;
    let runCount = 0;

    for (let i = 0; i < lineCount; i++) {
        // 跳过被多行组覆盖的行
        if (excludeLines.has(i)) {
            // 中断当前序列
            if (runCount >= minRepeat && runSig !== null && runStart >= 0) {
                groups.push({
                    startLine: runStart,
                    endLine: runStart + runCount - 1,
                    count: runCount,
                    signature: runSig,
                    blockSize: 1,
                });
            }
            runStart = -1;
            runSig = null;
            runCount = 0;
            continue;
        }

        const line = document.lineAt(i).text;
        const rawSig = extractSignature(line);
        const sig = rawSig !== null ? normalizeSignature(rawSig) : null;

        if (sig !== null && sig === runSig) {
            runCount++;
        } else {
            if (runCount >= minRepeat && runSig !== null && runStart >= 0) {
                groups.push({
                    startLine: runStart,
                    endLine: runStart + runCount - 1,
                    count: runCount,
                    signature: runSig,
                    blockSize: 1,
                });
            }
            if (sig !== null) {
                runStart = i;
                runSig = sig;
                runCount = 1;
            } else {
                runStart = -1;
                runSig = null;
                runCount = 0;
            }
        }
    }

    if (runCount >= minRepeat && runSig !== null && runStart >= 0) {
        groups.push({
            startLine: runStart,
            endLine: runStart + runCount - 1,
            count: runCount,
            signature: runSig,
            blockSize: 1,
        });
    }

    return groups;
}

/**
 * 截断签名用于大纲显示。
 *
 * @param sig — 归一化签名
 * @param maxLen — 最大显示长度（默认 60）
 * @returns 截断后的显示文本
 */
export function truncateSignature(sig: string, maxLen: number = 60): string {
    return sig.length <= maxLen ? sig : sig.slice(0, maxLen - 3) + '...';
}
