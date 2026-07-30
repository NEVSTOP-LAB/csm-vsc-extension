// ---------------------------------------------------------------------------
// src/language/logFold/foldingProvider.ts — CSMLog 日志折叠 FoldingRangeProvider
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { FoldRegion, FoldOptions, DEFAULT_FOLD_OPTIONS } from './types';
import { normalizeLine } from './normalizer';
import { detectRepeatRegions } from './detector';
import { LineSignature } from './types';

/**
 * 按 (document.uri, document.version) 缓存的检测结果。
 */
interface CachedResult {
    version: number;
    regions: FoldRegion[];
}

/**
 * VS Code FoldingRangeProvider 实现。
 *
 * 通过外部注入的 enabledDocs Set 控制哪些文档启用折叠；
 * 未在集合中的文档返回空折叠区（默认不折叠）。
 */
export class CSMLogFoldingRangeProvider implements vscode.FoldingRangeProvider {

    private readonly cache = new Map<string, CachedResult>();

    /**
     * 当前已启用折叠的文档 URI 集合（由 extension.ts 管理）。
     * FoldingRangeProvider 每次 provide 时检查此集合。
     */
    public enabledDocs: Set<string> = new Set();

    private getOptions(): FoldOptions {
        const config = vscode.workspace.getConfiguration('csmlog.folding');
        return {
            minRepeatCount: config.get<number>('minRepeatCount', DEFAULT_FOLD_OPTIONS.minRepeatCount),
            maxBlockLines: config.get<number>('maxBlockLines', DEFAULT_FOLD_OPTIONS.maxBlockLines),
            smartParams: config.get<boolean>('smartParams', DEFAULT_FOLD_OPTIONS.smartParams),
            decorationStyle: config.get<'compact' | 'detailed'>(
                'decorationStyle', DEFAULT_FOLD_OPTIONS.decorationStyle,
            ),
        };
    }

    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        // 始终返回检测到的折叠范围（保证行号旁折叠按钮始终可见）。
        // enabledDocs 仅控制装饰和自动折叠行为，不影响 FoldingRangeProvider 输出。
        const options = this.getOptions();

        // 缓存
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
        this.cache.set(key, { version: document.version, regions });
        return regionsToFoldingRanges(regions);
    }

    /** 文档变更时清除对应缓存 */
    onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
        this.cache.delete(e.document.uri.toString());
    }

    /** 显式清除某个文档的缓存 */
    clearCache(uri: string): void {
        this.cache.delete(uri);
    }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function regionsToFoldingRanges(regions: FoldRegion[]): vscode.FoldingRange[] {
    return regions.map((r) => new vscode.FoldingRange(
        r.startLine, r.endLine, vscode.FoldingRangeKind.Region,
    ));
}
