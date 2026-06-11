// ---------------------------------------------------------------------------
// src/logFold/detector.ts — 重复检测算法（三级递进）
// ---------------------------------------------------------------------------

import { LineSignature, FoldRegion, RepeatPattern, FoldOptions, DEFAULT_FOLD_OPTIONS } from './types';
import { normalizeLine } from './normalizer';
import { CSMLOG_RELATIVE_TS_PATTERN } from '../common/constants';

// ---------------------------------------------------------------------------
// 工具：滚动哈希
// ---------------------------------------------------------------------------

const HASH_BASE = 131;
const HASH_MOD = 1_000_000_007;

/** 计算行签名数组的滚动哈希值 */
function computeHash(signatures: Array<LineSignature | null>, start: number, len: number): number {
    let h = 0;
    const end = Math.min(start + len, signatures.length);
    for (let i = start; i < end; i++) {
        const sig = signatures[i];
        if (sig === null) { return -1; }
        h = (h * HASH_BASE + hashString(sig.normalized)) % HASH_MOD;
    }
    return h;
}

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * HASH_BASE + s.charCodeAt(i)) % HASH_MOD;
    }
    return h;
}

/**
 * 冲刷多行块运行：将检测到的重复块记录到 regions 并标记 covered。
 */
function flushBlockRun(
    blockRunStart: number,
    blockRunCount: number,
    w: number,
    minRepeat: number,
    rawLines: string[],
    signatures: Array<LineSignature | null>,
    covered: boolean[],
    regions: FoldRegion[],
): void {
    if (blockRunCount < minRepeat || blockRunStart < 0) { return; }

    const blockSamples: string[] = [];
    const firstBlockEnd = blockRunStart + w - 1;
    for (let k = 0; k < Math.min(3 * w, firstBlockEnd - blockRunStart + 1); k++) {
        blockSamples.push(rawLines[blockRunStart + k]);
    }
    // 最后一块样本
    const lastBlockStart = blockRunStart + (blockRunCount - 1) * w;
    if (lastBlockStart !== blockRunStart) {
        blockSamples.push('---');
        for (let k = 0; k < w; k++) {
            blockSamples.push(rawLines[lastBlockStart + k]);
        }
    }
    regions.push({
        startLine: blockRunStart,
        endLine: blockRunStart + blockRunCount * w - 1,
        repeatCount: blockRunCount,
        pattern: 'block-exact',
        sampleLines: blockSamples,
        signature: signatures[blockRunStart]!.normalized,
    });
    for (let j = blockRunStart; j < blockRunStart + blockRunCount * w; j++) {
        covered[j] = true;
    }
}

// ---------------------------------------------------------------------------
// 主检测器
// ---------------------------------------------------------------------------

/**
 * 对文档行执行三级递进重复检测。
 *
 * @param rawLines    原始文档行（保留时间戳等完整信息）
 * @param signatures  归一化签名（对应 rawLines 中每条有效行的签名；空行/null 位用 null 占位）
 * @param options     折叠配置
 * @returns 检测到的折叠区域列表（按行号升序，区域不重叠）
 */
