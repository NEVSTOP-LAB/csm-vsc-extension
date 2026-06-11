// ---------------------------------------------------------------------------
// src/logFold/decorations.ts — 日志折叠装饰器（视觉呈现）
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { FoldRegion, FoldOptions, DEFAULT_FOLD_OPTIONS, RepeatPattern } from './types';

// ---------------------------------------------------------------------------
// 颜色常量（深色/浅色主题自适应）
// ---------------------------------------------------------------------------

/** 模式 → 底色映射（浅色主题） */
const LIGHT_BG: Record<RepeatPattern, string> = {
    exact: 'rgba(100, 140, 180, 0.10)',
    parameterized: 'rgba(130, 110, 180, 0.10)',
    'block-exact': 'rgba(100, 160, 130, 0.10)',
    interleaved: 'rgba(180, 145, 100, 0.10)',
};

/** 模式 → 底色映射（深色主题） */
const DARK_BG: Record<RepeatPattern, string> = {
    exact: 'rgba(70, 130, 200, 0.16)',
    parameterized: 'rgba(150, 110, 200, 0.16)',
    'block-exact': 'rgba(70, 170, 130, 0.16)',
    interleaved: 'rgba(200, 150, 80, 0.16)',
};

/** 概 要标签颜色 */
const SUMMARY_LABEL_LIGHT = '#6a737d';
const SUMMARY_LABEL_DARK = '#8b949e';

/** 折叠三角标记颜色 */
const FOLD_TRIANGLE_LIGHT = '#6a737d';
const FOLD_TRIANGLE_DARK = '#8b949e';

// ---------------------------------------------------------------------------
// 装饰类型工厂
// ---------------------------------------------------------------------------

export interface DecorationTypes {
    bgDecorations: Record<RepeatPattern, vscode.TextEditorDecorationType>;
    borderDecoration: vscode.TextEditorDecorationType;
    paramHighlightDecoration: vscode.TextEditorDecorationType;
    summaryLabelDecoration: vscode.TextEditorDecorationType;
    foldTriangleDecoration: vscode.TextEditorDecorationType;
}

/**
 * 根据当前主题创建全部装饰类型。
 * 需要在主题切换时重新调用以获取适配的颜色。
 */
