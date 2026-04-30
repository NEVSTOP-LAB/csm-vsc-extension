import * as vscode from 'vscode';

/**
 * Flat (non-nested) outline entry recognised by `buildFlatSymbols`.
 *
 * Each entry corresponds to a single line in the document. The helper
 * computes the `range` so that an entry extends from its own line down to
 * the line immediately before the next entry (or to the end of the
 * document), which is what makes outline items collapsible in VS Code.
 */
export interface FlatSymbolEntry {
    /** Zero-based line index of the symbol definition. */
    lineIndex: number;
    /** Display name shown in the outline. */
    name: string;
    /** SymbolKind controlling the outline icon. */
    kind: vscode.SymbolKind;
    /** Optional secondary text (right-aligned in the outline). */
    detail?: string;
}

/**
 * Convert a list of `FlatSymbolEntry` records into `DocumentSymbol`
 * instances with collapsible ranges, in document order.
 *
 * The input is expected to already be sorted by `lineIndex` ascending; the
 * helper does not re-sort.
 */
export function buildFlatSymbols(
    document: vscode.TextDocument,
    entries: FlatSymbolEntry[],
): vscode.DocumentSymbol[] {
    if (entries.length === 0) { return []; }

    const lastLine = document.lineCount - 1;
    return entries.map((entry, idx): vscode.DocumentSymbol => {
        const startLine = entry.lineIndex;
        const endLine = idx + 1 < entries.length
            ? entries[idx + 1].lineIndex - 1
            : lastLine;
        const endLineText = document.lineAt(endLine).text;
        const fullRange = new vscode.Range(startLine, 0, endLine, endLineText.length);
        const selectionRange = document.lineAt(startLine).range;
        return new vscode.DocumentSymbol(
            entry.name,
            entry.detail ?? '',
            entry.kind,
            fullRange,
            selectionRange,
        );
    });
}
