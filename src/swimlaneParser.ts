import { TextDocumentLike } from './types';

/**
 * Type of inter-module communication message in a CSMScript swimlane.
 */
export type MessageType =
    | 'sync'               // -@  synchronous call
    | 'async'              // ->  async call (awaits response)
    | 'fire-forget'        // ->| fire-and-forget (no response)
    | 'subscribe'          // -><register>
    | 'subscribe-interrupt'// -><register as interrupt>
    | 'subscribe-status'   // -><register as status>
    | 'unsubscribe';       // -><unregister>

/**
 * A single inter-module communication message extracted from a CSMScript line.
 */
export interface SwimlaneMessage {
    type: MessageType;
    /** Source participant (usually 'Engine'). */
    from: string;
    /** Target participant or module name. */
    to: string;
    /** Display label for the message (the API call part of the instruction). */
    label: string;
    /** Optional return-value name(s), e.g. from `=> bootCode`. */
    returnLabel?: string;
    /** Optional condition for conditional return value usage. */
    returnCondition?: string;
    /** 0-based line number in the source document. */
    lineNumber: number;
}

/**
 * Control flow structure in swimlane.
 */
export interface SwimlaneControlFlow {
    type: 'if' | 'else' | 'end_if' | 'while' | 'end_while' | 'foreach' | 'end_foreach' | 'do_while' | 'end_do_while';
    /** Condition expression for if/while/foreach/do_while. */
    condition?: string;
    /** 0-based line number in the source document. */
    lineNumber: number;
}

/**
 * A swimlane element: either a message or control flow structure.
 */
export type SwimlaneElement =
    | { kind: 'message'; message: SwimlaneMessage }
    | { kind: 'control'; control: SwimlaneControlFlow };

/**
 * The parsed swimlane graph: an ordered list of participants, messages, and control flow.
 */
