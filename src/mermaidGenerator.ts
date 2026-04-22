import { FlowGraph, FlowNode, FlowSubgraph } from './flowParser';

/**
 * Shared fill colors for control-flow boundary node pairs.
 * Both the start classDef and the matching end classDef are generated from
 * this single source of truth, so they can never drift apart.
 */
const CONTROL_FLOW_COLORS: Record<string, string> = {
    if:       '#FF9999',
    while:    '#FFB347',
    foreach:  '#77DD77',
    do_while: '#AEC6CF',
};

const BRANCH_EDGE_COLORS = {
    yes: '#2E8B57',
    no: '#C0392B',
} as const;

const CONDITIONAL_EXEC_EDGE_COLOR = '#2E8B57';

const CONDITION_WRAP_WIDTH = 24;
const MIN_WRAP_SEARCH_INDEX = 12;
const PREFERRED_WRAP_TOKENS = [' && ', ' || ', ', ', ' ? ', ' : ', ' and ', ' or '];

function wrapSingleLine(label: string, maxLineLength: number): string {
    let remaining = label.trim();
    const wrappedLines: string[] = [];

    while (remaining.length > maxLineLength) {
        let splitIndex = -1;

        for (const token of PREFERRED_WRAP_TOKENS) {
            const candidate = remaining.lastIndexOf(token, maxLineLength);
            if (candidate >= MIN_WRAP_SEARCH_INDEX) {
                splitIndex = Math.max(splitIndex, candidate + token.length);
            }
        }

        if (splitIndex < 0) {
            const whitespaceIndex = remaining.lastIndexOf(' ', maxLineLength);
            if (whitespaceIndex >= MIN_WRAP_SEARCH_INDEX) {
                splitIndex = whitespaceIndex + 1;
            }
        }

        if (splitIndex < 0) {
            splitIndex = maxLineLength;
        }

        wrappedLines.push(remaining.slice(0, splitIndex).trimEnd());
        remaining = remaining.slice(splitIndex).trimStart();
    }

    if (remaining) {
        wrappedLines.push(remaining);
    }

    return wrappedLines.join('\n');
}

function wrapConditionLabel(label: string): string {
    return label
        .split(/\r?\n/)
        .map(line => wrapSingleLine(line, CONDITION_WRAP_WIDTH))
        .join('\n');
}

/**
 * Escape characters for Mermaid `"..."` quoted labels rendered with `htmlLabels: true`.
 * Since labels are rendered as HTML content inside a `<div>`, we must HTML-escape
 * `&`, `<`, and `>` so that:
 *   - anchor labels like `<entry>` are not swallowed as HTML tags
 *   - `&&` in conditions is not mis-parsed as an HTML entity prefix
 * `{` and `}` are escaped with Mermaid entity syntax (`#123;` / `#125;`) so that
 * variable references like `${var}` in condition labels do not break the diamond
 * `{"..."}` or hexagon `{{"..."}}` shape delimiters.
 * `#` is escaped with Mermaid's own entity syntax, `"` with `#quot;`, and
 * `\n` is converted to a `<br/>` HTML line-break (safe to add after escaping).
 */
