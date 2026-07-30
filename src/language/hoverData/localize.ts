import { isChineseLanguage } from '../../common/i18n';
import type { HoverEntry } from './types';

export type HoverTranslations = Partial<Record<string, HoverEntry>>;

/** 非中文环境下将中文 hover 条目替换为英文翻译。中文环境下直接返回原文。 */
export function applyEnglishHoverTranslations(entries: Record<string, HoverEntry>, translations: HoverTranslations): Record<string, HoverEntry> {
	if (isChineseLanguage()) {
		return entries;
	}

	// 无翻译时跳过拷贝，直接返回原文
	const translationKeys = Object.keys(translations);
	if (translationKeys.length === 0) {
		return entries;
	}

	const localized: Record<string, HoverEntry> = {};
	for (const [key, entry] of Object.entries(entries)) {
		localized[key] = translations[key] ?? entry;
	}

	return localized;
}