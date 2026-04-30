/**
 * Shared regex patterns and zone parser for `.csmlog` log lines.
 *
 * A standard log line is structured as:
 *
 *     YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [EventType] Module | content
 *     └── date timestamp ──┘ └── rel ts ───┘ └── event ─┘ └─ mod ─┘ └ ... ┘
 *
 * Variants:
 *   - The relative timestamp `[HH:MM:SS.mmm]` is optional.
 *   - Some events omit `| content` entirely (e.g. `[Module Destroyed]`).
 *   - File-logger lines have only `<date timestamp>  <text>` (no brackets).
 */

/** Full date timestamp at start of line: `YYYY/MM/DD HH:MM:SS.mmm`. */
export const RE_DATE_TS = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/;

/** Standalone relative timestamp at start of line: `[HH:MM:SS.mmm]`. */
export const RE_REL_TS_ONLY = /^(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/;

/** Configuration line: `- Key | Value`. */
export const RE_CONFIG_LINE = /^-\s+([^|]+?)\s+\|\s+(.+)$/;

/**
 * File-logger line: a date timestamp followed by 2+ spaces and any text that
 * does not start with `[`. The negative lookahead distinguishes this format
 * from standard log lines which always continue with `[` (relative ts or
 * event type).
 */
export const RE_FILE_LOGGER = /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s{2,}(?!\[)/;

/** Character ranges for each parsed zone of a log line. */
export interface LogLineZones {
    /** Range of the absolute date timestamp `[start, end)`. */
    dateTs?: [number, number];
    /** Range of the relative timestamp `[HH:MM:SS.mmm]`. */
    relTs?: [number, number];
    /** Range of the bracketed event-type expression `[EventType]`. */
    eventType?: [number, number];
    /** Index of the first character after the `|` separator, or `-1` if no pipe. */
    contentStart: number;
}

/**
 * Parse a standard `.csmlog` log line into character ranges for each zone.
 *
 * Returns `null` when `line` does not start with either a full date
 * timestamp or a standalone relative timestamp — in that case the line is
 * not a recognised log entry and the caller should not provide a hover.
 */
export function parseLogLineZones(line: string): LogLineZones | null {
    let pos = 0;
    let dateTs: [number, number] | undefined;
    let relTs: [number, number] | undefined;

    const dateTsMatch = line.match(RE_DATE_TS);
    if (dateTsMatch) {
        dateTs = [0, dateTsMatch[0].length];
        pos = dateTs[1];

        // Optional relative timestamp `[HH:MM:SS.mmm]` after the date timestamp
        const relTsMatch = line.slice(pos).match(/^\s+(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/);
        if (relTsMatch) {
            const start = pos + relTsMatch[0].indexOf('[');
            const end = start + relTsMatch[1].length;
            relTs = [start, end];
            pos += relTsMatch[0].length;
        }
    } else {
        // Relative-timestamp-only line: `[HH:MM:SS.mmm] [Event] Module | ...`
        const relTsOnlyMatch = line.match(RE_REL_TS_ONLY);
        if (!relTsOnlyMatch) { return null; }
        relTs = [0, relTsOnlyMatch[0].length];
        pos = relTs[1];
    }

    // Optional event-type bracket
    let eventType: [number, number] | undefined;
    const eventTypeMatch = line.slice(pos).match(/^\s+(\[[^\]]+\])/);
    if (eventTypeMatch) {
        const start = pos + eventTypeMatch[0].indexOf('[');
        const end = start + eventTypeMatch[1].length;
        eventType = [start, end];
        pos += eventTypeMatch[0].length;
    }

    const pipeIdx = line.indexOf('|', pos);
    return {
        dateTs,
        relTs,
        eventType,
        contentStart: pipeIdx === -1 ? -1 : pipeIdx + 1,
    };
}
