import type { TextDocumentLike } from './types';
export type { TextDocumentLike } from './types';

/**
 * Represents a node in the CSMScript flow graph.
 */
export interface FlowNode {
    id: string;
    label: string;
    type: 'block' | 'condition' | 'anchor' | 'start' | 'end' | 'if_start' | 'while_start' | 'foreach_start' | 'do_while_start' | 'if_end' | 'while_end' | 'foreach_end' | 'do_while_end' | 'predef' | 'goto' | 'include';
    styleClass?: 'conditionalAction';
    lineNumber: number;
}

/**
 * Represents an edge (transition) in the CSMScript flow graph.
 */
export interface FlowEdge {
    from: string;
    to: string;
    label?: string;
    style?: 'yes' | 'no' | 'conditional-exec' | 'contrast-solid';
    dashed?: boolean;    // For GOTO jumps
    invisible?: boolean; // Invisible layout-only edge (rendered as ~~~ in Mermaid)
}

/**
 * Represents a visual subgraph grouping for control flow structures.
 */
export interface FlowSubgraph {
    id: string;
    label: string;
    direction?: 'TB' | 'LR';
    nodeIds: string[];
    children: FlowSubgraph[];
}

/**
 * Represents the complete flow structure of a CSMScript document.
 */
export interface FlowGraph {
    nodes: FlowNode[];
    edges: FlowEdge[];
    subgraphs: FlowSubgraph[];
}

/**
 * Strip a line comment (`// …`) from a line of text.
 */
function stripComment(text: string): string {
    const idx = text.indexOf('//');
    return idx >= 0 ? text.substring(0, idx) : text;
}

/**
 * Check if a line is a section header like [COMMAND_ALIAS], [PREDEF], etc.
 */
function isSectionHeader(line: string): boolean {
    return /^\[.+\]$/.test(line.trim());
}

/**
 * Check if a line is an anchor definition (e.g., `<entry>`).
 */
function isAnchor(line: string): string | null {
    const trimmed = line.trim();
    const match = trimmed.match(/^<([A-Za-z][A-Za-z0-9_-]*)>$/);
    if (!match) {
        return null;
    }
    const name = match[1].toLowerCase();
    // Exclude control flow keywords
    const reserved = ['if', 'else', 'end_if', 'while', 'end_while', 'do_while', 'end_do_while', 'foreach', 'end_foreach', 'include'];
    return reserved.includes(name) ? null : match[1];
}

/**
 * Check if a line contains a GOTO or JUMP command.
 */
function isGotoLine(line: string): { target: string; conditional: boolean; condition?: string; parameterless?: boolean; prefixStatement?: string } | null {
    const trimmed = line.trim();

    // Inline error conditional with optional statement prefix:
    //   statement ?? goto >> <target>
    // or standalone:
    //   ?? goto >> <target>
    const inlineErrorMatch = trimmed.match(/^(.*?)\s*\?\?\s*(?:goto|GOTO|jump|JUMP)\s*>>\s*<([A-Za-z][A-Za-z0-9_-]*)>$/);
    if (inlineErrorMatch) {
        return {
            target: inlineErrorMatch[2],
            conditional: true,
            condition: '??',
            prefixStatement: inlineErrorMatch[1].trim() || undefined,
        };
    }

    // Inline conditional with optional statement prefix:
    //   statement ?expr? goto >> <target>
    // or standalone:
    //   ?expr? goto >> <target>
    const inlineCondMatch = trimmed.match(/^(.*?)\s*\?([^?]+)\?\s*(?:goto|GOTO|jump|JUMP)\s*>>\s*<([A-Za-z][A-Za-z0-9_-]*)>$/);
    if (inlineCondMatch) {
        return {
            target: inlineCondMatch[3],
            conditional: true,
            condition: inlineCondMatch[2].trim(),
            prefixStatement: inlineCondMatch[1].trim() || undefined,
        };
    }

    // Conditional GOTO: ?expr? goto >> <target>
    const condMatch = trimmed.match(/\?([^?]+)\?\s*(?:goto|GOTO|jump|JUMP)\s*>>\s*<([A-Za-z][A-Za-z0-9_-]*)>/);
    if (condMatch) {
        return { target: condMatch[2], conditional: true, condition: condMatch[1].trim() };
    }

    // Error conditional: ?? goto >> <target>
    const errorMatch = trimmed.match(/\?\?\s*(?:goto|GOTO|jump|JUMP)\s*>>\s*<([A-Za-z][A-Za-z0-9_-]*)>/);
    if (errorMatch) {
        return { target: errorMatch[1], conditional: true, condition: 'error' };
    }

    // Regular GOTO/JUMP
    const gotoMatch = trimmed.match(/(?:GOTO|JUMP)\s*>>\s*<([A-Za-z][A-Za-z0-9_-]*)>/i);
    if (gotoMatch) {
        return { target: gotoMatch[1], conditional: false };
    }

    // Parameterless GOTO/JUMP: goto > or GOTO >
    const parameterlessMatch = trimmed.match(/^(?:goto|GOTO|jump|JUMP)\s*>$/i);
    if (parameterlessMatch) {
        return { target: '', conditional: false, parameterless: true };
    }

    return null;
}

