import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { CsmModuleEntry } from './types';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function sanitizeSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function ensureDir(dirUri: vscode.Uri): Promise<void> {
	await vscode.workspace.fs.createDirectory(dirUri);
}

async function replaceAsync(source: string, pattern: RegExp, replacer: (match: RegExpMatchArray) => Promise<string>): Promise<string> {
	const matches = [...source.matchAll(pattern)];
	if (matches.length === 0) {
		return source;
	}
	let result = '';
	let cursor = 0;
	for (const match of matches) {
		const index = match.index ?? 0;
		result += source.slice(cursor, index);
		result += await replacer(match);
		cursor = index + match[0].length;
	}
	result += source.slice(cursor);
	return result;
}

export class ReadmeAssetCache {
	constructor(private readonly storageRoot: vscode.Uri) {}

	public get rootUri(): vscode.Uri {
		return vscode.Uri.joinPath(this.storageRoot, 'module-manager-readme');
	}

	private getEntryDir(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.rootUri, sanitizeSegment(entry.owner), sanitizeSegment(entry.name));
	}

	private getMarkdownUri(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.getEntryDir(entry), 'README.md');
	}

	private getAssetsDir(entry: CsmModuleEntry): vscode.Uri {
		return vscode.Uri.joinPath(this.getEntryDir(entry), 'assets');
	}

	private resolveBaseUrl(entry: CsmModuleEntry): string {
		return `https://raw.githubusercontent.com/${entry.owner}/${entry.name}/${entry.defaultBranch}/`;
	}

	private getCacheKeyUrl(entry: CsmModuleEntry, assetUrl: string): string {
		if (/^https?:\/\//i.test(assetUrl)) {
			return assetUrl;
		}
		return new URL(assetUrl, this.resolveBaseUrl(entry)).toString();
	}

	private async downloadAsset(entry: CsmModuleEntry, assetUrl: string): Promise<vscode.Uri> {
		const resolvedUrl = this.getCacheKeyUrl(entry, assetUrl);
		const hash = crypto.createHash('sha1').update(resolvedUrl).digest('hex');
		const fileName = path.basename(new URL(resolvedUrl).pathname) || 'asset';
		const extension = path.extname(fileName) || '.bin';
		const assetDir = this.getAssetsDir(entry);
		await ensureDir(assetDir);
		const assetUri = vscode.Uri.joinPath(assetDir, `${hash}${extension}`);
		try {
			await vscode.workspace.fs.stat(assetUri);
			return assetUri;
		} catch {
			// Continue to download.
		}
		const response = await fetch(resolvedUrl, {
			headers: {
				'User-Agent': 'csm-vsc-support',
			},
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch readme asset: ${response.status}`);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		await vscode.workspace.fs.writeFile(assetUri, bytes);
		return assetUri;
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

	private async renderInline(entry: CsmModuleEntry, text: string, webview: vscode.Webview): Promise<string> {
		let rendered = escapeHtml(text);

		rendered = await replaceAsync(rendered, /!\[([^\]]*)\]\(([^)]+)\)/g, async (match) => {
			const alt = escapeHtml(match[1] ?? '');
			const source = (match[2] ?? '').trim();
			try {
				const assetUri = await this.downloadAsset(entry, source);
				return `<img alt="${alt}" src="${webview.asWebviewUri(assetUri)}" />`;
			} catch {
				const fallbackUrl = this.getCacheKeyUrl(entry, source);
				return `<img alt="${alt}" src="${escapeHtml(fallbackUrl)}" />`;
			}
		});

		rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, source: string) => {
			const href = source.trim().startsWith('http') ? source.trim() : this.getCacheKeyUrl(entry, source.trim());
			return `<a href="${escapeHtml(href)}">${label}</a>`;
		});

		rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
		rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
		return rendered;
	}

	public async renderMarkdown(entry: CsmModuleEntry, markdown: string, webview: vscode.Webview): Promise<string> {
		await ensureDir(this.getEntryDir(entry));
		const lines = markdown.split(/\r?\n/);
		const blocks: string[] = [];
		let index = 0;

		while (index < lines.length) {
			const line = lines[index] ?? '';
			if (!line.trim()) {
				index += 1;
				continue;
			}

			const codeFence = line.match(/^```(.*)$/);
			if (codeFence) {
				const codeLines: string[] = [];
				index += 1;
				while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
					codeLines.push(lines[index] ?? '');
					index += 1;
				}
				index += 1;
				blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
				continue;
			}

			const heading = line.match(/^(#{1,6})\s+(.*)$/);
			if (heading) {
				const level = heading[1]?.length ?? 1;
				blocks.push(`<h${level}>${await this.renderInline(entry, heading[2] ?? '', webview)}</h${level}>`);
				index += 1;
				continue;
			}

			if (/^\s*[-*+]\s+/.test(line)) {
				const items: string[] = [];
				while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? '')) {
					const itemText = (lines[index] ?? '').replace(/^\s*[-*+]\s+/, '');
					items.push(`<li>${await this.renderInline(entry, itemText, webview)}</li>`);
					index += 1;
				}
				blocks.push(`<ul>${items.join('')}</ul>`);
				continue;
			}

			blocks.push(`<p>${await this.renderInline(entry, line, webview)}</p>`);
			index += 1;
		}

		return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'none';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #e6edf3; background: #0d1117; line-height: 1.6; }
    a { color: #58a6ff; }
    code, pre { background: rgba(110, 118, 129, 0.18); border-radius: 6px; }
    code { padding: 0.1rem 0.35rem; }
    pre { padding: 12px; overflow: auto; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    h1, h2, h3, h4, h5, h6 { margin: 1.25em 0 0.5em; }
    ul { padding-left: 1.4em; }
  </style>
</head>
<body>
${blocks.join('\n')}
</body>
</html>`;
	}
}
