import * as vscode from 'vscode';
import { buildHover } from './hover/types';
import { provideContentHover } from './hover/contentHover';
import { HEADER_HOVER_DB } from './csmlog/headerHoverDb';
import {
    RE_CONFIG_LINE,
    RE_DATE_TS,
    RE_FILE_LOGGER,
    parseLogLineZones,
} from './csmlog/logLineParser';

/**
 * Hover provider for `.csmlog` files.
 *
 * The provider classifies the cursor position into one of three line shapes
 * — config line, file-logger line, or standard log line — and returns a
 * hover for the recognised zone. Inside the standard-log content area
 * (after `|`) it delegates to `provideContentHover`, which reuses the same
 * keyword database used for `.lvcsm`-style script content elsewhere.
 *
 * Resolution order on a standard log line:
 *  1. Absolute date timestamp
 *  2. Relative timestamp `[HH:MM:SS.mmm]`
 *  3. Event-type bracket
 *  4. Origin marker `<-` inside content
 *  5. Content area → `provideContentHover`
 */
export class CSMLogHoverProvider implements vscode.HoverProvider {

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        const line = document.lineAt(position.line).text;
        const col = position.character;

        // 1. Config line: `- Key | Value`
        const configMatch = line.match(RE_CONFIG_LINE);
        if (configMatch && line.startsWith('-')) {
            const keyStart = line.indexOf(configMatch[1]);
            const keyEnd = keyStart + configMatch[1].length;
            if (col >= keyStart && col < keyEnd) {
                const entry = HEADER_HOVER_DB[configMatch[1].trim().toUpperCase()];
                if (entry) { return buildHover(entry); }
            }
            return undefined;
        }

        // 2. File-logger line (no event-type bracket)
        if (RE_FILE_LOGGER.test(line)) {
            const dateTsMatch = line.match(RE_DATE_TS);
            if (dateTsMatch && col < dateTsMatch[0].length) {
                return buildHover(HEADER_HOVER_DB['__TIMESTAMP_DATE__']);
            }
            return undefined;
        }

        // 3. Standard log entry
        const zones = parseLogLineZones(line);
        if (!zones) { return undefined; }
        const { dateTs, relTs, eventType, contentStart } = zones;

        if (dateTs && col >= dateTs[0] && col < dateTs[1]) {
            return buildHover(HEADER_HOVER_DB['__TIMESTAMP_DATE__']);
        }
        if (relTs && col >= relTs[0] && col < relTs[1]) {
            return buildHover(HEADER_HOVER_DB['__TIMESTAMP_TIME__']);
        }
        if (eventType && col >= eventType[0] && col < eventType[1]) {
            const rawType = line.substring(eventType[0], eventType[1]).toUpperCase();
            const entry = HEADER_HOVER_DB[rawType];
            return entry ? buildHover(entry) : undefined;
        }

        // Content area (after `|`) — origin marker first, then delegate
        if (contentStart !== -1 && col >= contentStart) {
            const contentSection = line.slice(contentStart);
            // Origin marker only fires for `<-` followed by whitespace, so
            // it isn't confused with arrows inside a quoted message.
            const originMatch = contentSection.match(/(<-)\s+/);
            if (originMatch) {
                const originStart = contentStart + contentSection.indexOf('<-');
                if (col >= originStart && col < originStart + 2) {
                    return buildHover(HEADER_HOVER_DB['<-']);
                }
            }
            return provideContentHover(document, position);
        }

        // Module-name zone (between event type and `|`) — no hover.
        return undefined;
    }
}
