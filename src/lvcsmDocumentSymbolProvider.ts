import * as vscode from 'vscode';
import { buildFlatSymbols, FlatSymbolEntry } from './symbols/flatSymbols';

/** INI section header: `[SectionName]` (optional leading whitespace). */
const INI_SECTION_REGEX = /^\s*\[([^\]]+)\]/;

/**
 * Provides a flat outline for `.lvcsm` (INI-style) files.
 *
 * Each `[SectionName]` becomes a `Module` symbol whose range extends to the
 * line just before the next section, so the outline supports collapsing.
 */
export class LvcsmDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.DocumentSymbol[] {
        const entries: FlatSymbolEntry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const match = document.lineAt(i).text.match(INI_SECTION_REGEX);
            if (match) {
                entries.push({
                    lineIndex: i,
                    name: match[1].trim(),
                    kind: vscode.SymbolKind.Module,
                });
            }
        }

        return buildFlatSymbols(document, entries);
    }
}
