import * as vscode from 'vscode';
import { GitHubModuleService } from './githubModuleService';
import { Logger } from './logger';
import { t } from './messages';
import { ReadmeAssetCache } from './readmeAssetCache';
import { CsmModuleEntry } from './types';

export interface ReadmePreviewServiceDeps {
    readmeCache: Record<string, string>;
    readmeAssetCache: ReadmeAssetCache;
    githubService: Pick<GitHubModuleService, 'fetchReadme'>;
    logger: Logger;
    ensureToken: (interactive: boolean) => Promise<string | undefined>;
}

export function getUnavailableReadmeMarkdown(): string {
    return `${t('readmeUnavailableTitle')}\n\n${t('readmeUnavailableBody')}`;
}

export async function loadReadmeMarkdown(
    entry: CsmModuleEntry,
    options: { warnOnMissingSession: boolean },
    deps: ReadmePreviewServiceDeps,
): Promise<string | undefined> {
    const key = getReadmeCacheKey(entry);
    let readme = Object.prototype.hasOwnProperty.call(deps.readmeCache, key)
        ? deps.readmeCache[key]
        : undefined;
    if (typeof readme !== 'string') {
        const cachedMarkdown = await deps.readmeAssetCache.readMarkdown(entry);
        if (typeof cachedMarkdown === 'string') {
            readme = cachedMarkdown;
            deps.readmeCache[key] = cachedMarkdown;
        }
    }
    if (typeof readme === 'string') {
        return readme;
    }

    const token = await deps.ensureToken(false);
    if (!token && entry.visibility === 'private') {
        if (options.warnOnMissingSession) {
            void vscode.window.showWarningMessage(t('noCachedReadmeAndNoSession'));
            return undefined;
        }
        return '';
    }

    try {
        readme = await deps.githubService.fetchReadme(entry.owner, entry.name, token);
        deps.readmeCache[key] = readme;
        await deps.readmeAssetCache.saveMarkdown(entry, readme);
        return readme;
    } catch (error) {
        deps.logger.warn(`Failed to fetch README for ${entry.owner}/${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
        deps.readmeCache[key] = '';
        return '';
    }
}

export async function buildReadmePreviewHtml(
    entry: CsmModuleEntry,
    webview: vscode.Webview,
    deps: ReadmePreviewServiceDeps,
): Promise<string> {
    const readme = await loadReadmeMarkdown(entry, { warnOnMissingSession: false }, deps);
    const markdownContent = readme || getUnavailableReadmeMarkdown();
    return deps.readmeAssetCache.renderMarkdownFragment(entry, markdownContent, webview);
}

function getReadmeCacheKey(entry: CsmModuleEntry): string {
    return `${entry.owner}/${entry.name}`;
}