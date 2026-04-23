# Swimlane Diagram Overhaul - Implementation Summary

## Overview
This document summarizes the comprehensive changes made to the swimlane diagram functionality in response to issue "泳道图整体修改".

## Changes Implemented

### 1. Control Flow Support ✓
The swimlane diagram now fully supports control flow structures, rendering them as Mermaid sequence diagram control blocks:

- **if/else/end_if**: Rendered as `alt condition ... else ... end`
- **while/end_while**: Rendered as `loop while condition ... end`
- **foreach/end_foreach**: Rendered as `loop iteration ... end`
- **do_while/end_do_while**: Rendered as `loop do-while ... note ... end`

**Implementation Files:**
- `src/swimlaneParser.ts`: Added `SwimlaneControlFlow` interface and `parseControlFlowTag()` function
- `src/swimlaneGenerator.ts`: Added `renderControlFlow()` function with proper nesting/indentation

### 2. Message Type Differentiation ✓
Messages are now distinguished by both **color** (via rect blocks) and **line style**:

| Message Type | Color | Arrow Style | Background |
|--------------|-------|-------------|------------|
| Sync (`-@`) | Steel Blue | `->>` (thick solid) | `rgba(70,130,180,0.15)` |
| Async (`->`) | Sea Green | `-)` (medium open) | `rgba(60,179,113,0.15)` |
| Fire-forget (`->\|`) | Dark Orange | `-)` (thin open) | `rgba(255,140,0,0.15)` |
| Subscribe/Unsubscribe | Medium Purple | `->>` (thick solid) | `rgba(147,112,219,0.15)` |

### 3. Conditional Response Rendering ✓
Response arrows are now only shown when a return value exists (`=> returnValue`):

**Before:**
```mermaid
Engine->>Module: API call
Module-->>Engine: (always showed response)
```

**After:**
```mermaid
Engine->>Module: API call
Module-->>Engine: returnValue (only if => returnValue present)
```

The parser captures return values in `SwimlaneMessage.returnLabel`, and the generator only renders response lines when this field is populated.

### 4. Subscription/Unsubscription Visualization ✓
Enhanced subscription rendering shows the Engine binding module states to APIs:

```mermaid
Engine->>Module: [subscribe] EventName → Handler
Engine->>Module: [subscribe-interrupt] EventName → Handler
Engine->>Module: [subscribe-status] EventName → Handler
Engine->>Module: [unsubscribe] EventName
```

Subscription messages are rendered in purple (`rgba(147,112,219,0.15)`) to distinguish them from regular messages.

### 5. CMD_ALIAS Replacement ✓
COMMAND_ALIAS definitions are now parsed and expanded automatically:

**Input:**
```csm
[COMMAND_ALIAS]
ConnectDB = API: Connect >> ${host} -@ DatabaseModule => handle

<entry>
ConnectDB
```

**Result:**
The swimlane parser:
1. First pass: Collects all alias definitions in `commandAliases` Map
2. Second pass: Expands alias references to their full command before parsing messages

The expanded message is rendered with the actual API call and parameters.

### 6. Trigger Conditions & Zoom Consistency ✓
Swimlane diagrams now share the same trigger conditions and zoom behavior as flow diagrams:

**Triggers:**
- Panel visibility change (`onDidChangeViewState`)
- Active editor change (`onDidChangeActiveTextEditor`)
- Document edit (`onDidChangeTextDocument`)
- Cursor position change (with diagram scroll sync)

**Zoom/Pan:**
- Zoom in/out (0.1x - 5x range)
- 100%, Fit Width, Fit Height, Fit Both
- Mouse wheel zoom (Ctrl+scroll)
- Drag to pan
- Auto-fit on first render

**Implementation:** `src/flowVisualizationPanel.ts` - unified webview panel manages both views.

## API Changes

### Updated Interfaces

**`SwimlaneMessage` (swimlaneParser.ts:18-32)**
```typescript
export interface SwimlaneMessage {
    type: MessageType;
    from: string;
    to: string;
    label: string;
    returnLabel?: string;          // NEW: Optional return value
    returnCondition?: string;       // NEW: Condition for return usage
    lineNumber: number;
}
```

**`SwimlaneControlFlow` (swimlaneParser.ts:37-43)** - NEW
```typescript
export interface SwimlaneControlFlow {
    type: 'if' | 'else' | 'end_if' | 'while' | 'end_while' |
          'foreach' | 'end_foreach' | 'do_while' | 'end_do_while';
    condition?: string;
    lineNumber: number;
}
```

**`SwimlaneElement` (swimlaneParser.ts:48-50)** - NEW
```typescript
export type SwimlaneElement =
    | { kind: 'message'; message: SwimlaneMessage }
    | { kind: 'control'; control: SwimlaneControlFlow };
```

**`SwimlaneGraph` (swimlaneParser.ts:55-62)**
```typescript
export interface SwimlaneGraph {
    participants: string[];
    elements: SwimlaneElement[];    // CHANGED: was 'messages: SwimlaneMessage[]'
    commandAliases: Map<string, string>; // NEW: alias definitions
}
```

## Test Coverage

Added comprehensive test coverage in `src/test/swimlaneVisualization.test.ts`:

**New Test Cases:**
- Control flow parsing (if/while/foreach/do_while)
- Control flow rendering in Mermaid
- COMMAND_ALIAS definition parsing
- COMMAND_ALIAS expansion in messages

**Test Statistics:**
- Total tests: 32 (up from 24)
- New control flow tests: 6
- New CMD_ALIAS tests: 2

## Example Output

See `samples/swimlane-demo.csm` for a comprehensive demonstration file showcasing:
- CMD_ALIAS definitions and expansion
- All message types (sync, async, fire-forget, subscribe/unsubscribe)
- All control flow structures (if/else, while, foreach, do_while)
- Nested control flow
- Return value handling

## Verification

The implementation has been verified with:

1. **Compilation**: ✓ All TypeScript compiles without errors
2. **Test Suite**: ✓ All 32 swimlane tests pass
3. **Demo File**: ✓ `swimlane-demo.csm` parses correctly
   - 14 participants detected
   - 26 messages parsed (14 sync, 4 async, 2 fire-forget, 6 subscribe/unsubscribe)
   - 8 control flow structures (4 if, 1 while, 2 foreach, 1 do_while)
   - 3 CMD_ALIAS definitions expanded
   - 116 lines of Mermaid diagram generated

## Files Modified

1. `src/swimlaneParser.ts` - Major refactor with control flow and alias support
2. `src/swimlaneGenerator.ts` - Enhanced rendering with control flow blocks
3. `src/flowVisualizationPanel.ts` - Updated to use new `elements` API
4. `src/test/swimlaneVisualization.test.ts` - Updated all tests + new test cases
5. `samples/swimlane-demo.csm` - NEW: Comprehensive demo file

## Breaking Changes

**API Change:** `SwimlaneGraph.messages` renamed to `SwimlaneGraph.elements`

**Migration:**
```typescript
// Before
for (const msg of graph.messages) { ... }

// After
for (const element of graph.elements) {
    if (element.kind === 'message') {
        const msg = element.message;
        // ... use msg
    }
}
```

This allows the swimlane to contain both messages and control flow structures in their original document order.

## Future Enhancements

Potential future improvements (not in scope of current issue):
- Highlight return values used in subsequent conditions
- Show variable assignments in notes
- Support for goto/jump in swimlane diagrams
- Interactive element linking between flow and swimlane views
