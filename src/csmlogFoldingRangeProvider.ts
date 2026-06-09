// ---------------------------------------------------------------------------
// csmlogFoldingRangeProvider.ts — CSM 日志重复消息折叠提供程序
// ---------------------------------------------------------------------------
// 在 .csmlog 文件的编辑器行号左侧提供折叠箭头，允许用户
// 折叠/展开连续重复的日志行组。
//
// 由 extension.ts 注册到 `csmlog` 语言。
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { detectRepeatedGroups, DedupLevel } from './common/csmlogDedup';

/**
 * 读取去重配置。
 */
function getDedupConfig(): { enabled: boolean; minRepeat: number; level: DedupLevel } {
    const config = vscode.workspace.getConfiguration('csmModules.dedup');
    const enabled = config.get<boolean>('enabled', true);
    const minRepeat = config.get<number>('minRepeatCount', 3);
    const rawLevel = config.get<string>('normalizationLevel', 'exact');
    const level: DedupLevel = rawLevel === 'numeric' ? 'numeric' : 'exact';
    return { enabled, minRepeat, level };
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

        const { enabled, minRepeat, level } = getDedupConfig();
        if (!enabled) { return []; }

        const repeatedGroups = detectRepeatedGroups(document, minRepeat, level);

        return repeatedGroups.map((group): vscode.FoldingRange =>
            new vscode.FoldingRange(
                group.startLine,
                group.endLine,
                vscode.FoldingRangeKind.Region,
            ),
        );
    }
}
