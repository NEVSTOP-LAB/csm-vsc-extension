const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		target: 'node14',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}

	// Copy pre-built mermaid.min.js to dist/ for webview local loading
	const mermaidSrc = path.join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
	const mermaidDst = path.join(__dirname, 'dist', 'mermaid.min.js');
	try {
		fs.copyFileSync(mermaidSrc, mermaidDst);
		console.log('[build] copied mermaid.min.js to dist/');
	} catch (err) {
		console.error('[build] FAILED to copy mermaid.min.js:', err.message);
		console.error('[build] Run "npm install" to ensure mermaid is installed.');
		process.exit(1);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
