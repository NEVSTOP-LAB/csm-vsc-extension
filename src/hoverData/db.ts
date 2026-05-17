import type { HoverEntry } from './types';
import { operatorEntries } from './operators';
import { commandEntries } from './commands';
import { controlFlowEntries } from './controlFlow';
import { systemStateEntries } from './systemStates';

// ---------------------------------------------------------------------------
// Combined hover documentation database
// ---------------------------------------------------------------------------

export const HOVER_DB: Record<string, HoverEntry> = {
    ...operatorEntries,
    ...commandEntries,
    ...controlFlowEntries,
    ...systemStateEntries,
};
