import fs from 'fs';
import path from 'path';
import os from 'os';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

function parseArg(name) {
	const index = process.argv.indexOf(name);
	if (index >= 0 && process.argv[index + 1]) {
		return process.argv[index + 1];
	}
	return undefined;
}

function resolveExtensionsDir() {
	const argDir = parseArg('--extensions-dir');
	if (argDir) {
		return path.resolve(argDir);
	}
	return path.join(os.homedir(), '.vscode', 'extensions');
}

function getTargetVersion() {
	return parseArg('--version') ?? pkg.version;
}

function readDirectories(dirPath) {
	if (!fs.existsSync(dirPath)) {
		return [];
	}
	return fs.readdirSync(dirPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

function main() {
	const publisher = String(pkg.publisher ?? '').toLowerCase();
	const name = String(pkg.name ?? '').toLowerCase();
	if (!publisher || !name) {
		throw new Error('package.json must contain publisher and name for extension verification.');
	}
	const extensionIdPrefix = `${publisher}.${name}-`;
	const targetVersion = getTargetVersion();
	const extensionsDir = resolveExtensionsDir();
	const directories = readDirectories(extensionsDir);

	const matches = directories.filter((entry) => entry.toLowerCase().startsWith(extensionIdPrefix));
	if (matches.length === 0) {
		throw new Error(`No installed extension found for ${publisher}.${name} in ${extensionsDir}`);
	}

	const targetDir = matches.find((entry) => entry.toLowerCase() === `${extensionIdPrefix}${targetVersion}`);
	if (!targetDir) {
		throw new Error(`Installed versions found (${matches.join(', ')}) but target version ${targetVersion} is missing in ${extensionsDir}`);
	}

	console.log(`[verify] Installed extension version confirmed: ${targetDir}`);
}

main();
