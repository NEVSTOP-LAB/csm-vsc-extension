export const hoverTranslations = {
    // operators.ts
    '-@': {
        summary: '`-@` — Synchronous Call',
        detail: `Sends a message to the target module and **waits for its return** before continuing execution.

**Format**
\`\`\`
API: StateName >> Arguments -@ TargetModule
\`\`\`

**Example**
\`\`\`
API: Initialize >> device:Dev1 -@ DAQ
API: QueryInfo  >> \${sn}       -@ DatabaseModule => code;name
\`\`\``,
    },
    '->': {
        summary: '`->` — Asynchronous Call',
        detail: `Sends a message to the target module and continues execution **without waiting for return**.

**Format**
\`\`\`
API: StateName >> Arguments -> TargetModule
\`\`\`

**Example**
\`\`\`
API: Prepare >> \${bootCode} -> WorkerModule
\`\`\``,
    },
    '->|': {
        summary: '`->|` — Fire-and-Forget',
        detail: `Sends a message to the target module and **does not wait for any response** (Fire-and-Forget).
Suitable for logging, notifications, etc., where the result is not a concern.

**Format**
\`\`\`
API: StateName >> Arguments ->| TargetModule
\`\`\`

**Example**
\`\`\`
API: Trace >> prepare-start ->| Logger
\`\`\``,
    },
    '>>': {
        summary: '`>>` — Argument Separator',
        detail: `Separates the instruction/state name from its arguments.

**Format**
\`\`\`
Instruction >> Arguments
API: StateName >> Arguments -@ Module
\`\`\``,
    },
    '@': {
        summary: '`@` — Module Address Separator',
        detail: `Separates the state name and module name, used for subscribe/unsubscribe operations.

**Format**
\`\`\`
Status@SourceModule >> Handler@HandlerModule -><register>
\`\`\``,
    },
    '=>': {
        summary: '`=>` — Return Value Save',
        detail: `Saves the return value of an instruction to a specified variable, which can then be referenced via \`\${varName}\`.

Supports using a semicolon \`;\` to separate multiple variable names to save multiple return values.

**Format**
\`\`\`
Instruction >> Arguments => varName
API: QueryInfo >> args -@ Module => field1;field2;field3
\`\`\`

**Example**
\`\`\`
API: Boot >> \${sn} -@ Fixture => bootCode
EXPRESSION >> \${bootCode} + 1 => nextCode
\`\`\``,
    },
    '-><REGISTER>': {
        summary: '`-><register>` — Subscribe',
        detail: `Registers a status from the source module to the handler module, establishing a subscription relationship.

**Format**
\`\`\`
Status@SourceModule >> Handler@HandlerModule -><register>
\`\`\`

**Example**
\`\`\`
StatusChanged@WorkerModule >> API: OnStatus -><register>
\`\`\``,
    },
    '-><UNREGISTER>': {
        summary: '`-><unregister>` — Unsubscribe',
        detail: `Cancels the subscription relationship previously established via \`-><register>\`.

**Format**
\`\`\`
Status@SourceModule >> Handler@HandlerModule -><unregister>
\`\`\``,
    },
    '-><REGISTER AS INTERRUPT>': {
        summary: '`-><register as interrupt>` — Register as Interrupt Subscription',
        detail: `Registers the source module status as an **interrupt** type, associated with the handler module.
Interrupt priority is higher than normal status messages.

**Format**
\`\`\`
Status@SourceModule >> Handler -><register as interrupt>
\`\`\``,
    },
    '-><REGISTER AS STATUS>': {
        summary: '`-><register as status>` — Register as Status Subscription',
        detail: `Registers the source module interrupt as a **normal status** type, associated with the handler module.

**Format**
\`\`\`
Interrupt@SourceModule >> Handler -><register as status>
\`\`\``,
    },
    '<STATUS>': {
        summary: '`<status>` — Broadcast Normal Status Target',
        detail: `Broadcasts the message as a **normal status**; all modules subscribed to this status will receive it.

**Format**
\`\`\`
API: PublishStatus >> \${result} -> <status>
\`\`\``,
    },
    '<INTERRUPT>': {
        summary: '`<interrupt>` — Broadcast Interrupt Status Target',
        detail: `Broadcasts the message as an **interrupt**; interrupt priority is higher than normal status messages.

**Format**
\`\`\`
API: SendInterrupt >> fault -> <interrupt>
\`\`\``,
    },
    '<BROADCAST>': {
        summary: '`<broadcast>` — Broadcast Message Target',
        detail: `Broadcasts the message to all modules.

**Format**
\`\`\`
API: BroadcastEvent >> ALL_OK -> <broadcast>
\`\`\``,
    },
    '<ALL>': {
        summary: '`<all>` — Broadcast to All Targets',
        detail: `Broadcasts the message to all connected modules.

**Format**
\`\`\`
API: BroadcastAll >> payload -> <all>
\`\`\``,
    },
    '${': {
        summary: '`\${varname}` / \`\${varname:default}\` — Variable Reference',
        detail: `Replaces the placeholder with the value of the corresponding variable at runtime.
Supports setting a default value: used when the variable is undefined.

**Variable Search Order** (Priority from high to low):
1. Temporary variable space (\`=>\` saved return values)
2. TagDB variable space (requires \`TAGDB_VAR_SPACE_ENABLE\`)
3. INI configuration variable space (requires \`INI_VAR_SPACE_ENABLE\`)

**Format**
\`\`\`
\${varname}          // No default value
\${varname:default}  // With default value
\${section.varname}  // Specify INI section name
\${tagdb.varname}    // Specify TagDB name
\`\`\``,
    },

    // commands.ts
    '[COMMAND_ALIAS]': {
        summary: '`[COMMAND_ALIAS]` — Command Alias Section (Pre-definition Section)',
        detail: `Defines instruction aliases in the **pre-definition section**, mapping CSM message instructions to short custom names.
Simplifies reuse of long instructions and improves script readability.

> Equivalent names can also be used: \`Command_Alias\`, \`CommandAlias\`, \`Command-Alias\`, \`CMD_Alias\`, etc.

**Format**
\`\`\`ini
[COMMAND_ALIAS]
AliasName = API: StateName >> Args -@ ModuleName
\`\`\`

**Example**
\`\`\`ini
[COMMAND_ALIAS]
DAQ-Init  = API: Initialize -@ DAQ
DAQ-Read  = API: fetch Data -@ DAQ
DAQ-Close = API: Close      -@ DAQ
\`\`\``,
    },
    '[AUTO_ERROR_HANDLE]': {
        summary: '`[AUTO_ERROR_HANDLE]` — Auto Error Handle Section (Pre-definition Section)',
        detail: `Configures automatic error handling behavior during script execution in the **pre-definition section**.

| Key | Description | Default Value |
|---|---|---|
| \`Enable\` | Whether to enable automatic error handling, \`TRUE\` or \`FALSE\` | \`FALSE\` |
| \`Anchor\` | The name of the anchor to jump to when an error occurs | \`<cleanup>\` |

**Example**
\`\`\`ini
[AUTO_ERROR_HANDLE]
Enable = TRUE
Anchor = <error_handler>
\`\`\`

Can also be dynamically configured in the script area using \`AUTO_ERROR_HANDLE_ENABLE\` and \`AUTO_ERROR_HANDLE_ANCHOR\` instructions.`,
    },
    '[INI_VAR_SPACE]': {
        summary: '`[INI_VAR_SPACE]` — INI Var Space Section (Pre-definition Section)',
        detail: `Enables the INI file configuration variable space in the **pre-definition section**, allowing scripts to read keys from INI files via \`\${variableName}\`.

| Key | Description |
|---|---|
| \`Enable\` | Whether to enable, \`TRUE\` or \`FALSE\` |
| \`Path\`   | Path to the INI file |

**Example**
\`\`\`ini
[INI_VAR_SPACE]
Enable = TRUE
Path = ./config.ini
\`\`\``,
    },
    '[TAGDB_VAR_SPACE]': {
        summary: '`[TAGDB_VAR_SPACE]` — TagDB Variable Space Section (Pre-definition Section)',
        detail: `Enables the TagDB variable space in the **pre-definition section**, allowing scripts to read TagDB data via \`\${variableName}\`.

| Key | Description |
|---|---|
| \`Enable\` | Whether to enable, \`TRUE\` or \`FALSE\` |
| \`Name\`   | TagDB name, supports multiple names separated by commas |

**Example**
\`\`\`ini
[TAGDB_VAR_SPACE]
Enable = TRUE
Name = tagdb_main,tagdb_backup
\`\`\``,
    },
    'GOTO': {
        summary: '`GOTO` — Jump to Anchor',
        detail: `Jumps to the specified **anchor** position in the script to continue execution.

> **Note**: When used inside a loop body, the target anchor must be located **within the current loop body**, otherwise an error will occur.

**Format**
\`\`\`
GOTO >> <anchor_name>
\`\`\`

**Example**
\`\`\`
GOTO >> <cleanup>
GOTO >> cleanup   // The <> can be omitted
\`\`\``,
    },
    'JUMP': {
        summary: '`JUMP` — Jump to Anchor',
        detail: `Equivalent to \`GOTO\`, jumps to the specified **anchor** position in the script to continue execution.

**Format**
\`\`\`
JUMP >> <anchor_name>
\`\`\``,
    },
    'WAIT': {
        summary: '`WAIT` — Wait',
        detail: `Waits for a specified time before continuing script execution. Default unit is seconds (s).

**Variants**
- \`WAIT\` — Parses a time string, supports composite formats like \`1min 20s 500ms\`
- \`WAIT(s)\` — Parameter is a floating-point number, unit seconds
- \`WAIT(ms)\` — Parameter is an integer, unit milliseconds

**Example**
\`\`\`
WAIT >> 1s
WAIT >> 1min 20s 500ms
WAIT(s) >> 1.5
WAIT(ms) >> 100
\`\`\``,
    },
    'WAIT(S)': {
        summary: '`WAIT(s)` — Wait (seconds)',
        detail: `Waits for the specified number of seconds. Parameter is a **floating-point number**.

**Example**
\`\`\`
WAIT(s) >> 1.5
\`\`\``,
    },
    'WAIT(MS)': {
        summary: '`WAIT(ms)` — Wait (milliseconds)',
        detail: `Waits for the specified number of milliseconds. Parameter is an **integer**.

**Example**
\`\`\`
WAIT(ms) >> 500
\`\`\``,
    },
    'SLEEP': {
        summary: '`SLEEP` — Sleep',
        detail: `Equivalent to \`WAIT\`, waits for a specified time before continuing script execution.
Supports \`SLEEP(s)\` and \`SLEEP(ms)\` variants.`,
    },
    'SLEEP(S)': {
        summary: '`SLEEP(s)` — Sleep (seconds)',
        detail: 'Equivalent to `WAIT(s)`. Parameter is a floating-point number, unit seconds.',
    },
    'SLEEP(MS)': {
        summary: '`SLEEP(ms)` — Sleep (milliseconds)',
        detail: 'Equivalent to `WAIT(ms)`. Parameter is an integer, unit milliseconds.',
    },
    'BREAK': {
        summary: '`BREAK` — Break Loop',
        detail: `Breaks out of the **current level of the loop** and continues executing the script after the loop.
Can be used in \`<while>\`, \`<do_while>\`, and \`<foreach>\` loops.
Has no effect when not used in a loop.

**Example**
\`\`\`
<while \${count:0} < 100>
  EXPRESSION >> \${count:0} + 1 => count
  <if \${count:0} > 30>
    BREAK
  <end_if>
<end_while>
\`\`\``,
    },
    'CONTINUE': {
        summary: '`CONTINUE` — Continue Next Loop Iteration',
        detail: `Ends the **current iteration** of the loop and jumps to the start of the next iteration.
Can be used in \`<while>\`, \`<do_while>\`, and \`<foreach>\` loops.

**Example**
\`\`\`
<foreach item in \${list:a;b;c}>
  <if \${skip}=1>
    CONTINUE
  <end_if>
  ECHO >> Current item: \${item}
<end_foreach>
\`\`\``,
    },
    'ECHO': {
        summary: '`ECHO` — Echo Output',
        detail: `Outputs specified information to the script execution result interface and broadcasts an event with the same name.
ECHO performs **full string replacement**, replacing variable placeholders with values before outputting the entire string as a message.

**Variants**: \`ECHO0\`–\`ECHO9\` correspond to different broadcast channels.

**Format**
\`\`\`
ECHO >> message
ECHO >> \${varname}
ECHO >> text => varname   // Output and save to variable
\`\`\`

> **Tip**: To evaluate numeric expressions, use the \`EXPRESSION\` instruction.`,
    },
    'EXPRESSION': {
        summary: '`EXPRESSION` — Evaluate Expression',
        detail: `Evaluates the specified expression, resulting in a **numeric** type (DBL or 1/0).

**Three Processing Modes**:
1. **Range expression** (using \`∈\` or \`!∈\`): Returns 1 (true) or 0 (false)
2. **String comparison** (forms like \`variable equal(...)\`): Returns 1 or 0
3. **Arithmetic/Logic expression**: Returns DBL calculation result

**Format**
\`\`\`
EXPRESSION >> expr => varName
\`\`\`

**Example**
\`\`\`
EXPRESSION >> 3 + 5 * (2 - 1) => result      // Result: 8
EXPRESSION >> \${temp:25} ∈ [0,100] => ok     // Range check
EXPRESSION >> \${str} equal("hello") => matched // String comparison
\`\`\``,
    },
    'RANDOM': {
        summary: '`RANDOM` — Generate Random Float',
        detail: `Generates a random **floating-point number** within the specified range. Parameter is in API String format, supports \`MIN\` and \`MAX\` parameters, default range [0, 1].

**Variants**: \`RANDOM(DBL)\`, \`RANDOMDBL\`

**Example**
\`\`\`
RANDOM >> MIN=0,MAX=1 => rndVal
RANDOM(DBL) >> MIN=0,MAX=100 => rndDbl
\`\`\``,
    },
    'RANDOMDBL': {
        summary: '`RANDOMDBL` — Generate Random Float (Same as RANDOM)',
        detail: 'Equivalent to `RANDOM`, generates a random floating-point number within the specified range.',
    },
    'RANDOM(DBL)': {
        summary: '`RANDOM(DBL)` — Generate Random Float',
        detail: 'Equivalent to `RANDOM`, generates a random floating-point number within the specified range.',
    },
    'RANDOMINT': {
        summary: '`RANDOMINT` — Generate Random Integer',
        detail: `Generates a random **integer** within the specified range.

**Variants**: \`RANDOM(INT)\`

**Example**
\`\`\`
RANDOMINT >> MIN=1,MAX=100 => rndInt
RANDOM(INT) >> MIN=0,MAX=9 => rndInt2
\`\`\``,
    },
    'RANDOM(INT)': {
        summary: '`RANDOM(INT)` — Generate Random Integer',
        detail: 'Equivalent to `RANDOMINT`, generates a random integer within the specified range.',
    },
    'AUTO_ERROR_HANDLE_ENABLE': {
        summary: '`AUTO_ERROR_HANDLE_ENABLE` — Enable/Disable Auto Error Handling',
        detail: `Dynamically **enables or disables** the automatic error handling feature during script execution.
When enabled, the script will automatically jump to the set anchor upon encountering an error.

**Format**
\`\`\`
AUTO_ERROR_HANDLE_ENABLE >> TRUE   // Enable
AUTO_ERROR_HANDLE_ENABLE >> FALSE  // Disable
\`\`\`

> Can also be statically configured in the \`[AUTO_ERROR_HANDLE]\` pre-definition section.`,
    },
    'AUTO_ERROR_HANDLE_ANCHOR': {
        summary: '`AUTO_ERROR_HANDLE_ANCHOR` — Set Error Jump Anchor',
        detail: `Sets the target **anchor** to jump to for automatic error handling, defaults to \`<cleanup>\`.

**Format**
\`\`\`
AUTO_ERROR_HANDLE_ANCHOR >> <error_handler>
AUTO_ERROR_HANDLE_ANCHOR >> error_handler  // The <> can be omitted
\`\`\``,
    },
    'INI_VAR_SPACE_ENABLE': {
        summary: '`INI_VAR_SPACE_ENABLE` — Enable/Disable INI Var Space',
        detail: `Dynamically enables or disables the INI file configuration variable space.
When enabled, variables in the INI file can be referenced via \`\${section.key}\`.

**Format**
\`\`\`
INI_VAR_SPACE_ENABLE >> TRUE
\`\`\``,
    },
    'INI_VAR_SPACE_PATH': {
        summary: '`INI_VAR_SPACE_PATH` — Set INI Config File Path',
        detail: `Specifies the file path used by the INI configuration variable space.

**Format**
\`\`\`
INI_VAR_SPACE_PATH >> ./config.ini
\`\`\``,
    },
    'TAGDB_VAR_SPACE_ENABLE': {
        summary: '`TAGDB_VAR_SPACE_ENABLE` — Enable/Disable TagDB Variable Space',
        detail: `Dynamically enables or disables TagDB variable space support.
When enabled, data in TagDB can be referenced via \`\${tagName.varName}\`.

**Format**
\`\`\`
TAGDB_VAR_SPACE_ENABLE >> TRUE
\`\`\``,
    },
    'TAGDB_VAR_SPACE_NAME': {
        summary: '`TAGDB_VAR_SPACE_NAME` — Set TagDB Variable Space Names',
        detail: `Specifies the names of the TagDB variable spaces, supports multiple names separated by commas (searched in order).

**Format**
\`\`\`
TAGDB_VAR_SPACE_NAME >> tagdb_main,tagdb_backup
\`\`\``,
    },
    'TAGDB_GET_VALUE': {
        summary: '`TAGDB_GET_VALUE` — Read Data from TagDB',
        detail: `Reads floating-point data from TagDB.

- **Input Parameters**: TagDB variable names, supports comma-separated array format
- **Output Parameters**: Key-value pairs read, e.g., \`tag1=10.5,tag2=20.3\`

**Example**
\`\`\`
TAGDB_GET_VALUE >> /line/station/result => tagResult
TAGDB_GET_VALUE >> tag1,tag2 => tagValues
\`\`\``,
    },
    'TAGDB_SET_VALUE': {
        summary: '`TAGDB_SET_VALUE` — Write Data to TagDB',
        detail: `Writes floating-point data to TagDB.

- **Input Parameters**: Data key-value pairs, supports array format, e.g., \`tag1=10.5,tag2=20.3\`

**Example**
\`\`\`
TAGDB_SET_VALUE >> /line/station/result,PASS
\`\`\``,
    },
    'TAGDB_SWEEP': {
        summary: '`TAGDB_SWEEP` — Sweep TagDB Data',
        detail: `Sweeps data in TagDB according to specified scanning parameters.

**Parameters**
- \`tag\`: Variable name to sweep
- \`Start\`: Starting value
- \`Stop\`: Ending value
- \`Step\` or \`Points\`: Step size or number of points (choose one)
- \`interval\`: Time interval per step (milliseconds)
- \`Async\`: Whether to sweep asynchronously (default FALSE)

**Example**
\`\`\`
TAGDB_SWEEP >> /line/station/*
\`\`\``,
    },
    'TAGDB_WAIT_FOR_EXPRESSION': {
        summary: '`TAGDB_WAIT_FOR_EXPRESSION` — Wait for TagDB Expression Condition',
        detail: `Blocks execution until data in TagDB meets the specified expression condition, or a timeout occurs.

**Parameters**
- \`exp\`: Expression string, e.g., \`tag1 > 10 && tag2 < 20\`
- \`timeout\`: Timeout duration (milliseconds, supports \`1min 20s 500ms\` format)
- \`settlingTime\`: Settling time (milliseconds)

- **Output Parameters**: Boolean (1 indicates condition met, 0 indicates timeout)`,
    },
    'TAGDB_START_MONITOR_EXPRESSION': {
        summary: '`TAGDB_START_MONITOR_EXPRESSION` — Start TagDB Expression Monitoring',
        detail: `Continuously monitors TagDB data in the background; when the expression is met, an **error is generated** (triggering auto error handling).

**Parameters**
- \`exp\`: Expression string
- \`settlingTime\`: Settling time (milliseconds)`,
    },
    'TAGDB_STOP_MONITOR_EXPRESSION': {
        summary: '`TAGDB_STOP_MONITOR_EXPRESSION` — Stop TagDB Expression Monitoring',
        detail: `Stops the monitoring previously started via \`TAGDB_START_MONITOR_EXPRESSION\`.

**Parameters**: The expression string to stop (must match the one used at start)`,
    },
    'TAGDB_WAIT_FOR_STABLE': {
        summary: '`TAGDB_WAIT_FOR_STABLE` — Wait for TagDB Data to Stabilize',
        detail: `Waits for data from specified TagDB variables to stabilize (monotonic trend changes).

**Parameters**
- \`tag\`: Variable names to monitor, supports array format
- \`timeout\`: Timeout duration (milliseconds)
- \`Period\`: Check step size (milliseconds) to avoid misjudgment due to short-term fluctuations

- **Output Parameters**: Boolean (1 indicates stabilized, 0 indicates timeout)`,
    },
    'ONE_BUTTON_DIALOG': {
        summary: '`ONE_BUTTON_DIALOG` — One-Button Dialog',
        detail: `Pops up a dialog box with a single button, waiting for the user to click before continuing execution.

**Parameters** (API String format)
- \`Message\`: Display content
- \`Btn\`: Button text (defaults to system string)
- \`Timeout\`: Timeout in seconds, default -1 (no timeout)

**Example**
\`\`\`
ONE_BUTTON_DIALOG >> Message: Are you OK?; Timeout:5 => ret
\`\`\``,
    },
    'TWO_BUTTON_DIALOG': {
        summary: '`TWO_BUTTON_DIALOG` — Two-Button Dialog',
        detail: `Pops up a dialog box with Confirmation/Cancel buttons, returning \`TRUE\` (Confirm) or \`FALSE\` (Cancel).

**Parameters** (API String format)
- \`Message\`: Display content
- \`OKBtn\`: Confirmation button text
- \`CancelBtn\`: Cancel button text
- \`OKTMO\`: Confirmation button timeout in seconds (default -1)
- \`CancelTMO\`: Cancel button timeout in seconds (default -1)

**Example**
\`\`\`
TWO_BUTTON_DIALOG >> Message: Continue?; CancelTMO:10 => ret
\`\`\``,
    },
    'CONFIRM_DIALOG': {
        summary: '`CONFIRM_DIALOG` — Information Confirmation Dialog',
        detail: `Pops up an information confirmation dialog, displaying key-value information and waiting for user confirmation before continuing.

**Parameters**: Data info pairs, format \`Key:Value; Key:Value; ...\`

**Example**
\`\`\`
CONFIRM_DIALOG >> SN:\${sn};Model:\${model};Result:\${result}
\`\`\``,
    },
    'INPUT_DIALOG': {
        summary: '`INPUT_DIALOG` — Input Dialog',
        detail: `Pops up an input dialog supporting multiple input items, waiting for user input before continuing.
The return value is a string in the format \`Name1:input1; Name2:input2; ...\`.

**Fields supported by each input item**
- \`Label\`: Label text
- \`Name\`: Variable name
- \`Regex\`: Validation regex
- \`BarScanner\`: Whether to enable barcode scanning (TRUE/FALSE)
- \`Prompt\`: Prompt text
- \`Disable\`: Whether to disable (TRUE/FALSE)

**Example**
\`\`\`
INPUT_DIALOG >> {Label:BatchNo;Prompt:Please input},{Label:Operator} => retInfo
\`\`\``,
    },

    // controlFlow.ts
    'API': {
        summary: '`API:` — API State Prefix',
        detail: `Marks the line as a CSM **API call** state, usually used with communication operators (\`-@\`, \`->\`, \`->|\`).

**Format**
\`\`\`
API: StateName >> Arguments -@ TargetModule
\`\`\` `,
    },
    'MACRO': {
        summary: '`Macro:` — Macro State Prefix',
        detail: `Marks the line as a CSM **macro** state call.

**Format**
\`\`\`
Macro: MacroName >> Arguments -@ TargetModule
\`\`\` `,
    },
    '<IF': {
        summary: '`<if condition>` — If Statement',
        detail: `Starts a conditional branch block. Executes code within the block when the condition is true; otherwise, jumps to \`<else>\` or \`<end_if>\`.

**Format**
\`\`\`
<if condition>
  // Executed when condition is true
<else>
  // Executed when condition is false
<end_if>
\`\`\`

**Example**
\`\`\`
<if \${bootCode}=1>
  ECHO >> Boot success
<else>
  GOTO >> <error_handler>
<end_if>
\`\`\``,
    },
    '<ELSE>': {
        summary: '`<else>` — Negative Clause for Conditional Branch',
        detail: `Used between \`<if>\` and \`<end_if>\` to define the code block executed when the condition is false.

**Example**
\`\`\`
<if \${ok}=1>
  ECHO >> Success
<else>
  ECHO >> Failure
<end_if>
\`\`\``,
    },
    '<END_IF>': {
        summary: '`<end_if>` — End Conditional Branch',
        detail: 'Ends the conditional branch block started by `<if>`.',
    },
    '<WHILE': {
        summary: '`<while condition>` — While Loop',
        detail: `Repeatedly executes the code within the loop body as long as the condition is true. Checks the condition before each loop iteration.

**Format**
\`\`\`
<while condition>
  // Loop body
<end_while>
\`\`\`

**Example**
\`\`\`
<while \${count:0} < 10>
  EXPRESSION >> \${count:0} + 1 => count
<end_while>
\`\`\``,
    },
    '<END_WHILE>': {
        summary: '`<end_while>` — End While Loop',
        detail: 'Ends the loop block started by `<while>` and returns to the loop condition check.',
    },
    '<DO_WHILE>': {
        summary: '`<do_while>` — Do-While Loop Body Start',
        detail: `Executes the loop body first, then checks the condition at \`<end_do_while condition>\`.
Executes at least once.

**Format**
\`\`\`
<do_while>
  // Loop body (executes at least once)
<end_do_while condition>
\`\`\``,
    },
    '<END_DO_WHILE': {
        summary: '`<end_do_while condition>` — End Do-While Loop',
        detail: `Ends the \`<do_while>\` loop; continues looping if the condition is true; otherwise, exits.

**Example**
\`\`\`
<do_while>
  ECHO >> Loop body
  CONTINUE
<end_do_while \${count:0} < 5>
\`\`\``,
    },
    '<FOREACH': {
        summary: '`<foreach var in list>` — ForEach Loop',
        detail: `Iterates through each element in a list, executing the loop body sequentially. List items are separated by semicolons \`;\`.

**Format**
\`\`\`
<foreach varName in \${listVar:a;b;c}>
  // varName takes one element from the list each cycle
<end_foreach>
\`\`\`

**Example**
\`\`\`
<foreach station in \${stationList:A;B;C}>
  ECHO >> Current station: \${station}
<end_foreach>
\`\`\``,
    },
    '<END_FOREACH>': {
        summary: '`<end_foreach>` — End ForEach Loop',
        detail: 'Ends the loop block started by `<foreach>`.',
    },
    '<INCLUDE': {
        summary: '`<include filepath>` — Include Script',
        detail: `Embeds the content of another script file into the current script for execution, similar to a function call.

**Format**
\`\`\`
<include path/to/script>
\`\`\`

**Example**
\`\`\`
<include samples/include-sequence>
\`\`\``,
    },
    '∈': {
        summary: '`∈` — In Range Operator',
        detail: `Determines if a variable value is within the specified range. Used in the \`EXPRESSION\` instruction.
Supports multiple ranges separated by semicolons \`;\` (logical "OR").

**Format**
\`\`\`
EXPRESSION >> \${var} ∈ [min, max] => inRange
EXPRESSION >> \${var} ∈ [0,10];[20,30] => inRange
\`\`\``,
    },
    '!∈': {
        summary: '`!∈` — Not In Range Operator',
        detail: `Determines if a variable value is **not** within the specified range. Used in the \`EXPRESSION\` instruction.

**Format**
\`\`\`
EXPRESSION >> \${var} !∈ [min, max] => outRange
\`\`\``,
    },
    'EQUAL': {
        summary: '`equal(value)` — String Equality Comparison (Case-Insensitive)',
        detail: `Determines if a variable value is **equal** to the specified string (ignoring case). Used in the \`EXPRESSION\` instruction.

**Format**
\`\`\`
EXPRESSION >> \${var} equal("expected") => matched
\`\`\``,
    },
    'EQUAL_S': {
        summary: '`equal_s(value)` — String Equality Comparison (Case-Sensitive)',
        detail: 'Same as `equal()`, but Case Sensitive.',
    },
    'MATCH': {
        summary: '`match(pattern)` — Regex Matching (Case-Insensitive)',
        detail: `Matches a variable value using a regular expression (ignoring case). Used in the \`EXPRESSION\` instruction.

**Format**
\`\`\`
EXPRESSION >> \${serial} match("SN\\\\d+") => ok
\`\`\``,
    },
    'MATCH_S': {
        summary: '`match_s(pattern)` — Regex Matching (Case-Sensitive)',
        detail: 'Same as `match()`, but Case Sensitive.',
    },
    'START_WITH': {
        summary: '`start_with(prefix)` — Prefix Matching (Case-Insensitive)',
        detail: 'Determines if a variable value starts with the specified prefix (ignoring case).',
    },
    'START_WITH_S': {
        summary: '`start_with_s(prefix)` — Prefix Matching (Case-Sensitive)',
        detail: 'Same as `start_with()`, but Case Sensitive.',
    },
    'END_WITH': {
        summary: '`end_with(suffix)` — Suffix Matching (Case-Insensitive)',
        detail: 'Determines if a variable value ends with the specified suffix (ignoring case).',
    },
    'END_WITH_S': {
        summary: '`end_with_s(suffix)` — Suffix Matching (Case-Sensitive)',
        detail: 'Same as `end_with()`, but Case Sensitive.',
    },
    'CONTAIN': {
        summary: '`contain(substring)` — Contain Matching (Case-Insensitive)',
        detail: 'Determines if a variable value contains the specified substring (ignoring case).',
    },
    'CONTAIN_S': {
        summary: '`contain_s(substring)` — Contain Matching (Case-Sensitive)',
        detail: 'Same as `contain()`, but Case Sensitive.',
    },
    'BELONG': {
        summary: '`belong(list)` — List Belonging Matching (Case-Insensitive)',
        detail: 'Determines if a variable value belongs to any item in the specified string list (ignoring case).',
    },
    'BELONG_S': {
        summary: '`belong_s(list)` — List Belonging Matching (Case-Sensitive)',
        detail: 'Same as `belong()`, but Case Sensitive.',
    },
    '??': {
        summary: '`?? goto >> <anchor>` — Error Jump',
        detail: `Jumps to the specified anchor when the **previous instruction generates an error**.

**Format**
\`\`\`
?? goto >> <error_handler>
\`\`\``,
    },
    '?EXPR?': {
        summary: '`?expression? goto >> <anchor>` — Conditional Jump',
        detail: `Jumps to the specified anchor when the **expression is true**.

**Format**
\`\`\`
?\${var}=0? goto >> <anchor>
?\${count}>10? goto >> <done>
\`\`\``,
    },

    // systemStates.ts
    'ASYNC MESSAGE POSTED': {
        summary: '`Async Message Posted` — System State: Async Message Posted',
        detail: 'CSM framework built-in state, indicating that an asynchronous message has been successfully posted to the target module\'s message queue.',
    },
    'ASYNC RESPONSE': {
        summary: '`Async Response` — System State: Async Response Received',
        detail: 'CSM framework built-in state, indicating that a response to a previously sent asynchronous call has been received.',
    },
    'TARGET TIMEOUT ERROR': {
        summary: '`Target Timeout Error` — System State: Target Timeout Error',
        detail: 'CSM framework built-in state, indicating a timeout while waiting for a response during a synchronous call (`-@`).',
    },
    'TARGET ERROR': {
        summary: '`Target Error` — System State: Target Error',
        detail: 'CSM framework built-in state, indicating that the target module returned an error while processing the message.',
    },
    'CRITICAL ERROR': {
        summary: '`Critical Error` — System State: Critical Error',
        detail: 'CSM framework built-in state, indicating that a severe, unrecoverable error has occurred.',
    },
    'NO TARGET ERROR': {
        summary: '`No Target Error` — System State: No Target Error',
        detail: 'CSM framework built-in state, indicating that the target module could not be found when sending the message.',
    },
    'ERROR HANDLER': {
        summary: '`Error Handler` — System State: Error Handler',
        detail: 'CSM framework built-in state, used to identify the entry point of the error handling process.',
    },
    'RESPONSE': {
        summary: '`Response` — System State: Response',
        detail: 'CSM framework built-in state, indicating the receipt of a response to either a synchronous or asynchronous call.',
    },

    // events.ts — Event type entries
    '[ERROR]': {
        summary: '`[Error]` — Error Event (Priority 1)',
        detail: `**Highest priority** log event, indicating a runtime error in the module.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Error] ModuleName | Description <- Origin
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.264 [17:33:05.264] [Error] AI | Target Error <- MeasureModule
\`\`\``,
    },
    '[USER LOG]': {
        summary: '`[User Log]` — User-defined Log (Priority 2)',
        detail: `Log information actively written by user scripts via the CSM Global Log API.
The relative timestamp field is optional (this event type may not have a source time).

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [User Log] ModuleName | User information
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.260 [User Log] TestRunner | Measurement cycle complete: \${result:OK}
\`\`\``,
    },
    '[MODULE CREATED]': {
        summary: '`[Module Created]` — Module Created (Priority 3)',
        detail: `The CSM module has started and completed initialization, entering the running state.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Module Created] ModuleName | VI Information
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:32:59.425 [17:32:59.425] [Module Created] AI |  > HAL-AI.vi:5990002
\`\`\``,
    },
    '[MODULE DESTROYED]': {
        summary: '`[Module Destroyed]` — Module Destroyed (Priority 3)',
        detail: `The CSM module has stopped running and been destroyed.
Following this event, there is usually no pipe separator or content field.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Module Destroyed] ModuleName
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.250 [17:33:05.250] [Module Destroyed] AI
\`\`\``,
    },
    '[REGISTER]': {
        summary: '`[Register]` — Broadcast Registration (Priority 4)',
        detail: `A module registers with the CSM framework to subscribe to a broadcast signal (Status or Interrupt).

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Register] ModuleName | API: SignalName -><register>
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.261 [17:33:05.261] [Register] Measure | API: DataReady -><register>
\`\`\``,
    },
    '[UNREGISTER]': {
        summary: '`[Unregister]` — Broadcast Unregistration (Priority 4)',
        detail: `A module cancels its subscription to a broadcast signal.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Unregister] ModuleName | API: SignalName -><unregister>
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.262 [17:33:05.262] [Unregister] Measure | API: DataReady -><unregister>
\`\`\``,
    },
    '[INTERRUPT]': {
        summary: '`[Interrupt]` — Interrupt Broadcast (Priority 5)',
        detail: `A module issues an interrupt broadcast signal; all modules subscribed to this signal (as an interrupt) will be interrupted.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Interrupt] ModuleName | SignalName -><interrupt>
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.263 [17:33:05.263] [Interrupt] AI | Interrupt Signal -><interrupt>
\`\`\``,
    },
    '[SYNC MESSAGE]': {
        summary: '`[Sync Message]` — Synchronous Message (Priority 6)',
        detail: `Synchronous message sending: The sender waits for the receiver to complete processing before continuing (corresponding to the \`-@\` operator).

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Sync Message] Sender | Content -@ Receiver
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:32:59.426 [17:32:59.425] [Sync Message] -SendMsgAPI | VI Reference -@ AI
\`\`\``,
    },
    '[ASYNC MESSAGE]': {
        summary: '`[Async Message]` — Asynchronous Message (Priority 6)',
        detail: `Asynchronous message sending: The sender continues execution without waiting for the receiver (corresponding to the \`->\` operator).

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Async Message] Sender | Content -> Receiver
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:32:59.697 [17:32:59.697] [Async Message] AI | API: Start >> -><interrupt> -> Measure
\`\`\``,
    },
    '[NO-REP ASYNC MESSAGE]': {
        summary: '`[No-Rep Async Message]` — No-Reply Async Message (Priority 6)',
        detail: `No-reply asynchronous message (Fire-and-Forget): The sender does not wait for any response (corresponding to the \`->|\` operator).

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [No-Rep Async Message] Sender | Content ->| Receiver
\`\`\``,
    },
    '[STATUS]': {
        summary: '`[Status]` — Status Broadcast (Priority 7)',
        detail: `A module issues a Status broadcast signal; all modules subscribed to this signal (as a normal status) will be notified.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Status] ModuleName | SignalName -><status>
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.264 [17:33:05.264] [Status] Measure | Status: Ready -><status>
\`\`\``,
    },
    '[STATE CHANGE]': {
        summary: '`[State Change]` — State Change (Priority 8)',
        detail: `The **most common** log event, recording every state change performed by the module's state machine.

**Format**
\`\`\`
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [State Change] ModuleName | StateName
\`\`\`

**Example**
\`\`\`csmlog
2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI | Macro: Initialize
2026/03/20 17:32:59.426 [17:32:59.426] [State Change] AI | Data: Initialize
\`\`\``,
    },

    // timestamps.ts — Timestamp entries
    '__TIMESTAMP_DATE__': {
        summary: '`YYYY/MM/DD HH:MM:SS.mmm` — Log Processing Time',
        detail: `The timestamp (accurate to milliseconds) when the CSM logging system **recorded this log entry**.

The difference from the relative timestamp \`[HH:MM:SS.mmm]\` reflects the processing delay of the log queue.

**Format:** \`YYYY/MM/DD HH:MM:SS.mmm\``,
    },
    '__TIMESTAMP_TIME__': {
        summary: '`[HH:MM:SS.mmm]` — Event Source Time',
        detail: `The timestamp (accurate to milliseconds) recorded by the source module when the **event actually occurred**.

Used for accurate analysis of event order and timing relationships, unaffected by log queue latency.

**Format:** \`[HH:MM:SS.mmm]\``,
    },

    // markers.ts — Marker entries
    '<-': {
        summary: '`<-` — Log Origin Marker',
        detail: `Appears in log content, indicating that the event **originated from** a specific module or message source (reverse traceability).

This is a direction marker **specific to logs**, distinct from other operators in scripts (\`->\`, \`-@\`), used only for log chain tracking and does not indicate a send operation.

**Example**
\`\`\`csmlog
2026/03/20 17:33:05.264 [17:33:05.264] [Error] AI | Target Error <- MeasureModule
\`\`\`

Here \`<- MeasureModule\` indicates that the error originated from \`MeasureModule\`.`,
    },

    // config.ts — Config key entries
    'PERIODICLOG.ENABLE': {
        summary: '`PeriodicLog.Enable` — Periodic Log Enable Switch',
        detail: `Controls whether to enable the periodic log compression mechanism.

| Value | Meaning |
|----|------|
| \`1\` | Enabled (repeated logs will be merged to reduce log volume) |
| \`0\` | Disabled (every log entry is recorded separately) |`,
    },
    'PERIODICLOG.THRESHOLD(#/S)': {
        summary: '`PeriodicLog.Threshold(#/s)` — Periodic Log Compression Frequency Threshold',
        detail: `The frequency threshold for triggering log compression, unit: **times/second (#/s)**.

When the frequency of a certain log type exceeds this threshold, the logging system will start periodic merging to avoid flooding valid information with high-frequency repeated logs.

**Default Value:** \`2.00\``,
    },
    'PERIODICLOG.CHECKPERIOD(S)': {
        summary: '`PeriodicLog.CheckPeriod(s)` — Periodic Log Check Interval',
        detail: `The interval at which the logging system periodically checks if compression needs to be triggered, unit: **seconds (s)**.

**Default Value:** \`1.00\``,
    },
};
