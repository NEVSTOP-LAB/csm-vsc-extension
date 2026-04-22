import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Hover documentation database
// ---------------------------------------------------------------------------

export interface HoverEntry {
    /** Short one-line summary shown as header. */
    summary: string;
    /** Full markdown body (optional). */
    detail?: string;
}

// Each key is the canonical (upper-case for commands, exact for operators)
// form of the token.  The lookup function normalises the source text before
// doing the key look-up.
const HOVER_DB: Record<string, HoverEntry> = {

    // -----------------------------------------------------------------------
    // Communication operators
    // -----------------------------------------------------------------------
    '-@': {
        summary: '`-@` — 同步调用 (Synchronous Call)',
        detail: [
            '向目标模块发送消息并**等待其返回**后继续执行。',
            '',
            '**格式**',
            '```csmscript',
            'API: StateName >> Arguments -@ TargetModule',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'API: Initialize >> device:Dev1 -@ DAQ',
            'API: QueryInfo  >> ${sn}       -@ DatabaseModule => code;name',
            '```',
        ].join('\n'),
    },
    '->': {
        summary: '`->` — 异步调用 (Asynchronous Call)',
        detail: [
            '向目标模块发送消息，**不等待返回**，继续执行后续脚本。',
            '',
            '**格式**',
            '```csmscript',
            'API: StateName >> Arguments -> TargetModule',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'API: Prepare >> ${bootCode} -> WorkerModule',
            '```',
        ].join('\n'),
    },
    '->|': {
        summary: '`->|` — 无应答异步调用 (Fire-and-Forget)',
        detail: [
            '向目标模块发送消息，**不等待任何应答**（Fire-and-Forget）。',
            '适用于日志记录、通知等不关心结果的场景。',
            '',
            '**格式**',
            '```csmscript',
            'API: StateName >> Arguments ->| TargetModule',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'API: Trace >> prepare-start ->| Logger',
            '```',
        ].join('\n'),
    },
    '>>': {
        summary: '`>>` — 参数分隔符 (Argument Separator)',
        detail: [
            '分隔指令/状态名称与其参数。',
            '',
            '**格式**',
            '```csmscript',
            'Instruction >> Arguments',
            'API: StateName >> Arguments -@ Module',
            '```',
        ].join('\n'),
    },
    '@': {
        summary: '`@` — 模块地址分隔符 (Module Address Separator)',
        detail: [
            '分隔状态名称和模块名称，用于订阅/取消订阅操作。',
            '',
            '**格式**',
            '```csmscript',
            'Status@SourceModule >> Handler@HandlerModule -><register>',
            '```',
        ].join('\n'),
    },
    '=>': {
        summary: '`=>` — 返回值保存 (Return Value Save)',
        detail: [
            '将指令的返回值保存到指定变量，后续可通过 `${变量名}` 引用。',
            '',
            '支持使用分号 `;` 分隔多个变量名以保存多个返回值（CSMScript 完整版）。',
            '',
            '**格式**',
            '```csmscript',
            'Instruction >> Arguments => varName',
            'API: QueryInfo >> args -@ Module => field1;field2;field3',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'API: Boot >> ${sn} -@ Fixture => bootCode',
            'EXPRESSION >> ${bootCode} + 1 => nextCode',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Subscription operators
    // -----------------------------------------------------------------------
    '-><REGISTER>': {
        summary: '`-><register>` — 注册订阅 (Subscribe)',
        detail: [
            '将源模块的状态注册到处理程序模块，建立订阅关系。',
            '',
            '**格式**',
            '```csmscript',
            'Status@SourceModule >> Handler@HandlerModule -><register>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'StatusChanged@WorkerModule >> API: OnStatus -><register>',
            '```',
        ].join('\n'),
    },
    '-><UNREGISTER>': {
        summary: '`-><unregister>` — 取消订阅 (Unsubscribe)',
        detail: [
            '取消之前通过 `-><register>` 建立的订阅关系。',
            '',
            '**格式**',
            '```csmscript',
            'Status@SourceModule >> Handler@HandlerModule -><unregister>',
            '```',
        ].join('\n'),
    },
    '-><REGISTER AS INTERRUPT>': {
        summary: '`-><register as interrupt>` — 注册为中断订阅',
        detail: [
            '将源模块的状态注册为**中断**类型，关联到处理程序模块。',
            '中断优先级高于普通状态消息。',
            '',
            '**格式**',
            '```csmscript',
            'Status@SourceModule >> Handler -><register as interrupt>',
            '```',
        ].join('\n'),
    },
    '-><REGISTER AS STATUS>': {
        summary: '`-><register as status>` — 注册为状态订阅',
        detail: [
            '将源模块的中断注册为**普通状态**类型，关联到处理程序模块。',
            '',
            '**格式**',
            '```csmscript',
            'Interrupt@SourceModule >> Handler -><register as status>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Broadcast targets
    // -----------------------------------------------------------------------
    '<STATUS>': {
        summary: '`<status>` — 广播正常状态目标',
        detail: [
            '将消息广播为**普通状态**，所有订阅了该状态的模块都会收到。',
            '',
            '**格式**',
            '```csmscript',
            'API: PublishStatus >> ${result} -> <status>',
            '```',
        ].join('\n'),
    },
    '<INTERRUPT>': {
        summary: '`<interrupt>` — 广播中断状态目标',
        detail: [
            '将消息广播为**中断**，中断优先级高于普通状态消息。',
            '',
            '**格式**',
            '```csmscript',
            'API: SendInterrupt >> fault -> <interrupt>',
            '```',
        ].join('\n'),
    },
    '<BROADCAST>': {
        summary: '`<broadcast>` — 广播消息目标',
        detail: [
            '将消息广播到所有模块。',
            '',
            '**格式**',
            '```csmscript',
            'API: BroadcastEvent >> ALL_OK -> <broadcast>',
            '```',
        ].join('\n'),
    },
    '<ALL>': {
        summary: '`<all>` — 广播到所有目标',
        detail: [
            '向所有已连接模块广播消息。',
            '',
            '**格式**',
            '```csmscript',
            'API: BroadcastAll >> payload -> <all>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Variables
    // -----------------------------------------------------------------------
    '${': {
        summary: '`${varname}` / `${varname:default}` — 变量引用 (Variable Reference)',
        detail: [
            '在执行时将占位符替换为对应变量的值。',
            '支持设置默认值：当变量未定义时使用默认值。',
            '',
            '**变量查找顺序**（优先级从高到低）：',
            '1. 临时变量空间（`=>` 保存的返回值）',
            '2. TagDB 变量空间（需开启 `TAGDB_VAR_SPACE_ENABLE`）',
            '3. INI 配置变量空间（需开启 `INI_VAR_SPACE_ENABLE`）',
            '',
            '**格式**',
            '```csmscript',
            '${varname}          // 无默认值',
            '${varname:default}  // 带默认值',
            '${section.varname}  // 指定 INI 节名称',
            '${tagdb.varname}    // 指定 TagDB 名称',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Pre-definition sections
    // -----------------------------------------------------------------------
    '[COMMAND_ALIAS]': {
        summary: '`[COMMAND_ALIAS]` — 指令别名配置节 (Pre-definition Section)',
        detail: [
            '在**预定义区域**中定义指令别名，将 CSM 消息指令映射为简短的自定义名称。',
            '简化重复使用的长指令，提升脚本可读性。',
            '',
            '> 也可使用等效名称：`Command_Alias`、`CommandAlias`、`Command-Alias`、`CMD_Alias` 等。',
            '',
            '**格式**',
            '```ini',
            '[COMMAND_ALIAS]',
            'AliasName = API: StateName >> Args -@ ModuleName',
            '```',
            '',
            '**示例**',
            '```ini',
            '[COMMAND_ALIAS]',
            'DAQ-Init  = API: Initialize -@ DAQ',
            'DAQ-Read  = API: fetch Data -@ DAQ',
            'DAQ-Close = API: Close      -@ DAQ',
            '```',
        ].join('\n'),
    },
    '[AUTO_ERROR_HANDLE]': {
        summary: '`[AUTO_ERROR_HANDLE]` — 自动错误处理配置节 (Pre-definition Section)',
        detail: [
            '在**预定义区域**中配置脚本执行时的自动错误处理行为。',
            '',
            '| 键 | 说明 | 默认值 |',
            '|---|---|---|',
            '| `Enable` | 是否开启自动错误处理，`TRUE` 或 `FALSE` | `FALSE` |',
            '| `Anchor` | 出错时跳转的锚点名称 | `<cleanup>` |',
            '',
            '**示例**',
            '```ini',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            'Anchor = <error_handler>',
            '```',
            '',
            '也可在脚本区域使用 `AUTO_ERROR_HANDLE_ENABLE` 和 `AUTO_ERROR_HANDLE_ANCHOR` 指令动态配置。',
        ].join('\n'),
    },
    '[INI_VAR_SPACE]': {
        summary: '`[INI_VAR_SPACE]` — INI 配置变量空间配置节 (Pre-definition Section)',
        detail: [
            '在**预定义区域**中开启 INI 文件配置变量空间，允许脚本通过 `${变量名}` 读取 INI 文件中的键值。',
            '',
            '| 键 | 说明 |',
            '|---|---|',
            '| `Enable` | 是否开启，`TRUE` 或 `FALSE` |',
            '| `Path`   | INI 文件路径 |',
            '',
            '**示例**',
            '```ini',
            '[INI_VAR_SPACE]',
            'Enable = TRUE',
            'Path = ./config.ini',
            '```',
        ].join('\n'),
    },
    '[TAGDB_VAR_SPACE]': {
        summary: '`[TAGDB_VAR_SPACE]` — TagDB 变量空间配置节 (Pre-definition Section)',
        detail: [
            '在**预定义区域**中开启 TagDB 变量空间，允许脚本通过 `${变量名}` 读取 TagDB 数据。',
            '',
            '| 键 | 说明 |',
            '|---|---|',
            '| `Enable` | 是否开启，`TRUE` 或 `FALSE` |',
            '| `Name`   | TagDB 名称，支持逗号分隔的多个名称 |',
            '',
            '**示例**',
            '```ini',
            '[TAGDB_VAR_SPACE]',
            'Enable = TRUE',
            'Name = tagdb_main,tagdb_backup',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Built-in commands
    // -----------------------------------------------------------------------
    'GOTO': {
        summary: '`GOTO` — 跳转指令 (Jump to Anchor)',
        detail: [
            '跳转到脚本中指定的**锚点**位置继续执行。',
            '',
            '> **注意**：在循环体内使用时，目标锚点必须位于**当前循环体内**，否则会报错。',
            '',
            '**格式**',
            '```csmscript',
            'GOTO >> <anchor_name>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'GOTO >> <cleanup>',
            'GOTO >> cleanup   // 可以省略 <>',
            '```',
        ].join('\n'),
    },
    'JUMP': {
        summary: '`JUMP` — 跳转指令 (Jump to Anchor)',
        detail: [
            '与 `GOTO` 等效，跳转到脚本中指定的**锚点**位置继续执行。',
            '',
            '**格式**',
            '```csmscript',
            'JUMP >> <anchor_name>',
            '```',
        ].join('\n'),
    },
    'WAIT': {
        summary: '`WAIT` — 等待指令 (Wait)',
        detail: [
            '等待指定的时间后继续执行脚本。默认单位为秒(s)。',
            '',
            '**变体**',
            '- `WAIT` — 解析时间字符串，支持 `1min 20s 500ms` 等复合格式',
            '- `WAIT(s)` — 参数为浮点数，单位秒',
            '- `WAIT(ms)` — 参数为整数，单位毫秒',
            '',
            '**示例**',
            '```csmscript',
            'WAIT >> 1s',
            'WAIT >> 1min 20s 500ms',
            'WAIT(s) >> 1.5',
            'WAIT(ms) >> 100',
            '```',
        ].join('\n'),
    },
    'WAIT(S)': {
        summary: '`WAIT(s)` — 等待指令（秒）',
        detail: [
            '等待指定秒数后继续执行。参数为 **浮点数**。',
            '',
            '**示例**',
            '```csmscript',
            'WAIT(s) >> 1.5',
            '```',
        ].join('\n'),
    },
    'WAIT(MS)': {
        summary: '`WAIT(ms)` — 等待指令（毫秒）',
        detail: [
            '等待指定毫秒数后继续执行。参数为 **整数**。',
            '',
            '**示例**',
            '```csmscript',
            'WAIT(ms) >> 500',
            '```',
        ].join('\n'),
    },
    'SLEEP': {
        summary: '`SLEEP` — 等待指令 (Sleep)',
        detail: [
            '与 `WAIT` 等效，等待指定的时间后继续执行脚本。',
            '支持 `SLEEP(s)` 和 `SLEEP(ms)` 变体。',
        ].join('\n'),
    },
    'SLEEP(S)': {
        summary: '`SLEEP(s)` — 等待指令（秒）',
        detail: '与 `WAIT(s)` 等效。参数为浮点数，单位秒。',
    },
    'SLEEP(MS)': {
        summary: '`SLEEP(ms)` — 等待指令（毫秒）',
        detail: '与 `WAIT(ms)` 等效。参数为整数，单位毫秒。',
    },
    'BREAK': {
        summary: '`BREAK` — 跳出循环',
        detail: [
            '跳出**当前一层循环**，继续执行循环之后的脚本。',
            '可用于 `<while>`、`<do_while>`、`<foreach>` 循环中。',
            '不在循环中使用时无效果。',
            '',
            '**示例**',
            '```csmscript',
            '<while ${count:0} < 100>',
            '  EXPRESSION >> ${count:0} + 1 => count',
            '  <if ${count:0} > 30>',
            '    BREAK',
            '  <end_if>',
            '<end_while>',
            '```',
        ].join('\n'),
    },
    'CONTINUE': {
        summary: '`CONTINUE` — 继续下一次循环迭代',
        detail: [
            '结束当前循环的**本次迭代**，跳到下一次循环开始处。',
            '可用于 `<while>`、`<do_while>`、`<foreach>` 循环中。',
            '',
            '**示例**',
            '```csmscript',
            '<foreach item in ${list:a;b;c}>',
            '  <if ${skip}=1>',
            '    CONTINUE',
            '  <end_if>',
            '  ECHO >> 当前项目：${item}',
            '<end_foreach>',
            '```',
        ].join('\n'),
    },
    'ECHO': {
        summary: '`ECHO` — 输出信息 (Echo Output)',
        detail: [
            '在脚本执行结果界面输出指定信息，同时广播同名事件。',
            'ECHO 做**全字符串替换**，将变量占位符替换为值后整体作为字符串输出。',
            '',
            '**变体**：`ECHO0`–`ECHO9` 对应不同广播通道。',
            '',
            '**格式**',
            '```csmscript',
            'ECHO >> message',
            'ECHO >> ${varname}',
            'ECHO >> text => varname   // 输出并保存到变量',
            '```',
            '',
            '> **提示**：如需计算数值表达式，请使用 `EXPRESSION` 指令。',
        ].join('\n'),
    },
    'EXPRESSION': {
        summary: '`EXPRESSION` — 计算表达式 (Evaluate Expression)',
        detail: [
            '计算指定的表达式，结果为**数值**类型（DBL 或 1/0）。',
            '',
            '**三种处理模式**：',
            '1. **范围表达式**（含 `∈` 或 `!∈`）：返回 1（成立）或 0（不成立）',
            '2. **字符串比较**（`变量 equal(...)` 等形式）：返回 1 或 0',
            '3. **算术/逻辑表达式**：返回 DBL 计算结果',
            '',
            '**格式**',
            '```csmscript',
            'EXPRESSION >> expr => varName',
            '```',
            '',
            '**示例**',
            '```csmscript',
            'EXPRESSION >> 3 + 5 * (2 - 1) => result      // 结果: 8',
            'EXPRESSION >> ${temp:25} ∈ [0,100] => ok     // 范围判断',
            'EXPRESSION >> ${str} equal("hello") => matched // 字符串比较',
            '```',
        ].join('\n'),
    },
    'RANDOM': {
        summary: '`RANDOM` — 生成随机浮点数',
        detail: [
            '生成指定范围内的随机**浮点数**。参数为 API String 格式，支持 `MIN` 和 `MAX` 参数，默认范围 [0, 1]。',
            '',
            '**变体**：`RANDOM(DBL)`、`RANDOMDBL`',
            '',
            '**示例**',
            '```csmscript',
            'RANDOM >> MIN=0,MAX=1 => rndVal',
            'RANDOM(DBL) >> MIN=0,MAX=100 => rndDbl',
            '```',
        ].join('\n'),
    },
    'RANDOMDBL': {
        summary: '`RANDOMDBL` — 生成随机浮点数（等同于 RANDOM）',
        detail: '与 `RANDOM` 等效，生成指定范围内的随机浮点数。',
    },
    'RANDOM(DBL)': {
        summary: '`RANDOM(DBL)` — 生成随机浮点数',
        detail: '与 `RANDOM` 等效，生成指定范围内的随机浮点数。',
    },
    'RANDOMINT': {
        summary: '`RANDOMINT` — 生成随机整数',
        detail: [
            '生成指定范围内的随机**整数**。',
            '',
            '**变体**：`RANDOM(INT)`',
            '',
            '**示例**',
            '```csmscript',
            'RANDOMINT >> MIN=1,MAX=100 => rndInt',
            'RANDOM(INT) >> MIN=0,MAX=9 => rndInt2',
            '```',
        ].join('\n'),
    },
    'RANDOM(INT)': {
        summary: '`RANDOM(INT)` — 生成随机整数',
        detail: '与 `RANDOMINT` 等效，生成指定范围内的随机整数。',
    },
    'AUTO_ERROR_HANDLE_ENABLE': {
        summary: '`AUTO_ERROR_HANDLE_ENABLE` — 开启/关闭自动错误处理',
        detail: [
            '在脚本运行时动态**开启或关闭**自动错误处理功能。',
            '开启后，脚本遇到错误会自动跳转到设定的锚点。',
            '',
            '**格式**',
            '```csmscript',
            'AUTO_ERROR_HANDLE_ENABLE >> TRUE   // 开启',
            'AUTO_ERROR_HANDLE_ENABLE >> FALSE  // 关闭',
            '```',
            '',
            '> 也可在 `[AUTO_ERROR_HANDLE]` 预定义区域中静态配置。',
        ].join('\n'),
    },
    'AUTO_ERROR_HANDLE_ANCHOR': {
        summary: '`AUTO_ERROR_HANDLE_ANCHOR` — 设置错误跳转锚点',
        detail: [
            '设置自动错误处理时跳转的目标**锚点**，默认为 `<cleanup>`。',
            '',
            '**格式**',
            '```csmscript',
            'AUTO_ERROR_HANDLE_ANCHOR >> <error_handler>',
            'AUTO_ERROR_HANDLE_ANCHOR >> error_handler  // 可省略 <>',
            '```',
        ].join('\n'),
    },
    'INI_VAR_SPACE_ENABLE': {
        summary: '`INI_VAR_SPACE_ENABLE` — 开启/关闭 INI 配置变量空间',
        detail: [
            '动态开启或关闭 INI 文件配置变量空间。',
            '开启后可通过 `${section.key}` 引用 INI 文件中的变量。',
            '',
            '**格式**',
            '```csmscript',
            'INI_VAR_SPACE_ENABLE >> TRUE',
            '```',
        ].join('\n'),
    },
    'INI_VAR_SPACE_PATH': {
        summary: '`INI_VAR_SPACE_PATH` — 设置 INI 配置文件路径',
        detail: [
            '指定 INI 配置变量空间使用的文件路径。',
            '',
            '**格式**',
            '```csmscript',
            'INI_VAR_SPACE_PATH >> ./config.ini',
            '```',
        ].join('\n'),
    },
    'TAGDB_VAR_SPACE_ENABLE': {
        summary: '`TAGDB_VAR_SPACE_ENABLE` — 开启/关闭 TagDB 变量空间',
        detail: [
            '动态开启或关闭 TagDB 变量空间支持。',
            '开启后可通过 `${tagName.varName}` 引用 TagDB 中的数据。',
            '',
            '**格式**',
            '```csmscript',
            'TAGDB_VAR_SPACE_ENABLE >> TRUE',
            '```',
        ].join('\n'),
    },
    'TAGDB_VAR_SPACE_NAME': {
        summary: '`TAGDB_VAR_SPACE_NAME` — 设置 TagDB 变量空间名称',
        detail: [
            '指定 TagDB 变量空间的名称，支持逗号分隔的多个名称（按顺序查找）。',
            '',
            '**格式**',
            '```csmscript',
            'TAGDB_VAR_SPACE_NAME >> tagdb_main,tagdb_backup',
            '```',
        ].join('\n'),
    },
    'TAGDB_GET_VALUE': {
        summary: '`TAGDB_GET_VALUE` — 从 TagDB 读取数据',
        detail: [
            '从 TagDB 中读取浮点数类型的数据。',
            '',
            '- **输入参数**：TagDB 变量名称，支持逗号分隔的数组形式',
            '- **输出参数**：读取到的键值对，例如 `tag1=10.5,tag2=20.3`',
            '',
            '**示例**',
            '```csmscript',
            'TAGDB_GET_VALUE >> /line/station/result => tagResult',
            'TAGDB_GET_VALUE >> tag1,tag2 => tagValues',
            '```',
        ].join('\n'),
    },
    'TAGDB_SET_VALUE': {
        summary: '`TAGDB_SET_VALUE` — 向 TagDB 写入数据',
        detail: [
            '向 TagDB 中写入浮点数类型的数据。',
            '',
            '- **输入参数**：数据键值对，支持数组形式，例如 `tag1=10.5,tag2=20.3`',
            '',
            '**示例**',
            '```csmscript',
            'TAGDB_SET_VALUE >> /line/station/result,PASS',
            '```',
        ].join('\n'),
    },
    'TAGDB_SWEEP': {
        summary: '`TAGDB_SWEEP` — 扫描 TagDB 数据',
        detail: [
            '按照指定的扫描参数，对 TagDB 中的数据进行扫描。',
            '',
            '**参数**',
            '- `tag`：要扫描的变量名',
            '- `Start`：起始值',
            '- `Stop`：结束值',
            '- `Step` 或 `Points`：步长或点数（二选一）',
            '- `interval`：每步时间间隔（毫秒）',
            '- `Async`：是否异步扫描（默认 FALSE）',
            '',
            '**示例**',
            '```csmscript',
            'TAGDB_SWEEP >> /line/station/*',
            '```',
        ].join('\n'),
    },
    'TAGDB_WAIT_FOR_EXPRESSION': {
        summary: '`TAGDB_WAIT_FOR_EXPRESSION` — 等待 TagDB 满足表达式条件',
        detail: [
            '阻塞执行，直到 TagDB 中的数据满足指定表达式条件，或超时。',
            '',
            '**参数**',
            '- `exp`：表达式字符串，例如 `tag1 > 10 && tag2 < 20`',
            '- `timeout`：超时时间（毫秒，支持 `1min 20s 500ms` 格式）',
            '- `settlingTime`：稳定时间（毫秒）',
            '',
            '- **输出参数**：Boolean（1 表示满足条件，0 表示超时）',
        ].join('\n'),
    },
    'TAGDB_START_MONITOR_EXPRESSION': {
        summary: '`TAGDB_START_MONITOR_EXPRESSION` — 启动 TagDB 表达式监控',
        detail: [
            '在后台持续监控 TagDB 数据，当表达式成立时**产生错误**（触发自动错误处理）。',
            '',
            '**参数**',
            '- `exp`：表达式字符串',
            '- `settlingTime`：稳定时间（毫秒）',
        ].join('\n'),
    },
    'TAGDB_STOP_MONITOR_EXPRESSION': {
        summary: '`TAGDB_STOP_MONITOR_EXPRESSION` — 停止 TagDB 表达式监控',
        detail: [
            '停止之前通过 `TAGDB_START_MONITOR_EXPRESSION` 启动的监控。',
            '',
            '**参数**：要停止的表达式字符串（与启动时相同）',
        ].join('\n'),
    },
    'TAGDB_WAIT_FOR_STABLE': {
        summary: '`TAGDB_WAIT_FOR_STABLE` — 等待 TagDB 数据稳定',
        detail: [
            '等待指定 TagDB 变量的数据趋于稳定（单调趋势发生变化）。',
            '',
            '**参数**',
            '- `tag`：要监控的变量名，支持数组形式',
            '- `timeout`：超时时间（毫秒）',
            '- `Period`：检查步长（毫秒），避免短时波动误判',
            '',
            '- **输出参数**：Boolean（1 表示已稳定，0 表示超时）',
        ].join('\n'),
    },
    'ONE_BUTTON_DIALOG': {
        summary: '`ONE_BUTTON_DIALOG` — 单按钮对话框',
        detail: [
            '弹出一个只有单个按钮的对话框，等待用户点击后继续执行。',
            '',
            '**参数**（API String 格式）',
            '- `Message`：显示内容',
            '- `Btn`：按钮文字（默认为系统字符串）',
            '- `Timeout`：超时秒数，默认 -1（不超时）',
            '',
            '**示例**',
            '```csmscript',
            'ONE_BUTTON_DIALOG >> Message: Are you OK?; Timeout:5 => ret',
            '```',
        ].join('\n'),
    },
    'TWO_BUTTON_DIALOG': {
        summary: '`TWO_BUTTON_DIALOG` — 双按钮对话框',
        detail: [
            '弹出带有确认/取消两个按钮的对话框，返回 `TRUE`（确认）或 `FALSE`（取消）。',
            '',
            '**参数**（API String 格式）',
            '- `Message`：显示内容',
            '- `OKBtn`：确认按钮文字',
            '- `CancelBtn`：取消按钮文字',
            '- `OKTMO`：确认按钮超时秒数（默认 -1）',
            '- `CancelTMO`：取消按钮超时秒数（默认 -1）',
            '',
            '**示例**',
            '```csmscript',
            'TWO_BUTTON_DIALOG >> Message: Continue?; CancelTMO:10 => ret',
            '```',
        ].join('\n'),
    },
    'CONFIRM_DIALOG': {
        summary: '`CONFIRM_DIALOG` — 信息确认对话框',
        detail: [
            '弹出信息确认对话框，展示键值对信息，等待用户确认后继续。',
            '',
            '**参数**：数据信息对，格式 `Key:Value; Key:Value; ...`',
            '',
            '**示例**',
            '```csmscript',
            'CONFIRM_DIALOG >> SN:${sn};Model:${model};Result:${result}',
            '```',
        ].join('\n'),
    },
    'INPUT_DIALOG': {
        summary: '`INPUT_DIALOG` — 输入对话框',
        detail: [
            '弹出输入对话框，支持多个输入项，等待用户输入后继续。',
            '返回值为 `Name1:input1; Name2:input2; ...` 格式的字符串。',
            '',
            '**每个输入项支持的字段**',
            '- `Label`：标签文字',
            '- `Name`：变量名',
            '- `Regex`：验证正则',
            '- `BarScanner`：是否启用扫码（TRUE/FALSE）',
            '- `Prompt`：提示文字',
            '- `Disable`：是否禁用（TRUE/FALSE）',
            '',
            '**示例**',
            '```csmscript',
            'INPUT_DIALOG >> {Label:批次号;Prompt:请输入},{Label:操作员} => retInfo',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // State prefixes
    // -----------------------------------------------------------------------
    'API': {
        summary: '`API:` — API 状态前缀 (API State Prefix)',
        detail: [
            '标记该行为 CSM **API 调用**状态，通常与通信操作符（`-@`、`->`、`->|`）一起使用。',
            '',
            '**格式**',
            '```csmscript',
            'API: StateName >> Arguments -@ TargetModule',
            '```',
        ].join('\n'),
    },
    'MACRO': {
        summary: '`Macro:` — 宏状态前缀 (Macro State Prefix)',
        detail: [
            '标记该行为 CSM **宏**状态调用。',
            '',
            '**格式**',
            '```csmscript',
            'Macro: MacroName >> Arguments -@ TargetModule',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Control flow keywords
    // -----------------------------------------------------------------------
    '<IF': {
        summary: '`<if condition>` — 条件分支 (If Statement)',
        detail: [
            '开始一个条件分支块。条件为真时执行块内代码，否则跳转到 `<else>` 或 `<end_if>`。',
            '',
            '**格式**',
            '```csmscript',
            '<if condition>',
            '  // 条件成立时执行',
            '<else>',
            '  // 条件不成立时执行',
            '<end_if>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            '<if ${bootCode}=1>',
            '  ECHO >> 启动成功',
            '<else>',
            '  GOTO >> <error_handler>',
            '<end_if>',
            '```',
        ].join('\n'),
    },
    '<ELSE>': {
        summary: '`<else>` — 条件分支的否定子句',
        detail: [
            '在 `<if>` 和 `<end_if>` 之间使用，定义条件不成立时执行的代码块。',
            '',
            '**示例**',
            '```csmscript',
            '<if ${ok}=1>',
            '  ECHO >> 成功',
            '<else>',
            '  ECHO >> 失败',
            '<end_if>',
            '```',
        ].join('\n'),
    },
    '<END_IF>': {
        summary: '`<end_if>` — 结束条件分支',
        detail: '结束 `<if>` 开始的条件分支块。',
    },
    '<WHILE': {
        summary: '`<while condition>` — While 循环',
        detail: [
            '当条件成立时重复执行循环体内的代码。每次循环开始前检查条件。',
            '',
            '**格式**',
            '```csmscript',
            '<while condition>',
            '  // 循环体',
            '<end_while>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            '<while ${count:0} < 10>',
            '  EXPRESSION >> ${count:0} + 1 => count',
            '<end_while>',
            '```',
        ].join('\n'),
    },
    '<END_WHILE>': {
        summary: '`<end_while>` — 结束 While 循环',
        detail: '结束 `<while>` 开始的循环块，回到循环条件检查处。',
    },
    '<DO_WHILE>': {
        summary: '`<do_while>` — Do-While 循环体开始',
        detail: [
            '先执行循环体，再检查 `<end_do_while condition>` 处的条件。',
            '至少执行一次。',
            '',
            '**格式**',
            '```csmscript',
            '<do_while>',
            '  // 循环体（至少执行一次）',
            '<end_do_while condition>',
            '```',
        ].join('\n'),
    },
    '<END_DO_WHILE': {
        summary: '`<end_do_while condition>` — 结束 Do-While 循环',
        detail: [
            '结束 `<do_while>` 循环，条件成立时继续循环，否则退出。',
            '',
            '**示例**',
            '```csmscript',
            '<do_while>',
            '  ECHO >> 循环体',
            '  CONTINUE',
            '<end_do_while ${count:0} < 5>',
            '```',
        ].join('\n'),
    },
    '<FOREACH': {
        summary: '`<foreach var in list>` — ForEach 循环',
        detail: [
            '遍历列表中的每个元素，依次执行循环体。列表使用分号 `;` 分隔。',
            '',
            '**格式**',
            '```csmscript',
            '<foreach varName in ${listVar:a;b;c}>',
            '  // 每次循环 varName 取列表中的一个元素',
            '<end_foreach>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            '<foreach station in ${stationList:A;B;C}>',
            '  ECHO >> 当前站点：${station}',
            '<end_foreach>',
            '```',
        ].join('\n'),
    },
    '<END_FOREACH>': {
        summary: '`<end_foreach>` — 结束 ForEach 循环',
        detail: '结束 `<foreach>` 开始的循环块。',
    },
    '<INCLUDE': {
        summary: '`<include filepath>` — 引用外部脚本 (Include Script)',
        detail: [
            '将另一个 `.csmscript` 文件的内容嵌入到当前脚本中执行，类似函数调用。',
            '',
            '**格式**',
            '```csmscript',
            '<include path/to/script.csmscript>',
            '```',
            '',
            '**示例**',
            '```csmscript',
            '<include samples/include-sequence.csmscript>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Range operators
    // -----------------------------------------------------------------------
    '∈': {
        summary: '`∈` — 范围内运算符 (In Range)',
        detail: [
            '判断变量值是否在指定区间内。用于 `EXPRESSION` 指令中。',
            '支持多个区间用分号 `;` 分隔（逻辑"或"）。',
            '',
            '**格式**',
            '```csmscript',
            'EXPRESSION >> ${var} ∈ [min, max] => inRange',
            'EXPRESSION >> ${var} ∈ [0,10];[20,30] => inRange',
            '```',
        ].join('\n'),
    },
    '!∈': {
        summary: '`!∈` — 不在范围内运算符 (Not In Range)',
        detail: [
            '判断变量值是否**不在**指定区间内。用于 `EXPRESSION` 指令中。',
            '',
            '**格式**',
            '```csmscript',
            'EXPRESSION >> ${var} !∈ [min, max] => outRange',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // String comparison functions
    // -----------------------------------------------------------------------
    'EQUAL': {
        summary: '`equal(value)` — 字符串相等比较（大小写不敏感）',
        detail: [
            '判断变量值是否与指定字符串**相等**（忽略大小写）。用于 `EXPRESSION` 指令中。',
            '',
            '**格式**',
            '```csmscript',
            'EXPRESSION >> ${var} equal("expected") => matched',
            '```',
        ].join('\n'),
    },
    'EQUAL_S': {
        summary: '`equal_s(value)` — 字符串相等比较（大小写敏感）',
        detail: '与 `equal()` 相同，但区分大小写（Case Sensitive）。',
    },
    'MATCH': {
        summary: '`match(pattern)` — 正则表达式匹配（大小写不敏感）',
        detail: [
            '使用正则表达式匹配变量值（忽略大小写）。用于 `EXPRESSION` 指令中。',
            '',
            '**格式**',
            '```csmscript',
            'EXPRESSION >> ${serial} match("SN\\d+") => ok',
            '```',
        ].join('\n'),
    },
    'MATCH_S': {
        summary: '`match_s(pattern)` — 正则表达式匹配（大小写敏感）',
        detail: '与 `match()` 相同，但区分大小写（Case Sensitive）。',
    },
    'START_WITH': {
        summary: '`start_with(prefix)` — 前缀匹配（大小写不敏感）',
        detail: '判断变量值是否以指定前缀开头（忽略大小写）。',
    },
    'START_WITH_S': {
        summary: '`start_with_s(prefix)` — 前缀匹配（大小写敏感）',
        detail: '与 `start_with()` 相同，但区分大小写。',
    },
    'END_WITH': {
        summary: '`end_with(suffix)` — 后缀匹配（大小写不敏感）',
        detail: '判断变量值是否以指定后缀结尾（忽略大小写）。',
    },
    'END_WITH_S': {
        summary: '`end_with_s(suffix)` — 后缀匹配（大小写敏感）',
        detail: '与 `end_with()` 相同，但区分大小写。',
    },
    'CONTAIN': {
        summary: '`contain(substring)` — 包含匹配（大小写不敏感）',
        detail: '判断变量值是否包含指定子字符串（忽略大小写）。',
    },
    'CONTAIN_S': {
        summary: '`contain_s(substring)` — 包含匹配（大小写敏感）',
        detail: '与 `contain()` 相同，但区分大小写。',
    },
    'BELONG': {
        summary: '`belong(list)` — 列表归属匹配（大小写不敏感）',
        detail: '判断变量值是否属于指定字符串列表中的某一项（忽略大小写）。',
    },
    'BELONG_S': {
        summary: '`belong_s(list)` — 列表归属匹配（大小写敏感）',
        detail: '与 `belong()` 相同，但区分大小写。',
    },

    // -----------------------------------------------------------------------
    // Conditional jump
    // -----------------------------------------------------------------------
    '??': {
        summary: '`?? goto >> <anchor>` — 错误时跳转 (Error Jump)',
        detail: [
            '当**前一条指令产生错误**时，跳转到指定锚点。',
            '',
            '**格式**',
            '```csmscript',
            '?? goto >> <error_handler>',
            '```',
        ].join('\n'),
    },
    '?EXPR?': {
        summary: '`?expression? goto >> <anchor>` — 条件跳转 (Conditional Jump)',
        detail: [
            '当**表达式成立**时，跳转到指定锚点。',
            '',
            '**格式**',
            '```csmscript',
            '?${var}=0? goto >> <anchor>',
            '?${count}>10? goto >> <done>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // System states
    // -----------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the hover entry for an operator token found at position in the line. */
function lookupOperator(line: string, pos: number): HoverEntry | undefined {
    // Ordered by length (longest first) to prefer specific matches.
    const candidates: [string, string][] = [
        ['-><register as interrupt>', '-><REGISTER AS INTERRUPT>'],
        ['-><register as status>',    '-><REGISTER AS STATUS>'],
        ['-><register as Interrupt>', '-><REGISTER AS INTERRUPT>'],
        ['-><register as Status>',    '-><REGISTER AS STATUS>'],
        ['-><register>',              '-><REGISTER>'],
        ['-><unregister>',            '-><UNREGISTER>'],
        ['->|',                       '->|'],
        ['->',                        '->'],
        ['-@',                        '-@'],
        ['=>',                        '=>'],
        ['>>',                        '>>'],
        ['!∈',                        '!∈'],
        ['∈',                         '∈'],
        ['??',                        '??'],
    ];
    for (const [op, key] of candidates) {
        // Check if the operator appears at or near pos
        const start = Math.max(0, pos - op.length + 1);
        const end = Math.min(line.length, pos + op.length);
        const slice = line.substring(start, end);
        if (slice.includes(op)) {
            const idx = line.indexOf(op, Math.max(0, pos - op.length));
            if (idx !== -1 && idx <= pos && pos < idx + op.length) {
                return HOVER_DB[key];
            }
        }
    }
    return undefined;
}

/** Extract the word (identifier / command) around the cursor position. */
function getWordAt(line: string, pos: number): string {
    // Expand left (include underscore, alphanumeric)
    let start = pos;
    while (start > 0 && /[\w]/.test(line[start - 1])) { start--; }
    // Expand right
    let end = pos;
    while (end < line.length && /[\w]/.test(line[end])) { end++; }
    const base = line.substring(start, end);

    // If immediately followed by (...), include to handle WAIT(ms), RANDOM(INT), etc.
    // Only do so when the content inside () is alphanumeric (command variant), not args.
    if (end < line.length && line[end] === '(') {
        const closeIdx = line.indexOf(')', end);
        if (closeIdx !== -1) {
            const inner = line.substring(end + 1, closeIdx);
            if (/^[A-Za-z]+$/.test(inner)) {
                return base + '(' + inner + ')';
            }
        }
    }
    return base;
}

/** Try to match multi-word system state names around cursor position. */
const MULTI_WORD_STATES = [
    'Async Message Posted',
    'Target Timeout Error',
    'No Target Error',
    'Async Response',
    'Target Error',
    'Critical Error',
    'Error Handler',
];
function lookupMultiWord(line: string, pos: number): HoverEntry | undefined {
    for (const state of MULTI_WORD_STATES) {
        const idx = line.indexOf(state);
        if (idx !== -1 && pos >= idx && pos < idx + state.length) {
            return HOVER_DB[state.toUpperCase()];
        }
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// User-defined anchor hover helpers
// ---------------------------------------------------------------------------

/** Control-flow tag keywords that cannot be user-defined anchor names. */
const CONTROL_FLOW_TAG_KEYWORDS = new Set([
    'if', 'else', 'end_if',
    'while', 'end_while',
    'do_while', 'end_do_while',
    'foreach', 'end_foreach',
    'include',
]);

/** Pattern matching valid user-defined anchor names (letter-leading, allows hyphens). */
const ANCHOR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface AnchorDefinition {
    /** Zero-based line index of the anchor definition. */
    line: number;
    /** Inline comment text on the definition line (empty string if none). */
    comment: string;
}

interface AnchorCacheEntry {
    /** Document version the cache was built for. */
    version: number;
    /** Map of lower-cased anchor name to its definition. */
    anchors: Map<string, AnchorDefinition>;
}

/** Cache anchor definitions per document URI and version to avoid repeated full scans. */
const anchorCache = new Map<string, AnchorCacheEntry>();

/**
 * Find an anchor definition `<name>` that matches `anchorName`
 * (case-insensitive) within the given document.
 *
 * Anchor definitions for each (document URI, version) pair are cached so
 * that the document is scanned at most once per version.
 */
function findAnchorInDocument(
    document: vscode.TextDocument,
    anchorName: string,
): AnchorDefinition | undefined {
    const lower = anchorName.toLowerCase();
    const cacheKey = document.uri.toString();
    const cached = anchorCache.get(cacheKey);

    if (cached && cached.version === document.version) {
        return cached.anchors.get(lower);
    }

    // Build a fresh cache entry for this document version.
    const anchors = new Map<string, AnchorDefinition>();
    const anchorPattern = /^\s*<([A-Za-z][A-Za-z0-9_-]*)>\s*(?:\/\/\s*(.*?))?\s*$/;

    for (let i = 0; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;
        const m = text.match(anchorPattern);
        if (m) {
            const nameLower = m[1].toLowerCase();
            // Preserve the first definition encountered for a given name.
            if (!anchors.has(nameLower)) {
                anchors.set(nameLower, { line: i, comment: m[2] ?? '' });
            }
        }
    }

    anchorCache.set(cacheKey, { version: document.version, anchors });
    return anchors.get(lower);
}

function buildAnchorHover(name: string, def: AnchorDefinition): vscode.Hover {
    const md = new vscode.MarkdownString();
    // Do not trust user-controlled document content in anchor hovers.
    md.isTrusted = false;
    md.supportHtml = false;
    md.appendMarkdown(`**\`<${name}>\` — 用户定义锚点 (User Anchor)**`);
    md.appendMarkdown('\n\n---\n\n');
    md.appendMarkdown(`定义于第 ${def.line + 1} 行。`);
    if (def.comment) {
        md.appendMarkdown('\n\n');
        md.appendText(def.comment);
    }
    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// Standalone hover function (used by both CSMScript and CSMLog providers)
// ---------------------------------------------------------------------------

export function provideCSMScriptHover(
    document: vscode.TextDocument,
    position: vscode.Position,
): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const col = position.character;

    // 1. Try operator look-up first (operators can contain non-word chars)
    const opEntry = lookupOperator(line, col);
    if (opEntry) {
        return buildHover(opEntry);
    }

    // 2. Multi-word system state look-up (before single-word to prefer longer match)
    const multiEntry = lookupMultiWord(line, col);
    if (multiEntry) {
        return buildHover(multiEntry);
    }

    // 3. Variable reference: cursor on $ or inside ${...}
    const dollarIdx = line.lastIndexOf('$', col);
    if (dollarIdx !== -1 && col <= line.indexOf('}', dollarIdx)) {
        const entry = HOVER_DB['${'];
        if (entry) { return buildHover(entry); }
    }

    // 4. Try word-based look-up
    const rawWord = getWordAt(line, col);
    if (!rawWord) { return undefined; }

    const upper = rawWord.toUpperCase();

    // Direct look-up
    let entry = HOVER_DB[upper];
    if (entry) { return buildHover(entry); }

    // Pre-definition section headers: [COMMAND_ALIAS] etc.
    // Check if the word is inside a [SECTION] header on this line
    const sectionMatch = line.match(/^\s*(\[[^\]]+\])/);
    if (sectionMatch) {
        const sectionKey = sectionMatch[1].toUpperCase()
            .replace(/COMMAND.ALIAS|CMD.ALIAS|COMMANDALIAS|CMDALIAS/i, 'COMMAND_ALIAS')
            .replace(/\s+/g, '_');
        entry = HOVER_DB[sectionKey];
        if (entry) { return buildHover(entry); }
    }

    // Control flow: <if, <while, <foreach, etc. – handle < prefix
    const beforeCursor = line.substring(0, col);
    const ltPos = beforeCursor.lastIndexOf('<');
    if (ltPos !== -1 && ltPos >= col - rawWord.length - 1) {
        const tag = ('<' + upper).replace(/\s+.*/, '');
        entry = HOVER_DB[tag];
        if (entry) { return buildHover(entry); }
    }

    // Broadcast targets: <status>, <interrupt>, <broadcast>, <all>
    // User hovered on the word inside < >
    const broadcastKey = '<' + upper + '>';
    entry = HOVER_DB[broadcastKey];
    if (entry) { return buildHover(entry); }

    // User-defined anchor: cursor is inside <anchorName> (supports hyphens in names)
    // Extract the full text between the nearest `<` before the cursor and the
    // next `>` on the line instead of relying on the word-boundary `rawWord`,
    // because `-` is a word separator in CSMScript's wordPattern.
    if (ltPos !== -1) {
        const gtPos = line.indexOf('>', ltPos);
        if (gtPos !== -1 && col > ltPos && col <= gtPos) {
            const anchorName = line.substring(ltPos + 1, gtPos);
            if (ANCHOR_NAME_PATTERN.test(anchorName)
                && !CONTROL_FLOW_TAG_KEYWORDS.has(anchorName.toLowerCase())) {
                const anchorDef = findAnchorInDocument(document, anchorName);
                if (anchorDef !== undefined) {
                    return buildAnchorHover(anchorName, anchorDef);
                }
            }
        }
    }

    // Conditional jump ?...?
    if (line.trimStart().startsWith('??')) {
        entry = HOVER_DB['??'];
        if (entry) { return buildHover(entry); }
    }
    if (/\?[^?]+\?/.test(line)) {
        entry = HOVER_DB['?EXPR?'];
        if (entry) { return buildHover(entry); }
    }

    return undefined;
}

export function buildHover(entry: HoverEntry): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = false;
    md.appendMarkdown(`**${entry.summary}**`);
    if (entry.detail) {
        md.appendMarkdown('\n\n---\n\n' + entry.detail);
    }
    return new vscode.Hover(md);
}
