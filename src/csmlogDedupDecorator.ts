// ---------------------------------------------------------------------------
// csmlogDedupDecorator.ts — CSM 日志重复行背景装饰器
// ---------------------------------------------------------------------------
//   1. 打开文件自动折叠所有重复组（count ≥ 2）
//   2. 首行信息线：显示时间跨度、起止行号、折叠块数/行数
//   3. 可见模板行左侧竖线 + 所有重复行淡背景 + 概览标尺
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups, RepeatedGroup, DISABLE_MULTI_LINE } from './common/csmlogDedup';
import { localizeBundle } from './i18n';

const autoFoldedDocs = new Set<string>();

/** 装饰器文本本地化 */
const decoratorMessages = {
    blocks: { en: 'blocks', zh: '块' },
    lines: { en: 'lines', zh: '行' },
} as const;

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
// 四种背景色：组索引 × 块索引 的奇偶交替，使相邻组及组内相邻块均可区分

/** 偶数组 + 偶数块 — 亮蓝色 */
const bgType00 = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(110, 160, 230, 0.10)',
    isWholeLine: true,
    overviewRulerColor: 'rgba(110, 160, 230, 0.10)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/** 偶数组 + 奇数块 — 深蓝色 */
const bgType01 = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(40, 75, 140, 0.10)',
    isWholeLine: true,
    overviewRulerColor: 'rgba(40, 75, 140, 0.10)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/** 奇数组 + 偶数块 — 亮琥珀色 */
const bgType10 = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(230, 175, 70, 0.10)',
    isWholeLine: true,
    overviewRulerColor: 'rgba(230, 175, 70, 0.10)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/** 奇数组 + 奇数块 — 深琥珀色 */
const bgType11 = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(140, 90, 30, 0.10)',
    isWholeLine: true,
    overviewRulerColor: 'rgba(140, 90, 30, 0.10)',
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
    const cfg = vscode.workspace.getConfiguration('csmModules.dedup');
    if (!cfg.get<boolean>('autoFold', true)) { return; }

    const uri = editor.document.uri.toString();
    if (autoFoldedDocs.has(uri)) { return; }
    autoFoldedDocs.add(uri);

    const foldable = groups.filter(g => g.count >= 2);
    if (foldable.length === 0) { return; }

    // 让出微任务以确保 VS Code 完成当前批次的装饰渲染
    await Promise.resolve();

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
        editor.setDecorations(bgType00, []); editor.setDecorations(bgType01, []);
        editor.setDecorations(bgType10, []); editor.setDecorations(bgType11, []);
        editor.setDecorations(infoType, []); editor.setDecorations(borderType, []);
        return;
    }
    const cfg = vscode.workspace.getConfiguration('csmModules.dedup');
    if (!cfg.get<boolean>('enabled', true)) {
        editor.setDecorations(bgType00, []); editor.setDecorations(bgType01, []);
        editor.setDecorations(bgType10, []); editor.setDecorations(bgType11, []);
        editor.setDecorations(infoType, []); editor.setDecorations(borderType, []);
        return;
    }

    const groups = cfg.get<boolean>('multiLineEnabled', true)
        ? detectAllRepeatedGroups(editor.document, cfg.get<number>('minRepeatCount', 2))
        : detectAllRepeatedGroups(editor.document, cfg.get<number>('minRepeatCount', 2), DISABLE_MULTI_LINE);

    await autoFoldGroups(editor, groups);

    const bgRanges00: vscode.Range[] = [];
    const bgRanges01: vscode.Range[] = [];
    const bgRanges10: vscode.Range[] = [];
    const bgRanges11: vscode.Range[] = [];
    const infoOpts: vscode.DecorationOptions[] = [];
    const borderRanges: vscode.Range[] = [];

    groups.forEach((g, groupIdx) => {
        const bs = g.blockSize;
        const totalBlocks = g.count;
        const totalLines = totalBlocks * bs;
        const groupParity = groupIdx % 2;  // 0=偶数, 1=奇数

        // 所有重复行背景 + 左侧竖线
        for (let l = g.startLine; l <= g.endLine; l++) {
            const r = editor.document.lineAt(l).range;
            const blockIdx = Math.floor((l - g.startLine) / bs);
            const blockParity = blockIdx % 2;  // 0=偶数块, 1=奇数块

            // 四种组合分配：组奇偶 × 块奇偶
            if (groupParity === 0) {
                if (blockParity === 0) { bgRanges00.push(r); }
                else { bgRanges01.push(r); }
            } else {
                if (blockParity === 0) { bgRanges10.push(r); }
                else { bgRanges11.push(r); }
            }
            borderRanges.push(r);
        }

        // 信息行（before 装饰在首行之前）
        const ts1 = shortTs(editor.document.lineAt(g.startLine).text);
        const ts2 = shortTs(editor.document.lineAt(g.endLine).text);
        const timeSpan = ts1 && ts2 ? ` | ${ts1} → ${ts2}` : '';
        const icon = foldIcon(editor, g);
        const blocksText = localizeBundle(decoratorMessages, 'blocks');
        const linesText = localizeBundle(decoratorMessages, 'lines');
        const label = `${icon} ${totalBlocks} ${blocksText} · ${totalLines} ${linesText}${timeSpan} | L${g.startLine + 1}-L${g.endLine + 1}`;

        infoOpts.push({
            range: editor.document.lineAt(g.startLine).range,
            renderOptions: {
                before: {
                    contentText: label,
                    color: new vscode.ThemeColor('editorInfo.foreground'),
                    fontWeight: 'bold',
                    margin: '0 8px 0 0',
                },
            },
        });
    });

    editor.setDecorations(bgType00, bgRanges00);
    editor.setDecorations(bgType01, bgRanges01);
    editor.setDecorations(bgType10, bgRanges10);
    editor.setDecorations(bgType11, bgRanges11);
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

    // 文档内容变更时更新（带防抖，避免大文件编辑时频繁全量扫描）
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                if (debounceTimer) { clearTimeout(debounceTimer); }
                debounceTimer = setTimeout(() => {
                    void applyDecorations(editor);
                }, 400);
            }
        }),
    );

    // 折叠/展开时更新图标（▼ ↔ ▶）—— 不防抖，确保即时响应
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
            if (event.textEditor.document.languageId === 'csmlog') {
                void applyDecorations(event.textEditor);
            }
        }),
    );

    // 文档关闭时清理自动折叠记录和防抖定时器
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            autoFoldedDocs.delete(document.uri.toString());
            if (debounceTimer) { clearTimeout(debounceTimer); }
        }),
    );

    // 扩展停用时清理所有自动折叠记录，避免重新激活后遗留状态
    context.subscriptions.push({
        dispose: () => { autoFoldedDocs.clear(); },
    });
}
