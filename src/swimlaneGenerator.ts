import { SwimlaneGraph, SwimlaneMessage, SwimlaneControlFlow } from './swimlaneParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a participant name into a safe Mermaid identifier (alphanumeric + _).
 * E.g. "<status>" → "status", "WorkerModule" → "WorkerModule".
 */
function toParticipantId(name: string): string {
    // Strip surrounding <> and replace remaining non-word chars with _
    return name.replace(/^<|>$/g, '').replace(/[^A-Za-z0-9_]/g, '_') || 'unknown';
}

/**
 * Escape characters that break Mermaid sequence-diagram message labels.
 * Only `#` and `"` need special treatment.
 */
function escapeLabel(text: string): string {
    return text
        .replace(/#/g, '#35;')     // escape # (Mermaid HTML-entity prefix)
        .replace(/"/g, '#quot;');  // escape " inside labels
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Mermaid sequenceDiagram from a SwimlaneGraph.
 *
 * Layout rules
 * ─────────────
 * • Engine is always the leftmost participant.
 * • -@  (sync)        → blue rect   Engine->>Module, Module-->>Engine (thick arrows)
 * • ->  (async)       → green rect  Engine-)Module,  Module--)Engine  (medium arrows)
 * • ->| (fire-forget) → orange rect Engine-)Module  (no return, thin arrow)
 * • subscribe/*       → purple rect Engine->>Module (no return arrow)
 * • Control flow structures (if/else, while, foreach, do_while) are rendered using Mermaid directives
 */
export function generateSwimlaneDiagram(graph: SwimlaneGraph): string {
    const lines: string[] = ['sequenceDiagram'];

    // Participant declarations
    for (const name of graph.participants) {
        const id      = toParticipantId(name);
        const display = escapeLabel(name);
        if (id === display) {
            lines.push(`    participant ${id}`);
        } else {
            lines.push(`    participant ${id} as "${display}"`);
        }
    }

    if (graph.elements.length === 0) {
        lines.push('');
        lines.push('    note over Engine: No inter-module communication found');
        return lines.join('\n');
    }

    lines.push('');

    // Track nesting level for proper indentation
    let indentLevel = 0;

    for (const element of graph.elements) {
        if (element.kind === 'control') {
            lines.push(...renderControlFlow(element.control, indentLevel));
            // Adjust indent level
            if (['if', 'while', 'foreach', 'do_while'].includes(element.control.type)) {
                indentLevel++;
            } else if (element.control.type === 'else') {
                // else stays at same level but is a transition
            } else if (['end_if', 'end_while', 'end_foreach', 'end_do_while'].includes(element.control.type)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        } else {
            lines.push(...renderMessage(element.message, indentLevel));
        }
    }

    return lines.join('\n');
}

/** Render a control flow structure into Mermaid sequence diagram syntax.
 *
 * Control flow in Mermaid sequence diagrams:
 *   if    → alt condition / opt condition (for simple if without else)
 *   else  → else
 *   while → loop condition
 *   foreach → loop iteration
 *   do_while → loop (condition at end)
 */
function renderControlFlow(control: SwimlaneControlFlow, indentLevel: number): string[] {
    const lines: string[] = [];
    const indent = '    '.repeat(1 + indentLevel);

    switch (control.type) {
        case 'if':
            // Use 'alt' for if statements (can have else)
            lines.push(`${indent}alt ${escapeLabel(control.condition || 'condition')}`);
            break;

        case 'else':
            lines.push(`${indent}else`);
            break;

        case 'end_if':
            lines.push(`${indent}end`);
            break;

        case 'while':
            lines.push(`${indent}loop while ${escapeLabel(control.condition || 'condition')}`);
            break;

        case 'end_while':
            lines.push(`${indent}end`);
            break;

        case 'foreach':
            lines.push(`${indent}loop ${escapeLabel(control.condition || 'iteration')}`);
            break;

        case 'end_foreach':
            lines.push(`${indent}end`);
            break;

        case 'do_while':
            lines.push(`${indent}loop do-while`);
            break;

        case 'end_do_while':
            // Add note showing the condition at the end
            if (control.condition) {
                lines.push(`${indent}note right of Engine: until ${escapeLabel(control.condition)}`);
            }
            lines.push(`${indent}end`);
            break;
    }

    return lines;
}

/** Render a single SwimlaneMessage into one or two Mermaid sequence lines.
 *
 * Color scheme (via `rect` background blocks):
 *   sync        → rgba(70,130,180,0.15)  steel blue
 *   async       → rgba(60,179,113,0.15)  sea green
 *   fire-forget → rgba(255,140,0,0.15)   dark orange
 *   subscribe/* → rgba(147,112,219,0.15) medium purple
 *
 * Line thickness (via arrow style):
 *   sync        → ->> (solid thick arrow)
 *   async       → -) (open arrow, medium)
 *   fire-forget → -) (open arrow, thin - same as async but no return)
 */
function renderMessage(msg: SwimlaneMessage, indentLevel: number): string[] {
    const from    = toParticipantId(msg.from);
    const to      = toParticipantId(msg.to);
    const label   = escapeLabel(msg.label);
    const lines: string[] = [];
    const indent = '    '.repeat(1 + indentLevel);

    switch (msg.type) {
        case 'sync':
            lines.push(`${indent}rect rgba(70,130,180,0.15)`);
            lines.push(`${indent}    ${from}->>${to}: ${label}`);
            // Only show response if return value exists
            if (msg.returnLabel) {
                const returnText = msg.returnCondition
                    ? `${escapeLabel(msg.returnLabel)} (used in: ${escapeLabel(msg.returnCondition)})`
                    : escapeLabel(msg.returnLabel);
                lines.push(`${indent}    ${to}-->>${from}: ${returnText}`);
            }
            lines.push(`${indent}end`);
            break;

        case 'async':
            lines.push(`${indent}rect rgba(60,179,113,0.15)`);
            lines.push(`${indent}    ${from}-) ${to}: ${label}`);
            // Only show response if return value exists
            if (msg.returnLabel) {
                const returnText = msg.returnCondition
                    ? `${escapeLabel(msg.returnLabel)} (used in: ${escapeLabel(msg.returnCondition)})`
                    : escapeLabel(msg.returnLabel);
                lines.push(`${indent}    ${to}--) ${from}: ${returnText}`);
            }
            lines.push(`${indent}end`);
            break;

        case 'fire-forget':
            lines.push(`${indent}rect rgba(255,140,0,0.15)`);
            lines.push(`${indent}    ${from}-) ${to}: ${label}`);
            lines.push(`${indent}end`);
            break;

        case 'subscribe':
        case 'subscribe-interrupt':
        case 'subscribe-status':
        case 'unsubscribe':
            lines.push(`${indent}rect rgba(147,112,219,0.15)`);
            lines.push(`${indent}    ${from}->>${to}: ${label}`);
            lines.push(`${indent}end`);
            break;

        default:
            lines.push(`${indent}${from}->>${to}: ${label}`);
    }

    return lines;
}
