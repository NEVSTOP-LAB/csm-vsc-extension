import * as vscode from 'vscode';

/** Matches a section header like [COMMAND_ALIAS], [AUTO_ERROR_HANDLE], etc. */
const SECTION_REGEX = /^\[([^\]]+)\]$/;

/**
 * Matches a plain anchor definition, e.g. `<entry>`, `<error_handler>`.
 * An optional trailing line comment is allowed.
 */
const ANCHOR_REGEX = /^<([A-Za-z][A-Za-z0-9_-]*)>(?:\s*\/\/.*)?$/;

/** Control-flow keywords that look like anchors but are NOT jump targets. */
const RESERVED_CF = new Set([
    'if', 'else', 'end_if',
    'while', 'end_while',
    'do_while', 'end_do_while',
    'foreach', 'end_foreach',
    'include',
]);

/**
 * Provides document symbols (outline) for CSMScript files.
 *
 * The outline contains:
 *  - Pre-definition section headers   ([COMMAND_ALIAS] etc.)  → SymbolKind.Array
 *  - Anchor definitions               (<entry>, <cleanup> …)  → SymbolKind.Function
 *
 * Each symbol's full range extends from its own line to the line immediately
 * before the next symbol (or the end of the document), so that the outline
 * entries are collapsible in the Explorer panel.
 */
export class CSMScriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.DocumentSymbol[] {

        interface Entry {
            lineIndex: number;
            name: string;
            kind: vscode.SymbolKind;
        }

        const entries: Entry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const trimmed = document.lineAt(i).text.trim();

            // Skip blank lines and pure comment lines.
            if (!trimmed || trimmed.startsWith('//')) {
                continue;
            }

            // Strip inline comment and re-trim to get the pure code portion.
            const codeOnly = trimmed.replace(/\/\/.*$/, '').trim();

            // Pre-definition section header: [COMMAND_ALIAS] etc.
            const sectionMatch = codeOnly.match(SECTION_REGEX);
            if (sectionMatch) {
                entries.push({ lineIndex: i, name: sectionMatch[1].trim(), kind: vscode.SymbolKind.Array });
                continue;
            }

            // Anchor definition: <entry>, <error_handler>, <cleanup> …
            const anchorMatch = trimmed.match(ANCHOR_REGEX);
            if (anchorMatch) {
                const anchorName = anchorMatch[1];
                if (!RESERVED_CF.has(anchorName.toLowerCase())) {
                    entries.push({ lineIndex: i, name: `<${anchorName}>`, kind: vscode.SymbolKind.Function });
                }
            }
        }

        const lastLine = document.lineCount - 1;
        return entries.map((entry, idx): vscode.DocumentSymbol => {
            const startLine = entry.lineIndex;
            // Extend to the line before the next symbol, or the end of the document.
            const endLine = idx + 1 < entries.length
                ? entries[idx + 1].lineIndex - 1
                : lastLine;
            const endLineText = document.lineAt(endLine).text;
            const fullRange = new vscode.Range(startLine, 0, endLine, endLineText.length);
            const selectionRange = document.lineAt(startLine).range;
            return new vscode.DocumentSymbol(entry.name, '', entry.kind, fullRange, selectionRange);
        });
    }
}