export interface SwimlaneGraph {
    /** Ordered participant list — 'Engine' is always first. */
    participants: string[];
    /** List of swimlane elements (messages and control flow structures). */
    elements: SwimlaneElement[];
    /** Map of COMMAND_ALIAS definitions for expansion. */
    commandAliases: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip a trailing `//` line comment. */
function stripComment(text: string): string {
    const idx = text.indexOf('//');
    return idx >= 0 ? text.substring(0, idx) : text;
}

/** Return true when a trimmed line looks like `[SECTION_NAME]`. */
function isSectionHeader(line: string): boolean {
    return /^\[.+\]$/.test(line);
}

/** Parse control flow tag from a line. */
function parseControlFlowTag(line: string): SwimlaneControlFlow | null {
    const trimmed = line.trim();

    // <if condition>
    const ifMatch = trimmed.match(/^<if\s+(.+)>$/i);
    if (ifMatch) {
        return { type: 'if', condition: ifMatch[1].trim(), lineNumber: 0 };
    }

    // <else>
    if (/^<else>$/i.test(trimmed)) {
        return { type: 'else', lineNumber: 0 };
    }

    // <end_if>
    if (/^<end_if>$/i.test(trimmed)) {
        return { type: 'end_if', lineNumber: 0 };
    }

    // <while condition>
    const whileMatch = trimmed.match(/^<while\s+(.+)>$/i);
    if (whileMatch) {
        return { type: 'while', condition: whileMatch[1].trim(), lineNumber: 0 };
    }

    // <end_while>
    if (/^<end_while>$/i.test(trimmed)) {
        return { type: 'end_while', lineNumber: 0 };
    }

    // <foreach var in list>
    const foreachMatch = trimmed.match(/^<foreach\s+(.+)>$/i);
    if (foreachMatch) {
        return { type: 'foreach', condition: foreachMatch[1].trim(), lineNumber: 0 };
    }

    // <end_foreach>
    if (/^<end_foreach>$/i.test(trimmed)) {
        return { type: 'end_foreach', lineNumber: 0 };
    }

    // <do_while>
    if (/^<do_while>$/i.test(trimmed)) {
        return { type: 'do_while', lineNumber: 0 };
    }

    // <end_do_while condition>
    const endDoWhileMatch = trimmed.match(/^<end_do_while\s+(.+)>$/i);
    if (endDoWhileMatch) {
        return { type: 'end_do_while', condition: endDoWhileMatch[1].trim(), lineNumber: 0 };
    }

    return null;
}

/** Return true when a trimmed line is a plain anchor definition, e.g. `<entry>`. */
function isAnchor(line: string): boolean {
    return /^<[A-Za-z][A-Za-z0-9_-]*>$/.test(line);
}

/**
 * Extract the label for a message arrow: everything in `code` to the left of
 * the first occurrence of `operator`, trimmed.
 */
function extractLabel(code: string, operator: string): string {
    const idx = code.indexOf(operator);
    return idx >= 0 ? code.substring(0, idx).trim() : code.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a CSMScript document and extract the inter-module communication
 * messages needed to render a swimlane (sequence) diagram.
 * Now includes control flow structures and COMMAND_ALIAS expansion.
 */
export function parseSwimlaneGraph(document: TextDocumentLike): SwimlaneGraph {
    const elements: SwimlaneElement[] = [];
    /** Preserves insertion order so Engine always comes first. */
    const participantOrder: string[] = [];
    const participantSet = new Set<string>();
    const commandAliases = new Map<string, string>();

    const ENGINE = 'Engine';
    participantOrder.push(ENGINE);
    participantSet.add(ENGINE);

    const addParticipant = (name: string) => {
        if (name && !participantSet.has(name)) {
            participantSet.add(name);
            participantOrder.push(name);
        }
    };

    // First pass: collect COMMAND_ALIAS definitions
    let scanningCommandAlias = false;
    for (let i = 0; i < document.lineCount; i++) {
        const rawText = document.lineAt(i).text;
        const code = stripComment(rawText).trim();

        if (!code) { continue; }

        if (isSectionHeader(code)) {
            const sectionName = code.slice(1, -1).trim();
            scanningCommandAlias = sectionName === 'COMMAND_ALIAS';
            continue;
        }

        if (scanningCommandAlias && !isAnchor(code)) {
            // Parse COMMAND_ALIAS definition: AliasName = actual command
            const aliasMatch = code.match(/^(\w+)\s*=\s*(.+)$/);
            if (aliasMatch) {
                const aliasName = aliasMatch[1].trim();
                const aliasValue = aliasMatch[2].trim();
                commandAliases.set(aliasName, aliasValue);
            }
        }

        if (isAnchor(code)) {
            scanningCommandAlias = false;
        }
    }

    // Second pass: parse messages and control flow
    let inSkippableSection = false;
    let inCommandAliasSection = false;
    for (let i = 0; i < document.lineCount; i++) {
        const rawText = document.lineAt(i).text;
        let code = stripComment(rawText).trim();

        if (!code) { continue; }

        if (isSectionHeader(code)) {
            const sectionName = code.slice(1, -1).trim();
            // Skip PREDEF sections except COMMAND_ALIAS
            inSkippableSection = ['AUTO_ERROR_HANDLE', 'INI_VAR_SPACE', 'TAGDB_VAR_SPACE', 'PREDEF'].includes(sectionName);
            inCommandAliasSection = sectionName === 'COMMAND_ALIAS';
            continue;
        }

        if (inSkippableSection && !isAnchor(code)) {
            continue;
        }

        if (inCommandAliasSection && !isAnchor(code)) {
            // Skip COMMAND_ALIAS definition lines in second pass
            continue;
        }

        // Check for control flow tags
        const controlFlow = parseControlFlowTag(code);
        if (controlFlow) {
            controlFlow.lineNumber = i;
            elements.push({ kind: 'control', control: controlFlow });
            continue;
        }

        if (isAnchor(code)) {
            inSkippableSection = false;
            inCommandAliasSection = false;
            continue;
        }

        // Expand COMMAND_ALIAS if this line is just an alias name
        if (commandAliases.has(code)) {
            code = commandAliases.get(code)!;
        }

        // ------------------------------------------------------------------
        // 1. Subscription / unsubscription:
        //    EventName@SourceModule >> API: Handler -><register[...]>
        //    EventName@SourceModule >> API: Handler -><unregister>
        // ------------------------------------------------------------------
        const subMatch = code.match(
            /^(.+?)@(\w[\w-]*)\s*>>\s*(.+?)\s*-><(register(?:\s+as\s+\w+)?|unregister)>/i
        );
        if (subMatch) {
            const eventName   = subMatch[1].trim();
            const sourceModule = subMatch[2].trim();
            const handler     = subMatch[3].trim();
            const regKind     = subMatch[4].toLowerCase();

            addParticipant(sourceModule);

            let msgType: MessageType;
            let label: string;
            if (regKind.includes('interrupt')) {
                msgType = 'subscribe-interrupt';
                label   = `[subscribe-interrupt] ${eventName} → ${handler}`;
            } else if (regKind.includes('status')) {
                msgType = 'subscribe-status';
                label   = `[subscribe-status] ${eventName} → ${handler}`;
            } else if (regKind === 'unregister') {
                msgType = 'unsubscribe';
                label   = `[unsubscribe] ${eventName}`;
            } else {
                msgType = 'subscribe';
                label   = `[subscribe] ${eventName} → ${handler}`;
            }

            elements.push({
                kind: 'message',
                message: { type: msgType, from: ENGINE, to: sourceModule, label, lineNumber: i }
            });
            continue;
        }

        // ------------------------------------------------------------------
        // 2. Fire-and-forget:  ... ->| ModuleName
        //    Must be checked BEFORE the generic `->` pattern.
        // ------------------------------------------------------------------
        const ffMatch = code.match(/->[\|]\s*(\w[\w-]*)\s*$/);
        if (ffMatch) {
            const module = ffMatch[1].trim();
            const label  = extractLabel(code, '->|');
            addParticipant(module);
            elements.push({
                kind: 'message',
                message: { type: 'fire-forget', from: ENGINE, to: module, label, lineNumber: i }
            });
            continue;
        }

        // ------------------------------------------------------------------
        // 3. Sync call:  ... -@ ModuleName  [=> result]
        // ------------------------------------------------------------------
        const syncMatch = code.match(/-@\s*(\w[\w-]*)\s*(?:=>\s*(.+))?$/);
        if (syncMatch) {
            const module = syncMatch[1].trim();
            const result = syncMatch[2]?.trim();
            const label  = extractLabel(code, '-@');
            addParticipant(module);
            elements.push({
                kind: 'message',
                message: { type: 'sync', from: ENGINE, to: module, label, returnLabel: result, lineNumber: i }
            });
            continue;
        }

        // ------------------------------------------------------------------
        // 4. Async call:  ... -> ModuleName  [=> result]
        // ------------------------------------------------------------------
        const asyncMatch = code.match(/->\s*(\w[\w-]*)\s*(?:=>\s*(.+))?$/);
        if (asyncMatch) {
            const module = asyncMatch[1].trim();
            const result = asyncMatch[2]?.trim();
            const label  = extractLabel(code, '->');
            addParticipant(module);
            elements.push({
                kind: 'message',
                message: { type: 'async', from: ENGINE, to: module, label, returnLabel: result, lineNumber: i }
            });
            continue;
        }
    }

    return {
        participants: participantOrder,
        elements,
        commandAliases,
    };
}
