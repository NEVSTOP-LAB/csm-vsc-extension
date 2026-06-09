import * as vscode from 'vscode';
import { localizeBundle } from './i18n';
import {
    CONFIG_KEY_REGEX,
    MODULE_LIFECYCLE_REGEX,
    LOGGER_MESSAGE_REGEX,
} from './common/constants';
import { SymbolEntry, buildDocumentSymbols } from './common/symbols';
import { detectAllRepeatedGroups, truncateSignature, DISABLE_MULTI_LINE } from './common/csmlogDedup';

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
    repeatedGroup: {
        en: 'Repeated',
        zh: '重复',
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

        // 按行号排序后统一构建 DocumentSymbol
        entries.sort((a, b) => a.lineIndex - b.lineIndex);

        // 检测并添加重复日志组（由 csmModules.dedup.* 配置控制）
        try {
            const dedupConfig = vscode.workspace.getConfiguration('csmModules.dedup');
            const dedupEnabled = dedupConfig.get<boolean>('enabled', true);
            if (dedupEnabled) {
                const minRepeat = dedupConfig.get<number>('minRepeatCount', 2);
                const multiLineEnabled = dedupConfig.get<boolean>('multiLineEnabled', true);
                const repeatedGroups = multiLineEnabled
                    ? detectAllRepeatedGroups(document, minRepeat)
                    : detectAllRepeatedGroups(document, minRepeat, DISABLE_MULTI_LINE);

                // 收集已有条目覆盖的行号
                const coveredLines = new Set<number>();
                for (const entry of entries) {
                    coveredLines.add(entry.lineIndex);
                }

                const repeatedLabel = localizeBundle(symbolMessages, 'repeatedGroup');
                for (const group of repeatedGroups) {
                    // 跳过与已有条目重叠的组（配置行、生命周期等优先）
                    if (coveredLines.has(group.startLine)) { continue; }

                    const shortSig = truncateSignature(group.signature, 50);
                    const name = group.blockSize === 1
                        ? `${repeatedLabel} ×${group.count}: ${shortSig}`
                        : `${repeatedLabel} ×${group.count} (${group.blockSize}行/块): ${shortSig}`;
                    entries.push({
                        lineIndex: group.startLine,
                        name,
                        kind: vscode.SymbolKind.EnumMember,
                    });
                }
            }
        } catch {
            // 去重检测失败不影响基本大纲功能
        }

        // 最终排序（包含去重组）后构建
        entries.sort((a, b) => a.lineIndex - b.lineIndex);
        return buildDocumentSymbols(document, entries);
    }
}
