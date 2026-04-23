/**
 * vscode-mock.ts
 * Minimal stub for the vscode API used by standalone csmlog tests
 * (csmlogHoverProvider / csmlogDocumentSymbolProvider / hoverData).
 * Compiled to out/test/vscode-mock.js and used by setup.ts to intercept
 * require('vscode') during standalone Mocha runs.
 */

export class MarkdownString {
    value = '';
    isTrusted = false;
    supportHtml = false;
    constructor(value?: string) { if (value) { this.value = value; } }
    appendMarkdown(text: string): this { this.value += text; return this; }
    appendText(text: string): this { this.value += text; return this; }
}

export class Hover {
    constructor(public contents: any) {}
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    File = 16,
    Reference = 17,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
}

export class SnippetString {
    constructor(public value: string) {}
}

export class CompletionItem {
    detail?: string;
    documentation?: MarkdownString | string;
    insertText?: SnippetString | string;
    filterText?: string;
    range?: Range;
    constructor(
        public label: string,
        public kind?: CompletionItemKind,
    ) {}
}

export class CompletionList {
    constructor(
        public items: CompletionItem[] = [],
        public isIncomplete = false,
    ) {}
}

// ---------------------------------------------------------------------------
// Diagnostics stubs
// ---------------------------------------------------------------------------

export class Position {
    constructor(public line: number, public character: number) {}
}

export class Range {
    start: Position;
    end: Position;
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
        this.start = new Position(startLine, startChar);
        this.end = new Position(endLine, endChar);
    }
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    source?: string;
    code?: string | number;
    constructor(
        public range: Range,
        public message: string,
        public severity: DiagnosticSeverity,
    ) {}
}

// ---------------------------------------------------------------------------
// Formatting stubs
// ---------------------------------------------------------------------------

export class TextEdit {
    constructor(
        public range: Range,
        public newText: string,
    ) {}

    static replace(range: Range, newText: string): TextEdit {
        return new TextEdit(range, newText);
    }
}

// ---------------------------------------------------------------------------
// Document symbol stubs
// ---------------------------------------------------------------------------

export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}

export class DocumentSymbol {
    children: DocumentSymbol[] = [];
    constructor(
        public name: string,
        public detail: string,
        public kind: SymbolKind,
        public range: Range,
        public selectionRange: Range,
    ) {}
}
