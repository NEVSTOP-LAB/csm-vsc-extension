import * as vscode from 'vscode';

/** Matches an INI section header: `[SectionName]` */
const INI_SECTION_REGEX = /^\[([^\]]+)\]/;

/**
 * Provides document symbols (outline) for LVCSM files.
 *
 * The outline contains one entry per INI section header (`[SectionName]`),
 * shown as SymbolKind.Module. Each symbol's full range extends from its own
 * line to the line immediately before the next section header (or the end of
 * the document), so that the outline entries are collapsible in the Explorer
 * panel.
 */
export class LvcsmDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.DocumentSymbol[] {

        interface Entry {
            lineIndex: number;
            name: string;
        }

        const entries: Entry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(INI_SECTION_REGEX);
            if (match) {
                entries.push({ lineIndex: i, name: match[1] });
            }
        }

        const lastLine = document.lineCount - 1;
        return entries.map((entry, idx): vscode.DocumentSymbol => {
            const startLine = entry.lineIndex;
            const endLine = idx + 1 < entries.length
                ? entries[idx + 1].lineIndex - 1
                : lastLine;
            const endLineText = document.lineAt(endLine).text;
            const fullRange = new vscode.Range(startLine, 0, endLine, endLineText.length);
            const selectionRange = document.lineAt(startLine).range;
            return new vscode.DocumentSymbol(entry.name, '', vscode.SymbolKind.Module, fullRange, selectionRange);
        });
    }
}
