import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();

function readHookInput() {
    if (process.stdin.isTTY) {
        return undefined;
    }
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) {
        return undefined;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        process.stderr.write(`[hook] Failed to parse Stop hook input: ${error instanceof Error ? error.message : String(error)}\n`);
        return undefined;
    }
}

function emitJson(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function toReason(message) {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return 'Local finish hook failed. Check the GitHub Copilot Chat Hooks output channel.';
    }
    return normalized.length > 220
        ? `${normalized.slice(0, 217)}...`
        : normalized;
}

function main() {
    const hookInput = readHookInput();
    const nodeCommand = process.execPath;
    const scriptPath = path.join(root, 'scripts', 'local-finish-hook.mjs');
    const result = spawnSync(nodeCommand, [scriptPath, '--stop-hook'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.stdout) {
        process.stderr.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    if (result.status === 0) {
        emitJson({ continue: true });
        return;
    }

    const failureText = [result.stderr, result.stdout]
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .join('\n');
    const reason = toReason(failureText || `Local finish hook exited with code ${result.status ?? 'unknown'}.`);
    if (hookInput?.stop_hook_active) {
        emitJson({
            continue: true,
            systemMessage: `Local finish hook still failing during repeated stop attempt. Allowing stop to avoid an infinite loop. ${reason}`,
        });
        return;
    }

    emitJson({
        continue: true,
        systemMessage: `Local finish hook failed: ${reason}`,
        hookSpecificOutput: {
            hookEventName: 'Stop',
            decision: 'block',
            reason: `Local finish hook failed. Fix the compile/load problem before ending. ${reason}`,
        },
    });
}

main();