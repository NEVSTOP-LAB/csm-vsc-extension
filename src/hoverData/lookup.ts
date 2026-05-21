import * as vscode from 'vscode';
import { isChineseLanguage } from '../i18n';
import type { HoverEntry } from './types';
import { HOVER_DB } from './db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the hover entry for an operator token found at position in the line. */
function lookupOperator(line: string, pos: number): HoverEntry | undefined {
    // Ordered by length (longest first) to prefer specific matches.
    const candidates: [string, string][] = [
        ['-><register as interrupt>', '-><REGISTER AS INTERRUPT>'],
        ['-><register as status>',    '-><REGISTER AS STATUS>'],
        ['-><register as Interrupt>', '-><REGISTER AS INTERRUPT>'],
        ['-><register as Status>',    '-><REGISTER AS STATUS>'],
        ['-><register>',              '-><REGISTER>'],
        ['-><unregister>',            '-><UNREGISTER>'],
        ['->|',                       '->|'],
        ['->',                        '->'],
        ['-@',                        '-@'],
        ['=>',                        '=>'],
        ['>>',                        '>>'],
        ['@',                         '@'],
        ['!∈',                        '!∈'],
        ['∈',                         '∈'],
        ['??',                        '??'],
    ];
    for (const [op, key] of candidates) {
        // Check if the operator appears at or near pos
        const start = Math.max(0, pos - op.length + 1);
        const end = Math.min(line.length, pos + op.length);
        const slice = line.substring(start, end);
        if (slice.includes(op)) {
            const idx = line.indexOf(op, Math.max(0, pos - op.length));
            if (idx !== -1 && idx <= pos && pos < idx + op.length) {
                return HOVER_DB[key];
            }
        }
    }
    return undefined;
}

/** Extract the word (identifier / command) around the cursor position. */
function getWordAt(line: string, pos: number): string {
    // Expand left (include underscore, alphanumeric)
    let start = pos;
    while (start > 0 && /[\w]/.test(line[start - 1])) { start--; }
    // Expand right
    let end = pos;
    while (end < line.length && /[\w]/.test(line[end])) { end++; }
    const base = line.substring(start, end);

    // If immediately followed by (...), include to handle WAIT(ms), RANDOM(INT), etc.
    // Only do so when the content inside () is alphanumeric (command variant), not args.
    if (end < line.length && line[end] === '(') {
        const closeIdx = line.indexOf(')', end);
        if (closeIdx !== -1) {
            const inner = line.substring(end + 1, closeIdx);
            if (/^[A-Za-z]+$/.test(inner)) {
                return base + '(' + inner + ')';
            }
        }
    }
    return base;
}

