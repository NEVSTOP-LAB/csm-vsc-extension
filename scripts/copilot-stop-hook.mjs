/**
 * copilot-stop-hook.mjs
 * Copilot Stop hook：会话结束时自动执行 `npm run compile`（check-types + lint + esbuild）。
 * - 每次 Stop 都编译，不区分是否编辑过代码（PostToolUse 标记机制已移除）。
 * - 编译失败：首次阻止对话结束并回传原因；再次触发（stopHookActive=true）时放行，避免死循环。
 */

import { execFileSync } from 'child_process';
import fs from 'fs';

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
        process.stderr.write(`[hook] Failed to parse hook input: ${error instanceof Error ? error.message : String(error)}\n`);
        return undefined;
    }
}

function emitJson(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function isStopHookActive(hookInput) {
    if (!hookInput || typeof hookInput !== 'object') {
        return false;
    }
    return hookInput.stop_hook_active === true || hookInput.stopHookActive === true;
}

function runCompile(cwd) {
    // Windows 下 npm 为 npm.cmd，经 cmd.exe 执行，避免直接 spawn npm.cmd 报 EINVAL
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run compile'] : ['run', 'compile'];
    const output = execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8', cwd, maxBuffer: 10 * 1024 * 1024 });
    if (output) {
        process.stdout.write(output);
    }
}

function extractFailureDetail(error) {
    const detail = [error?.stderr, error?.stdout].filter(Boolean).join('\n').trim();
    if (!detail) {
        return undefined;
    }
    const lines = detail.split('\n').map((line) => line.trim()).filter(Boolean);
    const tail = lines.slice(-12).join(' ');
    const normalized = tail.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return undefined;
    }
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function toReason(message) {
    const normalized = String(message).replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return 'Compile failed. Check the GitHub Copilot Chat Hooks output channel.';
    }
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function main() {
    const hookInput = readHookInput();
    const cwd = process.cwd();
    try {
        runCompile(cwd);
        emitJson({ continue: true });
    } catch (error) {
        const reason = toReason(extractFailureDetail(error) ?? (error instanceof Error ? error.message : String(error)));
        if (isStopHookActive(hookInput)) {
            emitJson({
                continue: true,
                systemMessage: `Compile still failing during repeated stop attempt. Allowing stop to avoid an infinite loop. ${reason}`,
            });
            return;
        }
        emitJson({
            continue: true,
            systemMessage: `Compile failed before the session could end: ${reason}`,
            hookSpecificOutput: {
                hookEventName: 'Stop',
                decision: 'block',
                reason: `Compile failed. Fix the compile/type-check/lint problems before ending. ${reason}`,
            },
        });
    }
}

main();