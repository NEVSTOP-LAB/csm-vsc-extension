import fs from 'fs';
import os from 'os';
import path from 'path';

function getStateRoot() {
    const configured = process.env.CSM_COPILOT_HOOK_STATE_DIR?.trim();
    return configured
        ? path.resolve(configured)
        : path.join(os.tmpdir(), 'csm-copilot-hook-state');
}

function sanitizeSessionId(sessionId) {
    return sessionId.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function readHookInput() {
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
        process.stderr.write(`[hook] Failed to parse hook input: ${error instanceof Error ? error.message : String(error)}\n`);
        return undefined;
    }
}

export function emitJson(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function getHookStringField(hookInput, fieldNames) {
    if (!hookInput || typeof hookInput !== 'object') {
        return undefined;
    }
    for (const fieldName of fieldNames) {
        const value = hookInput[fieldName];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

function normalizeToolName(toolName) {
    if (typeof toolName !== 'string') {
        return undefined;
    }
    const trimmed = toolName.trim();
    if (!trimmed) {
        return undefined;
    }
    const segments = trimmed.split(/[./\\:]/).filter(Boolean);
    return (segments.length > 0 ? segments[segments.length - 1] : trimmed).trim() || undefined;
}

export function getHookSessionId(hookInput) {
    return getHookStringField(hookInput, ['sessionId', 'session_id', 'sessionID']);
}

export function getHookEventName(hookInput) {
    return getHookStringField(hookInput, ['hookEventName', 'hook_event_name', 'eventName']);
}

export function getHookToolName(hookInput) {
    const direct = getHookStringField(hookInput, ['tool_name', 'toolName', 'tool']);
    if (direct) {
        return normalizeToolName(direct);
    }
    const nestedTool = hookInput?.toolCall?.tool_name ?? hookInput?.toolCall?.toolName;
    return normalizeToolName(typeof nestedTool === 'string' ? nestedTool : undefined);
}

export function getHookTimestamp(hookInput) {
    return getHookStringField(hookInput, ['timestamp', 'time']);
}

export function isStopHookActive(hookInput) {
    if (!hookInput || typeof hookInput !== 'object') {
        return false;
    }
    return hookInput.stop_hook_active === true || hookInput.stopHookActive === true;
}

export function getSessionMarkerPath(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
        return undefined;
    }
    return path.join(getStateRoot(), `${sanitizeSessionId(sessionId.trim())}.json`);
}

export function readSessionMarker(sessionId) {
    const markerPath = getSessionMarkerPath(sessionId);
    if (!markerPath || !fs.existsSync(markerPath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch (error) {
        process.stderr.write(`[hook] Failed to read session marker ${markerPath}: ${error instanceof Error ? error.message : String(error)}\n`);
        return undefined;
    }
}

export function writeSessionMarker(sessionId, payload) {
    const markerPath = getSessionMarkerPath(sessionId);
    if (!markerPath) {
        return undefined;
    }
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return markerPath;
}

export function clearSessionMarker(sessionId) {
    const markerPath = getSessionMarkerPath(sessionId);
    if (!markerPath) {
        return;
    }
    try {
        fs.rmSync(markerPath, { force: true });
    } catch (error) {
        process.stderr.write(`[hook] Failed to clear session marker ${markerPath}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
}