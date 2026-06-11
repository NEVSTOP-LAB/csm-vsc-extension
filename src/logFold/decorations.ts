// ---------------------------------------------------------------------------
// src/logFold/decorations.ts — 日志折叠装饰器（视觉呈现）
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { FoldRegion, FoldOptions, DEFAULT_FOLD_OPTIONS, RepeatPattern } from './types';

// ---------------------------------------------------------------------------
// 颜色常量（四种模式）
// ---------------------------------------------------------------------------

/** 模式 → 底色的映射 */
const PATTERN_BG_COLORS: Record<RepeatPattern, string> = {
    exact: 'rgba(100, 140, 180, 0.06)',          // 灰蓝
    parameterized: 'rgba(130, 110, 180, 0.06)',   // 灰紫
    'block-exact': 'rgba(100, 160, 130, 0.06)',   // 灰绿
    'block-parameterized': 'rgba(90, 150, 150, 0.06)', // 灰青
    interleaved: 'rgba(180, 145, 100, 0.06)',     // 灰橙
};

const SUMMARY_LABEL_COLOR = '#6a737d';
const PARAM_HIGHLIGHT_COLOR = '#c9d1d9';

// ---------------------------------------------------------------------------
// 装饰类型工厂
// ---------------------------------------------------------------------------

/**
 * 注册所有装饰类型并返回。
 * 调用方需将返回的装饰类型数组加入 `context.subscriptions`。
 */