export function detectRepeatRegions(
    rawLines: string[],
    signatures: Array<LineSignature | null>,
    options: FoldOptions = DEFAULT_FOLD_OPTIONS,
): FoldRegion[] {

    const n = rawLines.length;
    const minRepeat = Math.max(2, options.minRepeatCount);
    const covered: boolean[] = new Array(n).fill(false);
    const regions: FoldRegion[] = [];

    // ---- L1: 连续单行匹配 ----
    let runStart = -1;
    let runEnd = -1;
    let runCount = 0;
    let runSig: LineSignature | null = null;
    const runSamples: string[] = [];

    const flushL1 = () => {
        if (runCount >= minRepeat && runStart >= 0 && runSig) {
            regions.push({
                startLine: runStart,
                endLine: runEnd,
                repeatCount: runCount,
                pattern: classifyPattern(runSig, runSamples, rawLines),
                sampleLines: [...runSamples],
                signature: runSig.normalized,
            });
            for (let i = runStart; i <= runEnd; i++) {
                covered[i] = true;
            }
        }
    };

    for (let i = 0; i < n; i++) {
        const sig = signatures[i];
        if (sig === null) {
            flushL1();
            runStart = -1;
            runCount = 0;
            runSig = null;
            runSamples.length = 0;
            continue;
        }

        if (runSig !== null && sig.normalized === runSig.normalized) {
            // 延续当前运行
            runEnd = i;
            runCount++;
            // 收集样本：前 3 条 + 最近 1 条
            if (runSamples.length < 3) {
                runSamples.push(rawLines[i]);
            } else {
                runSamples[runSamples.length - 1] = rawLines[i];
            }
        } else {
            // 签名变化 → 冲刷之前的运行
            flushL1();
            // 开始新的运行
            runStart = i;
            runEnd = i;
            runCount = 1;
            runSig = sig;
            runSamples.length = 0;
            runSamples.push(rawLines[i]);
        }
    }
    // 冲刷最后的运行
    flushL1();

    // ---- L2: 多行块匹配 ----
    const maxBlock = Math.min(options.maxBlockLines, 20);
    // 找出未覆盖的连续区间
    const gaps: Array<[number, number]> = [];
    let gapStart = -1;
    for (let i = 0; i < n; i++) {
        if (!covered[i] && signatures[i] !== null) {
            if (gapStart === -1) { gapStart = i; }
        } else {
            if (gapStart !== -1) {
                gaps.push([gapStart, i - 1]);
                gapStart = -1;
            }
        }
    }
    if (gapStart !== -1) {
        gaps.push([gapStart, n - 1]);
    }

    for (const [gs, ge] of gaps) {
        const gapLen = ge - gs + 1;
        if (gapLen < minRepeat * 2) { continue; } // 至少需要 minRepeat 个块

        // 尝试窗口大小 2..maxBlock
        for (let w = 2; w <= Math.min(maxBlock, Math.floor(gapLen / minRepeat)); w++) {
            // 计算第一个块的哈希
            let prevHash = -1;
            let blockRunStart = -1;
            let blockRunCount = 0;

            for (let pos = gs; pos + w - 1 <= ge; pos += w) {
                // 跳过已被 L2 其他窗口大小覆盖的行，避免重叠区
                let anyCovered = false;
                for (let k = 0; k < w && !anyCovered; k++) {
                    if (covered[pos + k]) { anyCovered = true; }
                }
                if (anyCovered) {
                    // 冲刷当前运行
                    flushBlockRun(blockRunStart, blockRunCount, w, minRepeat, rawLines, signatures, covered, regions);
                    blockRunStart = -1;
                    blockRunCount = 0;
                    prevHash = -1;
                    continue;
                }

                // 确保块内所有行有有效签名
                let allValid = true;
                for (let k = 0; k < w; k++) {
                    if (signatures[pos + k] === null) { allValid = false; break; }
                }
                if (!allValid) {
                    // 冲刷并跳过
                    flushBlockRun(blockRunStart, blockRunCount, w, minRepeat, rawLines, signatures, covered, regions);
                    blockRunStart = -1;
                    blockRunCount = 0;
                    prevHash = -1;
                    continue;
                }

                const curHash = computeHash(signatures, pos, w);

                if (curHash === prevHash && prevHash !== -1) {
                    if (blockRunStart === -1) {
                        blockRunStart = pos - w;
                        blockRunCount = 2;
                    } else {
                        blockRunCount++;
                    }
                } else {
                    // 冲刷
                    flushBlockRun(blockRunStart, blockRunCount, w, minRepeat, rawLines, signatures, covered, regions);
                    blockRunStart = -1;
                    blockRunCount = 0;
                }
                prevHash = curHash;
            }

            // 冲刷最后的块运行
            flushBlockRun(blockRunStart, blockRunCount, w, minRepeat, rawLines, signatures, covered, regions);
        }
    }

    // ---- L3: 参数化确认 ----
    // 仅在 smartParams 开启时，对 L1 产生的 exact 区域做二次判定
    if (options.smartParams) {
        for (const region of regions) {
            if (region.pattern === 'exact') {
                const paramsVaried = checkParamsVariation(region, rawLines, signatures);
                if (paramsVaried) {
                    region.pattern = 'parameterized';
                    // 提取参数变化列表
                    region.paramsByOccurrence = extractParams(region, rawLines, signatures);
                }
            }
            // 检查交错模式：同一折叠区域内是否有不同模块交替出现
            if (region.pattern === 'exact') {
                const modules = extractModules(region, rawLines);
                if (modules.size > 1) {
                    region.pattern = 'interleaved';
                }
            }
        }
    }

    // 按行号排序，确保不重叠区域顺序正确
    regions.sort((a, b) => a.startLine - b.startLine);

    return regions;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 判定 L1 区域的模式：exact / parameterized / interleaved（初始假定 exact）
 */
function classifyPattern(
    sig: LineSignature,
    _samples: string[],
    _rawLines: string[],
): RepeatPattern {
    if (sig.paramMask.length > 0) {
        // 签名中有参数归一化 → 可能参数化，L3 会进一步确认
        return 'exact';
    }
    return 'exact';
}

/**
 * 检查区域内是否存在参数变化（不同次出现的参数值不同）。
 */
function checkParamsVariation(
    region: FoldRegion,
    rawLines: string[],
    signatures: Array<LineSignature | null>,
): boolean {
    // 取首尾各一条做比对
    if (region.endLine <= region.startLine) { return false; }
    const firstSig = signatures[region.startLine];
    const lastSig = signatures[region.endLine];
    if (!firstSig || !lastSig) { return false; }
    if (firstSig.paramMask.length === 0 && lastSig.paramMask.length === 0) { return false; }

    // 归一化后相同但原始行不同 → 参数变化
    const firstRaw = rawLines[region.startLine];
    const lastRaw = rawLines[region.endLine];
    return firstRaw !== lastRaw;
}

/**
 * 提取区域内每次出现的参数值。
 * 使用正则直接从剥离时间戳后的原始行重新提取，不依赖归一化过程中记录的 paramMask 偏移
 * （递进替换会导致偏移量相对于逐步缩短的中间文本，而非原始剥离文本）。
 */
function extractParams(
    region: FoldRegion,
    rawLines: string[],
    _signatures: Array<LineSignature | null>,
): string[][] {
    const result: string[][] = [];
    const sampleIndices: number[] = [];
    sampleIndices.push(region.startLine);
    if (region.endLine > region.startLine) { sampleIndices.push(region.endLine); }
    const mid = Math.floor((region.startLine + region.endLine) / 2);
    if (mid !== region.startLine && mid !== region.endLine) { sampleIndices.push(mid); }

    const relTsRegex = new RegExp(CSMLOG_RELATIVE_TS_PATTERN, 'g');
    // CSM 完整日期时间戳
    const dateTsRe = /\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/;

    for (const idx of sampleIndices) {
        let raw = rawLines[idx];
        // 剥离日期时间戳前缀和相对时间戳
        const dateMatch = raw.match(dateTsRe);
        if (dateMatch) { raw = raw.substring(raw.indexOf(dateMatch[0]) + dateMatch[0].length); }
        raw = raw.replace(relTsRegex, '').replace(/\s{2,}/g, ' ').trim();

        const values: string[] = [];
        // 花括号参数块
        for (const m of raw.matchAll(/\{([^}]*)\}/g)) { values.push(m[1]); }
        // >> 引导值
        for (const m of raw.matchAll(/>>\s+([^<\n]+?)(?=\s*<-|$)/g)) { values.push(m[1].trim()); }
        if (values.length > 0) { result.push(values); }
    }

    return result;
}

/**
 * 提取区域内每次出现的模块名（用于判断交错模式）。
 */
function extractModules(region: FoldRegion, rawLines: string[]): Set<string> {
    const modules = new Set<string>();
    const moduleRe = /\]\s+(\S+?)\s+\|/;
    for (let i = region.startLine; i <= region.endLine; i++) {
        const m = rawLines[i].match(moduleRe);
        if (m) {
            modules.add(m[1]);
        }
    }
    return modules;
}
