import * as vscode from 'vscode';
import { CSMLogHoverProvider } from './language/csmlogHoverProvider';
import { CSMLogDocumentSymbolProvider } from './language/csmlogDocumentSymbolProvider';
import { LvcsmDocumentSymbolProvider } from './language/lvcsmDocumentSymbolProvider';
import { clearAnchorCache } from './language/hoverData';
import { ModuleManagerController } from './modules';
import { CsmFileDecorationProvider } from './language/fileDecorationProvider';
import {
	CSMLogFoldingRangeProvider,
	createDecorationTypes,
	disposeDecorationTypes,
	applyDecorations,
	clearDecorations,
	detectRepeatRegions,
	normalizeLine,
	DecorationTypes,
} from './language/logFold';
import { DEFAULT_FOLD_OPTIONS, FoldOptions } from './language/logFold/types';
import { t } from './language/logFold/messages';

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;
let decorDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let currentDecorTypes: DecorationTypes | undefined;

/** 暂存折叠前的视窗首行 */
let savedTopLine: number | undefined;

/** 模块级 foldProvider 引用（供 updateDecorationsForEditor 检查激活状态） */
let foldProvider: CSMLogFoldingRangeProvider;

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
	foldProvider = new CSMLogFoldingRangeProvider();
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
	statusBarItem.tooltip = t('statusBarTooltip');
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

	// ---- 激活当前文件的折叠功能（显示装饰 + 自动全部折叠） ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.activate', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }

			const uri = editor.document.uri.toString();
			foldProvider.enabledDocs.add(uri);

			await vscode.commands.executeCommand('setContext', 'csmlog.folding.activated', true);

			// 等折叠范围已被 VS Code 加载后自动全部折叠
			await new Promise((resolve) => setTimeout(resolve, 150));
			savedTopLine = editor.visibleRanges[0]?.start.line;
			await vscode.commands.executeCommand('editor.foldAllMarkerRegions');
			restoreViewport(editor);

			scheduleDecorUpdate(editor);
			updateStatusBar(statusBarItem, editor, foldProvider);
		}),
	);

	// ---- 停用当前文件的折叠功能（隐藏装饰 + 全部展开） ----
	context.subscriptions.push(
		vscode.commands.registerCommand('csmlog.folding.deactivate', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'csmlog') { return; }

			const uri = editor.document.uri.toString();
			foldProvider.enabledDocs.delete(uri);

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
			const uri = editor.document.uri.toString();
			if (!foldProvider.enabledDocs.has(uri)) { return; }

			savedTopLine = editor.visibleRanges[0]?.start.line;

			// 判断当前是否处于已折叠状态：
			// 如果存在至少一个 region 是折叠的 → 当前是折叠态 → 展开全部
			// 否则 → 折叠全部
			const regions = detectFoldRegions(editor);
			const anyFolded = regions.some((r) => {
				if (r.endLine <= r.startLine) { return true; }
				const checkLine = r.startLine + 1;
				return !editor.visibleRanges.some(
					(vr) => vr.start.line <= checkLine && vr.end.line >= checkLine,
				);
			});

			if (anyFolded) {
				await vscode.commands.executeCommand('editor.unfoldAll');
			} else {
				await vscode.commands.executeCommand('editor.foldAllMarkerRegions');
			}

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
				vscode.window.showInformationMessage(t('statsNotCsmlog'));
				return;
			}
			if (!foldProvider.enabledDocs.has(editor.document.uri.toString())) {
				vscode.window.showInformationMessage(t('statsEnableFirst'));
				return;
			}
			const stats = computeFoldStats(editor);
			vscode.window.showInformationMessage(t('statsResult', {
				regionCount: stats.regionCount,
				foldedLines: stats.foldedLines,
				percentage: stats.percentage,
			}));
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
// 折叠区域检测（轻量，用于 toggleAllFolds 判断当前折叠方向）
// ---------------------------------------------------------------------------

function detectFoldRegions(editor: vscode.TextEditor): Array<{ startLine: number; endLine: number }> {
	const rawLines: string[] = [];
	const signatures: Array<import('./language/logFold/types').LineSignature | null> = [];
	for (let i = 0; i < editor.document.lineCount; i++) {
		const raw = editor.document.lineAt(i).text;
		rawLines.push(raw);
		signatures.push(normalizeLine(raw));
	}
	return detectRepeatRegions(rawLines, signatures, readFoldOptions());
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
	item.text = t('statusBarText', { regionCount: stats.regionCount, lineCount: editor.document.lineCount });
	item.tooltip = t('statusBarTooltipDetailed', {
		regionCount: stats.regionCount,
		foldedLines: stats.foldedLines,
		percentage: stats.percentage,
	});
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
	if (!currentDecorTypes) { return; }

	// 仅当该文件已激活折叠时才显示装饰（▼三角、概要标签、底色等）
	// FoldingRangeProvider 始终提供折叠范围，行号旁折叠按钮始终可见
	const uri = editor.document.uri.toString();
	const activated = foldProvider.enabledDocs.has(uri);
	if (!activated) {
		clearDecorations(editor, currentDecorTypes);
		return;
	}

	const options = readFoldOptions();
	const rawLines: string[] = [];
	const signatures: Array<import('./language/logFold/types').LineSignature | null> = [];
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
	const signatures: Array<import('./language/logFold/types').LineSignature | null> = [];
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
