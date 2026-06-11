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

/** 暂存折叠前的视窗首行，用于折叠后恢复滚动位置 */
let savedTopLine: number | undefined;

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
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

	// 主题变更时重建装饰类型
	context.subscriptions.push(
		vscode.window.onDidChangeActiveColorTheme((theme) => {
			if (currentDecorTypes) {
				if (vscode.window.activeTextEditor?.document.languageId === 'csmlog') {
					clearDecorations(vscode.window.activeTextEditor, currentDecorTypes);
				}
				disposeDecorationTypes(currentDecorTypes);
			}
			currentDecorTypes = createDecorationTypes(theme.kind);
			scheduleDecorUpdate(vscode.window.activeTextEditor);
		}),
	);

	// 文档变更时清除缓存 + 去抖更新装饰
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			foldProvider.onDocumentChanged(e);
			scheduleDecorUpdate(vscode.window.activeTextEditor);
		}),
	);

	// 关闭文档时清除折叠缓存
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			foldProvider.clearCache(document.uri.toString());
		}),
	);

	// 切换编辑器时更新状态栏和装饰
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			updateStatusBar(statusBarItem, editor);
			scheduleDecorUpdate(editor);
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
	updateStatusBar(statusBarItem, vscode.window.activeTextEditor);
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

	// 启用折叠
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.enable', async () => {
			const config = vscode.workspace.getConfiguration('csmlog.folding');
			await config.update('enabled', true, vscode.ConfigurationTarget.Global);
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				foldProvider.clearCache(editor.document.uri.toString());
				updateStatusBar(statusBarItem, editor);
				scheduleDecorUpdate(editor);
			}
		}),
	);

	// 禁用折叠
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.disable', async () => {
			const config = vscode.workspace.getConfiguration('csmlog.folding');
			await config.update('enabled', false, vscode.ConfigurationTarget.Global);
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				await vscode.commands.executeCommand('editor.unfoldAll');
				foldProvider.clearCache(editor.document.uri.toString());
				updateStatusBar(statusBarItem, editor);
				scheduleDecorUpdate(editor);
			}
		}),
	);

	// 折叠全部重复区（保持视窗位置）
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.foldAll', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }
			// 保存当前视窗顶部行号
			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.foldAllMarkerRegions');
			// 恢复视窗位置
			restoreViewport(editor);
			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor);
		}),
	);

	// 展开全部重复区（保持视窗位置）
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.unfoldAll', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }
			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.unfoldAll');
			restoreViewport(editor);
			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor);
		}),
	);

	// 切换全部
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.toggleAllFolds', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }
			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.toggleFold');
			restoreViewport(editor);
			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor);
		}),
	);

	// 折叠当前区
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.foldCurrentRegion', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }
			await vscode.commands.executeCommand('editor.fold', { levels: 1, direction: 'up' });
			scheduleDecorUpdate(editor);
		}),
	);

	// 统计
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
}

// ---------------------------------------------------------------------------
// 视窗位置恢复
// ---------------------------------------------------------------------------

async function restoreViewport(editor: vscode.TextEditor): Promise<void> {
	if (savedTopLine === undefined) { return; }
	const topLine = savedTopLine;
	savedTopLine = undefined;
	// 等 VS Code 完成折叠渲染后再恢复
	await new Promise((resolve) => setTimeout(resolve, 50));
	// 如果目标行仍在可见范围内则不跳转
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

function updateStatusBar(item: vscode.StatusBarItem, editor: vscode.TextEditor | undefined): void {
	if (!editor || editor.document.languageId !== 'csmlog') { item.hide(); return; }
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
	const options = readFoldOptions();
	if (!options.enabled) {
		if (currentDecorTypes) { clearDecorations(editor, currentDecorTypes); }
		return;
	}
	if (!currentDecorTypes) { return; }

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
		enabled: config.get<boolean>('enabled', DEFAULT_FOLD_OPTIONS.enabled),
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
	for (const r of regions) { foldedLines += r.endLine - r.startLine + 1; }
	const pct = editor.document.lineCount > 0
		? ((foldedLines / editor.document.lineCount) * 100).toFixed(1) : '0.0';
	return { regionCount: regions.length, foldedLines, percentage: pct };
}
