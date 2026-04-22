import * as vscode from 'vscode';
import { parseFlowGraph } from './flowParser';
import { generateMermaidDiagram } from './mermaidGenerator';
import { parseSwimlaneGraph } from './swimlaneParser';
import { generateSwimlaneDiagram } from './swimlaneGenerator';

/**
 * Escapes HTML special characters for safe embedding in HTML content.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Manages the webview panel for CSMScript flow visualization.
 */
export class FlowVisualizationPanel {
    public static currentPanel: FlowVisualizationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _sourceDocument: vscode.TextDocument | undefined;
    private _lastRenderedUri: string | undefined;
    private _lastRenderedVersion: number | undefined;
    /** Current diagram mode: flowchart or swimlane sequence diagram. */
    private _viewMode: 'flow' | 'swimlane' = 'flow';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sourceDocument?: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._sourceDocument = sourceDocument;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    let targetDocument: vscode.TextDocument | undefined;

                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && activeEditor.document.languageId === 'csmscript') {
                        targetDocument = activeEditor.document;
                        this._sourceDocument = activeEditor.document;
                    } else {
                        targetDocument = this._sourceDocument;
                    }

                    if (targetDocument &&
                        this._lastRenderedUri === targetDocument.uri.toString() &&
                        this._lastRenderedVersion === targetDocument.version) {
                        return;
                    }
                    this._update();
                }
            },
            null,
            this._disposables,
        );

        // Update when the active editor changes (e.g., switching to another CSMScript file)
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                if (this._panel.visible && editor && editor.document.languageId === 'csmscript') {
                    // Skip re-render if same document and version haven't changed
                    if (this._lastRenderedUri === editor.document.uri.toString() &&
                        this._lastRenderedVersion === editor.document.version) {
                        return;
                    }
                    this._sourceDocument = editor.document;
                    this._update();
                }
            },
            null,
            this._disposables,
        );

        // Update when the document content changes (live editing)
        vscode.workspace.onDidChangeTextDocument(
            event => {
                if (this._panel.visible && this._sourceDocument && event.document === this._sourceDocument) {
                    this._update();
                }
            },
            null,
            this._disposables,
        );

        // Scroll preview to cursor position when selection changes in the source document
        vscode.window.onDidChangeTextEditorSelection(
            (event) => {
                if (this._panel.visible && this._sourceDocument &&
                    event.textEditor.document === this._sourceDocument &&
                    event.selections.length > 0) {
                    const line = event.selections[0].active.line;
                    this._panel.webview.postMessage({ command: 'scrollToLine', line });
                }
            },
            null,
            this._disposables,
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message: { command: string; view?: string; text?: string; line?: number }) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text ?? '');
                        return;
                    case 'switchView':
                        if (message.view === 'swimlane' || message.view === 'flow') {
                            this._viewMode = message.view;
                            this._update();
                        }
                        return;
                    case 'refresh':
                        this._lastRenderedUri = undefined;
                        this._lastRenderedVersion = undefined;
                        this._update();
                        return;
                    case 'openSourceFile':
                        if (this._sourceDocument) {
                            vscode.window.showTextDocument(this._sourceDocument, {
                                viewColumn: vscode.ViewColumn.One,
                                preserveFocus: false,
                                preview: false
                            });
                        }
                        return;
                    case 'goToLine':
                        if (this._sourceDocument && typeof message.line === 'number') {
                            const line = message.line;
                            if (Number.isInteger(line) && line >= 0 && line < this._sourceDocument.lineCount) {
                                const range = new vscode.Range(line, 0, line, 0);
                                vscode.window.showTextDocument(this._sourceDocument, {
                                    viewColumn: vscode.ViewColumn.One,
                                    preserveFocus: false,
                                    preview: false,
                                    selection: range,
                                });
                            }
                        }
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    /**
     * Creates or shows the flow visualization panel.
     * Opens side-by-side like markdown preview.
     */
    public static createOrShow(extensionUri: vscode.Uri) {
        // Always open to the side (like markdown preview)
        const column = vscode.ViewColumn.Beside;

        // Get the current CSMScript document
        const editor = vscode.window.activeTextEditor;
        const sourceDoc = editor && editor.document.languageId === 'csmscript' ? editor.document : undefined;

        // If we already have a panel, reveal it in the beside column
        if (FlowVisualizationPanel.currentPanel) {
            FlowVisualizationPanel.currentPanel._panel.reveal(column, true); // Preserve focus on editor
            if (sourceDoc) {
                // Skip re-render if same document and version haven't changed
                const current = FlowVisualizationPanel.currentPanel;
                if (current._lastRenderedUri === sourceDoc.uri.toString() &&
                    current._lastRenderedVersion === sourceDoc.version) {
                    return;
                }
                FlowVisualizationPanel.currentPanel._sourceDocument = sourceDoc;
            }
            FlowVisualizationPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel in the beside column
        const panel = vscode.window.createWebviewPanel(
            'csmscriptFlowVisualization',
            'CSMScript Flow',
            { viewColumn: column, preserveFocus: true },
            {
                // Enable javascript in the webview
                enableScripts: true,

                // Restrict the webview to only loading content from our extension's directory
                localResourceRoots: [extensionUri],

                // Retain context when hidden
                retainContextWhenHidden: true,
            },
        );

        const flowPanel = new FlowVisualizationPanel(panel, extensionUri, sourceDoc);
        FlowVisualizationPanel.currentPanel = flowPanel;
    }

    /**
     * Disposes the panel.
     */
    public dispose() {
        FlowVisualizationPanel.currentPanel = undefined;
        this._panel.dispose();
        for (let i = this._disposables.length - 1; i >= 0; i--) {
            this._disposables[i].dispose();
        }
        this._disposables.length = 0;
    }

    /**
     * Updates the webview content.
     */
    private _update() {
        const webview = this._panel.webview;

        // Use the tracked source document
        if (!this._sourceDocument) {
            // Try to get from active editor if we don't have a source document yet
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'csmscript') {
                this._sourceDocument = editor.document;
            } else {
                this._panel.webview.html = this._getErrorHtml('No CSMScript file is currently open');
                return;
            }
        }

        let mermaidCode: string;
        let nodeLineMap: Record<string, number> = {};

        if (this._viewMode === 'swimlane') {
            // Generate Mermaid sequence/swimlane diagram
            const swimlaneGraph = parseSwimlaneGraph(this._sourceDocument);
            mermaidCode = generateSwimlaneDiagram(swimlaneGraph);
            // Build line map from swimlane elements for cursor-based scrolling
            for (const element of swimlaneGraph.elements) {
                if (element.kind === 'message') {
                    const key = `msg_${element.message.lineNumber}`;
                    nodeLineMap[key] = element.message.lineNumber;
                } else if (element.kind === 'control') {
                    const key = `ctrl_${element.control.lineNumber}`;
                    nodeLineMap[key] = element.control.lineNumber;
                }
            }
        } else {
            // Parse the flow graph
            const flowGraph = parseFlowGraph(this._sourceDocument);
            // Generate Mermaid flowchart
            mermaidCode = generateMermaidDiagram(flowGraph);
            // Build node-to-line mapping for cursor-based scrolling
            for (const node of flowGraph.nodes) {
                nodeLineMap[node.id] = node.lineNumber;
            }
        }

        // Track the rendered document to avoid unnecessary re-renders
        this._lastRenderedUri = this._sourceDocument.uri.toString();
        this._lastRenderedVersion = this._sourceDocument.version;

        // Update the webview
        this._panel.webview.html = this._getHtmlForWebview(webview, mermaidCode, nodeLineMap, this._viewMode);
    }

    /**
     * Gets the HTML content for the webview when there's an error.
     */
    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSMScript Flow Visualization</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .error {
            color: var(--vscode-errorForeground);
            padding: 10px;
            border: 1px solid var(--vscode-errorBorder);
            border-radius: 4px;
            background-color: var(--vscode-inputValidation-errorBackground);
        }
    </style>
