import * as vscode from 'vscode';
import { buildHover, provideContentHover } from './hoverData';
import { getHoverDb } from './hoverData/db';
import { RE_DATE_TS, CONFIG_LINE_REGEX, RE_FILE_LOGGER } from './common/constants';

// ---------------------------------------------------------------------------
// Line zone detection
// ---------------------------------------------------------------------------

interface LogLineZones {
    /** Start and end of the full date timestamp in the line. */
    dateTs?: [number, number];
    /** Start and end of the relative timestamp [HH:MM:SS.mmm]. */
    relTs?: [number, number];
    /** Start and end of the event-type bracket expression. */
    eventType?: [number, number];
    /** Start of the content section (after '|'). -1 if no pipe. */
    contentStart: number;
}

/**
 * Parse a standard log line and return the character ranges for each zone.
 * Returns `null` when the line does not match the expected log format.
 */
function parseLogLineZones(line: string): LogLineZones | null {
    let pos = 0;
    let dateTs: [number, number] | undefined;
    let relTs: [number, number] | undefined;

    // Start may be either full date timestamp or relative timestamp only
    const dateTsMatch = line.match(RE_DATE_TS);
    if (dateTsMatch) {
        dateTs = [0, dateTsMatch[0].length];
        pos = dateTs[1];

        // Optional relative timestamp [HH:MM:SS.mmm] after date timestamp
        const afterDate = line.slice(pos);
        const relTsSpaceMatch = afterDate.match(/^\s+(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/);
        if (relTsSpaceMatch) {
            const start = pos + relTsSpaceMatch[0].indexOf('[');
            const end = start + relTsSpaceMatch[1].length;
            relTs = [start, end];
            pos += relTsSpaceMatch[0].length;
        }
    } else {
        // Relative timestamp only line: [HH:MM:SS.mmm] [Event] Module | ...
        const relTsOnlyMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\.\d{3}\])/);
        if (!relTsOnlyMatch) { return null; }
        relTs = [0, relTsOnlyMatch[0].length];
        pos = relTs[1];
    }

    // Optional event type [EventType]
    let eventType: [number, number] | undefined;
    const afterRelTs = line.slice(pos);
    const eventTypeSpaceMatch = afterRelTs.match(/^\s+(\[[^\]]+\])/);
    if (eventTypeSpaceMatch) {
        const start = pos + eventTypeSpaceMatch[0].indexOf('[');
        const end = start + eventTypeSpaceMatch[1].length;
        eventType = [start, end];
        pos += eventTypeSpaceMatch[0].length;
    }

    // Find the pipe separator
    const pipeIdx = line.indexOf('|', pos);

    return { dateTs, relTs, eventType, contentStart: pipeIdx === -1 ? -1 : pipeIdx + 1 };
}

// ---------------------------------------------------------------------------
// HoverProvider
// ---------------------------------------------------------------------------

export class CSMLogHoverProvider implements vscode.HoverProvider {

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        const line = document.lineAt(position.line).text;
        const col = position.character;
        const db = getHoverDb();

        // 1. Config line: "- Key | Value"
        const configMatch = line.match(CONFIG_LINE_REGEX);
        if (configMatch && line.startsWith('-')) {
            const keyStart = line.indexOf(configMatch[1]);
            const keyEnd = keyStart + configMatch[1].length;
            if (col >= keyStart && col < keyEnd) {
                const key = configMatch[1].trim().toUpperCase();
                const entry = db[key];
                if (entry) { return buildHover(entry); }
            }
            // Cursor is on value or outside key — no hover
            return undefined;
        }

        // 2. File logger line (no event type)
        if (RE_FILE_LOGGER.test(line)) {
            // Only hover over the timestamp portion
            const dateTsMatch = line.match(RE_DATE_TS);
            if (dateTsMatch && col < dateTsMatch[0].length) {
                return buildHover(db['__TIMESTAMP_DATE__']!);
            }
            return undefined;
        }

        // 3. Standard log entry line
        const zones = parseLogLineZones(line);
        if (!zones) { return undefined; }

        const { dateTs, relTs, eventType, contentStart } = zones;

        // Zone: full date timestamp
        if (dateTs && col >= dateTs[0] && col < dateTs[1]) {
            return buildHover(db['__TIMESTAMP_DATE__']!);
        }

        // Zone: relative timestamp
        if (relTs && col >= relTs[0] && col < relTs[1]) {
            return buildHover(db['__TIMESTAMP_TIME__']!);
        }

        // Zone: event type bracket
        if (eventType && col >= eventType[0] && col < eventType[1]) {
            const rawType = line.substring(eventType[0], eventType[1]).toUpperCase();
            const entry = db[rawType];
            if (entry) { return buildHover(entry); }
            // Unknown event type — no hover
            return undefined;
        }

        // Zone: content (after '|') — delegate to content hover
        if (contentStart !== -1 && col >= contentStart) {
            // Check for '<-' log origin marker first
            const contentSection = line.slice(contentStart);
            const originMatch = contentSection.match(/(<-)\s+/);
            if (originMatch) {
                const originStart = contentStart + contentSection.indexOf('<-');
                const originEnd = originStart + 2;
                if (col >= originStart && col < originEnd) {
                    return buildHover(db['<-']!);
                }
            }
            // Delegate to content hover for operators, commands, variables, etc.
            return provideContentHover(document, position);
        }

        // Zone: module name (between event type and '|') — no hover
        return undefined;
    }
}
