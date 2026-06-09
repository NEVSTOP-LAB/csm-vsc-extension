// ---------------------------------------------------------------------------
// csmlogDedupDecorator.ts — CSM 日志重复行背景装饰器
// ---------------------------------------------------------------------------
// 为检测到的连续重复日志行组添加浅灰色背景，使重复区域在折叠前
// 后都一眼可见，帮助用户快速定位淹没在重复内容中的关键信息。
//
// 由 extension.ts 在 activate 时调用 setupDedupDecorator() 注册。
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups } from './common/csmlogDedup';

/**
 * 重复行装饰类型：浅灰蓝色背景 + 左侧细边框，不干扰代码阅读。
 */
const dedupDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/**
 * 为指定编辑器中的重复日志行应用背景装饰。
 */
function applyDecorations(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'csmlog') {
        editor.setDecorations(dedupDecorationType, []);
        return;
    }

    const config = vscode.workspace.getConfiguration('csmModules.dedup');
    if (!config.get<boolean>('enabled', true)) {
        editor.setDecorations(dedupDecorationType, []);
        return;
    }

    const minRepeat = config.get<number>('minRepeatCount', 2);
    const multiLineEnabled = config.get<boolean>('multiLineEnabled', true);

    const groups = multiLineEnabled
        ? detectAllRepeatedGroups(editor.document, minRepeat)
        : detectAllRepeatedGroups(editor.document, minRepeat, 999);

    const ranges: vscode.Range[] = [];
    for (const group of groups) {
        for (let line = group.startLine; line <= group.endLine; line++) {
            ranges.push(editor.document.lineAt(line).range);
        }
    }

    editor.setDecorations(dedupDecorationType, ranges);
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
