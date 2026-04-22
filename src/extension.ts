import * as vscode from 'vscode';
import { CSMScriptHoverProvider } from './hoverProvider';
import { CSMLogHoverProvider } from './csmlogHoverProvider';
import { CSMScriptCompletionProvider } from './completionProvider';
import { updateDiagnostics } from './diagnosticProvider';
import { CSMScriptFormattingProvider } from './formattingProvider';
import { FlowVisualizationPanel } from './flowVisualizationPanel';
import { CSMScriptDocumentSymbolProvider } from './documentSymbolProvider';
import { CSMLogDocumentSymbolProvider } from './csmlogDocumentSymbolProvider';

export function activate(context: vscode.ExtensionContext) {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('csmscript');

	vscode.workspace.textDocuments.forEach(doc => updateDiagnostics(doc, diagnosticCollection));

	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ language: 'csmscript' }, new CSMScriptHoverProvider()),
		vscode.languages.registerHoverProvider({ language: 'csmlog' }, new CSMLogHoverProvider()),
		vscode.languages.registerCompletionItemProvider({ language: 'csmscript' }, new CSMScriptCompletionProvider(), '<', '[', '>', '$', '?'),
		vscode.languages.registerDocumentFormattingEditProvider({ language: 'csmscript' }, new CSMScriptFormattingProvider()),
		vscode.languages.registerDocumentSymbolProvider({ language: 'csmscript' }, new CSMScriptDocumentSymbolProvider()),
		vscode.languages.registerDocumentSymbolProvider({ language: 'csmlog' }, new CSMLogDocumentSymbolProvider()),
		diagnosticCollection,
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.languageId === 'csmscript') {
				updateDiagnostics(e.document, diagnosticCollection);
			}
		}),
		vscode.workspace.onDidOpenTextDocument(doc => updateDiagnostics(doc, diagnosticCollection)),
		vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)),
		vscode.commands.registerCommand('csmscript.showFlowVisualization', () => {
			FlowVisualizationPanel.createOrShow(context.extensionUri);
		}),
	);
}

export function deactivate() {}
