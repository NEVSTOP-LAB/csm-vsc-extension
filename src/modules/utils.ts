// ---------------------------------------------------------------------------
// modules/utils.ts — 模块管理器共享工具函数
// ---------------------------------------------------------------------------

import { CsmModuleEntry } from './types';

/** 将模块条目转换为唯一标识键（owner/name）。 */
export function getModuleKey(entry: CsmModuleEntry): string {
	return `${entry.owner}/${entry.name}`;
}

/** 按最大长度截断文本，超出部分用 "..." 替代。 */
export function truncate(text: string, maxLength: number): string {
	if (maxLength <= 0) { return ''; }
	if (text.length <= maxLength) {
		return text;
	}
	if (maxLength <= 3) {
		return text.slice(0, maxLength);
	}
	return `${text.slice(0, maxLength - 3)}...`;
}
