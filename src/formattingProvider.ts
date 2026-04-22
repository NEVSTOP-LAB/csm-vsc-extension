import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Control-flow keyword sets (mirrors diagnosticProvider for consistency)
// ---------------------------------------------------------------------------

/** Tags that open a new indented block. */
const OPEN_TAG_KEYWORDS = new Set(['if', 'while', 'do_while', 'foreach']);

/** Tags that close a block (dedent before writing). */
const CLOSE_TAG_KEYWORDS = new Set(['end_if', 'end_while', 'end_do_while', 'end_foreach']);

const ELSE_KEYWORD = 'else';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip a line comment (`// …`) from a line of text. */
function stripComment(text: string): string {
    const idx = text.indexOf('//');
    return idx >= 0 ? text.substring(0, idx) : text;
}

/**
 * Extract the leading angle-bracket tag keyword from the start of a
 * comment-stripped, leading-whitespace-stripped code line.
 *
 * E.g. `<if ${x} > 0>`   → `'if'`
 *      `<end_if>`         → `'end_if'`
 *      `<do_while>`       → `'do_while'`
 *      `<end_do_while …>` → `'end_do_while'`
 *      `<include a.csm>`  → `'include'`
 */
function extractTagKeyword(trimmedCode: string): string | null {
    const m = trimmedCode.match(/^<(\w+)(?:\s|>)/);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Return `true` when the code-only portion of a line (comment stripped,
 * fully trimmed) is an anchor definition.
 *
 * Anchors match the grammar pattern `<[A-Za-z][A-Za-z0-9_-]*>` — a single
 * word with optional hyphens, no spaces, no expression inside the brackets.
 * The name must start with a letter and must not be a reserved tag keyword
 * such as control-flow tags (`if`, `end_if`, `else`, ...) or `include`.
 */
function isAnchorDefinition(codeOnly: string): boolean {
    const m = codeOnly.match(/^<([A-Za-z][A-Za-z0-9_-]*)>$/);
    if (!m) {
        return false;
    }
    const name = m[1].toLowerCase();
    if (
        OPEN_TAG_KEYWORDS.has(name) ||
        CLOSE_TAG_KEYWORDS.has(name) ||
        name === ELSE_KEYWORD ||
        name === 'include'
    ) {
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Core formatting logic (pure – no VS Code API dependency)
// ---------------------------------------------------------------------------

/**
 * Format a CSMScript document text and return the formatted string.
 *
 * Formatting rules applied:
 * 1. Trailing whitespace is removed from every line.
 * 2. Blank lines are preserved as-is.
 * 3. INI section headers (`[SECTION_NAME]`) are placed at column 0 and
 *    reset the running indentation level to 0.
 * 4. Anchor definitions (`<anchorName>`) are placed at column 0.
 * 5. Control-flow open tags (`<if>`, `<while>`, `<do_while>`, `<foreach>`)
 *    are placed at the current indent level, then the level is incremented.
 * 6. The `<else>` tag is placed at one level below the current indent (same
 *    level as the matching `<if>`); the indent level is unchanged.
 * 7. Control-flow close tags (`<end_if>`, `<end_while>`, `<end_do_while>`,
 *    `<end_foreach>`) decrement the indent level first, then are placed at
 *    the resulting level.
 * 8. All other lines (commands, comments, key-value pairs) are placed at the
 *    current indent level.
 */
export function formatCSMScript(
    text: string,
    options: Pick<vscode.FormattingOptions, 'insertSpaces' | 'tabSize'>,
): string {
    // Preserve the original line ending style.
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const indentUnit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

    let indentLevel = 0;
    const result: string[] = [];

    for (const rawLine of lines) {
        // Remove trailing whitespace.
        const lineText = rawLine.trimEnd();
        const lineTextTrimmed = lineText.trim();

        // Blank (or whitespace-only) line — preserve as empty.
        if (lineTextTrimmed === '') {
            result.push('');
            continue;
        }

        // Code portion: strip comment and trim leading/trailing whitespace.
        const codeOnly = stripComment(lineText).trim();

        // Comment-only line — apply current indentation.
        if (codeOnly === '') {
            result.push(indentUnit.repeat(indentLevel) + lineTextTrimmed);
            continue;
        }

        // INI section header: [SECTION_NAME] — always at column 0,
        // resets running indentation to 0.
        // Section names may contain letters, digits, underscores, hyphens,
        // and spaces (e.g. "CMD Alias", "Command Alias" are valid).
        if (/^\[[\w\s-]+\]$/.test(codeOnly)) {
            indentLevel = 0;
            result.push(lineTextTrimmed);
            continue;
        }

        // Extract the keyword from a leading `<tag…>` construct.
        const keyword = extractTagKeyword(codeOnly);

        // ── Control-flow close tag ───────────────────────────────────────
        if (keyword && CLOSE_TAG_KEYWORDS.has(keyword)) {
            indentLevel = Math.max(0, indentLevel - 1);
            result.push(indentUnit.repeat(indentLevel) + lineTextTrimmed);
            continue;
        }

        // ── else tag ─────────────────────────────────────────────────────
        if (keyword === ELSE_KEYWORD) {
            // Place at the same level as the matching `<if>`.
            const elseLevel = Math.max(0, indentLevel - 1);
            result.push(indentUnit.repeat(elseLevel) + lineTextTrimmed);
            // indentLevel stays the same: the else-body keeps the same depth.
            continue;
        }

        // ── Control-flow open tag ────────────────────────────────────────
        if (keyword && OPEN_TAG_KEYWORDS.has(keyword)) {
            result.push(indentUnit.repeat(indentLevel) + lineTextTrimmed);
            indentLevel++;
            continue;
        }

        // ── Anchor definition ────────────────────────────────────────────
        if (isAnchorDefinition(codeOnly)) {
            result.push(lineTextTrimmed);
            continue;
        }

        // ── Regular line (command, expression, key-value, include …) ─────
        result.push(indentUnit.repeat(indentLevel) + lineTextTrimmed);
    }

    return result.join(eol);
}

// ---------------------------------------------------------------------------
// VS Code provider class
// ---------------------------------------------------------------------------

export class CSMScriptFormattingProvider
    implements vscode.DocumentFormattingEditProvider {

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
    ): vscode.TextEdit[] {
        const text = document.getText();
        const formatted = formatCSMScript(text, options);

        if (formatted === text) { return []; }

        const endPos = document.positionAt(text.length);
        const fullRange = new vscode.Range(0, 0, endPos.line, endPos.character);
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
}
