import { HoverEntry } from '../types';

/**
 * CSM framework built-in system states. These names appear inside log
 * messages and inside script arguments; lookup is performed both as
 * single-word (e.g. `RESPONSE`) and as upper-case multi-word phrases (e.g.
 * `ASYNC MESSAGE POSTED`) — see `lookupMultiWord` in `contentHover.ts`.
 */
export const SYSTEM_STATE_HOVERS: Record<string, HoverEntry> = {
    'ASYNC MESSAGE POSTED': {
        summary: '`Async Message Posted` — 系统状态：异步消息已发布',
        detail: 'CSM 框架内置状态，表示一条异步消息已成功发布到目标模块的消息队列。',
    },
    'ASYNC RESPONSE': {
        summary: '`Async Response` — 系统状态：收到异步响应',
        detail: 'CSM 框架内置状态，表示收到了之前发出的异步调用的响应消息。',
    },
    'TARGET TIMEOUT ERROR': {
        summary: '`Target Timeout Error` — 系统状态：目标超时错误',
        detail: 'CSM 框架内置状态，表示同步调用（`-@`）等待目标模块响应时超时。',
    },
    'TARGET ERROR': {
        summary: '`Target Error` — 系统状态：目标错误',
        detail: 'CSM 框架内置状态，表示目标模块在处理消息时返回了错误。',
    },
    'CRITICAL ERROR': {
        summary: '`Critical Error` — 系统状态：严重错误',
        detail: 'CSM 框架内置状态，表示发生了严重的、不可恢复的错误。',
    },
    'NO TARGET ERROR': {
        summary: '`No Target Error` — 系统状态：无目标错误',
        detail: 'CSM 框架内置状态，表示消息发送时找不到目标模块。',
    },
    'ERROR HANDLER': {
        summary: '`Error Handler` — 系统状态：错误处理器',
        detail: 'CSM 框架内置状态，用于标识错误处理流程的入口。',
    },
    'RESPONSE': {
        summary: '`Response` — 系统状态：响应',
        detail: 'CSM 框架内置状态，表示收到同步调用或异步调用的响应。',
    },
};

/** Multi-word system state names that need phrase-level matching. */
export const MULTI_WORD_STATES: readonly string[] = [
    'Async Message Posted',
    'Target Timeout Error',
    'No Target Error',
    'Async Response',
    'Target Error',
    'Critical Error',
    'Error Handler',
];
