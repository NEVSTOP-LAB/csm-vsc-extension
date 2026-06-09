import * as vscode from 'vscode';
import { CSMLogHoverProvider } from './csmlogHoverProvider';
import { CSMLogDocumentSymbolProvider } from './csmlogDocumentSymbolProvider';
import { CSMLogFoldingRangeProvider } from './csmlogFoldingRangeProvider';
import { LvcsmDocumentSymbolProvider } from './lvcsmDocumentSymbolProvider';
import { setupDedupDecorator } from './csmlogDedupDecorator';
import { clearAnchorCache } from './hoverData';
import { ModuleManagerController } from './moduleManager';

export function activate(context: vscode.ExtensionContext) {
	// 语言功能（高亮、Hover、Outline）必须在模块管理器之前注册，
	// 确保即使模块管理器初始化失败，csmlog/lvcsm 的基本语言特性仍可用。
	try {
		context.subscriptions.push(
			vscode.languages.registerHoverProvider({ language: 'csmlog' }, new CSMLogHoverProvider()),
			vscode.languages.registerDocumentSymbolProvider({ language: 'csmlog' }, new CSMLogDocumentSymbolProvider()),
			vscode.languages.registerFoldingRangeProvider({ language: 'csmlog' }, new CSMLogFoldingRangeProvider()),
			vscode.languages.registerDocumentSymbolProvider({ language: 'lvcsm' }, new LvcsmDocumentSymbolProvider()),
			// Clean up anchor cache when documents are closed to prevent memory leaks
			vscode.workspace.onDidCloseTextDocument((document) => {
				clearAnchorCache(document.uri.toString());
			}),
		);
	} catch (err) {
		console.error('[CSM] Failed to register language providers:', err);
	}

	// 去重装饰器（背景高亮 + 概览标尺标记）
	// 初始化失败不影响语言功能
	try {
		setupDedupDecorator(context);
	} catch (err) {
		console.error('[CSM] Failed to setup dedup decorator:', err);
	}

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
