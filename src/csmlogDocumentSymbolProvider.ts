import * as vscode from 'vscode';
import { buildFlatSymbols, FlatSymbolEntry } from './symbols/flatSymbols';

// Configuration line: `- Key | Value`
const CONFIG_REGEX = /^-\s+([^|]+?)\s+\|\s+.+$/;

// Module Created / Module Destroyed log line.
//   - Date timestamp is required.
//   - Relative timestamp is optional.
//   - Module name is optional (Module Destroyed lines may omit `| ...`).
const CSMLOG_DATETIME = String.raw`\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}`;
const CSMLOG_OPTIONAL_RELATIVE_TS = String.raw`(?:\s+\[[\d:.]+\])?`;
const CSMLOG_LIFECYCLE_EVENT = String.raw`\[(Module Created|Module Destroyed)\]`;
const CSMLOG_OPTIONAL_MODULE_NAME = String.raw`(?:\s+([^|]+?)(?:\s+\||$))?`;
const MODULE_LIFECYCLE_REGEX = new RegExp(
    `^${CSMLOG_DATETIME}${CSMLOG_OPTIONAL_RELATIVE_TS}\\s+${CSMLOG_LIFECYCLE_EVENT}${CSMLOG_OPTIONAL_MODULE_NAME}`,
);

// Logger system message: `<date timestamp> <Label> ...`
const LOGGER_MESSAGE_REGEX = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+<([^>]+)>/;

/**
 * Provides a flat outline for `.csmlog` files.
 *
 * Recognised entries (matched in this priority order, first match wins):
 *  - `- Key | Value`              configuration parameters → `Property`
 *  - `[Module Created]`           module life-cycle start  → `Constructor`
 *  - `[Module Destroyed]`         module life-cycle end    → `Event`
 *  - `<Label>` after a timestamp  Logger system messages   → `Key`
 *
 * Other lines (state changes, messages, errors, etc.) are intentionally
 * skipped so that the outline stays useful as a navigational map rather
 * than a copy of every log entry.
 */
export class CSMLogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.DocumentSymbol[] {
        const entries: FlatSymbolEntry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;

            const configMatch = text.match(CONFIG_REGEX);
            if (configMatch) {
                entries.push({
                    lineIndex: i,
                    name: configMatch[1].trim(),
                    kind: vscode.SymbolKind.Property,
                });
                continue;
            }

            const moduleMatch = text.match(MODULE_LIFECYCLE_REGEX);
            if (moduleMatch) {
                const eventName = moduleMatch[1];
                const moduleName = moduleMatch[2]?.trim() || '<unknown-module>';
                entries.push({
                    lineIndex: i,
                    name: `${eventName}: ${moduleName}`,
                    kind: eventName === 'Module Created'
                        ? vscode.SymbolKind.Constructor
                        : vscode.SymbolKind.Event,
                });
                continue;
            }

            const loggerMatch = text.match(LOGGER_MESSAGE_REGEX);
            if (loggerMatch) {
                entries.push({
                    lineIndex: i,
                    name: `<${loggerMatch[1]}>`,
                    kind: vscode.SymbolKind.Key,
                });
                continue;
            }
        }

        return buildFlatSymbols(document, entries);
    }
}
