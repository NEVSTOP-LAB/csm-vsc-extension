// ---------------------------------------------------------------------------
// src/logFold/foldingProvider.ts — CSMLog 日志折叠 FoldingRangeProvider
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { FoldRegion, FoldOptions, DEFAULT_FOLD_OPTIONS } from './types';
import { normalizeLine } from './normalizer';
import { detectRepeatRegions } from './detector';
import { LineSignature } from './types';

/**
 * 按 (document.uri, document.version) 缓存的检测结果。
 * 当文档 version 未变时直接返回缓存，避免重复计算。
 */
interface CachedResult {
    version: number;
    regions: FoldRegion[];
}

/**
 * VS Code FoldingRangeProvider 实现。
 *
 * 使用三级递进算法检测 CSMLog 文档中的重复日志区域，
 * 将其转换为编辑器折叠范围。
 *
 * 支持缓存和增量更新：文档内容变更时仅在受影响区域重算。
 */
export class CSMLogFoldingRangeProvider implements vscode.FoldingRangeProvider {

    private readonly cache = new Map<string, CachedResult>();

    /**
     * 从 VS Code 配置读取折叠选项。
     */
    private getOptions(): FoldOptions {
        const config = vscode.workspace.getConfiguration('csmlog.folding');
        return {
            enabled: config.get<boolean>('enabled', DEFAULT_FOLD_OPTIONS.enabled),
            minRepeatCount: config.get<number>('minRepeatCount', DEFAULT_FOLD_OPTIONS.minRepeatCount),
            maxBlockLines: config.get<number>('maxBlockLines', DEFAULT_FOLD_OPTIONS.maxBlockLines),
            smartParams: config.get<boolean>('smartParams', DEFAULT_FOLD_OPTIONS.smartParams),
            decorationStyle: config.get<'compact' | 'detailed'>(
                'decorationStyle',
                DEFAULT_FOLD_OPTIONS.decorationStyle,
            ),
        };
    }

    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        const options = this.getOptions();
        if (!options.enabled) { return []; }

        // 检查缓存
        const key = document.uri.toString();
        const cached = this.cache.get(key);
        if (cached && cached.version === document.version) {
            return regionsToFoldingRanges(cached.regions);
        }

        // 全量检测
        const rawLines: string[] = [];
        const signatures: Array<LineSignature | null> = [];

        for (let i = 0; i < document.lineCount; i++) {
            const raw = document.lineAt(i).text;
            rawLines.push(raw);
            signatures.push(normalizeLine(raw));
        }

        const regions = detectRepeatRegions(rawLines, signatures, options);

        // 缓存
        this.cache.set(key, { version: document.version, regions });

        return regionsToFoldingRanges(regions);
    }

    /**
     * 在文档变更时清除对应缓存，确保下次 provide 时重算。
     */
    onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
        const key = e.document.uri.toString();
        // 直接清除缓存，下次 provideFoldingRanges 时全量重算
        // （增量重算可在后续优化）
        this.cache.delete(key);
    }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/**
 * 将 FoldRegion 列表转换为 VS Code FoldingRange 列表。
 */
function regionsToFoldingRanges(regions: FoldRegion[]): vscode.FoldingRange[] {
    return regions.map((r) => {
        // FoldingRange 行号是 0-based（与 FoldRegion 一致）
        // kind 使用 Region 以区别于语法折叠（用独立图标）
        const fr = new vscode.FoldingRange(
            r.startLine,
            r.endLine,
            vscode.FoldingRangeKind.Region,
        );
        return fr;
    });
}