export function createDecorationTypes(): {
    bgDecorations: Record<RepeatPattern, vscode.TextEditorDecorationType>;
    borderDecoration: vscode.TextEditorDecorationType;
    paramHighlightDecoration: vscode.TextEditorDecorationType;
    summaryLabelDecoration: vscode.TextEditorDecorationType;
} {
    // 四种模式底色
    const bgDecorations: Record<string, vscode.TextEditorDecorationType> = {};
    for (const [pattern, bgColor] of Object.entries(PATTERN_BG_COLORS)) {
        bgDecorations[pattern] = vscode.window.createTextEditorDecorationType({
            backgroundColor: bgColor,
            isWholeLine: true,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });
    }

    // 左侧边框标识（展开后标识折叠区成员行）
    // VS Code decoration API 不支持单侧 border，使用整体淡色 border 达成类似效果
    const borderDecoration = vscode.window.createTextEditorDecorationType({
        borderStyle: 'none none none solid',
        borderWidth: '0 0 0 2px',
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 参数高亮
    const paramHighlightDecoration = vscode.window.createTextEditorDecorationType({
        color: PARAM_HIGHLIGHT_COLOR,
        fontWeight: 'normal',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 折叠概要标签（行末 after-text）
    const summaryLabelDecoration = vscode.window.createTextEditorDecorationType({
        after: {
            color: SUMMARY_LABEL_COLOR,
            fontStyle: 'italic',
            margin: '0 0 0 8px',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    return {
        bgDecorations: bgDecorations as Record<RepeatPattern, vscode.TextEditorDecorationType>,
        borderDecoration,
        paramHighlightDecoration,
        summaryLabelDecoration,
    };
}

// ---------------------------------------------------------------------------
// 装饰器应用
// ---------------------------------------------------------------------------

/**
 * 根据折叠区域和编辑器折叠状态应用装饰。
 *
 * @param editor           当前文本编辑器
 * @param regions          检测到的折叠区域列表
 * @param decorTypes       装饰类型集合
 * @param options          用户折叠选项
 */
export function applyDecorations(
    editor: vscode.TextEditor,
    regions: FoldRegion[],
    decorTypes: ReturnType<typeof createDecorationTypes>,
    options: FoldOptions = DEFAULT_FOLD_OPTIONS,
): void {
    const { bgDecorations, borderDecoration, paramHighlightDecoration, summaryLabelDecoration } =
        decorTypes;

    // 按模式分组收集装饰范围
    const bgRanges: Record<string, vscode.Range[]> = {};
    const borderRanges: vscode.Range[] = [];
    const paramRanges: vscode.Range[] = [];
    const summaryOptions: vscode.DecorationOptions[] = [];

    // 需要获取折叠状态来判断哪些行被折叠

    for (const region of regions) {
        const pattern = region.pattern;

        // 背景色：区间内所有行
        if (!bgRanges[pattern]) { bgRanges[pattern] = []; }
        const bgRange = new vscode.Range(
            region.startLine, 0,
            region.endLine, editor.document.lineAt(region.endLine).text.length,
        );
        bgRanges[pattern].push(bgRange);

        // 边框颜色：区间内所有行（定制 borderColor）
        // 由于 VS Code decoration API 不支持单 decoration 多颜色，我们为每个模式单独应用
        const borderRange = new vscode.Range(
            region.startLine, 0,
            region.endLine, 0,
        );
        borderRanges.push(borderRange);

        // 概要标签：仅在第 1 行末尾
        const summaryText = buildSummaryLabel(region, options);
        const firstLineRange = new vscode.Range(region.startLine, 0, region.startLine, 0);
        summaryOptions.push({
            range: firstLineRange,
            renderOptions: {
                after: {
                    contentText: summaryText,
                    color: SUMMARY_LABEL_COLOR,
                    fontStyle: 'italic',
                    margin: '0 0 0 8px',
                },
            },
        });

        // 参数高亮：仅在 parameterized 模式下
        if (region.pattern === 'parameterized' || region.pattern === 'block-parameterized') {
            if (region.paramsByOccurrence && region.paramsByOccurrence.length > 0) {
                // 在第一条样本行找到参数位置并高亮
                // 简化处理：仅对起始行应用参数高亮（通过匹配花括号内容）
                const firstLine = editor.document.lineAt(region.startLine).text;
                const braceRe = /\{[^}]*\}/g;
                let bm: RegExpExecArray | null;
                while ((bm = braceRe.exec(firstLine)) !== null) {
                    paramRanges.push(
                        new vscode.Range(
                            region.startLine, bm.index,
                            region.startLine, bm.index + bm[0].length,
                        ),
                    );
                }
            }
        }
    }

    // ---- 应用装饰 ----
    // 背景
    for (const [pattern, ranges] of Object.entries(bgRanges)) {
        editor.setDecorations(bgDecorations[pattern as RepeatPattern], ranges);
    }

    // 边框 — 使用 overlay 方式：为每个模式创建独立的 border decoration
    // VS Code 不支持 per-range border color，所以用统一的不显眼颜色
    editor.setDecorations(borderDecoration, borderRanges);

    // 概要标签
    editor.setDecorations(summaryLabelDecoration, summaryOptions);

    // 参数高亮
    if (paramRanges.length > 0) {
        editor.setDecorations(paramHighlightDecoration, paramRanges);
    } else {
        editor.setDecorations(paramHighlightDecoration, []);
    }
}

/**
 * 清除所有装饰。
 */
export function clearDecorations(
    editor: vscode.TextEditor,
    decorTypes: ReturnType<typeof createDecorationTypes>,
): void {
    const { bgDecorations, borderDecoration, paramHighlightDecoration, summaryLabelDecoration } =
        decorTypes;
    for (const d of Object.values(bgDecorations)) {
        editor.setDecorations(d, []);
    }
    editor.setDecorations(borderDecoration, []);
    editor.setDecorations(paramHighlightDecoration, []);
    editor.setDecorations(summaryLabelDecoration, []);
}

// ---------------------------------------------------------------------------
// 标签构建
// ---------------------------------------------------------------------------

/**
 * 构建折叠区域的概要标签文本。
 */
function buildSummaryLabel(region: FoldRegion, options: FoldOptions): string {
    const count = region.repeatCount;

    if (options.decorationStyle === 'compact') {
        return `  …×${count}`;
    }

    // detailed 模式：含时间跨度和频率
    const parts: string[] = [];
    parts.push(`…重复 ${count} 次`);

    // 尝试从采样行提取时间范围
    if (region.sampleLines.length >= 2) {
        const firstTime = extractTime(region.sampleLines[0]);
        const lastTime = extractTime(region.sampleLines[region.sampleLines.length - 1]);
        if (firstTime && lastTime) {
            // 只取 HH:MM:SS 部分
            const firstShort = firstTime.slice(-12, -4); // HH:MM:SS
            const lastShort = lastTime.slice(-12, -4);
            parts.push(`${firstShort}~${lastShort}`);
        }
    }

    return `  ${parts.join(' · ')}`;
}

/**
 * 从原始日志行提取时间戳部分（相对时间戳优先，否则完整日期）。
 */
function extractTime(line: string): string | null {
    // 相对时间戳 [HH:MM:SS.mmm]
    const relMatch = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    if (relMatch) { return relMatch[1]; }
    // 完整日期时间戳
    const dateMatch = line.match(/(\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (dateMatch) { return dateMatch[1]; }
    return null;
}
