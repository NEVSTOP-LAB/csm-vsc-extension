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
	disposeDecorationTypes,
	applyDecorations,
	clearDecorations,
	detectRepeatRegions,
	normalizeLine,
	DecorationTypes,
} from './logFold';
import { DEFAULT_FOLD_OPTIONS, FoldOptions } from './logFold/types';

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;
let decorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let currentDecorTypes: DecorationTypes | undefined;

/** 暂存折叠前的视窗首行 */
let savedTopLine: number | undefined;

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
	// 初始化折叠上下文键（必须在注册 menus 之前，否则 editor/title 按钮不显示）
	vscode.commands.executeCommand('setContext', 'csmlog.folding.activated', false);

	// 语言功能（高亮、Hover、Outline）
	try {
		context.subscriptions.push(
			vscode.languages.registerHoverProvider({ language: 'csmlog' }, new CSMLogHoverProvider()),
			vscode.languages.registerDocumentSymbolProvider({ language: 'csmlog' }, new CSMLogDocumentSymbolProvider()),
			vscode.languages.registerDocumentSymbolProvider({ language: 'lvcsm' }, new LvcsmDocumentSymbolProvider()),
			vscode.workspace.onDidCloseTextDocument((document) => {
				clearAnchorCache(document.uri.toString());
			}),
			vscode.window.registerFileDecorationProvider(new CsmFileDecorationProvider()),
		);
	} catch (err) {
		console.error('[CSM] Failed to register language providers:', err);
	}

	// ---- 日志折叠功能 ----
	const foldProvider = new CSMLogFoldingRangeProvider();
	currentDecorTypes = createDecorationTypes(vscode.window.activeColorTheme.kind);

	context.subscriptions.push(
		vscode.languages.registerFoldingRangeProvider({ language: 'csmlog' }, foldProvider),
	);

	// 主题变更
	context.subscriptions.push(
		vscode.window.onDidChangeActiveColorTheme((theme) => {
			if (currentDecorTypes) {
				if (vscode.window.activeTextEditor?.document.languageId === 'csmlog') {
					clearDecorations(vscode.window.activeTextEditor, currentDecorTypes);
				}
				disposeDecorationTypes(currentDecorTypes);
			}
			currentDecorTypes = createDecorationTypes(theme.kind);
			refreshDecorForActiveEditor();
		}),
	);

	// 文档变更时清除缓存 + 去抖更新装饰
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			foldProvider.onDocumentChanged(e);
			refreshDecorForActiveEditor();
		}),
	);

	// 关闭文档时清除缓存 + 清理 per-file 状态
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			const uri = document.uri.toString();
			foldProvider.clearCache(uri);
			foldProvider.enabledDocs.delete(uri);
		}),
	);

	// 切换编辑器时更新状态栏和装饰，重置 toolbar context
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			const isCsmlog = editor?.document.languageId === 'csmlog';
			const activated = isCsmlog && foldProvider.enabledDocs.has(editor!.document.uri.toString());
			vscode.commands.executeCommand('setContext', 'csmlog.folding.activated', activated);
			updateStatusBar(statusBarItem, editor, foldProvider);
			refreshDecorForActiveEditor();
		}),
	);

	// 折叠态变化时更新装饰（三角方向随折叠态变化）
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
			if (e.textEditor.document.languageId === 'csmlog') {
				scheduleDecorUpdate(e.textEditor);
			}
		}),
	);

	// ---- 状态栏 ----
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	statusBarItem.command = 'csmlog.folding.toggleAllFolds';
	statusBarItem.tooltip = '切换全部 CSMLog 重复区折叠';
	context.subscriptions.push(statusBarItem);
	updateStatusBar(statusBarItem, vscode.window.activeTextEditor, foldProvider);
	scheduleDecorUpdate(vscode.window.activeTextEditor);

	// ---- 装饰器 dispose ----
	if (currentDecorTypes) {
		context.subscriptions.push(
			...Object.values(currentDecorTypes.bgDecorations),
			currentDecorTypes.borderDecoration,
			currentDecorTypes.paramHighlightDecoration,
			currentDecorTypes.summaryLabelDecoration,
			currentDecorTypes.foldTriangleFolded,
			currentDecorTypes.foldTriangleExpanded,
		);
	}

	// ---- 命令 ----
	registerCommands(context, foldProvider, statusBarItem);

	// ---- 模块管理器 ----
	try {
		const moduleManagerController = new ModuleManagerController(context);
		moduleManagerController.register(context.subscriptions);
	} catch (err) {
		console.error('[CSM] Failed to initialize module manager (language features remain available):', err);
	}
}

export function deactivate() { }

// ---------------------------------------------------------------------------
// 命令注册
// ---------------------------------------------------------------------------

