import { emitJson, getHookEventName, getHookSessionId, getHookTimestamp, getHookToolName, readHookInput, writeSessionMarker } from './copilot-hook-state.mjs';

const EDITING_TOOL_NAMES = new Set([
    'apply_patch',
    'create_file',
    'delete_file',
    'edit_notebook_file',
    'editFiles',
    'rename_file',
    'replace_string_in_file',
    'vscode_renameSymbol',
]);

function shouldTrackToolUse(hookInput) {
    const toolName = getHookToolName(hookInput);
    return typeof toolName === 'string' && EDITING_TOOL_NAMES.has(toolName);
}

function main() {
    const hookInput = readHookInput();
    const sessionId = getHookSessionId(hookInput);
    const toolName = getHookToolName(hookInput);
    if (!shouldTrackToolUse(hookInput) || !sessionId || !toolName) {
        emitJson({ continue: true });
        return;
    }

    writeSessionMarker(sessionId, {
        sessionId,
        hookEventName: getHookEventName(hookInput),
        toolName,
        timestamp: getHookTimestamp(hookInput) ?? new Date().toISOString(),
    });
    emitJson({ continue: true });
}

main();