function escapeMermaidLabel(label: string): string {
    return label
        .replace(/#/g, '#35;')    // escape # first (Mermaid entity syntax prefix, e.g. #35; #quot; #123;)
        .replace(/&/g, '&amp;')   // escape & before < / > to avoid double-escaping
        .replace(/</g, '&lt;')    // escape < so tags aren't stripped by HTML renderer
        .replace(/>/g, '&gt;')    // escape > for symmetry with <
        .replace(/"/g, '#quot;')  // escape double quotes inside "..." labels
        .replace(/\{/g, '#123;')  // escape { so it doesn't open a Mermaid shape delimiter
        .replace(/\}/g, '#125;')  // escape } so it doesn't close a Mermaid shape delimiter
        .replace(/\n/g, '<br/>'); // convert newlines to HTML line breaks
}

/**
 * Get the Mermaid node shape based on node type.
 * All labels are wrapped in double quotes (`"..."`) so that special characters
 * like `&`, `<`, `>`, `(`, `)`, `[`, `]`, `{`, `}`, `|` are rendered literally
 * without breaking Mermaid parsing.
 */
function getMermaidNodeShape(node: FlowNode): string {
    const rawLabel = node.type === 'condition'
        ? wrapConditionLabel(node.label)
        : node.label;
    const label = escapeMermaidLabel(rawLabel);

    switch (node.type) {
        case 'start':
        case 'end':
            return `${node.id}(["${label}"])`;
        case 'anchor':
            return `${node.id}{{"${label}"}}`;
        case 'condition':
            return `${node.id}{"${label}"}`;
        case 'goto':
            // Subroutine shape for goto > nodes
            return `${node.id}[["${label}"]]`;
        case 'if_start':
        case 'while_start':
        case 'foreach_start':
        case 'do_while_start':
            return `${node.id}[/"${label}"\\]`;
        case 'if_end':
        case 'while_end':
        case 'foreach_end':
        case 'do_while_end':
            return `${node.id}[\\"${label}"/]`;
        case 'include':
            return `${node.id}[/"${label}"/]`;
        case 'predef':
        case 'block':
        default:
            return `${node.id}["${label}"]`;
    }
}

/**
 * Recursively generate Mermaid subgraph lines.
 */
function generateSubgraphLines(
    sg: FlowSubgraph,
    nodeMap: Map<string, FlowNode>,
    indent: string,
): string[] {
    const lines: string[] = [];
    lines.push(`${indent}subgraph ${sg.id} ["${escapeMermaidLabel(sg.label)}"]`);
    lines.push(`${indent}    direction ${sg.direction || 'TB'}`);

    // Add direct nodes
    for (const nodeId of sg.nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node) {
            lines.push(`${indent}    ${getMermaidNodeShape(node)}`);
        }
    }

    // Add nested subgraphs
    for (const child of sg.children) {
        lines.push(...generateSubgraphLines(child, nodeMap, indent + '    '));
    }

    lines.push(`${indent}end`);
    return lines;
}

/**
 * Generate a Mermaid flowchart from a flow graph.
 */
export function generateMermaidDiagram(flowGraph: FlowGraph): string {
    const lines: string[] = [];
    const branchLinkStyles: Array<{ index: number; style: 'yes' | 'no' | 'conditional-exec' | 'contrast-solid' }> = [];
    let edgeIndex = 0;

    // Start with flowchart directive
    lines.push('flowchart TD');

    // Collect all node IDs that belong to subgraphs
    const nodesInSubgraphs = new Set<string>();
    function collectSubgraphNodes(sg: FlowSubgraph) {
        for (const id of sg.nodeIds) {
            nodesInSubgraphs.add(id);
        }
        for (const child of sg.children) {
            collectSubgraphNodes(child);
        }
    }
    for (const sg of flowGraph.subgraphs) {
        collectSubgraphNodes(sg);
    }

    // Add top-level nodes (not in any subgraph)
    for (const node of flowGraph.nodes) {
        if (!nodesInSubgraphs.has(node.id)) {
            lines.push(`    ${getMermaidNodeShape(node)}`);
        }
    }

    // Add subgraphs with their nodes
    const nodeMap = new Map(flowGraph.nodes.map(n => [n.id, n]));
    for (const sg of flowGraph.subgraphs) {
        lines.push(...generateSubgraphLines(sg, nodeMap, '    '));
    }

    // Add edges
    for (const edge of flowGraph.edges) {
        const normalizedLabel = edge.label?.trim().toLowerCase();
        const styleType = edge.style
            || (normalizedLabel === 'yes' || normalizedLabel === 'no' ? normalizedLabel : undefined);
        const isColoredBranch = styleType === 'yes' || styleType === 'no' || styleType === 'conditional-exec' || styleType === 'contrast-solid';
        if (isColoredBranch) {
            branchLinkStyles.push({
                index: edgeIndex,
                style: styleType,
            });
        }

        // Invisible edges are layout-only constraints (no visible arrow).
        if (edge.invisible) {
            lines.push(`    ${edge.from} ~~~ ${edge.to}`);
            edgeIndex += 1;
            continue;
        }

        // Keep Yes/No labels internal for branch color detection, but hide their
        // rendered edge text to keep the diagram cleaner and avoid label overlap issues.
        const label = (edge.label && styleType !== 'yes' && styleType !== 'no' && styleType !== 'conditional-exec')
            ? escapeMermaidLabel(edge.label)
            : '';

        // Use dashed line for GOTO jumps
        if (edge.dashed) {
            if (label) {
                lines.push(`    ${edge.from} -.->|${label}| ${edge.to}`);
            } else {
                lines.push(`    ${edge.from} -.-> ${edge.to}`);
            }
        } else if (label) {
            lines.push(`    ${edge.from} -->|${label}| ${edge.to}`);
        } else {
            lines.push(`    ${edge.from} --> ${edge.to}`);
        }

        edgeIndex += 1;
    }

    // Add styling
    lines.push('');
    lines.push('    classDef startEnd fill:#90EE90,stroke:#333,stroke-width:2px,color:#000;');
    lines.push('    classDef anchor fill:#4169E1,stroke:#1a237e,stroke-width:3px,color:#fff,font-weight:bold;');
    lines.push('    classDef condition fill:#FFD700,stroke:#333,stroke-width:2px,color:#000;');
    lines.push('    classDef block fill:#DDA0DD,stroke:#333,stroke-width:2px,color:#000;');
    lines.push('    classDef predef fill:#FFD580,stroke:#B8860B,stroke-width:2px,color:#000;');
    lines.push('    classDef goto fill:#FFA07A,stroke:#FF4500,stroke-width:2px,color:#000;');
    lines.push('    classDef include fill:#8DD3C7,stroke:#2F4F4F,stroke-width:2px,color:#000;');
    lines.push('    classDef conditionalAction fill:#B7EFC5,stroke:#2E8B57,stroke-width:2px,color:#0b1f14;');
    for (const [key, fill] of Object.entries(CONTROL_FLOW_COLORS)) {
        const capKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        const style = `fill:${fill},stroke:#333,stroke-width:2px,color:#000`;
        lines.push(`    classDef ${capKey}Start ${style};`);
        lines.push(`    classDef ${capKey}End ${style};`);
    }
    lines.push('');

    // Apply classes to nodes
    const nodesByType = new Map<string, string[]>();
    for (const node of flowGraph.nodes) {
        if (!nodesByType.has(node.type)) {
            nodesByType.set(node.type, []);
        }
        nodesByType.get(node.type)!.push(node.id);
    }

    const conditionalActionNodeIds = new Set(
        flowGraph.nodes.filter(n => n.styleClass === 'conditionalAction').map(n => n.id)
    );

    /** Emit a `class` line for a node type, mapping to a Mermaid classDef name. */
    function applyClass(type: string, className: string, excludeIds?: Set<string>) {
        let ids = nodesByType.get(type);
        if (!ids || ids.length === 0) { return; }
        if (excludeIds) { ids = ids.filter(id => !excludeIds.has(id)); }
        if (ids.length > 0) {
            lines.push(`    class ${ids.join(',')} ${className};`);
        }
    }

    // Combined start/end class
    const startEndNodes = [...(nodesByType.get('start') || []), ...(nodesByType.get('end') || [])];
    if (startEndNodes.length > 0) {
        lines.push(`    class ${startEndNodes.join(',')} startEnd;`);
    }

    applyClass('anchor', 'anchor');
    applyClass('condition', 'condition');
    applyClass('block', 'block', conditionalActionNodeIds);
    applyClass('predef', 'predef');
    applyClass('goto', 'goto', conditionalActionNodeIds);

    if (conditionalActionNodeIds.size > 0) {
        lines.push(`    class ${[...conditionalActionNodeIds].join(',')} conditionalAction;`);
    }

    applyClass('include', 'include');

    // Control-flow boundary node classes
    for (const key of Object.keys(CONTROL_FLOW_COLORS)) {
        const capKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        applyClass(`${key}_start` as string, `${capKey}Start`);
        applyClass(`${key}_end` as string, `${capKey}End`);
    }

    // Style subgraphs with dashed borders
    function collectAllSubgraphs(sgs: FlowSubgraph[]): FlowSubgraph[] {
        const result: FlowSubgraph[] = [];
        for (const sg of sgs) {
            result.push(sg);
            result.push(...collectAllSubgraphs(sg.children));
        }
        return result;
    }
    const allSubgraphs = collectAllSubgraphs(flowGraph.subgraphs);
    for (const sg of allSubgraphs) {
        lines.push(`    style ${sg.id} fill:transparent,stroke:#999,stroke-width:2px,stroke-dasharray:5,color:#999;`);
    }
    for (const { index, style } of branchLinkStyles) {
        if (style === 'conditional-exec') {
            lines.push(`    linkStyle ${index} stroke:${CONDITIONAL_EXEC_EDGE_COLOR},stroke-width:3px;`);
            continue;
        }
        if (style === 'contrast-solid') {
            lines.push(`    linkStyle ${index} stroke-width:3px;`);
            continue;
        }
        const color = BRANCH_EDGE_COLORS[style];
        lines.push(`    linkStyle ${index} stroke:${color},stroke-width:3px;`);
    }

    return lines.join('\n');
}