function registerCommands(
	context: vscode.ExtensionContext,
	foldProvider: CSMLogFoldingRangeProvider,
	statusBarItem: vscode.StatusBarItem,
): void {

	// ---- 激活当前文件的折叠功能（检测 + 自动全部折叠） ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.activate', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }

			const uri = editor.document.uri.toString();
			foldProvider.enabledDocs.add(uri);
			foldProvider.clearCache(uri);

			// 设置 context key，控制工具栏按钮显隐
			await vscode.commands.executeCommand('setContext', 'csmlog.folding.activated', true);

			// 等待 FoldingRangeProvider 返回结果后自动折叠全部
			await new Promise((resolve) => setTimeout(resolve, 200));
			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.foldAllMarkerRegions');
			restoreViewport(editor);

			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor, foldProvider);
		}),
	);

	// ---- 停用当前文件的折叠功能（展开全部 + 清除） ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.deactivate', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }

			const uri = editor.document.uri.toString();
			foldProvider.enabledDocs.delete(uri);
			foldProvider.clearCache(uri);

			await vscode.commands.executeCommand('setContext', 'csmlog.folding.activated', false);

			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.unfoldAll');
			restoreViewport(editor);

			if (currentDecorTypes) { clearDecorations(editor, currentDecorTypes); }
			updateStatusBar(statusBarItem, editor, foldProvider);
		}),
	);

	// ---- 切换全部折叠/展开（保持视窗位置） ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.toggleAllFolds', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }
			if (!foldProvider.enabledDocs.has(editor.document.uri.toString())) { return; }

			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.toggleFold');
			restoreViewport(editor);
			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor, foldProvider);
		}),
	);

	// ---- 统计 ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.showStats', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') {
				vscode.window.showInformationMessage('CSMLog Fold: 当前文件不是 CSMLog 文件');
				return;
			}
			if (!foldProvider.enabledDocs.has(editor.document.uri.toString())) {
				vscode.window.showInformationMessage('CSMLog Fold: 请先点击工具栏 👁 按钮启用折叠检测');
				return;
			}
			const stats = computeFoldStats(editor);
			vscode.window.showInformationMessage(
				`CSMLog 折叠统计: 检测到 ${stats.regionCount} 个重复区，覆盖 ${stats.foldedLines} 行 ` +
				`(${stats.percentage}%)`,
			);
		}),
	);
}

// ---------------------------------------------------------------------------
// 视窗位置恢复
// ---------------------------------------------------------------------------

async function restoreViewport(editor: vscode.TextEditor): Promise<void> {
	if (savedTopLine === undefined) { return; }
	const topLine = savedTopLine;
	savedTopLine = undefined;
	await new Promise((resolve) => setTimeout(resolve, 50));
	const stillVisible = editor.visibleRanges.some(
		(vr) => vr.start.line <= topLine && vr.end.line >= topLine,
	);
	if (!stillVisible) {
		editor.revealRange(
			new vscode.Range(topLine, 0, topLine, 0),
			vscode.TextEditorRevealType.AtTop,
		);
	}
}

// ---------------------------------------------------------------------------
// 去抖
// ---------------------------------------------------------------------------

function refreshDecorForActiveEditor(): void {
	scheduleDecorUpdate(vscode.window.activeTextEditor);
}

function scheduleDecorUpdate(editor: vscode.TextEditor | undefined): void {
	if (decorDebounceTimer) { clearTimeout(decorDebounceTimer); }
	decorDebounceTimer = setTimeout(() => {
		decorDebounceTimer = undefined;
		updateDecorationsForEditor(editor);
	}, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// 状态栏
// ---------------------------------------------------------------------------

function updateStatusBar(
	item: vscode.StatusBarItem,
	editor: vscode.TextEditor | undefined,
	foldProvider: CSMLogFoldingRangeProvider,
): void {
	if (!editor || editor.document.languageId !== 'csmlog') { item.hide(); return; }
	if (!foldProvider.enabledDocs.has(editor.document.uri.toString())) { item.hide(); return; }

	const stats = computeFoldStats(editor);
	if (stats.regionCount === 0) { item.hide(); return; }
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
// 装饰器
// ---------------------------------------------------------------------------

function updateDecorationsForEditor(editor: vscode.TextEditor | undefined): void {
	if (!editor || editor.document.languageId !== 'csmlog') {
		if (editor && currentDecorTypes) { clearDecorations(editor, currentDecorTypes); }
		return;
	}
	// 装饰始终与当前折叠-region 绑定；折叠范围由 FoldingRangeProvider 控制
	if (!currentDecorTypes) { return; }

	const options = readFoldOptions();
	const rawLines: string[] = [];
	const signatures: Array<import('./logFold/types').LineSignature | null> = [];
	for (let i = 0; i < editor.document.lineCount; i++) {
		const raw = editor.document.lineAt(i).text;
		rawLines.push(raw);
		signatures.push(normalizeLine(raw));
	}
	const regions = detectRepeatRegions(rawLines, signatures, options);
	applyDecorations(editor, regions, currentDecorTypes, options);
}

function readFoldOptions(): FoldOptions {
	const config = vscode.workspace.getConfiguration('csmlog.folding');
	return {
		minRepeatCount: config.get<number>('minRepeatCount', DEFAULT_FOLD_OPTIONS.minRepeatCount),
		maxBlockLines: config.get<number>('maxBlockLines', DEFAULT_FOLD_OPTIONS.maxBlockLines),
		smartParams: config.get<boolean>('smartParams', DEFAULT_FOLD_OPTIONS.smartParams),
		decorationStyle: config.get<'compact' | 'detailed'>(
			'decorationStyle', DEFAULT_FOLD_OPTIONS.decorationStyle,
		),
	};
}

interface FoldStats { regionCount: number; foldedLines: number; percentage: string; }

function computeFoldStats(editor: vscode.TextEditor): FoldStats {
	const options = readFoldOptions();
	const rawLines: string[] = [];
	const signatures: Array<import('./logFold/types').LineSignature | null> = [];
	for (let i = 0; i < editor.document.lineCount; i++) {
		const raw = editor.document.lineAt(i).text;
		rawLines.push(raw);
		signatures.push(normalizeLine(raw));
	}
	const regions = detectRepeatRegions(rawLines, signatures, options);
	let foldedLines = 0;
	for (const r of regions) { foldedLines += r.endLine - r.startLine + 1; }
	const pct = editor.document.lineCount > 0
		? ((foldedLines / editor.document.lineCount) * 100).toFixed(1) : '0.0';
	return { regionCount: regions.length, foldedLines, percentage: pct };
}
