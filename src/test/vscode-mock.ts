import * as fs from 'fs';
import * as path from 'path';

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

export class Disposable {
    constructor(private readonly callback: () => void = () => {}) {}
    dispose(): void {
        this.callback();
    }
}

export class TreeView<T> extends Disposable {
    public selection: readonly T[] = [];
}

class MockWebview {
    private messageListeners: Array<(message: unknown) => void> = [];
    private webviewHtml = '';
    public readonly cspSource = 'vscode-resource:';
    public options: { enableScripts?: boolean } = {};
    constructor(private readonly onHtmlChange: (html: string) => void) {}
    asWebviewUri(uri: Uri): Uri {
        return uri;
    }
    onDidReceiveMessage(listener: (message: unknown) => void): Disposable {
        this.messageListeners.push(listener);
        return new Disposable(() => {
            this.messageListeners = this.messageListeners.filter((item) => item !== listener);
        });
    }
    async postMessage(_message: unknown): Promise<boolean> {
        return true;
    }
    get html(): string {
        return this.webviewHtml;
    }
    set html(value: string) {
        this.webviewHtml = value;
        this.onHtmlChange(value);
    }
    __fireMessage(message: unknown): void {
        for (const listener of this.messageListeners) {
            listener(message);
        }
    }
}

class MockWebviewView {
    public readonly webview: MockWebview;
    constructor(onHtmlChange: (html: string) => void) {
        this.webview = new MockWebview(onHtmlChange);
    }
}

export class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    public readonly event = (listener: (value: T) => void): Disposable => {
        this.listeners.push(listener);
        return new Disposable(() => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        });
    };
    fire(value: T): void {
        for (const listener of this.listeners) {
            listener(value);
        }
    }
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class ThemeIcon {
    constructor(public id: string) {}
}

export class TreeItem {
    description?: string;
    tooltip?: MarkdownString | string;
    contextValue?: string;
    command?: { command: string; title: string; arguments?: unknown[] };
    iconPath?: ThemeIcon;
    constructor(
        public label: string,
        public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
    ) {}
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
}

export class Uri {
    constructor(public readonly fsPath: string) {}
    static joinPath(base: Uri, ...segments: string[]): Uri {
        return new Uri(path.join(base.fsPath, ...segments));
    }
    static file(fsPath: string): Uri {
        return new Uri(fsPath);
    }
    toString(): string {
        return this.fsPath;
    }
}

export class RelativePattern {
    constructor(
        public readonly baseUri: Uri | { uri: Uri },
        public readonly pattern: string,
    ) {}
}

type MessageLevel = 'info' | 'warn' | 'error';

const messageLog: Array<{ level: MessageLevel; text: string }> = [];
let warningResponse: string | undefined;
let informationResponse: unknown;
let quickPickResponse: unknown;
let inputBoxResponse: string | undefined;
let findFilesResult: Uri[] = [];
let findFilesResultByPattern = new Map<string, Uri[]>();
let workspaceFoldersState: Array<{ name: string; uri: Uri }> | undefined;
let configurationValues = new Map<string, unknown>();
let contextValues = new Map<string, unknown>();
let lastWebviewPanel: { title: string; html: string } | undefined;
let lastWebviewView: { viewId: string; html: string } | undefined;

const webviewViewProviders = new Map<string, { resolveWebviewView: (webviewView: unknown, context: unknown, token: unknown) => void }>();
const webviewViews = new Map<string, MockWebviewView>();

const commandMap = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
        commandMap.set(command, callback);
        return new Disposable(() => commandMap.delete(command));
    },
    async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
        if (command === 'setContext') {
            const [key, value] = args;
            if (typeof key === 'string') {
                contextValues.set(key, value);
            }
            return undefined;
        }
        const handler = commandMap.get(command);
        if (!handler) {
            return undefined;
        }
        return handler(...args);
    },
};

