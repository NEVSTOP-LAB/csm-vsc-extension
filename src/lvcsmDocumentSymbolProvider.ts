import * as vscode from 'vscode';
import { INI_SECTION_REGEX } from './common/constants';
import { SymbolEntry, buildDocumentSymbols } from './common/symbols';

/**
 * Provides document symbols (outline) for LVCSM files.
 *
 * The outline contains one entry per INI section header (`[SectionName]`),
 * shown as SymbolKind.Module.
 */
export class LvcsmDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.DocumentSymbol[] {

        const entries: SymbolEntry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(INI_SECTION_REGEX);
            if (match) {
                entries.push({ lineIndex: i, name: match[1].trim(), kind: vscode.SymbolKind.Module });
            }
        }

        return buildDocumentSymbols(document, entries);
    }
}
