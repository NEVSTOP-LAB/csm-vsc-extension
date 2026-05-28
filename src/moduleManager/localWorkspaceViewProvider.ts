import * as vscode from 'vscode';
import { SidebarWorkspaceContext } from './interfaces';
import { renderLocalWorkspaceViewHtml } from './moduleSidebarHtml';
import { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from './types';

interface LocalWorkspaceViewActions {
    onInitializeWorkspace: () => void;
    onOpenReadme: (entry: CsmModuleEntry) => void;
    onRemoveModule: (entry: CsmModuleEntry) => void;
    onUpdateModule: (entry: CsmModuleEntry) => void;
    onCreateLocalRepository: (entry: LocalUnmanagedFolderEntry) => void;
}

type WebviewMessage = {
    type: 'initializeWorkspace' | 'openLocalReadme' | 'removeLocalModule' | 'updateLocalModule' | 'createLocalRepository';
    localItemId?: string;
};

export class LocalWorkspaceViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;
    private signedIn = false;
    private canInitializeWorkspace = false;
    private managedModules: LocalManagedModuleEntry[] = [];
    private unmanagedFolders: LocalUnmanagedFolderEntry[] = [];
    private readonly managedModulesById = new Map<string, LocalManagedModuleEntry>();
    private readonly unmanagedFoldersById = new Map<string, LocalUnmanagedFolderEntry>();
    private workspaceLabel: string | undefined;
    private moduleRoot: string | undefined;

    constructor(private readonly actions: LocalWorkspaceViewActions) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.onDidReceiveMessage((message: unknown) => {
            void this.handleMessage(message);
        });
        this.updateDescription();
        this.render();
    }

    public setAuthenticated(signedIn: boolean): void {
        this.signedIn = signedIn;
        this.render();
    }

    public setCanInitializeWorkspace(canInitializeWorkspace: boolean): void {
        this.canInitializeWorkspace = canInitializeWorkspace;
        this.render();
    }

    public setWorkspaceContext(context: SidebarWorkspaceContext): void {
        this.workspaceLabel = context.workspaceLabel;
        this.moduleRoot = context.moduleRoot;
        this.managedModules = context.managedModules ?? [];
        this.unmanagedFolders = context.unmanagedFolders ?? [];
        this.managedModulesById.clear();
        for (const entry of this.managedModules) {
            this.managedModulesById.set(entry.id, entry);
        }
        this.unmanagedFoldersById.clear();
        for (const entry of this.unmanagedFolders) {
            this.unmanagedFoldersById.set(entry.id, entry);
        }
        this.updateDescription();
        this.render();
    }

    private updateDescription(): void {
        if (!this.view) {
            return;
        }
        this.view.description = this.moduleRoot;
    }

    private render(): void {
        if (!this.view) {
            return;
        }
        this.view.webview.html = renderLocalWorkspaceViewHtml({
            signedIn: this.signedIn,
            canInitializeWorkspace: this.canInitializeWorkspace,
            managedModules: this.managedModules,
            unmanagedFolders: this.unmanagedFolders,
            workspaceLabel: this.workspaceLabel,
            moduleRoot: this.moduleRoot,
        });
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!this.isWebviewMessage(message)) {
            return;
        }

        switch (message.type) {
            case 'initializeWorkspace':
                this.actions.onInitializeWorkspace();
                return;
            case 'openLocalReadme': {
                const entry = message.localItemId ? this.managedModulesById.get(message.localItemId) : undefined;
                if (entry) {
                    this.actions.onOpenReadme(entry.moduleEntry);
                }
                return;
            }
            case 'removeLocalModule': {
                const entry = message.localItemId ? this.managedModulesById.get(message.localItemId) : undefined;
                if (entry) {
                    this.actions.onRemoveModule(entry.moduleEntry);
                }
                return;
            }
            case 'updateLocalModule': {
                const entry = message.localItemId ? this.managedModulesById.get(message.localItemId) : undefined;
                if (entry) {
                    this.actions.onUpdateModule(entry.moduleEntry);
                }
                return;
            }
            case 'createLocalRepository': {
                const entry = message.localItemId ? this.unmanagedFoldersById.get(message.localItemId) : undefined;
                if (entry) {
                    this.actions.onCreateLocalRepository(entry);
                }
                return;
            }
        }
    }

    private isWebviewMessage(message: unknown): message is WebviewMessage {
        if (!message || typeof message !== 'object') {
            return false;
        }
        const candidate = message as Partial<WebviewMessage>;
        return typeof candidate.type === 'string';
    }
}