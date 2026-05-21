import type { HoverEntry } from './types';
import { localizeHoverEntries } from './localize';
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

export const HOVER_DB: Record<string, HoverEntry> = localizeHoverEntries(zhHoverEntries, hoverTranslations);
