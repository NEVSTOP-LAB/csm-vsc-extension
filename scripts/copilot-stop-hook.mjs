import { clearSessionMarker, emitJson, getHookSessionId, isStopHookActive, readHookInput, readSessionMarker } from './copilot-hook-state.mjs';
import { compileOnly, getCurrentVersion, installVsix } from './hook-actions.mjs';

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
    const sessionId = getHookSessionId(hookInput);
    const marker = readSessionMarker(sessionId);
    if (!marker) {
        emitJson({ continue: true });
        return;
    }

    const cwd = process.cwd();
    try {
        compileOnly(cwd);
        const version = getCurrentVersion(cwd);
        installVsix(version, cwd);
        clearSessionMarker(sessionId);
        emitJson({ continue: true });
    } catch (error) {
        const failureText = error instanceof Error ? error.message : String(error);
        const reason = toReason(failureText || `Local finish hook exited with an error.`);
        if (isStopHookActive(hookInput)) {
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
}

main();