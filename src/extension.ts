import * as vscode from 'vscode';
import { CSMLogHoverProvider } from './csmlogHoverProvider';
import { CSMLogDocumentSymbolProvider } from './csmlogDocumentSymbolProvider';
import { LvcsmDocumentSymbolProvider } from './lvcsmDocumentSymbolProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ language: 'csmlog' }, new CSMLogHoverProvider()),
		vscode.languages.registerDocumentSymbolProvider({ language: 'csmlog' }, new CSMLogDocumentSymbolProvider()),
		vscode.languages.registerDocumentSymbolProvider({ language: 'lvcsm' }, new LvcsmDocumentSymbolProvider()),
	);
}

export function deactivate() {}
