/**
 * Minimal interface describing the document properties used by parsers.
 * Accepts both a real vscode.TextDocument and lightweight test stubs.
 */
export interface TextDocumentLike {
    readonly lineCount: number;
    lineAt(line: number): { readonly text: string };
}
