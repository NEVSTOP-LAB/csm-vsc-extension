// ---------------------------------------------------------------------------
// common/symbols.ts — 通用的 DocumentSymbol 构建工具
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';

/**
 * 表示从文档中识别出的一个符号条目（尚未计算范围）。
 */
export interface SymbolEntry {
    /** 条目所在行（0-based）。 */
    lineIndex: number;
    /** 显示的符号名称。 */
    name: string;
    /** 符号类型。 */
    kind: vscode.SymbolKind;
}

/**
 * 将符号条目列表转换为 `vscode.DocumentSymbol[]`。
 *
 * 每个符号的 `fullRange` 从自身行扩展到下一个符号的前一行（或文档末尾），
 * `selectionRange` 仅限于当前行。这样在 Explorer 面板中可以折叠展开。
 *
 * @param document - 当前文本文档
 * @param entries - 按行号升序排列的符号条目
 */
export function buildDocumentSymbols(
    document: vscode.TextDocument,
    entries: SymbolEntry[],
): vscode.DocumentSymbol[] {
    const lastLine = document.lineCount - 1;

    return entries.map((entry, idx): vscode.DocumentSymbol => {
        const startLine = entry.lineIndex;
        const endLine = idx + 1 < entries.length
            ? entries[idx + 1].lineIndex - 1
            : lastLine;

        const endLineText = document.lineAt(endLine).text;
        const fullRange = new vscode.Range(
            startLine, 0,
            endLine, endLineText.length,
        );
        const selectionRange = document.lineAt(startLine).range;

        return new vscode.DocumentSymbol(
            entry.name,
            '',
            entry.kind,
            fullRange,
            selectionRange,
        );
    });
}
