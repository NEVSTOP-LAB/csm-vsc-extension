import * as vscode from 'vscode';
import { getFileBadgeMessage } from '../i18n';

/**
 * CSM 文件装饰提供者，为 .csmlog 和 .lvcsm 文件在资源管理器中添加 Badge 标记。
 * 该方式可与任意文件图标主题共存，不会替换用户的图标主题。
 */
export class CsmFileDecorationProvider implements vscode.FileDecorationProvider {
    onDidChangeFileDecorations?: vscode.Event<vscode.Uri[]>;

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.fsPath.endsWith('.csmlog')) {
            return {
                badge: 'C',
                color: new vscode.ThemeColor('charts.blue'),
                tooltip: getFileBadgeMessage('csmlogBadge')
            };
        }
        if (uri.fsPath.endsWith('.lvcsm')) {
            return {
                badge: 'L',
                color: new vscode.ThemeColor('charts.green'),
                tooltip: getFileBadgeMessage('lvcsmBadge')
            };
        }
        return undefined;
    }
}
