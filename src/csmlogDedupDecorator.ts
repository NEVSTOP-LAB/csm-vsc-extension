// ---------------------------------------------------------------------------
// csmlogDedupDecorator.ts — CSM 日志重复行背景装饰器
// ---------------------------------------------------------------------------
// 为检测到的连续重复日志行组添加视觉标记：
//   1. 打开文件时自动折叠所有重复组
//   2. 所有重复行：浅灰色背景 + 概览标尺标记
//   3. 折叠入口行：醒目的 "▼ ×N" 前缀文字标记（仅折叠时可见的行上）
//
// 由 extension.ts 在 activate 时调用 setupDedupDecorator() 注册。
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups, RepeatedGroup } from './common/csmlogDedup';

/**
 * 已自动折叠过的文档 URI 集合（避免重复折叠）。
 */
const autoFoldedDocs = new Set<string>();

/**
 * 从日志行提取简短时间戳（HH:MM:SS），用于折叠标记中的时间跨度显示。
 */
function extractShortTimestamp(line: string): string | null {
    const m = line.match(/\d{4}[/-]\d{2}[/-]\d{2}\s+(\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : null;
}

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
 * 折叠标记装饰：在折叠入口行显示醒目的 "▼ ×N" 文字标记。
 */
const foldMarkerDecorationType = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/**
 * 对编辑器自动折叠所有重复组（仅首次）。
 */
async function autoFoldGroups(editor: vscode.TextEditor, groups: RepeatedGroup[]): Promise<void> {
    const uri = editor.document.uri.toString();
    if (autoFoldedDocs.has(uri)) { return; }
    autoFoldedDocs.add(uri);

    // 延迟执行，等 VS Code 完成语法高亮和折叠范围计算
    await new Promise(resolve => setTimeout(resolve, 300));

    for (const group of groups) {
        const foldStart = group.blockSize > 1
            ? group.startLine + group.blockSize
            : group.startLine;
        if (foldStart >= group.endLine) { continue; }

        // 将光标移到折叠起始行，执行 editor.fold
        const pos = new vscode.Position(foldStart, 0);
        editor.selection = new vscode.Selection(pos, pos);
        await vscode.commands.executeCommand('editor.fold');
    }
}

/**
 * 为指定编辑器中的重复日志行应用背景装饰，并自动折叠。
 */
async function applyDecorations(editor: vscode.TextEditor): Promise<void> {
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

    // —— 自动折叠（仅首次打开时） ——
    autoFoldGroups(editor, groups);

    const bgRanges: vscode.Range[] = [];
    const markerOpts: vscode.DecorationOptions[] = [];

    for (const group of groups) {
        const bs = group.blockSize;

        // 所有重复行添加淡背景
        for (let line = group.startLine; line <= group.endLine; line++) {
            bgRanges.push(editor.document.lineAt(line).range);
        }

        // 计算折叠信息
        const foldedCount = group.count >= 3 ? group.count - 2 : 1;
        const foldStartLine = group.startLine + bs; // 折叠起始行

        if (foldStartLine <= group.endLine) {
            // 提取折叠段首尾时间戳
            const firstFoldedLine = editor.document.lineAt(foldStartLine).text;
            const lastFoldedLine = editor.document.lineAt(
                group.count >= 3 ? group.endLine - bs : group.endLine
            ).text;
            const ts1 = extractShortTimestamp(firstFoldedLine);
            const ts2 = extractShortTimestamp(lastFoldedLine);

            // 构建标记文字
            const label = bs > 1
                ? `▼ ${foldedCount} blocks (${bs}L)`
                : `▼ ${foldedCount} lines`;
            const timeSpan = ts1 && ts2 ? ` | ${ts1} → ${ts2}` : '';
            const contentText = `${label}${timeSpan} `;

            markerOpts.push({
                range: editor.document.lineAt(foldStartLine).range,
                renderOptions: {
                    before: {
                        contentText,
                        color: new vscode.ThemeColor('editorInfo.foreground'),
                        backgroundColor: new vscode.ThemeColor('editorInfo.background'),
                        fontWeight: 'bold',
                        margin: '0 8px 0 0',
                    },
                },
            });
        }
    }

    editor.setDecorations(dedupBgDecorationType, bgRanges);
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
        void applyDecorations(activeEditor);
    }

    // 活动编辑器切换时更新
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                void applyDecorations(editor);
            }
        }),
    );

    // 文档内容变更时更新
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                void applyDecorations(editor);
            }
        }),
    );

    // 文档关闭时清理自动折叠记录
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            autoFoldedDocs.delete(document.uri.toString());
        }),
    );
}
