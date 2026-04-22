/**
 * setup.ts
 * Mocha --require setup: patches Module._resolveFilename so that
 * require('vscode') is redirected to our local vscode-mock module,
 * allowing hoverProvider.ts to be tested without a VS Code process.
 */

const Module = require('module') as typeof import('module') & {
    _resolveFilename: (request: string, ...args: unknown[]) => string;
};

const mockPath = require.resolve('./vscode-mock');
const original = Module._resolveFilename.bind(Module);

Module._resolveFilename = function (request: string, ...args: unknown[]): string {
    if (request === 'vscode') { return mockPath; }
    return original(request, ...args);
};