/**
 * Check if a line contains an inline conditional action, e.g.
 *   statement ?expr? other statement
 *   statement ?? other statement
 *   ?expr? other statement
 */
function isInlineConditionalAction(line: string): { condition: string; prefixStatement?: string; actionStatement: string } | null {
    const trimmed = line.trim();

    const inlineErrorMatch = trimmed.match(/^(.*?)\s*\?\?\s*(.+)$/);
    if (inlineErrorMatch) {
        return {
            condition: '??',
            prefixStatement: inlineErrorMatch[1].trim() || undefined,
            actionStatement: inlineErrorMatch[2].trim(),
        };
    }

    const inlineCondMatch = trimmed.match(/^(.*?)\s*\?([^?]+)\?\s*(.+)$/);
    if (inlineCondMatch) {
        return {
            condition: inlineCondMatch[2].trim(),
            prefixStatement: inlineCondMatch[1].trim() || undefined,
            actionStatement: inlineCondMatch[3].trim(),
        };
    }

    return null;
}

/**
 * Check if a line is a control flow tag.
 */
function getControlFlowType(line: string): { type: string; condition?: string } | null {
    const trimmed = line.trim();

    // <if condition>
    const ifMatch = trimmed.match(/^<if\s+(.+)>$/);
    if (ifMatch) {
        return { type: 'if', condition: ifMatch[1] };
    }

    // <while condition>
    const whileMatch = trimmed.match(/^<while\s+(.+)>$/);
    if (whileMatch) {
        return { type: 'while', condition: whileMatch[1] };
    }

    // <foreach var in list>
    const foreachMatch = trimmed.match(/^<foreach\s+(\w+)\s+in\s+(.+)>$/);
    if (foreachMatch) {
        return { type: 'foreach', condition: `${foreachMatch[1]} in ${foreachMatch[2]}` };
    }

    // <do_while>
    if (trimmed.match(/^<do_while>$/)) {
        return { type: 'do_while' };
    }

    // <end_do_while condition>
    const endDoWhileMatch = trimmed.match(/^<end_do_while\s+(.+)>$/);
    if (endDoWhileMatch) {
        return { type: 'end_do_while', condition: endDoWhileMatch[1] };
    }

    // Other closing tags
    if (trimmed.match(/^<else>$/)) {
        return { type: 'else' };
    }
    if (trimmed.match(/^<end_if>$/)) {
        return { type: 'end_if' };
    }
    if (trimmed.match(/^<end_while>$/)) {
        return { type: 'end_while' };
    }
    if (trimmed.match(/^<end_foreach>$/)) {
        return { type: 'end_foreach' };
    }

    return null;
}

/**
 * Parse a CSMScript document and extract its flow graph structure.
 *
 * New approach (as requested):
 * 1. Ignore comments and empty lines
 * 2. Group PREDEF sections together as first block
 * 3. while/foreach/do_while are loops -> convert to loop Mermaid syntax
 * 4. if/else/end_if -> convert to conditional Mermaid syntax
 * 5. Other statements separated by comments/empty lines/GOTO form blocks
 * 6. GOTO uses dashed lines to jump to specified anchor
 */
