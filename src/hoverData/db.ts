import type { HoverEntry } from './types';
import { localizeHoverEntries } from './localize';
import { isChineseLanguage } from '../i18n';
import { operatorEntries } from './operators';
import { commandEntries } from './commands';
import { controlFlowEntries } from './controlFlow';
import { systemStateEntries } from './systemStates';
import { hoverTranslations } from './translations';

// ---------------------------------------------------------------------------
// Combined hover documentation database
// ---------------------------------------------------------------------------

const zhHoverEntries: Record<string, HoverEntry> = {
    ...operatorEntries,
    ...commandEntries,
    ...controlFlowEntries,
    ...systemStateEntries,
};

let _hoverDbCache: { isChinese: boolean; db: Record<string, HoverEntry> } | undefined;

/**
 * Returns the hover DB for the current language, building and caching per
 * language state. This must be a function (not a module-level constant) so
 * that language overrides set after module load (e.g. in tests) are respected.
 */
export function getHoverDb(): Record<string, HoverEntry> {
    const isChinese = isChineseLanguage();
    if (_hoverDbCache !== undefined && _hoverDbCache.isChinese === isChinese) {
        return _hoverDbCache.db;
    }
    const db = localizeHoverEntries(zhHoverEntries, hoverTranslations);
    _hoverDbCache = { isChinese, db };
    return db;
}