export function createDecorationTypes(themeKind: vscode.ColorThemeKind): DecorationTypes {
    const isDark = themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
    const bgColors = isDark ? DARK_BG : LIGHT_BG;
    const summaryColor = isDark ? SUMMARY_LABEL_DARK : SUMMARY_LABEL_LIGHT;
    const triangleColor = isDark ? FOLD_TRIANGLE_DARK : FOLD_TRIANGLE_LIGHT;

    // 四种模式底色
    const bgDecorations: Record<string, vscode.TextEditorDecorationType> = {};
    for (const [pattern, bgColor] of Object.entries(bgColors)) {
        bgDecorations[pattern] = vscode.window.createTextEditorDecorationType({
            backgroundColor: bgColor,
            isWholeLine: true,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });
    }

    // 左侧边框标识
    const borderDecoration = vscode.window.createTextEditorDecorationType({
        borderStyle: 'none none none solid',
        borderWidth: '0 0 0 2px',
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 参数高亮
    const paramHighlightDecoration = vscode.window.createTextEditorDecorationType({
        color: isDark ? '#e1c06b' : '#b08800',
        fontWeight: 'bold',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 折叠概要标签（行末 after-text）
    const summaryLabelDecoration = vscode.window.createTextEditorDecorationType({
        after: {
            color: summaryColor,
            fontStyle: 'italic',
            margin: '0 0 0 8px',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 折叠三角标记（行首 before-text），使用 ▼ emoji
    const foldTriangleDecoration = vscode.window.createTextEditorDecorationType({
        before: {
            contentText: '▼ ',
            color: triangleColor,
            fontWeight: 'bold',
            margin: '0 4px 0 0',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    return {
        bgDecorations: bgDecorations as Record<RepeatPattern, vscode.TextEditorDecorationType>,
        borderDecoration,
        paramHighlightDecoration,
        summaryLabelDecoration,
        foldTriangleDecoration,
    };
}

/**
 * 释放所有装饰类型。
 */
export function disposeDecorationTypes(types: DecorationTypes): void {
    for (const d of Object.values(types.bgDecorations)) { d.dispose(); }
    types.borderDecoration.dispose();
    types.paramHighlightDecoration.dispose();
    types.summaryLabelDecoration.dispose();
    types.foldTriangleDecoration.dispose();
}

// ---------------------------------------------------------------------------
// 装饰器应用
// ---------------------------------------------------------------------------

/**
 * 根据折叠区域应用装饰。
 */
export function applyDecorations(
    editor: vscode.TextEditor,
    regions: FoldRegion[],
    decorTypes: DecorationTypes,
    options: FoldOptions = DEFAULT_FOLD_OPTIONS,
): void {
    const { bgDecorations, borderDecoration, paramHighlightDecoration, summaryLabelDecoration, foldTriangleDecoration } =
        decorTypes;

    // 按模式分组
    const bgRanges: Record<string, vscode.Range[]> = {};
    const borderRanges: vscode.Range[] = [];
    const paramRanges: vscode.Range[] = [];
    const summaryOptions: vscode.DecorationOptions[] = [];
    const triangleRanges: vscode.Range[] = [];

    for (const region of regions) {
        const pattern = region.pattern;

        // 背景色：区间内所有行
        if (!bgRanges[pattern]) { bgRanges[pattern] = []; }
        bgRanges[pattern].push(new vscode.Range(
            region.startLine, 0,
            region.endLine, editor.document.lineAt(region.endLine).text.length,
        ));

        // 左侧边框
        borderRanges.push(new vscode.Range(region.startLine, 0, region.endLine, 0));

        // ▼ 折叠三角：仅在起始行行首
        triangleRanges.push(new vscode.Range(region.startLine, 0, region.startLine, 0));

        // 概要标签：仅在第 1 行末尾
        const summaryText = buildSummaryLabel(region, options);
        summaryOptions.push({
            range: new vscode.Range(region.startLine, 0, region.startLine, 0),
            renderOptions: {
                after: {
                    contentText: summaryText,
                    color: undefined, // 使用 decoration type 自身的颜色
                    fontStyle: 'italic',
                    margin: '0 0 0 8px',
                },
            },
        });

        // 参数高亮：仅在 parameterized 模式下
        if (region.pattern === 'parameterized') {
            if (region.paramsByOccurrence && region.paramsByOccurrence.length > 0) {
                const firstLine = editor.document.lineAt(region.startLine).text;
                const braceRe = /\{[^}]*\}/g;
                let bm: RegExpExecArray | null;
                while ((bm = braceRe.exec(firstLine)) !== null) {
                    paramRanges.push(new vscode.Range(
                        region.startLine, bm.index,
                        region.startLine, bm.index + bm[0].length,
                    ));
                }
            }
        }
    }

    // ---- 应用装饰 ----
    for (const [pattern, ranges] of Object.entries(bgRanges)) {
        editor.setDecorations(bgDecorations[pattern as RepeatPattern], ranges);
    }
    for (const pattern of Object.keys(bgDecorations)) {
        if (!bgRanges[pattern]) {
            editor.setDecorations(bgDecorations[pattern as RepeatPattern], []);
        }
    }

    editor.setDecorations(borderDecoration, borderRanges);
    editor.setDecorations(summaryLabelDecoration, summaryOptions);
    editor.setDecorations(foldTriangleDecoration, triangleRanges);
    editor.setDecorations(paramHighlightDecoration, paramRanges.length > 0 ? paramRanges : []);
}

/**
 * 清除所有装饰。
 */
export function clearDecorations(
    editor: vscode.TextEditor,
    decorTypes: DecorationTypes,
): void {
    for (const d of Object.values(decorTypes.bgDecorations)) {
        editor.setDecorations(d, []);
    }
    editor.setDecorations(decorTypes.borderDecoration, []);
    editor.setDecorations(decorTypes.paramHighlightDecoration, []);
    editor.setDecorations(decorTypes.summaryLabelDecoration, []);
    editor.setDecorations(decorTypes.foldTriangleDecoration, []);
}

// ---------------------------------------------------------------------------
// 标签构建
// ---------------------------------------------------------------------------

function buildSummaryLabel(region: FoldRegion, options: FoldOptions): string {
    const count = region.repeatCount;

    if (options.decorationStyle === 'compact') {
        return `  …×${count}`;
    }

    // detailed 模式：含时间跨度和频率
    const parts: string[] = [];
    parts.push(`…重复 ${count} 次`);

    if (region.sampleLines.length >= 2) {
        const firstTime = extractTime(region.sampleLines[0]);
        const lastTime = extractTime(region.sampleLines[region.sampleLines.length - 1]);
        if (firstTime && lastTime) {
            const firstShort = firstTime.slice(-12, -4);
            const lastShort = lastTime.slice(-12, -4);
            parts.push(`${firstShort}~${lastShort}`);
        }
    }

    return `  ${parts.join(' · ')}`;
}

function extractTime(line: string): string | null {
    const relMatch = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    if (relMatch) { return relMatch[1]; }
    const dateMatch = line.match(/(\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (dateMatch) { return dateMatch[1]; }
    return null;
}
