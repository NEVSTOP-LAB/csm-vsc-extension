// ---------------------------------------------------------------------------
// moduleManager/moduleTreeTypes.ts — 树视图相关的共享类型
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';
import { getVisibilityLabel, getVisibilityTag, t } from './messages';
import { getVisibleModuleTopics } from './topics';

export type ViewState = 'loading' | 'ready' | 'empty' | 'error';

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * 树视图中表示一个 CSM 模块的 TreeItem。
 */
export class ModuleTreeItem extends vscode.TreeItem {
    constructor(public readonly moduleEntry: CsmModuleEntry) {
        super(moduleEntry.name, vscode.TreeItemCollapsibleState.Expanded);
        const topics = getVisibleModuleTopics(moduleEntry.topics);
        const visibilityLabel = getVisibilityLabel(moduleEntry.visibility);
        const shortName = truncate(moduleEntry.name, 36);
        const visibilityTag = getVisibilityTag(moduleEntry.visibility);
        this.label = {
            label: `${shortName}  [GH] ${visibilityTag}`,
            highlights: [[0, shortName.length]],
        };
        this.description = `@${moduleEntry.owner}`;
        this.iconPath = new vscode.ThemeIcon(moduleEntry.visibility === 'private' ? 'lock' : 'repo');
        this.tooltip = new vscode.MarkdownString([
            `**${moduleEntry.name}**`,
            `${t('ownerLabel')}: ${moduleEntry.owner}`,
            moduleEntry.description || t('noDescription'),
            topics.length > 0 ? `${t('topicsLabel')}: ${topics.join(', ')}` : `${t('topicsLabel')}: ${t('topicsNone')}`,
            `${t('visibilityLabel')}: ${visibilityLabel}`,
            `${t('defaultBranchLabel')}: ${moduleEntry.defaultBranch}`,
            `${t('repositoryLabel')}: ${moduleEntry.repoUrl}`,
        ].join('  \n'));
        this.contextValue = 'csmModuleEntry';
    }
}