export const window = {
    registerTreeDataProvider: () => new Disposable(),
    createTreeView: <T>(_viewId: string, _options: unknown) => new TreeView<T>(),
    registerWebviewViewProvider: (viewId: string, provider: { resolveWebviewView: (webviewView: unknown, context: unknown, token: unknown) => void }) => {
        webviewViewProviders.set(viewId, provider);
        return new Disposable(() => {
            webviewViewProviders.delete(viewId);
            webviewViews.delete(viewId);
        });
    },
    createWebviewPanel: (_viewType: string, title: string, _column: ViewColumn, _options: unknown) => {
        let webviewHtml = '';
        return {
            webview: {
                cspSource: 'vscode-resource:',
                asWebviewUri: (uri: Uri) => uri,
                get html(): string {
                    return webviewHtml;
                },
                set html(value: string) {
                    webviewHtml = value;
                    lastWebviewPanel = {
                        title,
                        html: value,
                    };
                },
            },
        };
    },
    async showWarningMessage(message: string, ..._items: unknown[]): Promise<string | undefined> {
        messageLog.push({ level: 'warn', text: message });
        return warningResponse;
    },
    async showInformationMessage(message: string, ...items: unknown[]): Promise<unknown> {
        messageLog.push({ level: 'info', text: message });
        return items.length > 0 ? informationResponse : undefined;
    },
    async showErrorMessage(message: string): Promise<void> {
        messageLog.push({ level: 'error', text: message });
    },
    async showQuickPick<T>(_items: readonly T[] | Promise<readonly T[]>, _options?: unknown): Promise<T | undefined> {
        return quickPickResponse as T | undefined;
    },
    async showInputBox(_options?: unknown): Promise<string | undefined> {
        return inputBoxResponse;
    },
    async showTextDocument(): Promise<void> {
        return;
    },
    createOutputChannel(_name: string, _options?: unknown): {
        appendLine: (value: string) => void;
        append: (value: string) => void;
        clear: () => void;
        dispose: () => void;
        replace: (value: string) => void;
        show: () => void;
        hide: () => void;
        name: string;
        info: (message: string, ...args: unknown[]) => void;
        warn: (message: string, ...args: unknown[]) => void;
        error: (message: string | Error, ...args: unknown[]) => void;
        debug: (message: string, ...args: unknown[]) => void;
        trace: (message: string, ...args: unknown[]) => void;
    } {
        return {
            name: _name,
            appendLine: () => {},
            append: () => {},
            clear: () => {},
            dispose: () => {},
            replace: () => {},
            show: () => {},
            hide: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
            trace: () => {},
        };
    },
    activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
};

export const workspace = {
    workspaceFolders: workspaceFoldersState as Array<{ name: string; uri: Uri }> | undefined,
    getConfiguration(section?: string): { get: <T>(key: string, defaultValue?: T) => T } {
        return {
            get<T>(key: string, defaultValue?: T): T {
                const fullKey = section ? `${section}.${key}` : key;
                return configurationValues.has(fullKey)
                    ? configurationValues.get(fullKey) as T
                    : defaultValue as T;
            },
        };
    },
    fs: {
        async createDirectory(uri: Uri): Promise<void> {
            fs.mkdirSync(uri.toString(), { recursive: true });
        },
        async writeFile(uri: Uri, data: Uint8Array): Promise<void> {
            fs.mkdirSync(path.dirname(uri.toString()), { recursive: true });
            fs.writeFileSync(uri.toString(), Buffer.from(data));
        },
        async readFile(uri: Uri): Promise<Uint8Array> {
            return fs.readFileSync(uri.toString());
        },
        async stat(uri: Uri): Promise<unknown> {
            return fs.statSync(uri.toString());
        },
    },
    async findFiles(_include: unknown, _exclude?: unknown, _maxResults?: number): Promise<Uri[]> {
        const pattern = typeof _include === 'object' && _include !== null && 'pattern' in _include
            ? String((_include as { pattern: unknown }).pattern)
            : undefined;
        if (pattern && findFilesResultByPattern.has(pattern)) {
            return [...(findFilesResultByPattern.get(pattern) ?? [])];
        }
        return [...findFilesResult];
    },
    getWorkspaceFolder(uri: Uri): { name: string; uri: Uri } | undefined {
        return workspace.workspaceFolders?.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath));
    },
    async openTextDocument(options: { language: string; content: string }): Promise<{ uri: { toString: () => string }; getText: () => string; languageId: string }> {
        return {
            uri: { toString: () => 'untitled:mock-readme.md' },
            getText: () => options.content,
            languageId: options.language,
        };
    },
};

