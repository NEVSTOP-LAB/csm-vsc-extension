import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Control-flow open/close maps
// ---------------------------------------------------------------------------

/** Tags that open a new block and must be matched by a closing tag. */
const OPEN_TAG_KEYWORDS = new Set(['if', 'while', 'do_while', 'foreach']);

/** Maps each closing-tag keyword to its expected matching opening-tag keyword. */
const CLOSE_TAG_MAP: Record<string, string> = {
    end_if: 'if',
    end_while: 'while',
    end_do_while: 'do_while',
    end_foreach: 'foreach',
};

interface ControlFlowFrame {
    keyword: string;
    range: vscode.Range;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip a line comment (`// …`) from a line of text. */
function stripComment(text: string): string {
    const idx = text.indexOf('//');
    return idx >= 0 ? text.substring(0, idx) : text;
}

/**
 * Extract the first angle-bracket tag keyword from the beginning of a
 * comment-stripped, leading-whitespace-stripped code line.
 *
 * E.g. `<if ${x} > 0>`   → `'if'`
 *      `<end_if>`         → `'end_if'`
 *      `<do_while>`       → `'do_while'`
 *      `<end_do_while …>` → `'end_do_while'`
 *      `<include a.csm>`  → `'include'`
 *      `<anchor_name>`    → `'anchor_name'`
 */
function extractLeadingTagKeyword(trimmedCode: string): string | null {
    const m = trimmedCode.match(/^<(\w+)(?:\s|>)/);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Compute the length of the opening `<tag…>` token at the start of a
 * trimmed code line.
 *
 * Uses the last `>` before any line comment so tags like `<while ${n} > 0>`
 * are fully covered.
 */
function leadingTagLength(trimmedCode: string): number {
    const withoutComment = stripComment(trimmedCode);
    const closingBracket = withoutComment.lastIndexOf('>');
    return closingBracket >= 0 ? closingBracket + 1 : withoutComment.length;
}

// ---------------------------------------------------------------------------
// Core analysis (pure – does not touch vscode.DiagnosticCollection)
// ---------------------------------------------------------------------------

/**
 * Analyze a CSMScript document and return an array of `vscode.Diagnostic`
 * objects.  This is a pure function: it only reads the document, never writes
 * to any collection.
 */
export function analyzeDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const stack: ControlFlowFrame[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        const code = stripComment(lineText);
        const trimmedCode = code.trimStart();

        // Column offset of the first non-whitespace character on this line.
        const colStart = lineText.search(/\S/);

        // ── 1. Unclosed variable reference: ${  without matching } ───────────
        let searchFrom = 0;
        while (true) {
            const open = code.indexOf('${', searchFrom);
            if (open === -1) { break; }
            const close = code.indexOf('}', open + 2);
            if (close === -1) {
                const range = new vscode.Range(i, open, i, code.length);
                const diag = new vscode.Diagnostic(
                    range,
                    `Unclosed variable reference '${code.slice(open).trimEnd()}'`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diag.code = 'CSMSCRIPT004';
                diag.source = 'csmscript';
                diagnostics.push(diag);
                break; // only report once per line
            }
            searchFrom = close + 1;
        }

        // ── 2. Range check (∈/!∈) and conditional jump on the same line ──────
        //    Manual warning: "返回值判断与锚点跳转功能不能同时在一行使用"
        const hasRangeOp = /∈/.test(code);
        const hasCondJump = /\?\?|\?[^?]+\?/.test(code);
        if (hasRangeOp && hasCondJump) {
            const rangeOpIdx = code.search(/!?[∈]/);
            const range = new vscode.Range(i, rangeOpIdx >= 0 ? rangeOpIdx : 0, i, code.length);
            const diag = new vscode.Diagnostic(
                range,
                'Range check (∈/!∈) and conditional jump (?? / ?expr?) cannot be used on the same line',
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = 'CSMSCRIPT006';
            diag.source = 'csmscript';
            diagnostics.push(diag);
        }

        // ── 3. EXPRESSION-specific checks ────────────────────────────────────
        if (/^\s*EXPRESSION\s*>>/i.test(code)) {
            // Extract the argument part (everything after `>>`)
            const argPart = code.replace(/^\s*EXPRESSION\s*>>\s*/i, '');

            // 3a. String comparison function mixed with && / || (CSMSCRIPT007)
            //     Manual warning: "字符串比较表达式与算术运算符表达式不能混用"
            const STRING_COMPARISON_PATTERN = /\b(?:equal|match|start_with|end_with|contain|belong)_?s?\s*\(/i;
            if (STRING_COMPARISON_PATTERN.test(argPart) && /&&|\|\|/.test(argPart)) {
                const range = new vscode.Range(i, 0, i, code.length);
                const diag = new vscode.Diagnostic(
                    range,
                    'String comparison function (equal/match/…) cannot be mixed with logical operators (&& / ||) in a single EXPRESSION',
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = 'CSMSCRIPT007';
                diag.source = 'csmscript';
                diagnostics.push(diag);
            }

            // 3b. rnd() function — not supported by muparser (CSMSCRIPT008)
            //     Manual warning: "muparser 声明支持的 rnd() 函数无法正常使用"
            if (/\brnd\s*\(/.test(argPart)) {
                const rndIdx = code.search(/\brnd\s*\(/);
                const range = new vscode.Range(i, rndIdx >= 0 ? rndIdx : 0, i, code.length);
                const diag = new vscode.Diagnostic(
                    range,
                    "'rnd()' is not supported in EXPRESSION (muparser limitation); use RANDOM or RANDOM(DBL) instead",
                    vscode.DiagnosticSeverity.Warning,
                );
                diag.code = 'CSMSCRIPT008';
                diag.source = 'csmscript';
                diagnostics.push(diag);
            }
        }

        // ── 4. Control-flow and include tags ─────────────────────────────────
        if (colStart < 0) { continue; } // blank line

        const keyword = extractLeadingTagKeyword(trimmedCode);
        if (keyword === null) { continue; }

        const tagLen = leadingTagLength(trimmedCode);
        const tagRange = new vscode.Range(i, colStart, i, colStart + tagLen);

        if (OPEN_TAG_KEYWORDS.has(keyword)) {
            stack.push({ keyword, range: tagRange });

        } else if (keyword in CLOSE_TAG_MAP) {
            const expectedOpen = CLOSE_TAG_MAP[keyword];
            if (stack.length === 0 || stack[stack.length - 1].keyword !== expectedOpen) {
                const diag = new vscode.Diagnostic(
                    tagRange,
                    stack.length === 0
                        ? `'<${keyword}>' without a matching '<${expectedOpen}>'`
                        : `'<${keyword}>' does not match '<${stack[stack.length - 1].keyword}>'`,
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = 'CSMSCRIPT002';
                diag.source = 'csmscript';
                diagnostics.push(diag);
            } else {
                stack.pop();
            }

        } else if (keyword === 'else') {
            if (stack.length === 0 || stack[stack.length - 1].keyword !== 'if') {
                const diag = new vscode.Diagnostic(
                    tagRange,
                    `'<else>' without a matching '<if>'`,
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = 'CSMSCRIPT003';
                diag.source = 'csmscript';
                diagnostics.push(diag);
            }

        } else if (keyword === 'include') {
            // <include> or <include   > without a file path
            if (/^<include\s*>/.test(trimmedCode)) {
                const diag = new vscode.Diagnostic(
                    tagRange,
                    `'<include>' is missing a file path`,
                    vscode.DiagnosticSeverity.Warning,
                );
                diag.code = 'CSMSCRIPT005';
                diag.source = 'csmscript';
                diagnostics.push(diag);
            }
        }
    }

    // ── 5. Unclosed open tags (still on the stack) ───────────────────────────
    for (const frame of stack) {
        const diag = new vscode.Diagnostic(
            frame.range,
            `'<${frame.keyword}>' has no matching '<end_${frame.keyword}>'`,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = 'CSMSCRIPT001';
        diag.source = 'csmscript';
        diagnostics.push(diag);
    }

    return diagnostics;
}

// ---------------------------------------------------------------------------
// Collection update helper
// ---------------------------------------------------------------------------

/**
 * Update the diagnostic collection for the given document.
 * No-ops for non-CSMScript documents (but clears any stale diagnostics).
 */
export function updateDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
): void {
    if (document.languageId !== 'csmscript') {
        collection.delete(document.uri);
        return;
    }
    collection.set(document.uri, analyzeDiagnostics(document));
}
