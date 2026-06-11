import * as vscode from 'vscode';
import { CSMLogHoverProvider } from './csmlogHoverProvider';
import { CSMLogDocumentSymbolProvider } from './csmlogDocumentSymbolProvider';
import { LvcsmDocumentSymbolProvider } from './lvcsmDocumentSymbolProvider';
import { clearAnchorCache } from './hoverData';
import { ModuleManagerController } from './moduleManager';
import { CsmFileDecorationProvider } from './fileDecorationProvider';
import {
    CSMLogFoldingRangeProvider,
    createDecorationTypes,
    applyDecorations,
    clearDecorations,
    FoldRegion,
    detectRepeatRegions,
    normalizeLine,
} from './logFold';
import { DEFAULT_FOLD_OPTIONS, FoldOptions } from './logFold/types';

export function activate(context: vscode.ExtensionContext) {
    // 语言功能（高亮、Hover、Outline）必须在模块管理器之前注册，
    // 确保即使模块管理器初始化失败，csmlog/lvcsm 的基本语言特性仍可用。
    try {
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: 'csmlog' }, new CSMLogHoverProvider()),
            vscode.languages.registerDocumentSymbolProvider({ language: 'csmlog' }, new CSMLogDocumentSymbolProvider()),
            vscode.languages.registerDocumentSymbolProvider({ language: 'lvcsm' }, new LvcsmDocumentSymbolProvider()),
            // Clean up anchor cache when documents are closed to prevent memory leaks
            vscode.workspace.onDidCloseTextDocument((document) => {
                clearAnchorCache(document.uri.toString());
            }),
            // 文件装饰（Badge 标记）可与任意图标主题共存
            vscode.window.registerFileDecorationProvider(new CsmFileDecorationProvider()),
        );
    } catch (err) {
        console.error('[CSM] Failed to register language providers:', err);
    }

    // ---- 日志折叠功能 ----
    const foldProvider = new CSMLogFoldingRangeProvider();
    const decorTypes = createDecorationTypes();

    // 注册 FoldingRangeProvider
    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            { language: 'csmlog' },
            foldProvider,
        ),
    );

    // 文档变更时清除折叠缓存
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            foldProvider.onDocumentChanged(e);
            // 同时更新装饰
            updateDecorationsForEditor(vscode.window.activeTextEditor, decorTypes);
        }),
    );

    // 切换编辑器时更新装饰
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateDecorationsForEditor(editor, decorTypes);
        }),
    );

    // 折叠状态变化时更新装饰
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            if (e.textEditor.document.languageId === 'csmlog') {
                updateDecorationsForEditor(e.textEditor, decorTypes);
            }
        }),
    );

    // ---- 状态栏 ----
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99,
    );
    statusBarItem.command = 'csmlog.folding.toggleAllFolds';
    statusBarItem.tooltip = 'Toggle all CSMLog repeated region folds';
    context.subscriptions.push(statusBarItem);

    // 编辑器切换时更新状态栏显隐
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateStatusBar(statusBarItem, editor);
        }),
    );

    // 初始化当前编辑器的状态栏和装饰
    updateStatusBar(statusBarItem, vscode.window.activeTextEditor);
    updateDecorationsForEditor(vscode.window.activeTextEditor, decorTypes);

    // ---- 命令 ----
    context.subscriptions.push(
        vscode.commands.registerCommand('csmlog.folding.toggleAllFolds', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csmlog') { return; }
            await vscode.commands.executeCommand('editor.toggleFold');
            // 触发装饰更新
            updateDecorationsForEditor(editor, decorTypes);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('csmlog.folding.foldCurrentRegion', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csmlog') { return; }
            // 使用 VS Code 内置的 fold 命令折叠当前光标所在区域
            await vscode.commands.executeCommand('editor.fold', {
                levels: 1,
                direction: 'up',
            });
            updateDecorationsForEditor(editor, decorTypes);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('csmlog.folding.showStats', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csmlog') {
                vscode.window.showInformationMessage('CSMLog Fold: 当前文件不是 CSMLog 文件');
                return;
            }
            const stats = computeFoldStats(editor);
            vscode.window.showInformationMessage(
                `CSMLog 折叠统计: 检测到 ${stats.regionCount} 个重复区，覆盖 ${stats.foldedLines} 行 ` +
                `(${stats.percentage}%)`,
            );
        }),
    );

    // 装饰器 dispose
    context.subscriptions.push(
        ...Object.values(decorTypes.bgDecorations),
        decorTypes.borderDecoration,
        decorTypes.paramHighlightDecoration,
        decorTypes.summaryLabelDecoration,
    );

    // ---- 模块管理器 ----
    // 模块管理器初始化失败不应影响语言功能——因此放在 try-catch 中，
    // 并置于语言 providers 注册之后。
    try {
        const moduleManagerController = new ModuleManagerController(context);
        moduleManagerController.register(context.subscriptions);
    } catch (err) {
        console.error('[CSM] Failed to initialize module manager (language features remain available):', err);
    }
}

