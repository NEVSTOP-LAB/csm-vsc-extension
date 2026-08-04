// ---------------------------------------------------------------------------
// src/i18n/language.ts — 语言功能域的本地化 UI 文案
//
// 集中管理语言功能（非模块管理）中直接展示给用户的文案：
//   - CSMLog outline 符号名（csmlogDocumentSymbolProvider）
//   - 资源管理器文件徽章 tooltip（fileDecorationProvider）
// ---------------------------------------------------------------------------

import { localizeBundle } from './core';

/** CSMLog outline 符号名（模块创建/销毁事件、未知模块占位） */
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
} as const;

type SymbolMessageKey = keyof typeof symbolMessages;

/** 资源管理器文件徽章 tooltip */
const fileBadgeMessages = {
	csmlogBadge: {
		en: 'CSM log file',
		zh: 'CSM 日志文件',
	},
	lvcsmBadge: {
		en: 'LVCSM script file',
		zh: 'LVCSM 脚本文件',
	},
} as const;

type FileBadgeMessageKey = keyof typeof fileBadgeMessages;

export function getSymbolMessage(key: SymbolMessageKey): string {
	return localizeBundle(symbolMessages, key);
}

export function getFileBadgeMessage(key: FileBadgeMessageKey): string {
	return localizeBundle(fileBadgeMessages, key);
}
