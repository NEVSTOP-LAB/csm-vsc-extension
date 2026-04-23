import * as vscode from 'vscode';

/** Matches a configuration line: `- Key | Value` */
const CONFIG_REGEX = /^-\s+([^|]+?)\s+\|\s+.+$/;

const CSMLOG_DATETIME_PATTERN = String.raw`\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}`;
const CSMLOG_OPTIONAL_RELATIVE_TIMESTAMP_PATTERN = String.raw`(?:\s+\[[\d:.]+\])?`;
const CSMLOG_LIFECYCLE_EVENT_PATTERN = String.raw`\[(Module Created|Module Destroyed)\]`;
const CSMLOG_OPTIONAL_MODULE_NAME_PATTERN = String.raw`(?:\s+([^|]+?)(?:\s+\||$))?`;

/** Matches a Module Created/Destroyed log line and captures the event type and module name. */
const MODULE_LIFECYCLE_REGEX = new RegExp(
    `^${CSMLOG_DATETIME_PATTERN}${CSMLOG_OPTIONAL_RELATIVE_TIMESTAMP_PATTERN}\\s+${CSMLOG_LIFECYCLE_EVENT_PATTERN}${CSMLOG_OPTIONAL_MODULE_NAME_PATTERN}`
);

/** Matches a Logger system message: timestamp followed by `<label>`. */
const LOGGER_MESSAGE_REGEX = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+<([^>]+)>/;

/**
 * Provides document symbols (outline) for CSMLog files.
 *
 * The outline contains:
 *  - Configuration parameters   (`- Key | Value`)              → SymbolKind.Property
 *  - Module Created events      (`[Module Created]`)            → SymbolKind.Constructor
 *  - Module Destroyed events    (`[Module Destroyed]`)          → SymbolKind.Event
 *  - Logger system messages     (`<Label>`)                     → SymbolKind.Key
 *
 * Each symbol's full range extends from its own line to the line immediately
 * before the next symbol (or the end of the document), so that the outline
 * entries are collapsible in the Explorer panel.
 */
export class CSMLogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

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
            const text = document.lineAt(i).text;

            // Configuration line: - Key | Value
            const configMatch = text.match(CONFIG_REGEX);
            if (configMatch) {
                entries.push({ lineIndex: i, name: configMatch[1].trim(), kind: vscode.SymbolKind.Property });
                continue;
            }

            // Module Created / Module Destroyed
            const moduleMatch = text.match(MODULE_LIFECYCLE_REGEX);
            if (moduleMatch) {
                const kind = moduleMatch[1] === 'Module Created'
                    ? vscode.SymbolKind.Constructor
                    : vscode.SymbolKind.Event;
                const moduleName = moduleMatch[2]?.trim() || '<unknown-module>';
                entries.push({ lineIndex: i, name: `${moduleMatch[1]}: ${moduleName}`, kind });
                continue;
            }

            // Logger system message: timestamp <Label> ...
            const loggerMatch = text.match(LOGGER_MESSAGE_REGEX);
            if (loggerMatch) {
                entries.push({ lineIndex: i, name: `<${loggerMatch[1]}>`, kind: vscode.SymbolKind.Key });
                continue;
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
            return new vscode.DocumentSymbol(entry.name, '', entry.kind, fullRange, selectionRange);
        });
    }
}
