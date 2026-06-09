// ---------------------------------------------------------------------------
// csmlogDedupDecorator.ts — CSM 日志重复行背景装饰器
// ---------------------------------------------------------------------------
// 为检测到的连续重复日志行组添加视觉标记：
//   1. 折叠起始行：醒目的左侧蓝色边框 + 着重背景 + "▼ ×N" 前缀文字
//   2. 其余重复行：浅灰色背景 + 概览标尺标记
//
// 使重复区域在折叠前后都一眼可见，帮助用户快速定位淹没在
// 重复内容中的关键信息。
//
// 由 extension.ts 在 activate 时调用 setupDedupDecorator() 注册。
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups } from './common/csmlogDedup';

/**
 * 重复行背景装饰：浅灰色，覆盖整行，右侧概览标尺标记。
 */
const dedupBgDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/**
 * 折叠标记装饰：在折叠起始行通过 before 文字显示醒目的 ×N 标记。
 * 文字以加粗 + 主题色背景呈现，与淡色重复行背景形成对比。
 */
const foldMarkerDecorationType = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/**
 * 为指定编辑器中的重复日志行应用背景装饰。
 */
function applyDecorations(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'csmlog') {
        editor.setDecorations(dedupBgDecorationType, []);
        editor.setDecorations(foldMarkerDecorationType, []);
        return;
    }

    const config = vscode.workspace.getConfiguration('csmModules.dedup');
    if (!config.get<boolean>('enabled', true)) {
        editor.setDecorations(dedupBgDecorationType, []);
        editor.setDecorations(foldMarkerDecorationType, []);
        return;
    }

    const minRepeat = config.get<number>('minRepeatCount', 2);
    const multiLineEnabled = config.get<boolean>('multiLineEnabled', true);

    const groups = multiLineEnabled
        ? detectAllRepeatedGroups(editor.document, minRepeat)
        : detectAllRepeatedGroups(editor.document, minRepeat, 999);

    const bgRanges: vscode.Range[] = [];
    const markerRanges: vscode.Range[] = [];
    const markerTexts: Record<number, string> = {}; // line index → marker text

    for (const group of groups) {
        // 折叠起始行：单行 = startLine，多行 = startLine + blockSize（模板之后第一行）
        const foldStart = group.blockSize > 1
            ? group.startLine + group.blockSize
            : group.startLine;

        for (let line = group.startLine; line <= group.endLine; line++) {
            // 所有重复行添加淡背景
            bgRanges.push(editor.document.lineAt(line).range);
        }

        // 折叠起始行添加醒目标记
        if (foldStart <= group.endLine) {
            const markerLine = editor.document.lineAt(foldStart);
            markerRanges.push(markerLine.range);

            // 生成折叠标记文字
            const count = group.blockSize > 1
                ? `${group.count - 1}× [${group.blockSize}L]`
                : `${group.count}`;
            markerTexts[foldStart] = count;
        }
    }

    // 为每条标记行设置独特的 before.contentText
    editor.setDecorations(dedupBgDecorationType, bgRanges);

    // 为折叠标记行设置不同文字——需要逐行创建 decoration options
    const markerOpts: vscode.DecorationOptions[] = markerRanges.map((range) => ({
        range,
        renderOptions: {
            before: {
                contentText: `▼ ×${markerTexts[range.start.line] ?? '?'} `,
                color: new vscode.ThemeColor('editorInfo.foreground'),
                backgroundColor: new vscode.ThemeColor('editorInfo.background'),
                fontWeight: 'bold',
                margin: '0 8px 0 0',
            },
        },
    }));

    editor.setDecorations(foldMarkerDecorationType, markerOpts);
}

/**
 * 设置去重装饰器的监听器。
 * 在活动编辑器切换和文档内容变更时自动更新装饰。
 *
 * @param context — 扩展上下文（用于 disposables）
 */
export function setupDedupDecorator(context: vscode.ExtensionContext): void {
    // 当前活动编辑器立即应用装饰
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        applyDecorations(activeEditor);
    }

    // 活动编辑器切换时更新
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                applyDecorations(editor);
            }
        }),
    );

    // 文档内容变更时更新（限流：仅处理 csmlog 文件）
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                applyDecorations(editor);
            }
        }),
    );
}
