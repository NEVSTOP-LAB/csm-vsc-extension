export const csmlogHoverTranslations = {
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
};
