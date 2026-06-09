import * as vscode from 'vscode';
import { localizeBundle } from './i18n';
import {
    CONFIG_KEY_REGEX,
    MODULE_LIFECYCLE_REGEX,
    LOGGER_MESSAGE_REGEX,
} from './common/constants';
import { SymbolEntry, buildDocumentSymbols } from './common/symbols';
import { detectAllRepeatedGroups, truncateSignature } from './common/csmlogDedup';

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
 *  - Repeated log groups        (consecutive duplicate lines)   → SymbolKind.EnumMember
 *
 * Each symbol's full range extends from its own line to the line immediately
 * before the next symbol (or the end of the document), so that the outline
 * entries are collapsible in the Explorer panel.
 *
 * Repeated log group detection is controlled by `csmModules.dedup.*` settings.
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

        // —— 重复日志组检测 ——
        // 从配置中读取去重参数，若启用则在日志行中检测连续重复组，
        // 并在大纲中为每个组创建一条枚举成员符号（×N 格式），方便快速导航。
        const dedupConfig = vscode.workspace.getConfiguration('csmModules.dedup');
        const dedupEnabled = dedupConfig.get<boolean>('enabled', true);
        if (dedupEnabled) {
            const minRepeat = dedupConfig.get<number>('minRepeatCount', 3);
            const multiLineEnabled = dedupConfig.get<boolean>('multiLineEnabled', true);

            const repeatedGroups = multiLineEnabled
                ? detectAllRepeatedGroups(document, minRepeat)
                : detectAllRepeatedGroups(document, minRepeat, 999);

            for (const group of repeatedGroups) {
                const displaySig = truncateSignature(group.signature);
                entries.push({
                    lineIndex: group.startLine,
                    name: `×${group.count} [${group.blockSize}-line] ${displaySig}`,
                    kind: vscode.SymbolKind.EnumMember,
                });
            }
        }

        // 按行号排序后统一构建 DocumentSymbol（确保现有条目和去重组条目交错时范围计算正确）
        entries.sort((a, b) => a.lineIndex - b.lineIndex);
        return buildDocumentSymbols(document, entries);
    }
}
