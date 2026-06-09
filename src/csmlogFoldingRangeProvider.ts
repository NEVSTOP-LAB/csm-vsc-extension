// ---------------------------------------------------------------------------
// csmlogFoldingRangeProvider.ts — CSM 日志重复消息折叠提供程序
// ---------------------------------------------------------------------------
// 在 .csmlog 文件的编辑器行号左侧提供折叠箭头，允许用户
// 折叠/展开连续重复的日志行组。
//
// 由 extension.ts 注册到 `csmlog` 语言。
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectAllRepeatedGroups } from './common/csmlogDedup';

/**
 * 读取去重配置。
 */
function getDedupConfig(): { enabled: boolean; minRepeat: number; multiLineEnabled: boolean } {
    const config = vscode.workspace.getConfiguration('csmModules.dedup');
    const enabled = config.get<boolean>('enabled', true);
    const minRepeat = config.get<number>('minRepeatCount', 3);
    const multiLineEnabled = config.get<boolean>('multiLineEnabled', true);
    return { enabled, minRepeat, multiLineEnabled };
}

/**
 * CSM 日志文件的 FoldingRangeProvider。
 *
 * 检测连续重复的日志消息并生成可折叠区域。
 * 非日志行（配置行、空行等）会自然中断重复序列。
 */
export class CSMLogFoldingRangeProvider implements vscode.FoldingRangeProvider {

    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.FoldingRange[]> {

        const { enabled, minRepeat, multiLineEnabled } = getDedupConfig();
        if (!enabled) { return []; }

        const repeatedGroups = multiLineEnabled
            ? detectAllRepeatedGroups(document, minRepeat)
            : detectAllRepeatedGroups(document, minRepeat, 999); // 999 = effectively disable multi-line

        return repeatedGroups
            .map((group): vscode.FoldingRange | null => {
                // 多行块：折叠从第二个块开始，保留第一个块作为"模板"可见
                // 单行：从第一行开始折叠（第一行可见作为模板）
                const foldStart = group.blockSize > 1
                    ? group.startLine + group.blockSize
                    : group.startLine;

                // 只有当可折叠行数 >= 1 时才创建折叠范围
                if (foldStart > group.endLine) { return null; }

                return new vscode.FoldingRange(
                    foldStart,
                    group.endLine,
                    vscode.FoldingRangeKind.Region,
                );
            })
            .filter((r): r is vscode.FoldingRange => r !== null);
    }
}