export function __getMessageLog(): Array<{ level: MessageLevel; text: string }> {
    return [...messageLog];
}

export function __resetMessageLog(): void {
    messageLog.length = 0;
}

export function __setWarningMessageResponse(response: string | undefined): void {
    warningResponse = response;
}

export function __setInformationMessageResponse(response: unknown): void {
    informationResponse = response;
}

export function __setQuickPickResponse(response: unknown): void {
    quickPickResponse = response;
}

export function __setInputBoxResponse(response: string | undefined): void {
    inputBoxResponse = response;
}

export function __setFindFilesResult(result: Uri[]): void {
    findFilesResult = [...result];
}

export function __setFindFilesResultForPattern(pattern: string, result: Uri[]): void {
    findFilesResultByPattern.set(pattern, [...result]);
}

export function __setWorkspaceFolders(folders: Array<{ name: string; uri: Uri }> | undefined): void {
    workspaceFoldersState = folders;
    workspace.workspaceFolders = folders;
}

export function __setConfigurationValue(key: string, value: unknown): void {
    configurationValues.set(key, value);
}

export function __getContextValue(key: string): unknown {
    return contextValues.get(key);
}

export function __getLastWebviewPanel(): { title: string; html: string } | undefined {
    return lastWebviewPanel ? { ...lastWebviewPanel } : undefined;
}

export function __resolveWebviewView(viewId: string): { html: string; fireMessage: (message: unknown) => void } | undefined {
    const provider = webviewViewProviders.get(viewId);
    if (!provider) {
        return undefined;
    }

    const view = new MockWebviewView((html: string) => {
        lastWebviewView = { viewId, html };
    });
    webviewViews.set(viewId, view);
    provider.resolveWebviewView(view as unknown, {} as unknown, {} as unknown);

    return {
        html: view.webview.html,
        fireMessage: (message: unknown) => {
            view.webview.__fireMessage(message);
        },
    };
}

export function __getLastWebviewView(): { viewId: string; html: string } | undefined {
    return lastWebviewView ? { ...lastWebviewView } : undefined;
}

export function __resetUiState(): void {
    warningResponse = undefined;
    informationResponse = undefined;
    quickPickResponse = undefined;
    inputBoxResponse = undefined;
    findFilesResult = [];
    findFilesResultByPattern = new Map<string, Uri[]>();
    workspaceFoldersState = undefined;
    configurationValues = new Map<string, unknown>();
    contextValues = new Map<string, unknown>();
    lastWebviewPanel = undefined;
    lastWebviewView = undefined;
    webviewViewProviders.clear();
    webviewViews.clear();
    workspace.workspaceFolders = undefined;
    window.activeTextEditor = undefined;
}

// ---------------------------------------------------------------------------
// Authentication stubs
// ---------------------------------------------------------------------------

type GetSessionFn = (providerId: string, scopes: string[], options: { createIfNone: boolean }) => Promise<unknown>;

let getSessionImpl: GetSessionFn = async () => undefined;

export const authentication = {
    async getSession(providerId: string, scopes: string[], options: { createIfNone: boolean }): Promise<unknown> {
        return getSessionImpl(providerId, scopes, options);
    },
};

export function __setAuthenticationGetSession(handler: GetSessionFn): void {
    getSessionImpl = handler;
}

export function __resetAuthenticationGetSession(): void {
    getSessionImpl = async () => undefined;
}