/** Try to match multi-word system state names around cursor position. */
const MULTI_WORD_STATES = [
    'Async Message Posted',
    'Target Timeout Error',
    'No Target Error',
    'Async Response',
    'Target Error',
    'Critical Error',
    'Error Handler',
];
function lookupMultiWord(line: string, pos: number): HoverEntry | undefined {
    for (const state of MULTI_WORD_STATES) {
        const idx = line.indexOf(state);
        if (idx !== -1 && pos >= idx && pos < idx + state.length) {
            return HOVER_DB[state.toUpperCase()];
        }
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// User-defined anchor hover helpers
// ---------------------------------------------------------------------------

/** Control-flow tag keywords that cannot be user-defined anchor names. */
const CONTROL_FLOW_TAG_KEYWORDS = new Set([
    'if', 'else', 'end_if',
    'while', 'end_while',
    'do_while', 'end_do_while',
    'foreach', 'end_foreach',
    'include',
]);

/** Pattern matching valid user-defined anchor names (letter-leading, allows hyphens). */
const ANCHOR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface AnchorDefinition {
    /** Zero-based line index of the anchor definition. */
    line: number;
    /** Inline comment text on the definition line (empty string if none). */
    comment: string;
}

interface AnchorCacheEntry {
    /** Document version the cache was built for. */
    version: number;
    /** Map of lower-cased anchor name to its definition. */
    anchors: Map<string, AnchorDefinition>;
}

/** Cache anchor definitions per document URI and version to avoid repeated full scans. */
const anchorCache = new Map<string, AnchorCacheEntry>();

/**
 * Clears the anchor cache entry for the given document URI.
 * Should be called when a document is closed to prevent memory leaks.
 */
export function clearAnchorCache(documentUri: string): void {
    anchorCache.delete(documentUri);
}

/**
 * Find an anchor definition `<name>` that matches `anchorName`
 * (case-insensitive) within the given document.
 *
 * Anchor definitions for each (document URI, version) pair are cached so
 * that the document is scanned at most once per version.
 */
function findAnchorInDocument(
    document: vscode.TextDocument,
    anchorName: string,
): AnchorDefinition | undefined {
    const lower = anchorName.toLowerCase();
    const cacheKey = document.uri.toString();
    const cached = anchorCache.get(cacheKey);

    if (cached && cached.version === document.version) {
        return cached.anchors.get(lower);
    }

    // Build a fresh cache entry for this document version.
    const anchors = new Map<string, AnchorDefinition>();
    const anchorPattern = /^\s*<([A-Za-z][A-Za-z0-9_-]*)>\s*(?:\/\/\s*(.*?))?\s*$/;

    for (let i = 0; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;
        const m = text.match(anchorPattern);
        if (m) {
            const nameLower = m[1].toLowerCase();
            // Preserve the first definition encountered for a given name.
            if (!anchors.has(nameLower)) {
                anchors.set(nameLower, { line: i, comment: m[2] ?? '' });
            }
        }
    }

    anchorCache.set(cacheKey, { version: document.version, anchors });
    return anchors.get(lower);
}

function buildAnchorHover(name: string, def: AnchorDefinition): vscode.Hover {
    const md = new vscode.MarkdownString();
    // Do not trust user-controlled document content in anchor hovers.
    md.isTrusted = false;
    md.supportHtml = false;
    if (isChineseLanguage()) {
        md.appendMarkdown(`**\`<${name}>\` — 用户定义锚点**`);
    } else {
        md.appendMarkdown(`**\`<${name}>\` — User-defined anchor**`);
    }
    md.appendMarkdown('\n\n---\n\n');
    if (isChineseLanguage()) {
        md.appendMarkdown(`定义于第 ${def.line + 1} 行。`);
    } else {
        md.appendMarkdown(`Defined on line ${def.line + 1}.`);
    }
    if (def.comment) {
        md.appendMarkdown('\n\n');
        md.appendText(def.comment);
    }
    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// Standalone hover function (used by both the CSMLog content-area provider)
// ---------------------------------------------------------------------------

export function provideContentHover(
    document: vscode.TextDocument,
    position: vscode.Position,
): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const col = position.character;

    // 1. Try operator look-up first (operators can contain non-word chars)
    const opEntry = lookupOperator(line, col);
    if (opEntry) {
        return buildHover(opEntry);
    }

    // 2. Multi-word system state look-up (before single-word to prefer longer match)
    const multiEntry = lookupMultiWord(line, col);
    if (multiEntry) {
        return buildHover(multiEntry);
    }

    // 3. Variable reference: cursor on $ or inside ${...}
    const dollarIdx = line.lastIndexOf('$', col);
    if (dollarIdx !== -1 && col <= line.indexOf('}', dollarIdx)) {
        const entry = HOVER_DB['${'];
        if (entry) { return buildHover(entry); }
    }

    // 4. Try word-based look-up
    const rawWord = getWordAt(line, col);
    if (!rawWord) { return undefined; }

    const upper = rawWord.toUpperCase();

    // Direct look-up
    let entry = HOVER_DB[upper];
    if (entry) { return buildHover(entry); }

    // Pre-definition section headers: [COMMAND_ALIAS] etc.
    // Check if the word is inside a [SECTION] header on this line
    const sectionMatch = line.match(/^\s*(\[[^\]]+\])/);
    if (sectionMatch) {
        const matchIndex = sectionMatch.index ?? 0;
        const sectionStart = matchIndex + sectionMatch[0].indexOf(sectionMatch[1]);
        const sectionEnd = sectionStart + sectionMatch[1].length;
        if (col < sectionStart || col >= sectionEnd) {
            return undefined;
        }
        const sectionKey = sectionMatch[1].toUpperCase()
            .replace(/COMMAND.ALIAS|CMD.ALIAS|COMMANDALIAS|CMDALIAS/i, 'COMMAND_ALIAS')
            .replace(/\s+/g, '_');
        entry = HOVER_DB[sectionKey];
        if (entry) { return buildHover(entry); }
    }

    // Control flow: <if, <while, <foreach, etc. – handle < prefix
    const beforeCursor = line.substring(0, col);
    const ltPos = beforeCursor.lastIndexOf('<');
    if (ltPos !== -1 && ltPos >= col - rawWord.length - 1) {
        const tag = ('<' + upper).replace(/\s+.*/, '');
        entry = HOVER_DB[tag];
        if (entry) { return buildHover(entry); }
    }

    // Broadcast targets: <status>, <interrupt>, <broadcast>, <all>
    // User hovered on the word inside < >
    const broadcastKey = '<' + upper + '>';
    entry = HOVER_DB[broadcastKey];
    if (entry) { return buildHover(entry); }

    // User-defined anchor: cursor is inside <anchorName> (supports hyphens in names)
    // Extract the full text between the nearest `<` before the cursor and the
    // next `>` on the line instead of relying on the word-boundary `rawWord`,
    // because `-` is a word separator in the csmlog wordPattern.
    if (ltPos !== -1) {
        const gtPos = line.indexOf('>', ltPos);
        if (gtPos !== -1 && col > ltPos && col <= gtPos) {
            const anchorName = line.substring(ltPos + 1, gtPos);
            if (ANCHOR_NAME_PATTERN.test(anchorName)
                && !CONTROL_FLOW_TAG_KEYWORDS.has(anchorName.toLowerCase())) {
                const anchorDef = findAnchorInDocument(document, anchorName);
                if (anchorDef !== undefined) {
                    return buildAnchorHover(anchorName, anchorDef);
                }
            }
        }
    }

    // Conditional jump ?...?
    if (line.trimStart().startsWith('??')) {
        entry = HOVER_DB['??'];
        if (entry) { return buildHover(entry); }
    }
    if (/\?[^?]+\?/.test(line)) {
        entry = HOVER_DB['?EXPR?'];
        if (entry) { return buildHover(entry); }
    }

    return undefined;
}

export function buildHover(entry: HoverEntry): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportHtml = false;
    md.appendMarkdown(`**${entry.summary}**`);
    if (entry.detail) {
        md.appendMarkdown('\n\n---\n\n' + entry.detail);
    }
    return new vscode.Hover(md);
}
