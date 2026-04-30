import { HoverEntry } from '../types';
import { OPERATOR_HOVERS } from './operators';
import { SECTION_HOVERS } from './sections';
import { COMMAND_HOVERS } from './commands';
import { CONTROL_FLOW_HOVERS } from './controlFlow';
import { SYSTEM_STATE_HOVERS } from './systemStates';

/**
 * Combined hover database used by `provideContentHover`.
 *
 * The database is assembled from category modules to keep individual data
 * files focused and easy to maintain. Lookups normalise the source token
 * (typically to upper case) before reading from this object.
 */
export const CONTENT_HOVER_DB: Record<string, HoverEntry> = {
    ...OPERATOR_HOVERS,
    ...SECTION_HOVERS,
    ...COMMAND_HOVERS,
    ...CONTROL_FLOW_HOVERS,
    ...SYSTEM_STATE_HOVERS,
};

export { MULTI_WORD_STATES } from './systemStates';
