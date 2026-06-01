import * as vscode from 'vscode';
import { localizeBundle } from './i18n';
import {
    CONFIG_KEY_REGEX,
    MODULE_LIFECYCLE_REGEX,
    LOGGER_MESSAGE_REGEX,
} from './common/constants';

const symbolMessages = {
    moduleCreated: {
        en: 'Module Created',
        zh: '模块创建',
    },
    moduleDestroyed: {
        en: 'Module Destroyed',
        zh: '模块销毁',
    },
    unknownModule: {
        en: '<unknown-module>',
        zh: '<未知模块>',
    },
} as const;

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
                    ? localizeBundle(symbolMessages, 'moduleCreated')
                    : localizeBundle(symbolMessages, 'moduleDestroyed');
                const moduleName = moduleMatch[2]?.trim() || localizeBundle(symbolMessages, 'unknownModule');
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
