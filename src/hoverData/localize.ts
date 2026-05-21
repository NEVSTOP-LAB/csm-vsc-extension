import { isChineseLanguage } from '../i18n';
import type { HoverEntry } from './types';

export type HoverTranslations = Partial<Record<string, HoverEntry>>;

export function localizeHoverEntries(entries: Record<string, HoverEntry>, translations: HoverTranslations): Record<string, HoverEntry> {
	if (isChineseLanguage()) {
		return entries;
	}

	const localized: Record<string, HoverEntry> = {};
	for (const [key, entry] of Object.entries(entries)) {
		localized[key] = translations[key] ?? entry;
	}

	return localized;
}