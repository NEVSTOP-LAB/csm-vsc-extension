import * as vscode from 'vscode';

/**
 * A single hover entry: short summary header + optional markdown body.
 *
 * Entries are stored in plain objects keyed by an upper-case canonical token
 * (or an exact operator string). Lookup callers normalise the source text
 * before reading from the database.
 */
export interface HoverEntry {
    /** Short one-line summary shown as the bold header. */
    summary: string;
    /** Full markdown body (optional). */
    detail?: string;
}

/**
 * Build a `vscode.Hover` from a `HoverEntry`.
 *
 * The output is a single `MarkdownString` that pairs the summary line with
 * an `---` separator and the detail body when present. Hovers are rendered
 * with `isTrusted = false` and `supportHtml = false`: hover content is
 * authored in this repository and never embeds user-supplied data, so we
 * intentionally refuse command-link execution and HTML.
 */
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
