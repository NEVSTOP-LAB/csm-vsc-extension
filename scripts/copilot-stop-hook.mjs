import { spawnSync } from 'child_process';
import path from 'path';
import { clearSessionMarker, emitJson, readHookInput, readSessionMarker } from './copilot-hook-state.mjs';

const root = process.cwd();

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
    const marker = readSessionMarker(hookInput?.sessionId);
    if (!marker) {
        emitJson({ continue: true });
        return;
    }

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
        clearSessionMarker(hookInput?.sessionId);
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
            systemMessage: `Local finish hook still failing during repeated stop attempt after ${marker.toolName ?? 'a code edit'}. Allowing stop to avoid an infinite loop. ${reason}`,
        });
        return;
    }

    emitJson({
        continue: true,
        systemMessage: `Local finish hook failed after ${marker.toolName ?? 'a code edit'}: ${reason}`,
        hookSpecificOutput: {
            hookEventName: 'Stop',
            decision: 'block',
            reason: `Local finish hook failed after ${marker.toolName ?? 'a code edit'}. Fix the compile/load problem before ending. ${reason}`,
        },
    });
}

main();