export function deactivate() { }

// ---------------------------------------------------------------------------
// 状态栏辅助
// ---------------------------------------------------------------------------

function updateStatusBar(
    item: vscode.StatusBarItem,
    editor: vscode.TextEditor | undefined,
): void {
    if (!editor || editor.document.languageId !== 'csmlog') {
        item.hide();
        return;
    }

    const stats = computeFoldStats(editor);
    if (stats.regionCount === 0) {
        item.hide();
        return;
    }

    // 比例超过 50% 时用警告色
    if (parseFloat(stats.percentage) > 50) {
        item.color = new vscode.ThemeColor('editorWarning.foreground');
    } else {
        item.color = undefined;
    }

    item.text = `$(fold) ${stats.regionCount}区 / ${editor.document.lineCount}行`;
    item.tooltip = `检测到 ${stats.regionCount} 个重复折叠区，覆盖 ${stats.foldedLines} 行 (${stats.percentage}%) —— 点击切换折叠`;
    item.show();
}

// ---------------------------------------------------------------------------
// 装饰器辅助
// ---------------------------------------------------------------------------

function updateDecorationsForEditor(
    editor: vscode.TextEditor | undefined,
    decorTypes: ReturnType<typeof createDecorationTypes>,
): void {
    if (!editor || editor.document.languageId !== 'csmlog') {
        if (editor) {
            clearDecorations(editor, decorTypes);
        }
        return;
    }

    const options = readFoldOptions();
    if (!options.enabled) {
        clearDecorations(editor, decorTypes);
        return;
    }

    // 重新检测
    const rawLines: string[] = [];
    const signatures: Array<import('./logFold/types').LineSignature | null> = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
        const raw = editor.document.lineAt(i).text;
        rawLines.push(raw);
        signatures.push(normalizeLine(raw));
    }

    const regions = detectRepeatRegions(rawLines, signatures, options);
    applyDecorations(editor, regions, decorTypes, options);
}

function readFoldOptions(): FoldOptions {
    const config = vscode.workspace.getConfiguration('csmlog.folding');
    return {
        enabled: config.get<boolean>('enabled', DEFAULT_FOLD_OPTIONS.enabled),
        minRepeatCount: config.get<number>('minRepeatCount', DEFAULT_FOLD_OPTIONS.minRepeatCount),
        maxBlockLines: config.get<number>('maxBlockLines', DEFAULT_FOLD_OPTIONS.maxBlockLines),
        smartParams: config.get<boolean>('smartParams', DEFAULT_FOLD_OPTIONS.smartParams),
        decorationStyle: config.get<'compact' | 'detailed'>(
            'decorationStyle',
            DEFAULT_FOLD_OPTIONS.decorationStyle,
        ),
    };
}

interface FoldStats {
    regionCount: number;
    foldedLines: number;
    percentage: string;
}

function computeFoldStats(editor: vscode.TextEditor): FoldStats {
    const options = readFoldOptions();
    if (!options.enabled) { return { regionCount: 0, foldedLines: 0, percentage: '0.0' }; }

    const rawLines: string[] = [];
    const signatures: Array<import('./logFold/types').LineSignature | null> = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
        const raw = editor.document.lineAt(i).text;
        rawLines.push(raw);
        signatures.push(normalizeLine(raw));
    }

    const regions = detectRepeatRegions(rawLines, signatures, options);
    let foldedLines = 0;
    for (const r of regions) {
        foldedLines += r.endLine - r.startLine + 1;
    }
    const pct = editor.document.lineCount > 0
        ? ((foldedLines / editor.document.lineCount) * 100).toFixed(1)
        : '0.0';

    return { regionCount: regions.length, foldedLines, percentage: pct };
}
