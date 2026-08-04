import * as vscode from 'vscode';
import { getSymbolMessage } from '../i18n';
import {
    CONFIG_KEY_REGEX,
    MODULE_LIFECYCLE_REGEX,
    LOGGER_MESSAGE_REGEX,
} from '../common/constants';
import { SymbolEntry, buildDocumentSymbols } from '../common/symbols';

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

        const entries: SymbolEntry[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;

            // Configuration line: - Key | Value
            const configMatch = text.match(CONFIG_KEY_REGEX);
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
                const eventName = moduleMatch[1] === 'Module Created'
                    ? getSymbolMessage('moduleCreated')
                    : getSymbolMessage('moduleDestroyed');
                const moduleName = moduleMatch[2]?.trim() || getSymbolMessage('unknownModule');
                entries.push({ lineIndex: i, name: `${eventName}: ${moduleName}`, kind });
                continue;
            }

            // Logger system message: timestamp <Label> ...
            const loggerMatch = text.match(LOGGER_MESSAGE_REGEX);
            if (loggerMatch) {
                entries.push({ lineIndex: i, name: `<${loggerMatch[1]}>`, kind: vscode.SymbolKind.Key });
                continue;
            }
        }

        // 循环已按行号递增顺序 push，entries 天然有序，直接构建即可
        return buildDocumentSymbols(document, entries);
    }
}
