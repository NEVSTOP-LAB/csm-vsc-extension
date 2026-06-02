import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';

function sanitizeSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function ensureDir(dirUri: vscode.Uri): Promise<void> {
	await vscode.workspace.fs.createDirectory(dirUri);
}

export class ReadmeAssetCache {
	constructor(private readonly storageRoot: vscode.Uri) { }

	public get rootUri(): vscode.Uri {
		return vscode.Uri.joinPath(this.storageRoot, 'module-manager-readme');
	}

	private getEntryDir(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.rootUri, sanitizeSegment(entry.owner), sanitizeSegment(entry.name));
	}

	public getMarkdownUri(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.getEntryDir(entry), 'README.md');
	}

	private getAssetsDir(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.getEntryDir(entry), 'assets');
	}

	public async saveMarkdown(entry: CsmModuleEntry, markdown: string): Promise<void> {
		const markdownUri = this.getMarkdownUri(entry);
		await ensureDir(this.getEntryDir(entry));
		await vscode.workspace.fs.writeFile(markdownUri, Buffer.from(markdown, 'utf8'));
	}

	public async readMarkdown(entry: CsmModuleEntry): Promise<string | undefined> {
		try {
			const bytes = await vscode.workspace.fs.readFile(this.getMarkdownUri(entry));
			return Buffer.from(bytes).toString('utf8');
		} catch {
			return undefined;
		}
	}

}
