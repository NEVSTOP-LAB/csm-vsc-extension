import { HoverEntry } from '../types';

/**
 * Built-in script commands: flow control, time, IO/dialog, TagDB, error
 * handling toggles. Keys are the upper-case command name (variants like
 * `WAIT(MS)`, `RANDOM(INT)` are listed with their parenthesised suffix
 * because `getWordAt` preserves these suffixes during lookup).
 */
export const COMMAND_HOVERS: Record<string, HoverEntry> = {

    // -----------------------------------------------------------------------
    // Flow / jump
    // -----------------------------------------------------------------------
    'GOTO': {
        summary: '`GOTO` — 跳转指令 (Jump to Anchor)',
        detail: [
            '跳转到脚本中指定的**锚点**位置继续执行。',
            '',
            '> **注意**：在循环体内使用时，目标锚点必须位于**当前循环体内**，否则会报错。',
            '',
            '**格式**',
            '```',
            'GOTO >> <anchor_name>',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
            'JUMP >> <anchor_name>',
            '```',
        ].join('\n'),
    },
    'BREAK': {
        summary: '`BREAK` — 跳出循环',
        detail: [
            '跳出**当前一层循环**，继续执行循环之后的脚本。',
            '可用于 `<while>`、`<do_while>`、`<foreach>` 循环中。',
            '不在循环中使用时无效果。',
            '',
            '**示例**',
            '```',
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
            '```',
            '<foreach item in ${list:a;b;c}>',
            '  <if ${skip}=1>',
            '    CONTINUE',
            '  <end_if>',
            '  ECHO >> 当前项目：${item}',
            '<end_foreach>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Time
    // -----------------------------------------------------------------------
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
            '```',
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
            '```',
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
            '```',
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

    // -----------------------------------------------------------------------
    // Output / expression / random
    // -----------------------------------------------------------------------
    'ECHO': {
        summary: '`ECHO` — 输出信息 (Echo Output)',
        detail: [
            '在脚本执行结果界面输出指定信息，同时广播同名事件。',
            'ECHO 做**全字符串替换**，将变量占位符替换为值后整体作为字符串输出。',
            '',
            '**变体**：`ECHO0`–`ECHO9` 对应不同广播通道。',
            '',
            '**格式**',
            '```',
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
            '```',
            'EXPRESSION >> expr => varName',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
            'RANDOMINT >> MIN=1,MAX=100 => rndInt',
            'RANDOM(INT) >> MIN=0,MAX=9 => rndInt2',
            '```',
        ].join('\n'),
    },
    'RANDOM(INT)': {
        summary: '`RANDOM(INT)` — 生成随机整数',
        detail: '与 `RANDOMINT` 等效，生成指定范围内的随机整数。',
    },

    // -----------------------------------------------------------------------
    // Auto-error-handle / variable spaces
    // -----------------------------------------------------------------------
    'AUTO_ERROR_HANDLE_ENABLE': {
        summary: '`AUTO_ERROR_HANDLE_ENABLE` — 开启/关闭自动错误处理',
        detail: [
            '在脚本运行时动态**开启或关闭**自动错误处理功能。',
            '开启后，脚本遇到错误会自动跳转到设定的锚点。',
            '',
            '**格式**',
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
            'TAGDB_VAR_SPACE_NAME >> tagdb_main,tagdb_backup',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // TagDB I/O
    // -----------------------------------------------------------------------
    'TAGDB_GET_VALUE': {
        summary: '`TAGDB_GET_VALUE` — 从 TagDB 读取数据',
        detail: [
            '从 TagDB 中读取浮点数类型的数据。',
            '',
            '- **输入参数**：TagDB 变量名称，支持逗号分隔的数组形式',
            '- **输出参数**：读取到的键值对，例如 `tag1=10.5,tag2=20.3`',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
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

    // -----------------------------------------------------------------------
    // Dialogs
    // -----------------------------------------------------------------------
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
            '```',
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
            '```',
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
            '```',
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
            '```',
            'INPUT_DIALOG >> {Label:批次号;Prompt:请输入},{Label:操作员} => retInfo',
            '```',
        ].join('\n'),
    },
};