</head>
<body>
    <div class="error">
        <h3>Error</h3>
        <p>${message}</p>
    </div>
</body>
</html>`;
    }

    /**
     * Gets the HTML content for the webview.
     *
     * HTML structure, CSS and JS are split into separate files under media/
     * to avoid template-string escaping issues that previously broke the
     * collapsible sections (top-level `await` in a non-module script).
     *
     * Dynamic data is passed to the JS via  window.__WEBVIEW_DATA__  which
     * is set by a small inline <script> before the main JS file loads.
     */
    private _getHtmlForWebview(webview: vscode.Webview, mermaidCode: string, nodeLineMap: Record<string, number>, viewMode: 'flow' | 'swimlane' = 'flow'): string {
        const nonce = getNonce();

        // Escape mermaidCode for display in textarea
        const escapedMermaidCode = escapeHtml(mermaidCode);

        // Embed mermaid code as a JS string, escaping </script to avoid premature termination
        const mermaidCodeJS = JSON
            .stringify(mermaidCode)
            .replace(/<\/script/gi, '<\\/script');

        const nodeLineMapJS = JSON.stringify(nodeLineMap);

        const toggleLabel  = viewMode === 'flow' ? '⇄ Swimlane' : '⇄ Flowchart';
        const toggleTarget = viewMode === 'flow' ? 'swimlane'   : 'flow';
        const diagramTitle = viewMode === 'flow' ? 'Flowchart'  : 'Swimlane';

        const fileName = this._sourceDocument ? vscode.workspace.asRelativePath(this._sourceDocument.uri) : 'Unknown file';
        const escapedFileName = escapeHtml(fileName);

        // Webview-local URIs
        const cssUri     = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'flowVisualization.css'));
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'mermaid.min.js'));
        const jsUri      = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'flowVisualization.js'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';">
    <title>CSMScript Flow Visualization</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <div id="container">
        <!-- Toolbar -->
        <div id="toolbar">
            <div class="toolbar-row" id="address-row">
                <span id="filename-bar">
                    <input id="filename-display" type="text" readonly value="${escapedFileName}" title="${escapedFileName}" />
                    <button id="btn-open-file" title="Open source file" aria-label="Open source file">&#8599;</button>
                </span>
                <button id="btn-refresh" title="Refresh preview" aria-label="Refresh preview">↻ Refresh</button>
            </div>
            <div class="toolbar-row" id="controls-row">
                <div id="controls-left">
                    <span id="zoom-level" aria-live="polite">Zoom: 100%</span>
                    <button id="btn-switch-view">${toggleLabel}</button>
                    <button id="btn-zoom-in">Zoom In</button>
                    <button id="btn-zoom-out">Zoom Out</button>
                    <button id="btn-zoom-100">100%</button>
                    <button id="btn-fit-width">Fit Width</button>
                    <button id="btn-fit-height">Fit Height</button>
                    <button id="btn-fit-both">Fit Both</button>
                    <button id="btn-export-svg">Export SVG</button>
                </div>
                <span id="toolbar-hint">${diagramTitle} | Ctrl+Scroll: Zoom | Drag: Pan | Scroll: Move</span>
            </div>
        </div>

        <!-- Diagram area -->
        <div id="diagram">
            <div id="mermaid-container"></div>
        </div>
        <div id="error" style="display:none;"></div>

        <!-- Collapsible: Raw Mermaid Code -->
        <div class="collapsible-section">
            <div class="collapsible-header" id="raw-mermaid-header">
                <span class="collapsible-toggle" id="raw-mermaid-toggle">&#9654;</span>
                <span class="collapsible-label" id="raw-mermaid-label">Show Raw Mermaid Code</span>
            </div>
            <div class="collapsible-body" id="raw-mermaid-body">
                <div class="raw-mermaid-toolbar">
                    <button id="btn-copy-mermaid">Copy</button>
                </div>
                <textarea class="section-textarea" id="raw-mermaid-textarea" rows="15" readonly>${escapedMermaidCode}</textarea>
            </div>
        </div>

        <!-- Collapsible: Render Log -->
        <div class="collapsible-section">
            <div class="collapsible-header" id="render-log-header">
                <span class="collapsible-toggle" id="render-log-toggle">&#9654;</span>
                <span class="collapsible-label" id="render-log-label">Show Render Log</span>
            </div>
            <div class="collapsible-body" id="render-log-body">
                <textarea class="section-textarea" id="render-log-textarea" rows="12" readonly></textarea>
            </div>
        </div>
    </div>

    <!-- Data bridge: set before external scripts load -->
    <script nonce="${nonce}">
        window.__WEBVIEW_DATA__ = {
            mermaidCode:  ${mermaidCodeJS},
            nodeLineMap:  ${nodeLineMapJS},
            toggleTarget: ${JSON.stringify(toggleTarget)}
        };
    </script>

    <!-- Mermaid library (local bundle) -->
    <script src="${mermaidUri}" nonce="${nonce}"></script>

    <!-- Main webview logic -->
    <script src="${jsUri}" nonce="${nonce}"></script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
