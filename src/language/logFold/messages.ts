// ---------------------------------------------------------------------------
// src/language/logFold/messages.ts — CSMLog 折叠功能的本地化文案
// ---------------------------------------------------------------------------

import { LocalizedBundle, localizeBundle } from '../../common/i18n';

const logFoldMessages = {
	/** 状态栏按钮 tooltip（扩展激活时创建） */
	statusBarTooltip: {
		en: 'Toggle all CSMLog repeat folds',
		zh: '切换全部 CSMLog 重复区折叠',
	},
	/** 状态栏文本：$(fold) N区 / M行 */
	statusBarText: {
		en: '$(fold) {regionCount} regions / {lineCount} lines',
		zh: '$(fold) {regionCount}区 / {lineCount}行',
	},
	/** 状态栏 tooltip：详细统计 + 点击提示 */
	statusBarTooltipDetailed: {
		en: 'Detected {regionCount} repeat fold regions covering {foldedLines} lines ({percentage}%) — click to toggle folds',
		zh: '检测到 {regionCount} 个重复折叠区，覆盖 {foldedLines} 行 ({percentage}%) —— 点击切换折叠',
	},
	/** 折叠统计命令：当前文件不是 CSMLog 文件 */
	statsNotCsmlog: {
		en: 'CSMLog Fold: the current file is not a CSMLog file',
		zh: 'CSMLog Fold: 当前文件不是 CSMLog 文件',
	},
	/** 折叠统计命令：尚未启用折叠检测 */
	statsEnableFirst: {
		en: 'CSMLog Fold: enable fold detection first via the 👁 toolbar button',
		zh: 'CSMLog Fold: 请先点击工具栏 👁 按钮启用折叠检测',
	},
	/** 折叠统计命令结果 */
	statsResult: {
		en: 'CSMLog fold statistics: {regionCount} repeat region(s) detected, covering {foldedLines} line(s) ({percentage}%)',
		zh: 'CSMLog 折叠统计: 检测到 {regionCount} 个重复区，覆盖 {foldedLines} 行 ({percentage}%)',
	},
	/** 折叠概要标签（detailed 模式）：…重复 N 次 */
	summaryRepeated: {
		en: '…repeated {count} time(s)',
		zh: '…重复 {count} 次',
	},
} as const;

type LogFoldMessageKey = keyof typeof logFoldMessages;

export function t(key: LogFoldMessageKey, params?: Record<string, string | number | boolean>): string {
	return localizeBundle(logFoldMessages satisfies LocalizedBundle, key, params);
}
