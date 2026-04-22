import * as vscode from 'vscode';
import { provideCSMScriptHover } from './hoverData';

export class CSMScriptHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        return provideCSMScriptHover(document, position);
    }
}
