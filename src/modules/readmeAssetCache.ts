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

	/**
	 * 生成模块在 GitHub raw 上的基础 URL，用于将相对路径图片重写为绝对路径。
	 */
	private resolveBaseUrl(entry: CsmModuleEntry): string {
		return `https://raw.githubusercontent.com/${entry.owner}/${entry.name}/${entry.defaultBranch}/`;
	}

	/**
	 * 将 markdown 中的相对路径图片 URL 重写为 GitHub raw 绝对路径。
	 * 处理两种格式：
	 * - Markdown: ![alt](url)
	 * - HTML: <img src="url" ...>
	 * 已经是绝对 URL（http/https）的不做处理。
	 */
	private rewriteImageUrls(entry: CsmModuleEntry, markdown: string): string {
		const baseUrl = this.resolveBaseUrl(entry);

		// 处理 Markdown 图片: ![alt](url)
		let result = markdown.replace(
			/!\[([^\]]*)\]\(([^)]+)\)/g,
			(_match: string, alt: string, url: string) => {
				const trimmed = url.trim();
				if (/^https?:\/\//i.test(trimmed)) {
					return `![${alt}](${trimmed})`;
				}
				try {
					const resolved = new URL(trimmed, baseUrl).toString();
					return `![${alt}](${resolved})`;
				} catch {
					return `![${alt}](${trimmed})`;
				}
			},
		);

		// 处理 HTML img 标签: <img ... src="url" ...>
		result = result.replace(
			/<img\b([^>]*?)src\s*=\s*("([^"]*)"|'([^']*)')([^>]*)>/gi,
			(_match: string, before: string, _quoted: string, doubleSrc?: string, singleSrc?: string, after?: string) => {
				const src = (doubleSrc ?? singleSrc ?? '').trim();
				if (/^https?:\/\//i.test(src)) {
					return `<img${before}src="${src}"${after ?? ''}>`;
				}
				try {
					const resolved = new URL(src, baseUrl).toString();
					return `<img${before}src="${resolved}"${after ?? ''}>`;
				} catch {
					return `<img${before}src="${src}"${after ?? ''}>`;
				}
			},
		);

		return result;
	}

	public async saveMarkdown(entry: CsmModuleEntry, markdown: string): Promise<void> {
		const rewritten = this.rewriteImageUrls(entry, markdown);
		const markdownUri = this.getMarkdownUri(entry);
		await ensureDir(this.getEntryDir(entry));
		await vscode.workspace.fs.writeFile(markdownUri, Buffer.from(rewritten, 'utf8'));
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
