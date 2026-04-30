import * as vscode from 'vscode';
import { HoverEntry, buildHover } from './types';
import { CONTENT_HOVER_DB, MULTI_WORD_STATES } from './db';

// ---------------------------------------------------------------------------
// Token lookup helpers
// ---------------------------------------------------------------------------

/**
 * Operator candidates ordered by length (longest first) so multi-character
 * operators win over their prefixes. Each entry is `[literal, dbKey]`.
 *
 * Subscription keywords accept both lower-case and Title-case spellings of
 * the inner word because both occur in real scripts.
 */
const OPERATOR_CANDIDATES: ReadonlyArray<readonly [string, string]> = [
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
    ['!∈',                        '!∈'],
    ['∈',                         '∈'],
    ['??',                        '??'],
];

/** Returns the hover entry for an operator token covering position `pos`. */
function lookupOperator(line: string, pos: number): HoverEntry | undefined {
    for (const [op, key] of OPERATOR_CANDIDATES) {
        // Quick exclusion: skip if the operator characters can't reach pos.
        const start = Math.max(0, pos - op.length + 1);
        const end = Math.min(line.length, pos + op.length);
        if (!line.substring(start, end).includes(op)) { continue; }

        const idx = line.indexOf(op, Math.max(0, pos - op.length));
        if (idx !== -1 && idx <= pos && pos < idx + op.length) {
            return CONTENT_HOVER_DB[key];
        }
    }
    return undefined;
}

/** Try to match a multi-word system state name covering position `pos`. */
function lookupMultiWord(line: string, pos: number): HoverEntry | undefined {
    for (const state of MULTI_WORD_STATES) {
        const idx = line.indexOf(state);
        if (idx !== -1 && pos >= idx && pos < idx + state.length) {
            return CONTENT_HOVER_DB[state.toUpperCase()];
        }
    }
    return undefined;
}

/** Extract the word (identifier / command) around the cursor position. */
function getWordAt(line: string, pos: number): string {
    let start = pos;
    while (start > 0 && /[\w]/.test(line[start - 1])) { start--; }
    let end = pos;
    while (end < line.length && /[\w]/.test(line[end])) { end++; }
    const base = line.substring(start, end);

    // Preserve `(suffix)` for command variants such as WAIT(ms), RANDOM(INT).
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

// ---------------------------------------------------------------------------
// User-defined anchor hover (per-document cache)
// ---------------------------------------------------------------------------

/** Control-flow tag keywords that may not be used as user anchor names. */
const CONTROL_FLOW_TAG_KEYWORDS = new Set([
    'if', 'else', 'end_if',
    'while', 'end_while',
    'do_while', 'end_do_while',
    'foreach', 'end_foreach',
    'include',
]);

/** Pattern matching valid user-defined anchor names (letter-leading, hyphens allowed). */
const ANCHOR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Pattern matching an anchor definition line: `<name>` with optional `// comment`. */
const ANCHOR_DEFINITION_PATTERN = /^\s*<([A-Za-z][A-Za-z0-9_-]*)>\s*(?:\/\/\s*(.*?))?\s*$/;

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

/**
 * Cache anchor definitions per document URI and version so that the document
 * is scanned at most once per version.
 */
const anchorCache = new Map<string, AnchorCacheEntry>();

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

    const anchors = new Map<string, AnchorDefinition>();
    for (let i = 0; i < document.lineCount; i++) {
        const m = document.lineAt(i).text.match(ANCHOR_DEFINITION_PATTERN);
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
    // Anchor hovers embed user-supplied comment text — never trust as command HTML.
    md.isTrusted = false;
    md.supportHtml = false;
    md.appendMarkdown(`**\`<${name}>\` — 用户定义锚点 (User Anchor)**`);
    md.appendMarkdown('\n\n---\n\n');
    md.appendMarkdown(`定义于第 ${def.line + 1} 行。`);
    if (def.comment) {
        md.appendMarkdown('\n\n');
        md.appendText(def.comment);
    }
    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Provide a hover for tokens inside the *content area* of a CSM script line.
 *
 * Resolution order (first match wins):
 *  1. Multi-character operators (longest first)
 *  2. Multi-word system state names
 *  3. `${...}` variable references
 *  4. Word-based lookup against the content database
 *  5. `[SECTION]` headers (with command-alias spelling normalisation)
 *  6. Control-flow tags such as `<if`, `<while`
 *  7. Broadcast targets such as `<status>`, `<interrupt>`
 *  8. User-defined anchors `<anchor-name>`
 *  9. Conditional jump shorthand `??` / `?expr?`
 */
export function provideContentHover(
    document: vscode.TextDocument,
    position: vscode.Position,
): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const col = position.character;

    // 1. Operators
    const opEntry = lookupOperator(line, col);
    if (opEntry) { return buildHover(opEntry); }

    // 2. Multi-word system states
    const multiEntry = lookupMultiWord(line, col);
    if (multiEntry) { return buildHover(multiEntry); }

    // 3. Variable reference: cursor on `$` or inside `${...}`
    const dollarIdx = line.lastIndexOf('$', col);
    if (dollarIdx !== -1 && col <= line.indexOf('}', dollarIdx)) {
        const entry = CONTENT_HOVER_DB['${'];
        if (entry) { return buildHover(entry); }
    }

    // 4. Word-based lookup
    const rawWord = getWordAt(line, col);
    if (!rawWord) { return undefined; }
    const upper = rawWord.toUpperCase();

    let entry = CONTENT_HOVER_DB[upper];
    if (entry) { return buildHover(entry); }

    // 5. Pre-definition section headers `[NAME]` — normalise alias spellings
    const sectionMatch = line.match(/^\s*(\[[^\]]+\])/);
    if (sectionMatch) {
        const sectionKey = sectionMatch[1].toUpperCase()
            .replace(/COMMAND.ALIAS|CMD.ALIAS|COMMANDALIAS|CMDALIAS/i, 'COMMAND_ALIAS')
            .replace(/\s+/g, '_');
        entry = CONTENT_HOVER_DB[sectionKey];
        if (entry) { return buildHover(entry); }
    }

    // 6. Control-flow tags: `<if`, `<while`, ...
    const beforeCursor = line.substring(0, col);
    const ltPos = beforeCursor.lastIndexOf('<');
    if (ltPos !== -1 && ltPos >= col - rawWord.length - 1) {
        const tag = ('<' + upper).replace(/\s+.*/, '');
        entry = CONTENT_HOVER_DB[tag];
        if (entry) { return buildHover(entry); }
    }

    // 7. Broadcast targets `<status>`, `<interrupt>`, `<broadcast>`, `<all>`
    const broadcastKey = '<' + upper + '>';
    entry = CONTENT_HOVER_DB[broadcastKey];
    if (entry) { return buildHover(entry); }

    // 8. User-defined anchors — extract the full `<name>` from the line so
    //    that hyphens (which are word separators) are preserved.
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

    // 9. Conditional jump `??` / `?expr?`
    if (line.trimStart().startsWith('??')) {
        entry = CONTENT_HOVER_DB['??'];
        if (entry) { return buildHover(entry); }
    }
    if (/\?[^?]+\?/.test(line)) {
        entry = CONTENT_HOVER_DB['?EXPR?'];
        if (entry) { return buildHover(entry); }
    }

    return undefined;
}
