// ---------------------------------------------------------------------------
// csmlogDedupDecorator.ts — CSM 日志重复行背景装饰器
// ---------------------------------------------------------------------------
//   1. 打开文件自动折叠所有重复组（count ≥ 2）
//   2. 首行信息线：显示时间跨度、起止行号、折叠块数/行数
//   3. 可见模板行左侧竖线 + 所有重复行淡背景 + 概览标尺
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups, RepeatedGroup } from './common/csmlogDedup';

const autoFoldedDocs = new Set<string>();

/** 提取 HH:MM:SS.mmm 时间戳（与原始日志精度一致） */
function shortTs(line: string): string | null {
    const m = line.match(/\d{4}[/-]\d{2}[/-]\d{2}\s+(\d{2}:\d{2}:\d{2}\.\d{3})/);
    return m ? m[1] : null;
}

/** 判断重复组的折叠状态：折叠=▶，展开=▼ */
function foldIcon(editor: vscode.TextEditor, g: RepeatedGroup): string {
    const nextLine = g.startLine + g.blockSize;  // 折叠头行的下一行
    for (const r of editor.visibleRanges) {
        if (r.start.line <= nextLine && r.end.line >= nextLine) {
            return '▼';  // 下一行可见 → 已展开
        }
    }
    return '▶';  // 下一行不可见 → 已折叠
}

// ---- 装饰类型 ----

/** 所有重复行淡背景 */
const bgType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/** 首行信息线 */
const infoType = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/** 可见模板行左侧竖线（使用 before 管道符模拟） */
const borderType = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: '│ ',
        color: new vscode.ThemeColor('editorInfo.foreground'),
        fontWeight: 'bold',
        margin: '0 4px 0 0',
    },
});

// ---- 自动折叠 ----

async function autoFoldGroups(editor: vscode.TextEditor, groups: RepeatedGroup[]): Promise<void> {
    const uri = editor.document.uri.toString();
    if (autoFoldedDocs.has(uri)) { return; }
    autoFoldedDocs.add(uri);

    const foldable = groups.filter(g => g.count >= 2);
    if (foldable.length === 0) { return; }

    await new Promise(resolve => setTimeout(resolve, 500));

    // 多选区同时折叠所有组，高效且不跳光标
    const selections = foldable.map(g => {
        const fs = g.startLine + g.blockSize - 1;
        const fe = g.endLine;
        return new vscode.Selection(new vscode.Position(fs, 0), new vscode.Position(fe, 0));
    });
    editor.selections = selections;
    await vscode.commands.executeCommand('editor.fold');
    // 恢复单光标到第一组可见位置
    if (foldable.length > 0) {
        const g = foldable[0];
        editor.selection = new vscode.Selection(new vscode.Position(g.startLine, 0), new vscode.Position(g.startLine, 0));
    }
}

// ---- 装饰应用 ----

async function applyDecorations(editor: vscode.TextEditor): Promise<void> {
    if (editor.document.languageId !== 'csmlog') {
        editor.setDecorations(bgType, []); editor.setDecorations(infoType, []); editor.setDecorations(borderType, []);
        return;
    }
    const cfg = vscode.workspace.getConfiguration('csmModules.dedup');
    if (!cfg.get<boolean>('enabled', true)) {
        editor.setDecorations(bgType, []); editor.setDecorations(infoType, []); editor.setDecorations(borderType, []);
        return;
    }

    const groups = cfg.get<boolean>('multiLineEnabled', true)
        ? detectAllRepeatedGroups(editor.document, cfg.get<number>('minRepeatCount', 2))
        : detectAllRepeatedGroups(editor.document, cfg.get<number>('minRepeatCount', 2), 999);

    await autoFoldGroups(editor, groups);

    const bgRanges: vscode.Range[] = [];
    const infoOpts: vscode.DecorationOptions[] = [];
    const borderRanges: vscode.Range[] = [];

    for (const g of groups) {
        const bs = g.blockSize;
        const totalBlocks = g.count;
        const totalLines = totalBlocks * bs;
        const foldStart = g.startLine + bs - 1;   // 第一组最后一行
        const foldEnd = g.endLine;

        // 所有重复行淡背景 + 左侧竖线
        for (let l = g.startLine; l <= g.endLine; l++) {
            const r = editor.document.lineAt(l).range;
            bgRanges.push(r);
            borderRanges.push(r);
        }

        // 信息行（before 装饰在首行之前）
        const ts1 = shortTs(editor.document.lineAt(g.startLine).text);
        const ts2 = shortTs(editor.document.lineAt(g.endLine).text);
        const timeSpan = ts1 && ts2 ? ` | ${ts1} → ${ts2}` : '';
        const icon = foldIcon(editor, g);
        const label = `${icon} ${totalBlocks} blocks · ${totalLines} lines${timeSpan} | L${g.startLine + 1}-L${g.endLine + 1}`;

        infoOpts.push({
            range: editor.document.lineAt(g.startLine).range,
            renderOptions: {
                before: {
                    contentText: label,
                    color: new vscode.ThemeColor('editorInfo.foreground'),
                    backgroundColor: new vscode.ThemeColor('editorInfo.background'),
                    fontWeight: 'bold',
                    margin: '0 8px 0 0',
                },
            },
        });
    }

    editor.setDecorations(bgType, bgRanges);
    editor.setDecorations(infoType, infoOpts);
    editor.setDecorations(borderType, borderRanges);
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

    // 折叠/展开时更新图标（▼ ↔ ▶）
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
            if (event.textEditor.document.languageId === 'csmlog') {
                void applyDecorations(event.textEditor);
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
