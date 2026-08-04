// ---------------------------------------------------------------------------
// src/language/logFold/decorations.ts — 日志折叠装饰器（视觉呈现）
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { FoldRegion, FoldOptions, DEFAULT_FOLD_OPTIONS, RepeatPattern } from './types';
import { t } from '../../i18n/logFold';

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

/** 概要标签颜色 */
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
    /** 折叠状态三角 — ▼ (region 已折叠) */
    foldTriangleFolded: vscode.TextEditorDecorationType;
    /** 折叠状态三角 — ▶ (region 已展开) */
    foldTriangleExpanded: vscode.TextEditorDecorationType;
}

/**
 * 根据当前主题创建全部装饰类型。
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

    const borderDecoration = vscode.window.createTextEditorDecorationType({
        borderStyle: 'none none none solid',
        borderWidth: '0 0 0 2px',
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    const paramHighlightDecoration = vscode.window.createTextEditorDecorationType({
        color: isDark ? '#e1c06b' : '#b08800',
        fontWeight: 'bold',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    const summaryLabelDecoration = vscode.window.createTextEditorDecorationType({
        after: { color: summaryColor, fontStyle: 'italic', margin: '0 0 0 8px' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 折叠三角 — 已折叠状态（▶ 表示内容已收起，点击展开）
    const foldTriangleFolded = vscode.window.createTextEditorDecorationType({
        before: { contentText: '▶ ', color: triangleColor, fontWeight: 'bold', margin: '0 4px 0 0' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // 折叠三角 — 已展开状态（▼ 表示内容可见，点击收起）
    const foldTriangleExpanded = vscode.window.createTextEditorDecorationType({
        before: { contentText: '▼ ', color: triangleColor, fontWeight: 'bold', margin: '0 4px 0 0' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    return {
        bgDecorations: bgDecorations as Record<RepeatPattern, vscode.TextEditorDecorationType>,
        borderDecoration,
        paramHighlightDecoration,
        summaryLabelDecoration,
        foldTriangleFolded,
        foldTriangleExpanded,
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
    types.foldTriangleFolded.dispose();
    types.foldTriangleExpanded.dispose();
}

// ---------------------------------------------------------------------------
// 装饰器应用
// ---------------------------------------------------------------------------

/**
 * 根据折叠区域应用装饰。
 *
 * 通过 editor.visibleRanges 判断每个 region 是否折叠，
 * 自动为 region 首行选择 ▼（折叠中）或 ▶（已展开）三角。
 */
export function applyDecorations(
    editor: vscode.TextEditor,
    regions: FoldRegion[],
    decorTypes: DecorationTypes,
    options: FoldOptions = DEFAULT_FOLD_OPTIONS,
): void {
    const {
        bgDecorations, borderDecoration, paramHighlightDecoration,
        summaryLabelDecoration, foldTriangleFolded, foldTriangleExpanded,
    } = decorTypes;

    // 推断每个 region 是否处于折叠状态：首行后的任何一行不可见即为折叠
    const regionFolded = new Map<number, boolean>();
    for (const region of regions) {
        if (region.endLine <= region.startLine) {
            regionFolded.set(region.startLine, true);
            continue;
        }
        // 检查 region.startLine + 1 是否在当前某 visibleRange 内
        const checkLine = region.startLine + 1;
        let visible = false;
        for (const vr of editor.visibleRanges) {
            if (vr.start.line <= checkLine && vr.end.line >= checkLine) {
                visible = true;
                break;
            }
        }
        regionFolded.set(region.startLine, !visible);
    }

    // 按模式分组
    const bgRanges: Record<string, vscode.Range[]> = {};
    const borderRanges: vscode.Range[] = [];
    const paramRanges: vscode.Range[] = [];
    const summaryOptions: vscode.DecorationOptions[] = [];
    const foldedTriangleRanges: vscode.Range[] = [];
    const expandedTriangleRanges: vscode.Range[] = [];

    for (const region of regions) {
        const pattern = region.pattern;
        const isFolded = regionFolded.get(region.startLine) ?? true;

        // 背景色
        if (!bgRanges[pattern]) { bgRanges[pattern] = []; }
        bgRanges[pattern].push(new vscode.Range(
            region.startLine, 0,
            region.endLine, editor.document.lineAt(region.endLine).text.length,
        ));

        // 左侧边框
        borderRanges.push(new vscode.Range(region.startLine, 0, region.endLine, 0));

        // 三角：根据折叠状态选择 ▼ 或 ▶
        if (isFolded) {
            foldedTriangleRanges.push(new vscode.Range(region.startLine, 0, region.startLine, 0));
        } else {
            expandedTriangleRanges.push(new vscode.Range(region.startLine, 0, region.startLine, 0));
        }

        // 概要标签
        const summaryText = buildSummaryLabel(region, options);
        summaryOptions.push({
            range: new vscode.Range(region.startLine, 0, region.startLine, 0),
            renderOptions: {
                after: { contentText: summaryText, fontStyle: 'italic', margin: '0 0 0 8px' },
            },
        });

        // 参数高亮
        if (region.pattern === 'parameterized' && region.paramsByOccurrence?.length) {
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

    // ---- 应用 ----
    for (const [pattern, ranges] of Object.entries(bgRanges)) {
        editor.setDecorations(bgDecorations[pattern as RepeatPattern], ranges);
    }
    for (const pattern of Object.keys(bgDecorations)) {
        if (!bgRanges[pattern]) {editor.setDecorations(bgDecorations[pattern as RepeatPattern], []);}
    }
    editor.setDecorations(borderDecoration, borderRanges);
    editor.setDecorations(summaryLabelDecoration, summaryOptions);
    editor.setDecorations(foldTriangleFolded, foldedTriangleRanges);
    editor.setDecorations(foldTriangleExpanded, expandedTriangleRanges);
    editor.setDecorations(paramHighlightDecoration, paramRanges.length > 0 ? paramRanges : []);
}

/** 清除所有装饰。 */
export function clearDecorations(editor: vscode.TextEditor, decorTypes: DecorationTypes): void {
    for (const d of Object.values(decorTypes.bgDecorations)) { editor.setDecorations(d, []); }
    editor.setDecorations(decorTypes.borderDecoration, []);
    editor.setDecorations(decorTypes.paramHighlightDecoration, []);
    editor.setDecorations(decorTypes.summaryLabelDecoration, []);
    editor.setDecorations(decorTypes.foldTriangleFolded, []);
    editor.setDecorations(decorTypes.foldTriangleExpanded, []);
}

// ---------------------------------------------------------------------------
// 标签构建
// ---------------------------------------------------------------------------

function buildSummaryLabel(region: FoldRegion, options: FoldOptions): string {
    const count = region.repeatCount;
    if (options.decorationStyle === 'compact') {
        return `  …×${count}`;
    }

    const parts: string[] = [];
    parts.push(t('summaryRepeated', { count }));

    if (region.sampleLines.length >= 2) {
        const firstTime = extractTime(region.sampleLines[0]);
        const lastTime = extractTime(region.sampleLines[region.sampleLines.length - 1]);
        if (firstTime && lastTime) {
            // 保留完整 HH:MM:SS.mmm 精度，与日志时间戳一致
            parts.push(`${firstTime}~${lastTime}`);
        }
    }

    return `  ${parts.join(' · ')}`;
}

/** 从日志行提取时间戳（相对 [HH:MM:SS.mmm] 优先，否则完整日期时间）。 */
function extractTime(line: string): string | null {
    const relMatch = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    if (relMatch) { return relMatch[1]; }
    const dateMatch = line.match(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    return dateMatch ? dateMatch[0] : null;
}
