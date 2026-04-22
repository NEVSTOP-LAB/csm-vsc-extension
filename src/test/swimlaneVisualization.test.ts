import * as assert from 'assert';
import { parseSwimlaneGraph } from '../swimlaneParser';
import { generateSwimlaneDiagram } from '../swimlaneGenerator';
import { TextDocumentLike } from '../flowParser';

/**
 * Create a lightweight TextDocument stub from a multiline string.
 */
function makeDoc(content: string): TextDocumentLike {
    const lines = content.split('\n');
    return {
        lineCount: lines.length,
        lineAt: (n: number) => ({ text: lines[n] ?? '' }),
    };
}

suite('Swimlane Visualization Tests', () => {

    // ------------------------------------------------------------------
    // parseSwimlaneGraph tests
    // ------------------------------------------------------------------

    test('parseSwimlaneGraph should always include Engine as first participant', () => {
        const doc = makeDoc(`ECHO >> Hello`);
        const graph = parseSwimlaneGraph(doc);
        assert.ok(graph.participants.length >= 1);
        assert.strictEqual(graph.participants[0], 'Engine');
    });

    test('parseSwimlaneGraph should detect sync call (-@)', () => {
        const doc = makeDoc(`API: Boot >> \${deviceId} -@ FixtureController => bootCode`);
        const graph = parseSwimlaneGraph(doc);

        assert.ok(graph.participants.includes('FixtureController'), 'Should include FixtureController');
        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'sync');
            assert.strictEqual(msg.from, 'Engine');
            assert.strictEqual(msg.to, 'FixtureController');
            assert.ok(msg.label.includes('API: Boot'), 'Label should contain API call');
            assert.strictEqual(msg.returnLabel, 'bootCode');
        }
    });

    test('parseSwimlaneGraph should detect async call (->)', () => {
        const doc = makeDoc(`API: Prepare >> \${bootCode} -> WorkerModule => prepResult`);
        const graph = parseSwimlaneGraph(doc);

        assert.ok(graph.participants.includes('WorkerModule'));
        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'async');
            assert.strictEqual(msg.to, 'WorkerModule');
            assert.strictEqual(msg.returnLabel, 'prepResult');
        }
    });

    test('parseSwimlaneGraph should detect fire-and-forget (->|)', () => {
        const doc = makeDoc(`API: Trace >> prepare-start ->| Logger`);
        const graph = parseSwimlaneGraph(doc);

        assert.ok(graph.participants.includes('Logger'));
        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'fire-forget');
            assert.strictEqual(msg.to, 'Logger');
            assert.strictEqual(msg.returnLabel, undefined);
        }
    });

    test('parseSwimlaneGraph should not confuse ->| with ->', () => {
        const doc = makeDoc(`API: Trace >>data ->| LoggerX
API: Call >>data -> ModuleY => result`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 2);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            assert.strictEqual(graph.elements[0].message.type, 'fire-forget');
            assert.strictEqual(graph.elements[0].message.to, 'LoggerX');
        }
        assert.strictEqual(graph.elements[1].kind, 'message');
        if (graph.elements[1].kind === 'message') {
            assert.strictEqual(graph.elements[1].message.type, 'async');
            assert.strictEqual(graph.elements[1].message.to, 'ModuleY');
        }
    });

    test('parseSwimlaneGraph should detect subscription (-><register>)', () => {
        const doc = makeDoc(`StatusChanged@WorkerModule >> API: OnStatusChanged -><register>`);
        const graph = parseSwimlaneGraph(doc);

        assert.ok(graph.participants.includes('WorkerModule'));
        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'subscribe');
            assert.strictEqual(msg.to, 'WorkerModule');
            assert.ok(msg.label.includes('[subscribe]'));
            assert.ok(msg.label.includes('StatusChanged'));
        }
    });

    test('parseSwimlaneGraph should detect interrupt subscription (-><register as interrupt>)', () => {
        const doc = makeDoc(`StatusChanged@WorkerModule >> API: OnInterrupt -><register as interrupt>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'subscribe-interrupt');
            assert.ok(msg.label.includes('[subscribe-interrupt]'));
        }
    });

    test('parseSwimlaneGraph should detect status subscription (-><register as status>)', () => {
        const doc = makeDoc(`StatusChanged@WorkerModule >> API: OnStatus -><register as status>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'subscribe-status');
            assert.ok(msg.label.includes('[subscribe-status]'));
        }
    });

    test('parseSwimlaneGraph should detect unsubscription (-><unregister>)', () => {
        const doc = makeDoc(`StatusChanged@WorkerModule >> API: OnStatusChanged -><unregister>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'unsubscribe');
            assert.ok(msg.label.includes('[unsubscribe]'));
        }
    });

    test('parseSwimlaneGraph should skip section headers and parse control flow after anchors', () => {
        const doc = makeDoc(`[COMMAND_ALIAS]
ConnectDB = API: Connect >> \${host} -@ DatabaseModule

<entry>
<if \${x}>0>
  ECHO >> Positive
<end_if>
ECHO >> Test`);
        const graph = parseSwimlaneGraph(doc);

        // [COMMAND_ALIAS] definition inside section header should be skipped
        // The -@ in command alias lines is inside [COMMAND_ALIAS] section — skip
        // Control flow tags after <entry> should be present as control elements
        assert.ok(graph.elements.length >= 2, 'Should have if/end_if control elements');
        // Filter to message elements only
        const messageElements = graph.elements.filter(e => e.kind === 'message');
        assert.strictEqual(messageElements.length, 0, 'Should not detect messages in predef sections or ECHO lines');
        // Verify control flow elements
        const controlElements = graph.elements.filter(e => e.kind === 'control');
        assert.strictEqual(controlElements.length, 2, 'Should have if and end_if control elements');
    });

    test('parseSwimlaneGraph should preserve participant insertion order', () => {
        const doc = makeDoc(`API: Call1 -@ ModuleA => r1
API: Call2 -@ ModuleB => r2
API: Call3 -@ ModuleA => r3`);
        const graph = parseSwimlaneGraph(doc);

        // Engine is first, then ModuleA, then ModuleB (order of first appearance)
        assert.strictEqual(graph.participants[0], 'Engine');
        assert.strictEqual(graph.participants[1], 'ModuleA');
        assert.strictEqual(graph.participants[2], 'ModuleB');
        assert.strictEqual(graph.participants.length, 3);
    });

    test('parseSwimlaneGraph should return correct line numbers', () => {
        const doc = makeDoc(`ECHO >> Hello
API: Boot -@ Fixture => r`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            assert.strictEqual(graph.elements[0].message.lineNumber, 1, 'Should be line 1 (0-based)');
        }
    });

    // ------------------------------------------------------------------
    // generateSwimlaneDiagram tests
    // ------------------------------------------------------------------

    test('generateSwimlaneDiagram should start with sequenceDiagram', () => {
        const doc = makeDoc(`API: Boot -@ Fixture`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.startsWith('sequenceDiagram'), 'Diagram must start with sequenceDiagram directive');
    });

    test('generateSwimlaneDiagram should declare all participants', () => {
        const doc = makeDoc(`API: Boot -@ FixtureController => bootCode
API: Trace ->| Logger`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('participant Engine'), 'Should declare Engine participant');
        assert.ok(diagram.includes('participant FixtureController'), 'Should declare FixtureController');
        assert.ok(diagram.includes('participant Logger'), 'Should declare Logger');
    });

    test('generateSwimlaneDiagram should use ->> for sync calls', () => {
        const doc = makeDoc(`API: Boot -@ Fixture => r`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('Engine->>Fixture:'), 'Should use ->> for sync call');
        assert.ok(diagram.includes('Fixture-->>Engine:'), 'Should use -->> for sync return');
    });

    test('generateSwimlaneDiagram should use -) for async calls', () => {
        const doc = makeDoc(`API: Prepare -> WorkerModule => prepResult`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('Engine-)'), 'Should use -) for async call');
        assert.ok(diagram.includes('WorkerModule--) Engine:'), 'Should use Mermaid --) syntax for async return arrow');
    });

    test('generateSwimlaneDiagram should omit return arrow for fire-and-forget', () => {
        const doc = makeDoc(`API: Trace ->| Logger`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        // There should be exactly one arrow line (no return)
        const arrowLines = diagram.split('\n').filter(l => l.includes('Engine-)') || l.includes('->>'));
        assert.strictEqual(arrowLines.length, 1, 'Fire-and-forget should produce exactly one arrow line');
        assert.ok(!diagram.includes('Logger-->>Engine'), 'Should not have return arrow');
    });

    test('generateSwimlaneDiagram should show note when no messages found', () => {
        const doc = makeDoc(`ECHO >> Hello`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('note over Engine:'), 'Should show note when no messages');
        assert.ok(diagram.includes('No inter-module communication found'), 'Note should explain empty diagram');
    });

    test('generateSwimlaneDiagram should sanitize participant names with hyphens', () => {
        const doc = makeDoc(`API: Call -@ Worker-Module => result`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        // Hyphens in participant names must be replaced with _ for valid Mermaid IDs
        assert.ok(!diagram.includes('participant Worker-Module'), 'Should not use hyphen in participant ID');
        assert.ok(diagram.includes('participant Worker_Module'), 'Should sanitize hyphen to underscore');
    });

    test('generateSwimlaneDiagram full sample: multiple message types', () => {
        const doc = makeDoc(
`API: Boot >> \${deviceId} -@ Fixture => bootCode
API: Prepare >> \${bootCode} -> Worker => prepResult
API: Trace >> start ->| Logger
StatusChanged@Worker >> API: OnStatus -><register>`
        );
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.startsWith('sequenceDiagram'));
        // Participants
        assert.ok(diagram.includes('participant Engine'));
        assert.ok(diagram.includes('participant Fixture'));
        assert.ok(diagram.includes('participant Worker'));
        assert.ok(diagram.includes('participant Logger'));
        // Sync call and return
        assert.ok(diagram.includes('Engine->>Fixture:'));
        assert.ok(diagram.includes('Fixture-->>Engine:'));
        // Async call and return
        assert.ok(diagram.includes('Engine-) Worker:'));
        // Fire-and-forget
        assert.ok(diagram.includes('Engine-) Logger:'));
        // Subscribe
        assert.ok(diagram.includes('Engine->>Worker:'));
    });

    // ------------------------------------------------------------------
    // Color differentiation via rect blocks
    // ------------------------------------------------------------------

    test('generateSwimlaneDiagram should wrap sync calls in blue rect', () => {
        const doc = makeDoc(`API: Boot -@ Fixture => r`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('rect rgba(70,130,180,0.15)'), 'Sync call should use blue rect');
    });

    test('generateSwimlaneDiagram should wrap async calls in green rect', () => {
        const doc = makeDoc(`API: Prepare -> Worker => r`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('rect rgba(60,179,113,0.15)'), 'Async call should use green rect');
    });

    test('generateSwimlaneDiagram should wrap fire-forget calls in orange rect', () => {
        const doc = makeDoc(`API: Trace ->| Logger`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('rect rgba(255,140,0,0.15)'), 'Fire-forget should use orange rect');
    });

    test('generateSwimlaneDiagram should wrap subscribe calls in purple rect', () => {
        const doc = makeDoc(`StatusChanged@Worker >> API: OnStatus -><register>`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('rect rgba(147,112,219,0.15)'), 'Subscribe call should use purple rect');
    });

    // ------------------------------------------------------------------
    // Control flow tests
    // ------------------------------------------------------------------

    test('parseSwimlaneGraph should parse if/end_if control flow', () => {
        const doc = makeDoc(`<if \${x} > 0>
API: Call -@ Module
<end_if>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 3);
        assert.strictEqual(graph.elements[0].kind, 'control');
        if (graph.elements[0].kind === 'control') {
            assert.strictEqual(graph.elements[0].control.type, 'if');
            assert.strictEqual(graph.elements[0].control.condition, '\${x} > 0');
        }
        assert.strictEqual(graph.elements[1].kind, 'message');
        assert.strictEqual(graph.elements[2].kind, 'control');
        if (graph.elements[2].kind === 'control') {
            assert.strictEqual(graph.elements[2].control.type, 'end_if');
        }
    });

    test('parseSwimlaneGraph should parse while/end_while control flow', () => {
        const doc = makeDoc(`<while \${i} < 10>
API: Process -@ Worker
<end_while>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 3);
        assert.strictEqual(graph.elements[0].kind, 'control');
        if (graph.elements[0].kind === 'control') {
            assert.strictEqual(graph.elements[0].control.type, 'while');
            assert.strictEqual(graph.elements[0].control.condition, '\${i} < 10');
        }
    });

    test('parseSwimlaneGraph should parse foreach/end_foreach control flow', () => {
        const doc = makeDoc(`<foreach item in items>
API: Handle -@ Processor
<end_foreach>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 3);
        assert.strictEqual(graph.elements[0].kind, 'control');
        if (graph.elements[0].kind === 'control') {
            assert.strictEqual(graph.elements[0].control.type, 'foreach');
            assert.strictEqual(graph.elements[0].control.condition, 'item in items');
        }
    });

    test('parseSwimlaneGraph should parse do_while/end_do_while control flow', () => {
        const doc = makeDoc(`<do_while>
API: Retry -@ Service
<end_do_while \${result} == error>`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 3);
        assert.strictEqual(graph.elements[0].kind, 'control');
        if (graph.elements[0].kind === 'control') {
            assert.strictEqual(graph.elements[0].control.type, 'do_while');
        }
        assert.strictEqual(graph.elements[2].kind, 'control');
        if (graph.elements[2].kind === 'control') {
            assert.strictEqual(graph.elements[2].control.type, 'end_do_while');
            assert.strictEqual(graph.elements[2].control.condition, '\${result} == error');
        }
    });

    test('generateSwimlaneDiagram should render if/else/end control flow', () => {
        const doc = makeDoc(`<if \${x} > 0>
API: Positive -@ Module1
<else>
API: Negative -@ Module2
<end_if>`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('alt'), 'Should use alt for if statement');
        assert.ok(diagram.includes('else'), 'Should include else');
        assert.ok(diagram.includes('end'), 'Should include end');
    });

    test('generateSwimlaneDiagram should render while loop', () => {
        const doc = makeDoc(`<while \${count} < 5>
API: Process -@ Worker
<end_while>`);
        const graph = parseSwimlaneGraph(doc);
        const diagram = generateSwimlaneDiagram(graph);

        assert.ok(diagram.includes('loop while'), 'Should use loop for while statement');
    });

    // ------------------------------------------------------------------
    // CMD_ALIAS tests
    // ------------------------------------------------------------------

    test('parseSwimlaneGraph should parse COMMAND_ALIAS definitions', () => {
        const doc = makeDoc(`[COMMAND_ALIAS]
ConnectDB = API: Connect >> \${host} -@ DatabaseModule

<entry>
ConnectDB`);
        const graph = parseSwimlaneGraph(doc);

        assert.ok(graph.commandAliases.has('ConnectDB'));
        assert.strictEqual(graph.commandAliases.get('ConnectDB'), 'API: Connect >> \${host} -@ DatabaseModule');
    });

    test('parseSwimlaneGraph should expand COMMAND_ALIAS in messages', () => {
        const doc = makeDoc(`[COMMAND_ALIAS]
SendData = API: Send >> \${payload} -> DataModule => result

<entry>
SendData`);
        const graph = parseSwimlaneGraph(doc);

        assert.strictEqual(graph.elements.length, 1);
        assert.strictEqual(graph.elements[0].kind, 'message');
        if (graph.elements[0].kind === 'message') {
            const msg = graph.elements[0].message;
            assert.strictEqual(msg.type, 'async');
            assert.strictEqual(msg.to, 'DataModule');
            assert.ok(msg.label.includes('API: Send'));
        }
    });
});
