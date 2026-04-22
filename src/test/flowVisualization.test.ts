import * as assert from 'assert';
import { parseFlowGraph, TextDocumentLike } from '../flowParser';
import { generateMermaidDiagram } from '../mermaidGenerator';

/**
 * Create a lightweight TextDocument stub from a multiline string.
 * Avoids the need for `vscode.workspace.openTextDocument` in unit tests.
 */
function makeDoc(content: string): TextDocumentLike {
    const lines = content.split('\n');
    return {
        lineCount: lines.length,
        lineAt: (n: number) => ({ text: lines[n] ?? '' }),
    };
}

suite('Flow Visualization Tests', () => {

    test('parseFlowGraph should extract anchors', () => {
        const doc = makeDoc(`<entry>
ECHO >> Test
<cleanup>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        // Should have start, entry anchor, cleanup anchor, end nodes plus statement blocks
        assert.ok(flowGraph.nodes.length >= 4, 'Should have at least 4 nodes');

        // Check for anchor nodes
        const anchorNodes = flowGraph.nodes.filter(n => n.type === 'anchor');
        assert.strictEqual(anchorNodes.length, 2, 'Should have 2 anchor nodes');

        const anchorLabels = anchorNodes.map(n => n.label);
        assert.ok(anchorLabels.includes('<entry>'), 'Should have entry anchor');
        assert.ok(anchorLabels.includes('<cleanup>'), 'Should have cleanup anchor');
    });

    test('parseFlowGraph should detect GOTO commands', () => {
        const doc = makeDoc(`<entry>
ECHO >> Test
GOTO >> <cleanup>
<cleanup>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        // Check for GOTO edge with dashed flag
        const gotoEdges = flowGraph.edges.filter(e => e.dashed && e.to === 'anchor_cleanup');
        assert.ok(gotoEdges.length >= 1, 'Should have at least one dashed edge to cleanup anchor');
    });

    test('parseFlowGraph should render regular GOTO as a standalone goto node', () => {
        const doc = makeDoc(`<entry>
ECHO >> Before jump
GOTO >> <cleanup>
ECHO >> Unreachable in linear flow
<cleanup>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        const gotoNodes = flowGraph.nodes.filter(n => n.type === 'goto');
        assert.strictEqual(gotoNodes.length, 1, 'Regular GOTO should create exactly one goto node');
        assert.strictEqual(gotoNodes[0].label, 'goto >> <cleanup>', 'Goto node should carry the target anchor in label');

        // GOTO line must not be merged into any regular block node.
        const mergedGotoInBlock = flowGraph.nodes.some(n => n.type === 'block' && /GOTO\s*>>/i.test(n.label));
        assert.ok(!mergedGotoInBlock, 'GOTO text should not be merged into block nodes');

        // Jump should be modeled as: previous node -(dashed)-> goto node -(dashed)-> anchor
        const edgeToGoto = flowGraph.edges.find(e => e.to === gotoNodes[0].id && e.dashed);
        assert.ok(edgeToGoto, 'There should be a dashed edge entering goto node');
        const edgeFromGoto = flowGraph.edges.find(e => e.from === gotoNodes[0].id && e.to === 'anchor_cleanup' && e.dashed);
        assert.ok(edgeFromGoto, 'Goto node should have dashed edge to target anchor');
    });

    test('parseFlowGraph should detect conditional jumps', () => {
        const doc = makeDoc(`<entry>
?\${x}=1? goto >> <branch_a>
GOTO >> <branch_b>
<branch_a>
ECHO >> A
<branch_b>
ECHO >> B`);

        const flowGraph = parseFlowGraph(doc);

        // Check for condition node
        const conditionNodes = flowGraph.nodes.filter(n => n.type === 'condition');
        assert.ok(conditionNodes.length >= 1, 'Should have at least 1 condition node');

        // Conditional jump should go through a standalone goto node, then dashed to anchor.
        const conditionalGotoNode = flowGraph.nodes.find(n => n.type === 'goto' && n.label === 'goto >> <branch_a>');
        assert.ok(conditionalGotoNode, 'Conditional jump should create goto node for branch_a');

        const condToGotoEdge = flowGraph.edges.find(e =>
            e.to === conditionalGotoNode!.id && e.label === 'Yes' && !e.dashed
        );
        assert.ok(condToGotoEdge, 'Condition should connect to goto node with a Yes edge');

        const gotoToAnchorEdge = flowGraph.edges.find(e =>
            e.from === conditionalGotoNode!.id && e.to === 'anchor_branch_a' && e.dashed
        );
        assert.ok(gotoToAnchorEdge, 'Goto node should connect to target anchor via dashed edge');
    });

    test('inline statement + ?? goto should split into statement block, condition, and goto nodes', () => {
        const doc = makeDoc(`<entry>
Reset Internal Status -@FlowCtrl ?? goto >> <error_handler>
ECHO >> Continue
<error_handler>
ECHO >> Error`);

        const flowGraph = parseFlowGraph(doc);

        const statementNode = flowGraph.nodes.find(
            n => n.type === 'block' && n.label === 'Reset Internal Status -@FlowCtrl'
        );
        assert.ok(statementNode, 'Prefix statement should remain a normal block node');

        const condNode = flowGraph.nodes.find(n => n.type === 'condition' && n.label === '??');
        assert.ok(condNode, 'Should create condition node labeled ??');

        const gotoNode = flowGraph.nodes.find(n => n.type === 'goto' && n.label === 'goto >> <error_handler>');
        assert.ok(gotoNode, 'Should create standalone goto node for error_handler');

        const statementToCond = flowGraph.edges.find(e => e.from === statementNode!.id && e.to === condNode!.id);
        assert.ok(statementToCond, 'Statement block should connect to condition node');

        const internalChain = flowGraph.edges.find(e => e.from === condNode!.id && e.to === gotoNode!.id);
        assert.ok(internalChain, 'Condition node should connect to goto node inside inline group');
        assert.ok(internalChain!.dashed, 'Condition-to-goto execution edge should be dashed');
        assert.strictEqual(internalChain!.style, 'conditional-exec', 'Condition-to-goto execution edge should use conditional-exec style');
        assert.strictEqual(gotoNode!.styleClass, 'conditionalAction', 'Goto node after ?? should use dedicated conditionalAction styling');

        // Inline conditional jump group should be placed in a dedicated LR subgraph.
        const collectSubgraphs = (items: typeof flowGraph.subgraphs): typeof flowGraph.subgraphs => {
            const result: typeof flowGraph.subgraphs = [];
            for (const sg of items) {
                result.push(sg);
                result.push(...collectSubgraphs(sg.children));
            }
            return result;
        };
        const allSubgraphs = collectSubgraphs(flowGraph.subgraphs);
        const inlineGroup = allSubgraphs.find(sg =>
            sg.direction === 'LR' &&
            sg.nodeIds.includes(statementNode!.id) &&
            sg.nodeIds.includes(condNode!.id) &&
            sg.nodeIds.includes(gotoNode!.id),
        );
        assert.ok(inlineGroup, 'Inline statement + conditional goto nodes should be grouped in an LR subgraph');

        const groupedYesEdge = flowGraph.edges.find(e => e.from === inlineGroup!.id && e.to === 'anchor_error_handler' && e.label === 'Yes');
        assert.ok(groupedYesEdge, 'Inline group should expose Yes branch from subgraph to target anchor');
        assert.strictEqual(groupedYesEdge!.style, 'conditional-exec', 'Inline group yes branch should use conditional-exec styling');

        const groupedNoEdge = flowGraph.edges.find(e => e.from === inlineGroup!.id && e.label === 'No');
        assert.ok(groupedNoEdge, 'Inline group should expose No branch from subgraph to sequential flow');
        assert.strictEqual(groupedNoEdge!.style, 'no', 'Inline group no branch should keep no-branch styling');
    });

    test('inline statement + conditional action should be grouped into an LR subgraph', () => {
        const doc = makeDoc(`<entry>
echo >> 开始执行 ?abc? echo >> abc
echo >> 收尾`);

        const flowGraph = parseFlowGraph(doc);

        const startNode = flowGraph.nodes.find(
            n => n.type === 'block' && n.label === 'echo >> 开始执行'
        );
        assert.ok(startNode, 'Prefix statement should become a normal block node');

        const condNode = flowGraph.nodes.find(n => n.type === 'condition' && n.label === 'abc');
        assert.ok(condNode, 'Inline conditional action should create a condition node');

        const actionNode = flowGraph.nodes.find(
            n => n.type === 'block' && n.label === 'echo >> abc'
        );
        assert.ok(actionNode, 'Inline conditional action should create an action block node');

        const internalEdges = [
            flowGraph.edges.find(e => e.from === startNode!.id && e.to === condNode!.id),
            flowGraph.edges.find(e => e.from === condNode!.id && e.to === actionNode!.id),
        ];
        assert.ok(internalEdges.every(Boolean), 'Inline conditional chain should stay connected inside the subgraph');
        assert.ok(internalEdges[1]!.dashed, 'Condition-to-action execution edge should be dashed');
        assert.strictEqual(internalEdges[1]!.style, 'conditional-exec', 'Condition-to-action execution edge should use conditional-exec style');
        assert.strictEqual(actionNode!.styleClass, 'conditionalAction', 'Action node after condition should use dedicated conditionalAction styling');

        const collectSubgraphs = (items: typeof flowGraph.subgraphs): typeof flowGraph.subgraphs => {
            const result: typeof flowGraph.subgraphs = [];
            for (const sg of items) {
                result.push(sg);
                result.push(...collectSubgraphs(sg.children));
            }
            return result;
        };
        const allSubgraphs = collectSubgraphs(flowGraph.subgraphs);
        const inlineGroup = allSubgraphs.find(sg =>
            sg.direction === 'LR' &&
            sg.nodeIds.includes(startNode!.id) &&
            sg.nodeIds.includes(condNode!.id) &&
            sg.nodeIds.includes(actionNode!.id),
        );
        assert.ok(inlineGroup, 'Inline conditional action nodes should be grouped in an LR subgraph');

        const groupedOutEdge = flowGraph.edges.find(e => e.from === inlineGroup!.id);
        assert.ok(groupedOutEdge, 'Inline conditional action group should continue flow via subgraph container');
        assert.strictEqual(groupedOutEdge!.style, 'contrast-solid', 'Inline conditional action group outgoing edge should force solid continuation styling');
    });

    test('parseFlowGraph should support hyphenated anchor names', () => {
        const doc = makeDoc(`<entry>
?? goto >> <error-handler>
GOTO >> <clean-up>
<error-handler>
ECHO >> Error
<clean-up>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        const anchorLabels = flowGraph.nodes
            .filter(n => n.type === 'anchor' && !n.label.includes('undefined'))
            .map(n => n.label);
        assert.ok(anchorLabels.includes('<error-handler>'), 'Should have error-handler anchor');
        assert.ok(anchorLabels.includes('<clean-up>'), 'Should have clean-up anchor');
    });

    test('parseFlowGraph should create include nodes with visible labels', () => {
        const doc = makeDoc(`<entry>
<include submodule/sub-flow.csmscript>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        const includeNodes = flowGraph.nodes.filter(n => n.type === 'include');
        assert.strictEqual(includeNodes.length, 1, 'Should create one include node');
        assert.ok(includeNodes[0].label.includes('include: submodule/sub-flow.csmscript'), 'Include node should display the target path');
    });

    test('parseFlowGraph should still create include node when path is missing', () => {
        const doc = makeDoc(`<entry>
<include>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        const includeNodes = flowGraph.nodes.filter(n => n.type === 'include');
        assert.strictEqual(includeNodes.length, 1, 'Should create one include node even without path');
        assert.strictEqual(includeNodes[0].label, 'include', 'Include node should fall back to label \"include\" when path is missing');
    });

    test('generateMermaidDiagram should create valid Mermaid syntax', () => {
        const doc = makeDoc(`<entry>
ECHO >> Test
<cleanup>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // Check for flowchart directive
        assert.ok(mermaid.includes('flowchart TD'), 'Should have flowchart TD directive');

        // Check for start and end nodes (now with quoted labels)
        assert.ok(mermaid.includes('start1(["Start"])'), 'Should have start node with quoted label');
        assert.ok(mermaid.includes('end1(["End"])'), 'Should have end node with quoted label');

        // Check for anchor nodes
        assert.ok(mermaid.includes('anchor_entry{{'), 'Should have entry anchor node');
        assert.ok(mermaid.includes('anchor_cleanup{{'), 'Should have cleanup anchor node');

        // Check for edges (arrows)
        assert.ok(mermaid.includes('-->'), 'Should have edges');

        // Check for style classes
        assert.ok(mermaid.includes('classDef'), 'Should have style definitions');

        // Anchor nodes should be visually prominent (bold, vivid fill, white text)
        const mermaidLines = mermaid.split('\n');
        const anchorClassDefLine = mermaidLines.find(line => /classDef\s+anchor\b/.test(line));
        assert.ok(anchorClassDefLine, 'Should have anchor classDef');
        assert.ok(/font-weight\s*:\s*bold/.test(anchorClassDefLine!), 'Anchor classDef should use bold font for prominence');
        assert.ok(/color\s*:\s*#fff/.test(anchorClassDefLine!), 'Anchor classDef should use white text for contrast');
    });

    test('generateMermaidDiagram should color Yes and No branch edges differently without rendering branch text', () => {
        const doc = makeDoc(`<entry>
<if \${x}>0>
  ECHO >> Positive
<else>
  ECHO >> Not positive
<end_if>`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        assert.ok(!mermaid.includes('-->|Yes|'), 'Conditional true branch should not render a Yes edge label');
        assert.ok(!mermaid.includes('-->|No|'), 'Conditional false branch should not render a No edge label');
        assert.ok(
            mermaid.includes('linkStyle') && mermaid.includes('stroke:#2E8B57'),
            'Yes branch edges should be styled with a green stroke',
        );
        assert.ok(
            mermaid.includes('linkStyle') && mermaid.includes('stroke:#C0392B'),
            'No branch edges should be styled with a red stroke',
        );
    });

    test('parseFlowGraph should handle control flow tags', () => {
        const doc = makeDoc(`<entry>
<if \${x}>0>
  ECHO >> Positive
<else>
  ECHO >> Not positive
<end_if>`);

        const flowGraph = parseFlowGraph(doc);

        // Check for if condition node (label is now just the condition, not "if: condition")
        const ifNodes = flowGraph.nodes.filter(n => n.type === 'condition' && n.label.includes('${x}>0'));
        assert.ok(ifNodes.length >= 1, 'Should have at least 1 if condition node');
    });

    test('parseFlowGraph should skip section headers', () => {
        const doc = makeDoc(`[COMMAND_ALIAS]
TestAlias = API: Test >> \${x} -@ Module

<entry>
ECHO >> Test`);

        const flowGraph = parseFlowGraph(doc);

        // Section headers should create a predef node showing actual content
        const predefNodes = flowGraph.nodes.filter(n => n.type === 'predef');
        assert.ok(predefNodes.length >= 1, 'Should have predef node');
        assert.ok(predefNodes[0].label.includes('TestAlias'), 'Predef node should show actual content, not placeholder');

        // Should still have entry anchor
        const entryNodes = flowGraph.nodes.filter(n => n.type === 'anchor' && n.label.includes('entry'));
        assert.ok(entryNodes.length >= 1, 'Should have entry anchor');
    });

    test('parseFlowGraph should handle while loops', () => {
        const doc = makeDoc(`<entry>
<while \${loopCounter:0}<5>
  ECHO >> Loop
<end_while>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        // Check for while condition node
        const whileNodes = flowGraph.nodes.filter(n => n.type === 'condition' && n.label.includes('loopCounter'));
        assert.ok(whileNodes.length >= 1, 'Should have while condition node');

        // Check for loop back edge
        const loopEdges = flowGraph.edges.filter(e => e.label === 'loop');
        assert.ok(loopEdges.length >= 1, 'Should have loop back edge');

        // Check for While and end_while nodes
        const loopStartNodes = flowGraph.nodes.filter(n => n.label === 'While');
        assert.ok(loopStartNodes.length >= 1, 'Should have While node');
        const loopEndNodes = flowGraph.nodes.filter(n => n.label === 'end_while');
        assert.ok(loopEndNodes.length >= 1, 'Should have end_while node');

        // An invisible layout edge must be added from the last body node to end_while
        // so that end_while is ranked below the body in the TB subgraph layout.
        // The last body node is identified as the source of the 'loop' back-edge.
        const whileEndNode = loopEndNodes[0];
        const loopBackEdge = loopEdges[0];
        const invisibleEdge = flowGraph.edges.find(e => e.invisible && e.to === whileEndNode.id);
        assert.ok(invisibleEdge, 'Should have invisible layout edge to end_while node');
        assert.strictEqual(
            invisibleEdge!.from,
            loopBackEdge.from,
            'Invisible layout edge must originate from the last body node (same source as the loop back-edge)',
        );
    });

    test('while/foreach with no body should not add an invisible edge to loop-end', () => {
        const doc = makeDoc(`<entry>
<while \${i}<10>
<end_while>
<foreach item in list>
<end_foreach>`);

        const flowGraph = parseFlowGraph(doc);

        const invisibleEdges = flowGraph.edges.filter(e => e.invisible);
        assert.strictEqual(invisibleEdges.length, 0, 'Empty while/foreach should have no invisible edges');
    });

    test('generateMermaidDiagram should emit ~~~ invisible edges for while/foreach layout', () => {
        const doc = makeDoc(`<entry>
<while \${i}<10>
  ECHO >> Loop
<end_while>
<foreach item in list>
  ECHO >> Item
<end_foreach>`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // The invisible depth edges must appear as ~~~ in the Mermaid source
        assert.ok(mermaid.includes('~~~'), 'Should emit ~~~ invisible edges for while/foreach layout');
        // Visible edges must still use -->
        assert.ok(mermaid.includes('-->'), 'Should still have visible --> edges');
        // Invisible edges must NOT use -->
        const invisibleEdges = flowGraph.edges.filter(e => e.invisible);
        for (const edge of invisibleEdges) {
            assert.ok(
                mermaid.includes(`${edge.from} ~~~ ${edge.to}`),
                `Invisible edge ${edge.from}→${edge.to} should use ~~~ syntax`,
            );
            assert.ok(
                !mermaid.includes(`${edge.from} --> ${edge.to}`),
                `Invisible edge ${edge.from}→${edge.to} must not use --> syntax`,
            );
        }
    });

    test('escapeMermaidLabel should HTML-escape special characters for htmlLabels rendering', () => {
        const doc = makeDoc(`<entry>
ECHO >> Test <with> "quotes" & [brackets]`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // With htmlLabels: true, labels are rendered as HTML inside a <div>, so
        // <, >, and & must be HTML-escaped to display correctly:
        //   - <entry> anchor label must become &lt;entry&gt; so it isn't stripped as a tag
        //   - & in conditions must become &amp; to avoid mis-parsed HTML entity refs
        assert.ok(mermaid.includes('&lt;entry&gt;'), 'Anchor label < and > should be HTML-escaped');
        assert.ok(mermaid.includes('&lt;with&gt;'), 'Block label < and > should be HTML-escaped');
        assert.ok(mermaid.includes('&amp;'), 'Should escape & to &amp; for HTML rendering');
        assert.ok(mermaid.includes('#quot;'), 'Should escape double quotes with #quot;');
    });

    test('condition node with ${...} variables should not be truncated in Mermaid output', () => {
        const doc = makeDoc(`<entry>
<if !\${ROM_check} && \${RAM_check} && \${Video_check} && \${Keyboard_check}>
ECHO >> Checks failed
<end_if>`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // The condition label must contain ALL variable names – not be truncated
        // at the first } from ${ROM_check}. Curly braces in labels must be escaped
        // so they don't break the Mermaid diamond shape {"..."} syntax.
        const condNode = flowGraph.nodes.find(n => n.type === 'condition');
        assert.ok(condNode, 'Should have a condition node');
        assert.ok(condNode!.label.includes('ROM_check'), 'Condition should contain ROM_check');
        assert.ok(condNode!.label.includes('Keyboard_check'), 'Condition should contain Keyboard_check');

        // Mermaid output must escape { and } so the diamond shape is not broken
        assert.ok(mermaid.includes('#123;'), 'Should escape { to #123; in Mermaid output');
        assert.ok(mermaid.includes('#125;'), 'Should escape } to #125; in Mermaid output');

        // The full condition text (escaped) must appear in a single Mermaid node definition
        assert.ok(mermaid.includes('ROM_check'), 'Mermaid should include ROM_check');
        assert.ok(mermaid.includes('Keyboard_check'), 'Mermaid should include Keyboard_check');
        assert.ok(mermaid.includes('<br/>'), 'Long condition labels should include line breaks for wrapping');
    });

    test('parseFlowGraph should group statements into blocks', () => {
        const doc = makeDoc(`<entry>
ECHO >> Line 1
ECHO >> Line 2
ECHO >> Line 3
<anchor2>
ECHO >> After anchor`);

        const flowGraph = parseFlowGraph(doc);

        // Should have blocks for groups of statements
        const blockNodes = flowGraph.nodes.filter(n => n.type === 'block');
        assert.ok(blockNodes.length >= 2, 'Should have statement blocks');
    });

    test('parseFlowGraph should use dashed lines for GOTO', () => {
        const doc = makeDoc(`<entry>
ECHO >> Before
GOTO >> <target>
<target>
ECHO >> Target`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // Dashed line syntax in Mermaid
        assert.ok(mermaid.includes('.->'), 'Should use dashed line syntax for GOTO');
    });

    test('parseFlowGraph should detect parameterless goto >', () => {
        const doc = makeDoc(`ECHO >> Start
goto >
ECHO >> After goto`);

        const flowGraph = parseFlowGraph(doc);

        // Check for goto node
        const gotoNodes = flowGraph.nodes.filter(n => n.type === 'goto');
        assert.strictEqual(gotoNodes.length, 1, 'Should have exactly one goto node');
        assert.strictEqual(gotoNodes[0].label, 'goto >', 'goto node should have label "goto >"');

        // Check that edges to and from goto node are dashed
        const dashedEdges = flowGraph.edges.filter(e => e.dashed);
        assert.strictEqual(
            dashedEdges.length,
            2,
            'Should have exactly two dashed edges (into and out of goto node)'
        );

        // Verify the goto node is connected
        const gotoId = gotoNodes[0].id;
        const edgesToGoto = flowGraph.edges.filter(e => e.to === gotoId);
        const edgesFromGoto = flowGraph.edges.filter(e => e.from === gotoId);
        assert.strictEqual(edgesToGoto.length, 1, 'goto node should have exactly one incoming edge');
        assert.strictEqual(edgesFromGoto.length, 1, 'goto node should have exactly one outgoing edge');
        assert.ok(
            edgesToGoto.every(e => e.dashed),
            'Incoming edge to goto node should be dashed'
        );
        assert.ok(
            edgesFromGoto.every(e => e.dashed),
            'Outgoing edge from goto node should be dashed'
        );
    });

    test('generateMermaidDiagram should render goto > with special shape', () => {
        const doc = makeDoc(`ECHO >> Start
goto >
ECHO >> After`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // Should contain subroutine shape for goto node [[...]]
        assert.ok(mermaid.includes('[['), 'Should use subroutine shape for goto node');
        assert.ok(mermaid.includes('goto &gt;'), 'Mermaid should contain goto > label (HTML-escaped)');

        // Should apply goto class styling to the specific goto node
        assert.ok(mermaid.includes('classDef goto'), 'Should define goto class');
        const gotoNode = flowGraph.nodes.find(n => n.type === 'goto');
        assert.ok(gotoNode, 'Flow graph should contain a goto node');
        const gotoNodeId = (gotoNode as any).id;
        assert.ok(gotoNodeId, 'Goto node should have an id for Mermaid rendering');
        assert.ok(
            mermaid.includes(`class ${gotoNodeId} goto;`),
            'Should apply goto class to the goto node',
        );

        // Dashed separators should be used on both sides of the goto node
        assert.ok(
            mermaid.includes(`-.-> ${gotoNodeId}`) || mermaid.includes(`-.->${gotoNodeId}`),
            'Incoming edge to goto node should use dashed syntax -.->',
        );
        assert.ok(
            mermaid.includes(`${gotoNodeId} -.->`) || mermaid.includes(`${gotoNodeId}-.-`),
            'Outgoing edge from goto node should use dashed syntax -.->',
        );
    });

    test('parseFlowGraph should split blocks on goto >', () => {
        const doc = makeDoc(`ECHO >> Line 1
ECHO >> Line 2
goto >
ECHO >> Line 3
ECHO >> Line 4`);

        const flowGraph = parseFlowGraph(doc);

        // Should have 2 separate blocks split by goto >
        const blockNodes = flowGraph.nodes.filter(n => n.type === 'block');
        assert.strictEqual(blockNodes.length, 2, 'Should have 2 statement blocks split by goto >');
        assert.ok(blockNodes[0].label.includes('Line 1'), 'First block should contain Line 1');
        assert.ok(blockNodes[0].label.includes('Line 2'), 'First block should contain Line 2');
        assert.ok(blockNodes[1].label.includes('Line 3'), 'Second block should contain Line 3');
        assert.ok(blockNodes[1].label.includes('Line 4'), 'Second block should contain Line 4');

        // Should have exactly one goto node between them
        const gotoNodes = flowGraph.nodes.filter(n => n.type === 'goto');
        assert.strictEqual(gotoNodes.length, 1, 'Should have exactly one goto node');
    });

    test('parseFlowGraph should split blocks on empty lines', () => {
        const doc = makeDoc(`<entry>
ECHO >> Line 1
ECHO >> Line 2

ECHO >> Line 3
ECHO >> Line 4`);

        const flowGraph = parseFlowGraph(doc);

        // Should have 2 separate blocks split by the empty line
        const blockNodes = flowGraph.nodes.filter(n => n.type === 'block');
        assert.strictEqual(blockNodes.length, 2, 'Should have 2 statement blocks split by empty line');
        assert.ok(blockNodes[0].label.includes('Line 1'), 'First block should contain Line 1');
        assert.ok(blockNodes[0].label.includes('Line 2'), 'First block should contain Line 2');
        assert.ok(blockNodes[1].label.includes('Line 3'), 'Second block should contain Line 3');
        assert.ok(blockNodes[1].label.includes('Line 4'), 'Second block should contain Line 4');
    });

    test('parseFlowGraph should create subgraphs for control flow', () => {
        const doc = makeDoc(`<entry>
<if \${x}>0>
  ECHO >> Positive
<else>
  ECHO >> Not positive
<end_if>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);

        // Should have at least one subgraph for the if block
        assert.ok(flowGraph.subgraphs.length >= 1, 'Should have subgraphs');
        assert.ok(flowGraph.subgraphs[0].label.includes('if'), 'Subgraph should be labeled as if');
        assert.ok(flowGraph.subgraphs[0].nodeIds.length >= 1, 'Subgraph should contain nodes');

        // Check for If and end_if nodes
        const ifStartNodes = flowGraph.nodes.filter(n => n.label === 'If');
        assert.ok(ifStartNodes.length >= 1, 'Should have If node');
        const ifEndNodes = flowGraph.nodes.filter(n => n.label === 'end_if');
        assert.ok(ifEndNodes.length >= 1, 'Should have end_if node');
    });

    test('generateMermaidDiagram should include subgraph blocks', () => {
        const doc = makeDoc(`<entry>
<while \${i}<10>
  ECHO >> Loop
<end_while>
ECHO >> Done`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // Should contain subgraph syntax
        assert.ok(mermaid.includes('subgraph'), 'Should have subgraph declaration');
        assert.ok(mermaid.includes('direction TB'), 'Should have direction TB inside subgraph');
        assert.ok(mermaid.includes('end'), 'Should have subgraph end');
        assert.ok(mermaid.includes('while'), 'Subgraph label should mention while');
    });

    test('parseFlowGraph should emit specific node types for control flow starts', () => {
        const doc = makeDoc(`<entry>
<if \${x}>0>
  ECHO >> Positive
<end_if>
<while \${i}<10>
  ECHO >> Loop
<end_while>
<foreach item in listA>
  ECHO >> Item
<end_foreach>
<do_while>
  ECHO >> Do
<end_do_while \${n}<5>`);

        const flowGraph = parseFlowGraph(doc);

        const ifStartNodes = flowGraph.nodes.filter(n => n.type === 'if_start');
        assert.ok(ifStartNodes.length >= 1, 'Should have at least one if_start node');
        assert.strictEqual(ifStartNodes[0].label, 'If', 'if_start node should have label "If"');

        const whileStartNodes = flowGraph.nodes.filter(n => n.type === 'while_start');
        assert.ok(whileStartNodes.length >= 1, 'Should have at least one while_start node');
        assert.strictEqual(whileStartNodes[0].label, 'While', 'while_start node should have label "While"');

        const foreachStartNodes = flowGraph.nodes.filter(n => n.type === 'foreach_start');
        assert.ok(foreachStartNodes.length >= 1, 'Should have at least one foreach_start node');
        assert.strictEqual(foreachStartNodes[0].label, 'Foreach', 'foreach_start node should have label "Foreach"');

        const doWhileStartNodes = flowGraph.nodes.filter(n => n.type === 'do_while_start');
        assert.ok(doWhileStartNodes.length >= 1, 'Should have at least one do_while_start node');
        assert.strictEqual(doWhileStartNodes[0].label, 'Do_while', 'do_while_start node should have label "Do_while"');

        // End nodes should have specific types matching their start counterparts
        const ifEndNodes = flowGraph.nodes.filter(n => n.type === 'if_end');
        assert.ok(ifEndNodes.length >= 1, 'Should have at least one if_end node');
        assert.strictEqual(ifEndNodes[0].label, 'end_if', 'if_end node should have label "end_if"');

        const whileEndNodes = flowGraph.nodes.filter(n => n.type === 'while_end');
        assert.ok(whileEndNodes.length >= 1, 'Should have at least one while_end node');
        assert.strictEqual(whileEndNodes[0].label, 'end_while', 'while_end node should have label "end_while"');

        const foreachEndNodes = flowGraph.nodes.filter(n => n.type === 'foreach_end');
        assert.ok(foreachEndNodes.length >= 1, 'Should have at least one foreach_end node');
        assert.strictEqual(foreachEndNodes[0].label, 'end_foreach', 'foreach_end node should have label "end_foreach"');

        const doWhileEndNodes = flowGraph.nodes.filter(n => n.type === 'do_while_end');
        assert.ok(doWhileEndNodes.length >= 1, 'Should have at least one do_while_end node');
        assert.strictEqual(doWhileEndNodes[0].label, 'end_do_while', 'do_while_end node should have label "end_do_while"');
    });

    test('generateMermaidDiagram should include classDefs and class assignments for control flow node types', () => {
        const doc = makeDoc(`<entry>
<if \${x}>0>
  ECHO >> Positive
<end_if>
<while \${i}<10>
  ECHO >> Loop
<end_while>
<foreach item in listA>
  ECHO >> Item
<end_foreach>
<do_while>
  ECHO >> Do
<end_do_while \${n}<5>`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // classDef declarations for start nodes with exact fill colors
        assert.ok(mermaid.includes('classDef ifStart fill:#FF9999,'), 'Should have ifStart classDef with correct fill color');
        assert.ok(mermaid.includes('classDef whileStart fill:#FFB347,'), 'Should have whileStart classDef with correct fill color');
        assert.ok(mermaid.includes('classDef foreachStart fill:#77DD77,'), 'Should have foreachStart classDef with correct fill color');
        assert.ok(mermaid.includes('classDef doWhileStart fill:#AEC6CF,'), 'Should have doWhileStart classDef with correct fill color');

        // classDef declarations for end nodes — must use the same fill color as the matching start
        assert.ok(mermaid.includes('classDef ifEnd fill:#FF9999,'), 'ifEnd fill color must match ifStart (#FF9999)');
        assert.ok(mermaid.includes('classDef whileEnd fill:#FFB347,'), 'whileEnd fill color must match whileStart (#FFB347)');
        assert.ok(mermaid.includes('classDef foreachEnd fill:#77DD77,'), 'foreachEnd fill color must match foreachStart (#77DD77)');
        assert.ok(mermaid.includes('classDef doWhileEnd fill:#AEC6CF,'), 'doWhileEnd fill color must match doWhileStart (#AEC6CF)');

        // class assignments for start nodes
        assert.ok(mermaid.includes('ifStart;'), 'Should assign ifStart class to if_start nodes');
        assert.ok(mermaid.includes('whileStart;'), 'Should assign whileStart class to while_start nodes');
        assert.ok(mermaid.includes('foreachStart;'), 'Should assign foreachStart class to foreach_start nodes');
        assert.ok(mermaid.includes('doWhileStart;'), 'Should assign doWhileStart class to do_while_start nodes');

        // class assignments for end nodes
        assert.ok(mermaid.includes('ifEnd;'), 'Should assign ifEnd class to if_end nodes');
        assert.ok(mermaid.includes('whileEnd;'), 'Should assign whileEnd class to while_end nodes');
        assert.ok(mermaid.includes('foreachEnd;'), 'Should assign foreachEnd class to foreach_end nodes');
        assert.ok(mermaid.includes('doWhileEnd;'), 'Should assign doWhileEnd class to do_while_end nodes');

        // trapezoid shapes: start uses [/"label"\], end uses [\"label"/]
        assert.ok(mermaid.includes('[/"If"\\]'), 'if_start should use trapezoid-start shape');
        assert.ok(mermaid.includes('[\\\"end_if"/]'), 'if_end should use trapezoid-end shape');
        assert.ok(mermaid.includes('[/"While"\\]'), 'while_start should use trapezoid-start shape');
        assert.ok(mermaid.includes('[\\\"end_while"/]'), 'while_end should use trapezoid-end shape');
        assert.ok(mermaid.includes('[/"Foreach"\\]'), 'foreach_start should use trapezoid-start shape');
        assert.ok(mermaid.includes('[\\\"end_foreach"/]'), 'foreach_end should use trapezoid-end shape');
        assert.ok(mermaid.includes('[/"Do_while"\\]'), 'do_while_start should use trapezoid-start shape');
        assert.ok(mermaid.includes('[\\\"end_do_while"/]'), 'do_while_end should use trapezoid-end shape');
    });

    test('generateMermaidDiagram should render include nodes with distinct shape and styling', () => {
        const doc = makeDoc(`<entry>
<include common/setup.csmscript>
ECHO >> After include`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);
        const includeNodes = flowGraph.nodes.filter(n => n.type === 'include');
        assert.strictEqual(includeNodes.length, 1, 'Should create one include node');

        const includeNode = includeNodes[0];
        assert.ok(mermaid.includes('classDef include'), 'Should declare include classDef');
        assert.ok(mermaid.includes(`[/"include: common/setup.csmscript"/]`), 'Include node should use a distinct parallelogram-style shape');
        assert.ok(mermaid.includes(`class ${includeNode.id} include;`), 'Include node should receive include class');
    });

    test('generateMermaidDiagram should include classDef predef and apply it to predef nodes', () => {
        const doc = makeDoc(`[COMMAND_ALIAS]
TestAlias = API: Test >> \${x} -@ Module

<entry>
ECHO >> Test`);

        const flowGraph = parseFlowGraph(doc);
        const mermaid = generateMermaidDiagram(flowGraph);

        // Should declare the predef classDef
        assert.ok(mermaid.includes('classDef predef'), 'Should have predef classDef');

        // Should apply predef class to the predef node
        const predefNodes = flowGraph.nodes.filter(n => n.type === 'predef');
        assert.ok(predefNodes.length >= 1, 'Should have predef node');
        assert.ok(mermaid.includes(`class ${predefNodes[0].id} predef;`), 'Should assign predef class to predef node');
    });
});