export function parseFlowGraph(document: TextDocumentLike): FlowGraph {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const subgraphs: FlowSubgraph[] = [];
    const anchorMap = new Map<string, string>(); // anchor name -> node ID

    let nodeCounter = 0;
    let includeCounter = 1;
    let subgraphCounter = 0;
    let previousNodeId: string | null = null;
    let additionalPreviousIds: string[] = [];
    /** Label to apply to the next edge created by connectToPrevious (consumed once used). */
    let nextEdgeLabel: string | undefined;
    /** Dashed style to apply to the next edge created by connectToPrevious (consumed once used). */
    let nextEdgeDashed: boolean | undefined;
    /** Visual style to apply to the next edge created by connectToPrevious (consumed once used). */
    let nextEdgeStyle: FlowEdge['style'] | undefined;

    /**
     * Create edges from all pending previous nodes to the target node,
     * then clear the additional list.
     */
    const connectToPrevious = (targetId: string, edgeProps?: { label?: string; dashed?: boolean; style?: FlowEdge['style'] }) => {
        // Use explicit edgeProps.label if provided, otherwise consume nextEdgeLabel
        const label = edgeProps?.label ?? nextEdgeLabel;
        const labelWasConsumed = !edgeProps?.label && nextEdgeLabel !== undefined;

        // Use explicit edgeProps.dashed if provided, otherwise consume nextEdgeDashed
        const dashed = edgeProps?.dashed ?? nextEdgeDashed;
        const dashedWasConsumed = edgeProps?.dashed === undefined && nextEdgeDashed !== undefined;
        const style = edgeProps?.style ?? nextEdgeStyle;
        const styleWasConsumed = edgeProps?.style === undefined && nextEdgeStyle !== undefined;

        // Clear consumed values
        if (labelWasConsumed) {
            nextEdgeLabel = undefined;
        }
        if (dashedWasConsumed) {
            nextEdgeDashed = undefined;
        }
        if (styleWasConsumed) {
            nextEdgeStyle = undefined;
        }

        const baseProps = dashed ? { dashed: true } : {};
        if (previousNodeId) {
            edges.push({ from: previousNodeId, to: targetId, ...baseProps, ...(label ? { label } : {}), ...(style ? { style } : {}) });
        }
        for (const id of additionalPreviousIds) {
            edges.push({ from: id, to: targetId, ...baseProps, ...(label ? { label } : {}), ...(style ? { style } : {}) });
        }
        additionalPreviousIds = [];
    };

    /**
     * Register a node ID with the current (innermost) control flow context.
     */
    const registerNode = (nodeId: string) => {
        if (controlFlowStack.length > 0) {
            controlFlowStack[controlFlowStack.length - 1].nodeIds.push(nodeId);
        }
    };

    /**
     * Create a subgraph from a completed control flow context and attach it
     * to the parent context or the top-level subgraphs list.
     */
    const createSubgraph = (
        label: string,
        nodeIds: string[],
        children: FlowSubgraph[],
        direction: 'TB' | 'LR' = 'TB',
    ): string => {
        const sg: FlowSubgraph = {
            id: `sg_${subgraphCounter++}`,
            label,
            direction,
            nodeIds,
            children,
        };
        if (controlFlowStack.length > 0) {
            controlFlowStack[controlFlowStack.length - 1].children.push(sg);
        } else {
            subgraphs.push(sg);
        }
        return sg.id;
    };

    // Collect all lines and group them
    const lines: Array<{ text: string; lineNumber: number }> = [];
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        const code = stripComment(lineText).trim();
        if (code.length > 0) {
            lines.push({ text: code, lineNumber: i });
        }
    }

    // First pass: collect all PREDEF sections
    const predefLines: string[] = [];
    let predefFirstLineNumber = -1;
    const nonPredefLines: Array<{ text: string; lineNumber: number }> = [];
    let inPredefSection = false;

    for (const line of lines) {
        if (isSectionHeader(line.text)) {
            const sectionName = line.text.slice(1, -1).trim();
            inPredefSection = ['COMMAND_ALIAS', 'AUTO_ERROR_HANDLE', 'INI_VAR_SPACE', 'TAGDB_VAR_SPACE', 'PREDEF'].includes(sectionName);
            if (inPredefSection) {
                if (predefFirstLineNumber === -1) {
                    predefFirstLineNumber = line.lineNumber;
                }
                predefLines.push(line.text);
            } else {
                nonPredefLines.push(line);
                inPredefSection = false; // Stop collecting predef
            }
        } else if (inPredefSection) {
            // Check if this line starts a new section (like an anchor)
            if (isAnchor(line.text)) {
                // This is an anchor, not part of predef section
                inPredefSection = false;
                nonPredefLines.push(line);
            } else {
                if (predefFirstLineNumber === -1) {
                    predefFirstLineNumber = line.lineNumber;
                }
                predefLines.push(line.text);
            }
        } else {
            nonPredefLines.push(line);
        }
    }

    // Create PREDEF block before Start node if we have any
    if (predefLines.length > 0) {
        const predefId = `node_${nodeCounter++}`;
        nodes.push({
            id: predefId,
            label: predefLines.join('\n'),
            type: 'predef',
            lineNumber: predefFirstLineNumber,
        });
        // No previous node yet, so just set it as the current node
        previousNodeId = predefId;
    }

    // Add start node (use 'start1' to avoid Mermaid reserved keyword 'start')
    const startId = 'start1';
    nodes.push({
        id: startId,
        label: 'Start',
        type: 'start',
        lineNumber: 0,
    });
    connectToPrevious(startId);
    previousNodeId = startId;

    // Second pass: process remaining lines
    let currentBlock: string[] = [];
    let currentBlockStartLine = 0;
    let currentBlockLastLine = -1;
    const controlFlowStack: Array<{
        type: string;
        conditionNodeId: string;
        blockStartNodeId?: string;
        loopStartNodeId?: string;
        ifStartNodeId?: string;
        nodeIds: string[];
        children: FlowSubgraph[];
        subgraphLabel: string;
    }> = [];

    const flushCurrentBlock = () => {
        if (currentBlock.length > 0) {
            const blockId = `node_${nodeCounter++}`;
            const label = currentBlock.join('\n');
            nodes.push({
                id: blockId,
                label: label,
                type: 'block',
                lineNumber: currentBlockStartLine,
            });

            connectToPrevious(blockId);
            registerNode(blockId);

            previousNodeId = blockId;
            currentBlock = [];
            currentBlockLastLine = -1;
        }
    };

    for (let i = 0; i < nonPredefLines.length; i++) {
        const { text: code, lineNumber } = nonPredefLines[i];

        // Check if it's an anchor
        const anchorName = isAnchor(code);
        if (anchorName) {
            flushCurrentBlock();

            const anchorId = `anchor_${anchorName}`;
            anchorMap.set(anchorName, anchorId);
            nodes.push({
                id: anchorId,
                label: `<${anchorName}>`,
                type: 'anchor',
                lineNumber: lineNumber,
            });

            connectToPrevious(anchorId);
            registerNode(anchorId);

            previousNodeId = anchorId;
            continue;
        }

        // Check for GOTO
        const gotoInfo = isGotoLine(code);
        if (gotoInfo) {
            flushCurrentBlock();
            const inlineConditionalGroupNodeIds: string[] = [];
            const shouldGroupInlineConditional = !!(gotoInfo.prefixStatement && gotoInfo.conditional);
            const inboundPreviousId = previousNodeId;
            const inboundAdditionalIds = [...additionalPreviousIds];
            const inboundLabel = nextEdgeLabel;
            const inboundDashed = nextEdgeDashed;

            if (shouldGroupInlineConditional) {
                // We will connect inbound/outbound flow via subgraph ID instead of
                // internal nodes, otherwise Mermaid may ignore subgraph LR direction.
                previousNodeId = null;
                additionalPreviousIds = [];
                nextEdgeLabel = undefined;
                nextEdgeDashed = undefined;
                nextEdgeStyle = undefined;
            }

            if (gotoInfo.prefixStatement) {
                const prefixBlockId = `node_${nodeCounter++}`;
                nodes.push({
                    id: prefixBlockId,
                    label: gotoInfo.prefixStatement,
                    type: 'block',
                    lineNumber: lineNumber,
                });

                if (!shouldGroupInlineConditional) {
                    connectToPrevious(prefixBlockId);
                }
                if (shouldGroupInlineConditional) {
                    inlineConditionalGroupNodeIds.push(prefixBlockId);
                } else {
                    registerNode(prefixBlockId);
                }
                previousNodeId = prefixBlockId;
            }

            if (gotoInfo.parameterless) {
                // Parameterless GOTO: create a special goto node
                const gotoId = `goto_${nodeCounter++}`;
                nodes.push({
                    id: gotoId,
                    label: 'goto >',
                    type: 'goto',
                    lineNumber: lineNumber,
                });

                connectToPrevious(gotoId, { dashed: true });
                registerNode(gotoId);
                previousNodeId = gotoId;
                nextEdgeDashed = true; // Next edge from goto node should also be dashed
            } else if (gotoInfo.conditional) {
                // Conditional GOTO creates a condition node followed by a goto node.
                // The "No" branch continues with sequential flow.
                const condId = `cond_${nodeCounter++}`;
                nodes.push({
                    id: condId,
                    label: gotoInfo.condition || 'condition',
                    type: 'condition',
                    lineNumber: lineNumber,
                });

                connectToPrevious(condId);
                if (shouldGroupInlineConditional) {
                    inlineConditionalGroupNodeIds.push(condId);
                } else {
                    registerNode(condId);
                }

                const gotoId = `goto_${nodeCounter++}`;
                nodes.push({
                    id: gotoId,
                    label: `goto >> <${gotoInfo.target}>`,
                    type: 'goto',
                    styleClass: shouldGroupInlineConditional ? 'conditionalAction' : undefined,
                    lineNumber: lineNumber,
                });
                if (shouldGroupInlineConditional) {
                    inlineConditionalGroupNodeIds.push(gotoId);
                } else {
                    registerNode(gotoId);
                }

                if (shouldGroupInlineConditional && inlineConditionalGroupNodeIds.length > 0) {
                    const shortCond = (gotoInfo.condition || 'condition').slice(0, 36);
                    // Internal chain stays inside LR subgraph.
                    edges.push({ from: condId, to: gotoId, dashed: true, style: 'conditional-exec' });

                    const inlineSubgraphId = createSubgraph(
                        `inline goto: ${shortCond}`,
                        inlineConditionalGroupNodeIds,
                        [],
                        'LR',
                    );

                    const baseProps = inboundDashed ? { dashed: true } : {};
                    if (inboundPreviousId) {
                        edges.push({ from: inboundPreviousId, to: inlineSubgraphId, ...baseProps, ...(inboundLabel ? { label: inboundLabel } : {}) });
                    }
                    for (const id of inboundAdditionalIds) {
                        edges.push({ from: id, to: inlineSubgraphId, ...baseProps, ...(inboundLabel ? { label: inboundLabel } : {}) });
                    }

                    // Route both branches via subgraph container so Mermaid keeps LR layout.
                    edges.push({
                        from: inlineSubgraphId,
                        to: `anchor_${gotoInfo.target}`,
                        label: 'Yes',
                        style: 'conditional-exec',
                    });
                    previousNodeId = inlineSubgraphId;
                    nextEdgeLabel = 'No';
                    nextEdgeStyle = 'no';
                } else {
                    edges.push({
                        from: condId,
                        to: gotoId,
                        label: 'Yes',
                        style: 'yes',
                    });
                    edges.push({
                        from: gotoId,
                        to: `anchor_${gotoInfo.target}`,
                        dashed: true,
                    });

                    // No-branch should continue to the next statement.
                    previousNodeId = condId;
                    nextEdgeLabel = 'No';
                    nextEdgeStyle = 'no';
                }
            } else {
                // Regular GOTO/JUMP: always materialize as a standalone goto node
                const gotoId = `goto_${nodeCounter++}`;
                nodes.push({
                    id: gotoId,
                    label: `goto >> <${gotoInfo.target}>`,
                    type: 'goto',
                    lineNumber: lineNumber,
                });

                connectToPrevious(gotoId, { dashed: true });
                registerNode(gotoId);
                edges.push({
                    from: gotoId,
                    to: `anchor_${gotoInfo.target}`,
                    dashed: true,
                });
                previousNodeId = null; // Break flow after an explicit jump
            }
            continue;
        }

        // Check for inline conditional action
        const inlineConditionalAction = isInlineConditionalAction(code);
        if (inlineConditionalAction) {
            flushCurrentBlock();

            const inboundPreviousId = previousNodeId;
            const inboundAdditionalIds = [...additionalPreviousIds];
            const inboundLabel = nextEdgeLabel;
            const inboundDashed = nextEdgeDashed;
            const inlineGroupNodeIds: string[] = [];

            previousNodeId = null;
            additionalPreviousIds = [];
            nextEdgeLabel = undefined;
            nextEdgeDashed = undefined;
            nextEdgeStyle = undefined;

            let prefixBlockId: string | undefined;
            if (inlineConditionalAction.prefixStatement) {
                prefixBlockId = `node_${nodeCounter++}`;
                nodes.push({
                    id: prefixBlockId,
                    label: inlineConditionalAction.prefixStatement,
                    type: 'block',
                    lineNumber,
                });
                inlineGroupNodeIds.push(prefixBlockId);
            }

            const condId = `cond_${nodeCounter++}`;
            nodes.push({
                id: condId,
                label: inlineConditionalAction.condition,
                type: 'condition',
                lineNumber,
            });
            inlineGroupNodeIds.push(condId);

            if (prefixBlockId) {
                edges.push({ from: prefixBlockId, to: condId });
            }

            const actionId = `node_${nodeCounter++}`;
            nodes.push({
                id: actionId,
                label: inlineConditionalAction.actionStatement,
                type: 'block',
                styleClass: 'conditionalAction',
                lineNumber,
            });
            inlineGroupNodeIds.push(actionId);
            edges.push({ from: condId, to: actionId, dashed: true, style: 'conditional-exec' });

            const shortCond = inlineConditionalAction.condition.slice(0, 36);
            const inlineSubgraphId = createSubgraph(
                `inline conditional: ${shortCond}`,
                inlineGroupNodeIds,
                [],
                'LR',
            );

            const baseProps = inboundDashed ? { dashed: true } : {};
            if (inboundPreviousId) {
                edges.push({ from: inboundPreviousId, to: inlineSubgraphId, ...baseProps, ...(inboundLabel ? { label: inboundLabel } : {}) });
            }
            for (const id of inboundAdditionalIds) {
                edges.push({ from: id, to: inlineSubgraphId, ...baseProps, ...(inboundLabel ? { label: inboundLabel } : {}) });
            }

            nextEdgeDashed = false;
            nextEdgeStyle = 'contrast-solid';
            previousNodeId = inlineSubgraphId;
            continue;
        }

        // Check for include tag
        const includeMatch = code.match(/^<include(?:\s+(.+))?>$/i);
        if (includeMatch) {
            flushCurrentBlock();

            const includePath = (includeMatch[1] || '').trim();
            const includeId = `include_${includeCounter++}`;
            nodes.push({
                id: includeId,
                label: includePath ? `include: ${includePath}` : 'include',
                type: 'include',
                lineNumber,
            });

            connectToPrevious(includeId);
            registerNode(includeId);

            previousNodeId = includeId;
            continue;
        }

        // Check for control flow tags
        const controlFlow = getControlFlowType(code);
        if (controlFlow) {
            flushCurrentBlock();

            if (controlFlow.type === 'if') {
                // If node (boundary start)
                const ifStartId = `node_${nodeCounter++}`;
                nodes.push({
                    id: ifStartId,
                    label: 'If',
                    type: 'if_start',
                    lineNumber: lineNumber,
                });
                connectToPrevious(ifStartId);
                registerNode(ifStartId);

                // Condition node
                const condId = `cond_${nodeCounter++}`;
                nodes.push({
                    id: condId,
                    label: controlFlow.condition || controlFlow.type,
                    type: 'condition',
                    lineNumber: lineNumber,
                });
                edges.push({ from: ifStartId, to: condId });

                controlFlowStack.push({
                    type: controlFlow.type,
                    conditionNodeId: condId,
                    ifStartNodeId: ifStartId,
                    nodeIds: [ifStartId, condId],
                    children: [],
                    subgraphLabel: `${controlFlow.type}: ${controlFlow.condition || controlFlow.type}`,
                });
                previousNodeId = condId;
                nextEdgeLabel = 'Yes';

            } else if (controlFlow.type === 'while' || controlFlow.type === 'foreach') {
                // Loop start node - use the control flow type as the label
                const loopStartLabel = controlFlow.type === 'while' ? 'While' : 'Foreach';
                const loopStartType = controlFlow.type === 'while' ? 'while_start' : 'foreach_start';
                const loopStartId = `node_${nodeCounter++}`;
                nodes.push({
                    id: loopStartId,
                    label: loopStartLabel,
                    type: loopStartType,
                    lineNumber: lineNumber,
                });
                connectToPrevious(loopStartId);
                registerNode(loopStartId);

                // Condition node
                const condId = `cond_${nodeCounter++}`;
                nodes.push({
                    id: condId,
                    label: controlFlow.condition || controlFlow.type,
                    type: 'condition',
                    lineNumber: lineNumber,
                });
                edges.push({ from: loopStartId, to: condId });

                controlFlowStack.push({
                    type: controlFlow.type,
                    conditionNodeId: condId,
                    loopStartNodeId: loopStartId,
                    nodeIds: [loopStartId, condId],
                    children: [],
                    subgraphLabel: `${controlFlow.type}: ${controlFlow.condition || controlFlow.type}`,
                });
                previousNodeId = condId;

            } else if (controlFlow.type === 'else') {
                // Else creates a fork
                if (controlFlowStack.length > 0 && controlFlowStack[controlFlowStack.length - 1].type === 'if') {
                    const context = controlFlowStack[controlFlowStack.length - 1];
                    // Save where the if-true block ended
                    context.blockStartNodeId = previousNodeId || undefined;
                    // Continue from condition node for else branch
                    previousNodeId = context.conditionNodeId;
                    nextEdgeLabel = 'No';
                }

            } else if (controlFlow.type === 'end_if') {
                // End of if - add end_if node and merge branches
                if (controlFlowStack.length > 0 && controlFlowStack[controlFlowStack.length - 1].type === 'if') {
                    const context = controlFlowStack.pop()!;

                    // end_if node - all branches merge here
                    const ifEndId = `node_${nodeCounter++}`;
                    nodes.push({
                        id: ifEndId,
                        label: 'end_if',
                        type: 'if_end',
                        lineNumber: lineNumber,
                    });

                    // Connect the current branch (last executed path) to If End
                    if (previousNodeId) {
                        edges.push({ from: previousNodeId, to: ifEndId });
                    }

                    if (context.blockStartNodeId) {
                        // Had an else block: true-branch end also needs to connect to end_if
                        edges.push({ from: context.blockStartNodeId, to: ifEndId });
                    } else {
                        // No else block: condition's false-path connects to end_if with "No" label
                        edges.push({ from: context.conditionNodeId, to: ifEndId, label: 'No' });
                    }

                    context.nodeIds.push(ifEndId);
                    createSubgraph(context.subgraphLabel, context.nodeIds, context.children);
                    previousNodeId = ifEndId;
                    additionalPreviousIds = [];
                }

            } else if (controlFlow.type === 'end_while' || controlFlow.type === 'end_foreach') {
                // End of loop - add back edge to loop_start, add loop_end node
                if (controlFlowStack.length > 0) {
                    const context = controlFlowStack.pop()!;

                    // Save last body node before the loop-back edge so we can use it for layout.
                    // If previousNodeId is the loop-start or condition itself the loop body is empty
                    // and the invisible depth edge is not needed.
                    const lastBodyNodeId =
                        previousNodeId !== context.loopStartNodeId &&
                        previousNodeId !== context.conditionNodeId
                            ? previousNodeId
                            : null;

                    // Loop body end connects back to loop start
                    if (context.loopStartNodeId) {
                        connectToPrevious(context.loopStartNodeId, { label: 'loop' });
                    } else {
                        connectToPrevious(context.conditionNodeId, { label: 'loop' });
                    }

                    // Loop end node - use specific type label
                    const loopEndLabel = controlFlow.type === 'end_while' ? 'end_while' : 'end_foreach';
                    const loopEndType = controlFlow.type === 'end_while' ? 'while_end' : 'foreach_end';
                    const loopEndId = `node_${nodeCounter++}`;
                    nodes.push({
                        id: loopEndId,
                        label: loopEndLabel,
                        type: loopEndType,
                        lineNumber: lineNumber,
                    });
                    edges.push({ from: context.conditionNodeId, to: loopEndId });

                    // Add an invisible layout edge from the last body node to the loop-end
                    // boundary.  Without this, Dagre places loop-end at the same rank as the
                    // first body node (both are one step from the condition), so it appears
                    // side-by-side with the body instead of at the bottom of the subgraph.
                    // The invisible edge forces loop-end to be ranked below all body nodes,
                    // matching the top/bottom boundary behavior of if/end_if and
                    // do_while/end_do_while.
                    if (lastBodyNodeId) {
                        edges.push({ from: lastBodyNodeId, to: loopEndId, invisible: true });
                    }

                    context.nodeIds.push(loopEndId);

                    createSubgraph(context.subgraphLabel, context.nodeIds, context.children);
                    previousNodeId = loopEndId;
                }

            } else if (controlFlow.type === 'do_while') {
                // Start of do-while body - add Do_while node
                const loopStartId = `node_${nodeCounter++}`;
                nodes.push({
                    id: loopStartId,
                    label: 'Do_while',
                    type: 'do_while_start',
                    lineNumber: lineNumber,
                });
                connectToPrevious(loopStartId);
                registerNode(loopStartId);

                controlFlowStack.push({
                    type: 'do_while',
                    conditionNodeId: '', // Will be set at end_do_while
                    loopStartNodeId: loopStartId,
                    blockStartNodeId: loopStartId,
                    nodeIds: [loopStartId],
                    children: [],
                    subgraphLabel: 'do_while',
                });
                previousNodeId = loopStartId;

            } else if (controlFlow.type === 'end_do_while') {
                // End of do-while - create condition, loop back to loop_start, add loop_end
                const condId = `cond_${nodeCounter++}`;
                nodes.push({
                    id: condId,
                    label: controlFlow.condition || 'do_while',
                    type: 'condition',
                    lineNumber: lineNumber,
                });

                connectToPrevious(condId);

                if (controlFlowStack.length > 0) {
                    const context = controlFlowStack.pop()!;
                    context.nodeIds.push(condId);

                    // Loop back edge to loop_start
                    if (context.loopStartNodeId) {
                        edges.push({
                            from: condId,
                            to: context.loopStartNodeId,
                            label: 'loop',
                        });
                    }

                    // end_do_while node
                    const loopEndId = `node_${nodeCounter++}`;
                    nodes.push({
                        id: loopEndId,
                        label: 'end_do_while',
                        type: 'do_while_end',
                        lineNumber: lineNumber,
                    });
                    edges.push({ from: condId, to: loopEndId });
                    context.nodeIds.push(loopEndId);

                    createSubgraph(
                        `do_while: ${controlFlow.condition || 'do_while'}`,
                        context.nodeIds,
                        context.children,
                    );

                    previousNodeId = loopEndId;
                } else {
                    previousNodeId = condId;
                }
            }

            continue;
        }

        // Regular statement - add to current block
        // Split blocks when there are empty lines in the original document
        if (currentBlock.length > 0 && currentBlockLastLine >= 0 && lineNumber > currentBlockLastLine + 1) {
            let hasBlankLine = false;
            for (let ln = currentBlockLastLine + 1; ln < lineNumber; ln++) {
                if (document.lineAt(ln).text.trim().length === 0) {
                    hasBlankLine = true;
                    break;
                }
            }
            if (hasBlankLine) {
                flushCurrentBlock();
            }
        }
        if (currentBlock.length === 0) {
            currentBlockStartLine = lineNumber;
        }
        currentBlock.push(code);
        currentBlockLastLine = lineNumber;
    }

    // Flush any remaining block
    flushCurrentBlock();

    // Add end node (use 'end1' to avoid Mermaid reserved keyword 'end')
    const endId = 'end1';
    nodes.push({
        id: endId,
        label: 'End',
        type: 'end',
        lineNumber: document.lineCount - 1,
    });

    connectToPrevious(endId);

    // Create placeholder nodes for undefined anchors
    const definedAnchors = new Set(anchorMap.values());
    for (const edge of edges) {
        if (edge.to.startsWith('anchor_') && !definedAnchors.has(edge.to)) {
            const anchorName = edge.to.substring(7);
            nodes.push({
                id: edge.to,
                label: `<${anchorName}>\\n(undefined)`,
                type: 'anchor',
                lineNumber: -1,
            });
            definedAnchors.add(edge.to);
        }
    }

    return { nodes, edges, subgraphs };
}
