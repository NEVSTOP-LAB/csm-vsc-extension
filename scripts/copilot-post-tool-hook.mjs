import { emitJson, readHookInput, writeSessionMarker } from './copilot-hook-state.mjs';

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
	if (!hookInput || typeof hookInput !== 'object') {
		return false;
	}
	return typeof hookInput.tool_name === 'string' && EDITING_TOOL_NAMES.has(hookInput.tool_name);
}

function main() {
	const hookInput = readHookInput();
	if (!shouldTrackToolUse(hookInput) || typeof hookInput?.sessionId !== 'string' || !hookInput.sessionId.trim()) {
		emitJson({ continue: true });
		return;
	}

	writeSessionMarker(hookInput.sessionId, {
		sessionId: hookInput.sessionId,
		hookEventName: hookInput.hookEventName,
		toolName: hookInput.tool_name,
		timestamp: typeof hookInput.timestamp === 'string' ? hookInput.timestamp : new Date().toISOString(),
	});
	emitJson({ continue: true });
}

main();