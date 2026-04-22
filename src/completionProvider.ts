import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Completion data definitions
// ---------------------------------------------------------------------------

interface CompletionDef {
    /** Text shown in the completion list. */
    label: string;
    /** VS Code icon / category. */
    kind: vscode.CompletionItemKind;
    /** One-line description shown beside the label. */
    detail: string;
    /**
     * SnippetString value for `insertText`.
     * When omitted, `label` is inserted as plain text.
     */
    insertText?: string;
    /** Markdown documentation shown in the detail pane. */
    documentation?: string;
}

// ---------------------------------------------------------------------------
// State prefixes
// ---------------------------------------------------------------------------
const PREFIX_COMPLETIONS: CompletionDef[] = [
    {
        label: 'API:',
        kind: vscode.CompletionItemKind.Keyword,
        detail: 'API 状态前缀',
        insertText: 'API: ${1:StateName} >> ${2:args}',
        documentation: [
            '标记该行为 CSM **API 调用**状态，通常与通信操作符（`-@`、`->`、`->|`）一起使用。',
            '',
            '**格式**',
            '```csmscript',
            'API: StateName >> Arguments -@ TargetModule',
            '```',
        ].join('\n'),
    },
    {
        label: 'Macro:',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '宏状态前缀',
        insertText: 'Macro: ${1:MacroName} >> ${2:args}',
        documentation: [
            '标记该行为 CSM **宏**状态调用。',
            '',
            '**格式**',
            '```csmscript',
            'Macro: MacroName >> Arguments -@ TargetModule',
            '```',
        ].join('\n'),
    },
];

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------
const COMMAND_COMPLETIONS: CompletionDef[] = [
    {
        label: 'GOTO',
        kind: vscode.CompletionItemKind.Function,
        detail: '跳转到锚点',
        insertText: 'GOTO >> ${1:<anchor>}',
        documentation: [
            '跳转到脚本中指定的**锚点**位置继续执行。',
            '',
            '```csmscript',
            'GOTO >> <anchor_name>',
            '```',
        ].join('\n'),
    },
    {
        label: 'JUMP',
        kind: vscode.CompletionItemKind.Function,
        detail: '跳转到锚点（等同于 GOTO）',
        insertText: 'JUMP >> ${1:<anchor>}',
        documentation: '与 `GOTO` 等效，跳转到脚本中指定的锚点位置继续执行。',
    },
    {
        label: 'WAIT',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待指定时间（默认秒）',
        insertText: 'WAIT >> ${1:1s}',
        documentation: [
            '等待指定的时间后继续执行脚本。支持 `1min 20s 500ms` 等复合格式。',
            '',
            '**变体**：`WAIT(s)` — 浮点秒，`WAIT(ms)` — 整数毫秒',
            '',
            '```csmscript',
            'WAIT >> 1s',
            'WAIT >> 1min 20s 500ms',
            '```',
        ].join('\n'),
    },
    {
        label: 'WAIT(s)',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待指定秒数（浮点数）',
        insertText: 'WAIT(s) >> ${1:1.0}',
        documentation: '等待指定秒数后继续执行。参数为浮点数。\n\n```csmscript\nWAIT(s) >> 1.5\n```',
    },
    {
        label: 'WAIT(ms)',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待指定毫秒数（整数）',
        insertText: 'WAIT(ms) >> ${1:500}',
        documentation: '等待指定毫秒数后继续执行。参数为整数。\n\n```csmscript\nWAIT(ms) >> 500\n```',
    },
    {
        label: 'SLEEP',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待指定时间（等同于 WAIT）',
        insertText: 'SLEEP >> ${1:1s}',
        documentation: '与 `WAIT` 等效，等待指定的时间后继续执行脚本。',
    },
    {
        label: 'BREAK',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '跳出当前循环',
        documentation: '跳出**当前一层循环**，继续执行循环之后的脚本。可用于 `<while>`、`<do_while>`、`<foreach>` 中。',
    },
    {
        label: 'CONTINUE',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '继续下一次循环迭代',
        documentation: '结束当前循环的本次迭代，跳到下一次循环开始处。',
    },
    {
        label: 'ECHO',
        kind: vscode.CompletionItemKind.Function,
        detail: '输出信息并广播同名事件',
        insertText: 'ECHO >> ${1:message}',
        documentation: [
            '在脚本执行结果界面输出指定信息，同时广播同名事件。',
            '',
            '**变体**：`ECHO0`–`ECHO9` 对应不同广播通道。',
            '',
            '```csmscript',
            'ECHO >> message',
            'ECHO >> ${varname}',
            '```',
        ].join('\n'),
    },
    {
        label: 'EXPRESSION',
        kind: vscode.CompletionItemKind.Function,
        detail: '计算表达式（数值 / 范围 / 字符串比较）',
        insertText: 'EXPRESSION >> ${1:expr} => ${2:result}',
        documentation: [
            '计算指定的表达式，结果为数值类型（DBL 或 1/0）。',
            '',
            '```csmscript',
            'EXPRESSION >> 3 + 5 => result',
            'EXPRESSION >> ${temp:25} ∈ [0,100] => ok',
            'EXPRESSION >> ${str} equal("hello") => matched',
            '```',
        ].join('\n'),
    },
    {
        label: 'RANDOM',
        kind: vscode.CompletionItemKind.Function,
        detail: '生成随机浮点数',
        insertText: 'RANDOM >> MIN=${1:0},MAX=${2:1} => ${3:rndVal}',
        documentation: '生成指定范围内的随机浮点数。参数为 API String 格式，支持 `MIN` 和 `MAX`，默认范围 [0, 1]。',
    },
    {
        label: 'RANDOMINT',
        kind: vscode.CompletionItemKind.Function,
        detail: '生成随机整数',
        insertText: 'RANDOMINT >> MIN=${1:1},MAX=${2:100} => ${3:rndInt}',
        documentation: '生成指定范围内的随机整数。',
    },
    {
        label: 'AUTO_ERROR_HANDLE_ENABLE',
        kind: vscode.CompletionItemKind.Function,
        detail: '开启/关闭自动错误处理',
        insertText: 'AUTO_ERROR_HANDLE_ENABLE >> ${1|TRUE,FALSE|}',
        documentation: '在脚本运行时动态开启或关闭自动错误处理功能。\n\n```csmscript\nAUTO_ERROR_HANDLE_ENABLE >> TRUE\n```',
    },
    {
        label: 'AUTO_ERROR_HANDLE_ANCHOR',
        kind: vscode.CompletionItemKind.Function,
        detail: '设置错误跳转锚点',
        insertText: 'AUTO_ERROR_HANDLE_ANCHOR >> ${1:<error_handler>}',
        documentation: '设置自动错误处理时跳转的目标锚点，默认为 `<cleanup>`。',
    },
    {
        label: 'INI_VAR_SPACE_ENABLE',
        kind: vscode.CompletionItemKind.Function,
        detail: '开启/关闭 INI 配置变量空间',
        insertText: 'INI_VAR_SPACE_ENABLE >> ${1|TRUE,FALSE|}',
        documentation: '动态开启或关闭 INI 文件配置变量空间。开启后可通过 `${section.key}` 引用 INI 文件中的变量。',
    },
    {
        label: 'INI_VAR_SPACE_PATH',
        kind: vscode.CompletionItemKind.Function,
        detail: '设置 INI 配置文件路径',
        insertText: 'INI_VAR_SPACE_PATH >> ${1:./config.ini}',
        documentation: '指定 INI 配置变量空间使用的文件路径。',
    },
    {
        label: 'TAGDB_VAR_SPACE_ENABLE',
        kind: vscode.CompletionItemKind.Function,
        detail: '开启/关闭 TagDB 变量空间',
        insertText: 'TAGDB_VAR_SPACE_ENABLE >> ${1|TRUE,FALSE|}',
        documentation: '动态开启或关闭 TagDB 变量空间支持。',
    },
    {
        label: 'TAGDB_VAR_SPACE_NAME',
        kind: vscode.CompletionItemKind.Function,
        detail: '设置 TagDB 变量空间名称',
        insertText: 'TAGDB_VAR_SPACE_NAME >> ${1:tagdb_main}',
        documentation: '指定 TagDB 变量空间的名称，支持逗号分隔的多个名称。',
    },
    {
        label: 'TAGDB_GET_VALUE',
        kind: vscode.CompletionItemKind.Function,
        detail: '从 TagDB 读取数据',
        insertText: 'TAGDB_GET_VALUE >> ${1:/tag/path} => ${2:tagResult}',
        documentation: '从 TagDB 中读取浮点数类型的数据。',
    },
    {
        label: 'TAGDB_SET_VALUE',
        kind: vscode.CompletionItemKind.Function,
        detail: '向 TagDB 写入数据',
        insertText: 'TAGDB_SET_VALUE >> ${1:/tag/path,value}',
        documentation: '向 TagDB 中写入浮点数类型的数据。',
    },
    {
        label: 'TAGDB_SWEEP',
        kind: vscode.CompletionItemKind.Function,
        detail: '扫描 TagDB 数据',
        insertText: 'TAGDB_SWEEP >> ${1:/tag/*}',
        documentation: '按照指定的扫描参数，对 TagDB 中的数据进行扫描。',
    },
    {
        label: 'TAGDB_WAIT_FOR_EXPRESSION',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待 TagDB 满足表达式条件',
        insertText: 'TAGDB_WAIT_FOR_EXPRESSION >> ${1:tag1>0} => ${2:result}',
        documentation: '阻塞执行，直到 TagDB 中的数据满足指定表达式条件，或超时。',
    },
    {
        label: 'TAGDB_START_MONITOR_EXPRESSION',
        kind: vscode.CompletionItemKind.Function,
        detail: '启动 TagDB 表达式监控',
        insertText: 'TAGDB_START_MONITOR_EXPRESSION >> ${1:tag1>0}',
        documentation: '在后台持续监控 TagDB 数据，当表达式成立时产生错误（触发自动错误处理）。',
    },
    {
        label: 'TAGDB_STOP_MONITOR_EXPRESSION',
        kind: vscode.CompletionItemKind.Function,
        detail: '停止 TagDB 表达式监控',
        insertText: 'TAGDB_STOP_MONITOR_EXPRESSION >> ${1:tag1>0}',
        documentation: '停止之前通过 `TAGDB_START_MONITOR_EXPRESSION` 启动的监控。',
    },
    {
        label: 'TAGDB_WAIT_FOR_STABLE',
        kind: vscode.CompletionItemKind.Function,
        detail: '等待 TagDB 数据稳定',
        insertText: 'TAGDB_WAIT_FOR_STABLE >> ${1:tagName} => ${2:result}',
        documentation: '等待指定 TagDB 变量的数据趋于稳定（单调趋势发生变化）。',
    },
    {
        label: 'ONE_BUTTON_DIALOG',
        kind: vscode.CompletionItemKind.Function,
        detail: '单按钮对话框',
        insertText: 'ONE_BUTTON_DIALOG >> Message:${1:Are you OK?}',
        documentation: '弹出一个只有单个按钮的对话框，等待用户点击后继续执行。',
    },
    {
        label: 'TWO_BUTTON_DIALOG',
        kind: vscode.CompletionItemKind.Function,
        detail: '双按钮对话框',
        insertText: 'TWO_BUTTON_DIALOG >> Message:${1:Continue?} => ${2:ret}',
        documentation: '弹出带有确认/取消两个按钮的对话框，返回 `TRUE`（确认）或 `FALSE`（取消）。',
    },
    {
        label: 'CONFIRM_DIALOG',
        kind: vscode.CompletionItemKind.Function,
        detail: '信息确认对话框',
        insertText: 'CONFIRM_DIALOG >> ${1:Key:Value}',
        documentation: '弹出信息确认对话框，展示键值对信息，等待用户确认后继续。',
    },
    {
        label: 'INPUT_DIALOG',
        kind: vscode.CompletionItemKind.Function,
        detail: '输入对话框',
        insertText: 'INPUT_DIALOG >> {Label:${1:输入项}} => ${2:retInfo}',
        documentation: '弹出输入对话框，支持多个输入项，等待用户输入后继续。',
    },
];

// ---------------------------------------------------------------------------
// Communication operators
// ---------------------------------------------------------------------------
const OPERATOR_COMPLETIONS: CompletionDef[] = [
    {
        label: '-@',
        kind: vscode.CompletionItemKind.Operator,
        detail: '同步调用',
        insertText: '-@ ${1:TargetModule}',
        documentation: '向目标模块发送消息并**等待其返回**后继续执行。',
    },
    {
        label: '->',
        kind: vscode.CompletionItemKind.Operator,
        detail: '异步调用',
        insertText: '-> ${1:TargetModule}',
        documentation: '向目标模块发送消息，不等待返回，继续执行后续脚本。',
    },
    {
        label: '->|',
        kind: vscode.CompletionItemKind.Operator,
        detail: '无应答异步调用（Fire-and-Forget）',
        insertText: '->| ${1:TargetModule}',
        documentation: '向目标模块发送消息，不等待任何应答（Fire-and-Forget）。',
    },
    {
        label: '>>',
        kind: vscode.CompletionItemKind.Operator,
        detail: '参数分隔符',
        insertText: '>> ${1:args}',
        documentation: '分隔指令/状态名称与其参数。',
    },
    {
        label: '=>',
        kind: vscode.CompletionItemKind.Operator,
        detail: '返回值保存',
        insertText: '=> ${1:varName}',
        documentation: '将指令的返回值保存到指定变量，后续可通过 `${变量名}` 引用。',
    },
    {
        label: '??',
        kind: vscode.CompletionItemKind.Operator,
        detail: '错误时跳转',
        insertText: '?? goto >> ${1:<error_handler>}',
        documentation: '当前一条指令产生错误时，跳转到指定锚点。',
    },
];

// ---------------------------------------------------------------------------
// Broadcast & subscription targets  (triggered after `->` or `<`)
// ---------------------------------------------------------------------------
const BROADCAST_COMPLETIONS: CompletionDef[] = [
    {
        label: '<status>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '广播正常状态目标',
        documentation: '将消息广播为**普通状态**，所有订阅了该状态的模块都会收到。',
    },
    {
        label: '<interrupt>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '广播中断状态目标',
        documentation: '将消息广播为**中断**，中断优先级高于普通状态消息。',
    },
    {
        label: '<broadcast>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '广播消息目标',
        documentation: '将消息广播到所有模块。',
    },
    {
        label: '<all>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '广播到所有目标',
        documentation: '向所有已连接模块广播消息。',
    },
];

const SUBSCRIPTION_COMPLETIONS: CompletionDef[] = [
    {
        label: '-><register>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '注册订阅',
        documentation: '将源模块的状态注册到处理程序模块，建立订阅关系。',
    },
    {
        label: '-><unregister>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '取消订阅',
        documentation: '取消之前通过 `-><register>` 建立的订阅关系。',
    },
    {
        label: '-><register as interrupt>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '注册为中断订阅',
        documentation: '将源模块的状态注册为**中断**类型，关联到处理程序模块。',
    },
    {
        label: '-><register as status>',
        kind: vscode.CompletionItemKind.EnumMember,
        detail: '注册为状态订阅',
        documentation: '将源模块的中断注册为**普通状态**类型，关联到处理程序模块。',
    },
];

// ---------------------------------------------------------------------------
// Control-flow tag keywords — NOT user-defined anchor names
// ---------------------------------------------------------------------------
const CONTROL_FLOW_TAG_KEYWORDS = new Set([
    'if', 'else', 'end_if',
    'while', 'end_while',
    'do_while', 'end_do_while',
    'foreach', 'end_foreach',
    'include',
]);

interface AnchorLabelCacheEntry {
    /** Document version the cache was built for. */
    version: number;
    /** Deduplicated list of anchor names in document order. */
    labels: string[];
}

/** Cache anchor label lists per document URI+version to avoid repeated full scans. */
const anchorLabelCache = new Map<string, AnchorLabelCacheEntry>();

/**
 * Scan the document and collect all user-defined anchor names.
 *
 * An anchor definition line has the form `<name>` (stripped of trailing
 * comments and surrounding whitespace) where `name` starts with a letter
 * and is not a built-in control-flow keyword.  Duplicates are excluded;
 * the first occurrence wins.  Results are cached by document URI + version.
 */
function collectAnchorLabels(document: vscode.TextDocument): string[] {
    const cacheKey = document.uri.toString();
    const cached = anchorLabelCache.get(cacheKey);
    if (cached && cached.version === document.version) {
        return cached.labels;
    }

    const anchors: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;
        const commentIdx = text.indexOf('//');
        const code = commentIdx >= 0 ? text.substring(0, commentIdx) : text;
        const trimmed = code.trim();
        const m = trimmed.match(/^<([A-Za-z][A-Za-z0-9_-]*)>$/);
        if (m) {
            const lower = m[1].toLowerCase();
            if (!CONTROL_FLOW_TAG_KEYWORDS.has(lower) && !seen.has(lower)) {
                seen.add(lower);
                anchors.push(m[1]);
            }
        }
    }

    anchorLabelCache.set(cacheKey, { version: document.version, labels: anchors });
    return anchors;
}

// ---------------------------------------------------------------------------
// Control-flow keywords  (triggered after `<`)
// ---------------------------------------------------------------------------
const CONTROL_FLOW_COMPLETIONS: CompletionDef[] = [
    {
        label: '<if>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '条件分支',
        insertText: '<if ${1:condition}>\n\t${2}\n<end_if>',
        documentation: [
            '开始一个条件分支块。条件为真时执行块内代码，否则跳转到 `<else>` 或 `<end_if>`。',
            '',
            '```csmscript',
            '<if condition>',
            '  // 条件成立时执行',
            '<end_if>',
            '```',
        ].join('\n'),
    },
    {
        label: '<else>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '条件分支否定子句',
        documentation: '在 `<if>` 和 `<end_if>` 之间使用，定义条件不成立时执行的代码块。',
    },
    {
        label: '<end_if>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '结束条件分支',
        documentation: '结束 `<if>` 开始的条件分支块。',
    },
    {
        label: '<while>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: 'While 循环',
        insertText: '<while ${1:condition}>\n\t${2}\n<end_while>',
        documentation: [
            '当条件成立时重复执行循环体内的代码。每次循环开始前检查条件。',
            '',
            '```csmscript',
            '<while ${count:0} < 10>',
            '  EXPRESSION >> ${count:0} + 1 => count',
            '<end_while>',
            '```',
        ].join('\n'),
    },
    {
        label: '<end_while>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '结束 While 循环',
        documentation: '结束 `<while>` 开始的循环块，回到循环条件检查处。',
    },
    {
        label: '<do_while>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: 'Do-While 循环体开始',
        insertText: '<do_while>\n\t${1}\n<end_do_while ${2:condition}>',
        documentation: [
            '先执行循环体，再检查 `<end_do_while condition>` 处的条件。至少执行一次。',
            '',
            '```csmscript',
            '<do_while>',
            '  // 循环体（至少执行一次）',
            '<end_do_while condition>',
            '```',
        ].join('\n'),
    },
    {
        label: '<end_do_while>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '结束 Do-While 循环',
        insertText: '<end_do_while ${1:condition}>',
        documentation: '结束 `<do_while>` 循环，条件成立时继续循环，否则退出。',
    },
    {
        label: '<foreach>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: 'ForEach 循环',
        insertText: '<foreach ${1:item} in ${2:\\${list:a;b;c}}>\n\t${3}\n<end_foreach>',
        documentation: [
            '遍历列表中的每个元素，依次执行循环体。列表使用分号 `;` 分隔。',
            '',
            '```csmscript',
            '<foreach station in ${stationList:A;B;C}>',
            '  ECHO >> 当前站点：${station}',
            '<end_foreach>',
            '```',
        ].join('\n'),
    },
    {
        label: '<end_foreach>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '结束 ForEach 循环',
        documentation: '结束 `<foreach>` 开始的循环块。',
    },
    {
        label: '<include>',
        kind: vscode.CompletionItemKind.Keyword,
        detail: '引用外部脚本',
        insertText: '<include ${1:path/to/script.csmscript}>',
        documentation: [
            '将另一个 `.csmscript` 文件的内容嵌入到当前脚本中执行，类似函数调用。',
            '',
            '```csmscript',
            '<include samples/include-sequence.csmscript>',
            '```',
        ].join('\n'),
    },
];

// ---------------------------------------------------------------------------
// Pre-definition section headers  (triggered after `[`)
// ---------------------------------------------------------------------------
const SECTION_COMPLETIONS: CompletionDef[] = [
    {
        label: '[COMMAND_ALIAS]',
        kind: vscode.CompletionItemKind.Module,
        detail: '指令别名配置节',
        documentation: [
            '在预定义区域中定义指令别名，将 CSM 消息指令映射为简短的自定义名称。',
            '',
            '```ini',
            '[COMMAND_ALIAS]',
            'AliasName = API: StateName >> Args -@ ModuleName',
            '```',
        ].join('\n'),
    },
    {
        label: '[AUTO_ERROR_HANDLE]',
        kind: vscode.CompletionItemKind.Module,
        detail: '自动错误处理配置节',
        insertText: '[AUTO_ERROR_HANDLE]\nEnable = ${1|TRUE,FALSE|}\nAnchor = ${2:<error_handler>}',
        documentation: [
            '在预定义区域中配置脚本执行时的自动错误处理行为。',
            '',
            '| 键 | 说明 | 默认值 |',
            '|---|---|---|',
            '| `Enable` | 是否开启自动错误处理，`TRUE` 或 `FALSE` | `TRUE` |',
            '| `Anchor` | 出错时跳转的锚点名称 | `<error_handler>` |',
            '',
            '```ini',
            '[AUTO_ERROR_HANDLE]',
            'Enable = TRUE',
            'Anchor = <error_handler>',
            '```',
        ].join('\n'),
    },
    {
        label: '[INI_VAR_SPACE]',
        kind: vscode.CompletionItemKind.Module,
        detail: 'INI 配置变量空间配置节',
        insertText: '[INI_VAR_SPACE]\nEnable = ${1|TRUE,FALSE|}\nPath = ${2:./config.ini}',
        documentation: [
            '在预定义区域中开启 INI 文件配置变量空间，允许脚本通过 `${变量名}` 读取 INI 文件中的键值。',
            '',
            '| 键 | 说明 | 示例值 |',
            '|---|---|---|',
            '| `Enable` | 是否开启，`TRUE` 或 `FALSE` | `TRUE` |',
            '| `Path`   | INI 文件路径 | `./config.ini` |',
            '',
            '```ini',
            '[INI_VAR_SPACE]',
            'Enable = TRUE',
            'Path = ./config.ini',
            '```',
        ].join('\n'),
    },
    {
        label: '[TAGDB_VAR_SPACE]',
        kind: vscode.CompletionItemKind.Module,
        detail: 'TagDB 变量空间配置节',
        insertText: '[TAGDB_VAR_SPACE]\nEnable = ${1|TRUE,FALSE|}\nName = ${2:csmscript}',
        documentation: [
            '在预定义区域中开启 TagDB 变量空间，允许脚本通过 `${变量名}` 读取 TagDB 数据。',
            '',
            '| 键 | 说明 | 默认值 |',
            '|---|---|---|',
            '| `Enable` | 是否开启，`TRUE` 或 `FALSE` | `FALSE` |',
            '| `Name`   | TagDB 名称，支持逗号分隔的多个名称 | `csmscript` |',
            '',
            '```ini',
            '[TAGDB_VAR_SPACE]',
            'Enable = TRUE',
            'Name = csmscript',
            '```',
        ].join('\n'),
    },
];

// ---------------------------------------------------------------------------
// Variable reference  (triggered after `$`)
// ---------------------------------------------------------------------------
const VARIABLE_COMPLETIONS: CompletionDef[] = [
    {
        label: '${varname}',
        kind: vscode.CompletionItemKind.Variable,
        detail: '变量引用',
        // `$` is a word char in CSMScript's wordPattern so VS Code replaces the
        // word `$` with this snippet.  `\$` (literal `$` in SnippetString) is
        // needed to include the dollar sign in the inserted text.
        insertText: '\\${${1:varName}}',
        documentation: [
            '在执行时将占位符替换为对应变量的值。',
            '支持设置默认值：当变量未定义时使用默认值。',
            '',
            '```csmscript',
            '${varname}          // 无默认值',
            '${varname:default}  // 带默认值',
            '```',
        ].join('\n'),
    },
    {
        label: '${varname:default}',
        kind: vscode.CompletionItemKind.Variable,
        detail: '带默认值的变量引用',
        insertText: '\\${${1:varName}:${2:default}}',
        documentation: '在执行时将占位符替换为对应变量的值。当变量未定义时使用默认值。',
    },
];

// ---------------------------------------------------------------------------
// String comparison functions  (used inside EXPRESSION >> ...)
// ---------------------------------------------------------------------------
const STRING_FUNC_COMPLETIONS: CompletionDef[] = [
    {
        label: 'equal()',
        kind: vscode.CompletionItemKind.Function,
        detail: '字符串相等比较（大小写不敏感）',
        insertText: 'equal("${1:expected}")',
        documentation: '判断变量值是否与指定字符串相等（忽略大小写）。用于 `EXPRESSION` 指令中。',
    },
    {
        label: 'equal_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '字符串相等比较（大小写敏感）',
        insertText: 'equal_s("${1:expected}")',
        documentation: '与 `equal()` 相同，但区分大小写（Case Sensitive）。',
    },
    {
        label: 'match()',
        kind: vscode.CompletionItemKind.Function,
        detail: '正则表达式匹配（大小写不敏感）',
        insertText: 'match("${1:pattern}")',
        documentation: '使用正则表达式匹配变量值（忽略大小写）。用于 `EXPRESSION` 指令中。',
    },
    {
        label: 'match_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '正则表达式匹配（大小写敏感）',
        insertText: 'match_s("${1:pattern}")',
        documentation: '与 `match()` 相同，但区分大小写（Case Sensitive）。',
    },
    {
        label: 'start_with()',
        kind: vscode.CompletionItemKind.Function,
        detail: '前缀匹配（大小写不敏感）',
        insertText: 'start_with("${1:prefix}")',
        documentation: '判断变量值是否以指定前缀开头（忽略大小写）。',
    },
    {
        label: 'start_with_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '前缀匹配（大小写敏感）',
        insertText: 'start_with_s("${1:prefix}")',
        documentation: '与 `start_with()` 相同，但区分大小写。',
    },
    {
        label: 'end_with()',
        kind: vscode.CompletionItemKind.Function,
        detail: '后缀匹配（大小写不敏感）',
        insertText: 'end_with("${1:suffix}")',
        documentation: '判断变量值是否以指定后缀结尾（忽略大小写）。',
    },
    {
        label: 'end_with_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '后缀匹配（大小写敏感）',
        insertText: 'end_with_s("${1:suffix}")',
        documentation: '与 `end_with()` 相同，但区分大小写。',
    },
    {
        label: 'contain()',
        kind: vscode.CompletionItemKind.Function,
        detail: '包含匹配（大小写不敏感）',
        insertText: 'contain("${1:substring}")',
        documentation: '判断变量值是否包含指定子字符串（忽略大小写）。',
    },
    {
        label: 'contain_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '包含匹配（大小写敏感）',
        insertText: 'contain_s("${1:substring}")',
        documentation: '与 `contain()` 相同，但区分大小写。',
    },
    {
        label: 'belong()',
        kind: vscode.CompletionItemKind.Function,
        detail: '列表归属匹配（大小写不敏感）',
        insertText: 'belong("${1:a,b,c}")',
        documentation: '判断变量值是否属于指定字符串列表中的某一项（忽略大小写）。',
    },
    {
        label: 'belong_s()',
        kind: vscode.CompletionItemKind.Function,
        detail: '列表归属匹配（大小写敏感）',
        insertText: 'belong_s("${1:a,b,c}")',
        documentation: '与 `belong()` 相同，但区分大小写。',
    },
];

// ---------------------------------------------------------------------------
// Helpers: convert CompletionDef → vscode.CompletionItem
// ---------------------------------------------------------------------------

/** Generic conversion — used for default and EXPRESSION contexts. */
function toCompletionItem(def: CompletionDef): vscode.CompletionItem {
    const item = new vscode.CompletionItem(def.label, def.kind);
    item.detail = def.detail;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    }
    if (def.insertText !== undefined) {
        item.insertText = new vscode.SnippetString(def.insertText);
    }
    return item;
}

/**
 * Builds a completion item for the `<` trigger context.
 *
 * The `<` character is a word separator in CSMScript's wordPattern, so VS Code
 * inserts the selected text AT the cursor (right after `<`) without replacing
 * anything.  To avoid producing `<<if …>`, we strip the leading `<` from the
 * insertText so that only the suffix is inserted.
 *
 * filterText is set to the label without the leading `<` so that VS Code's
 * prefix-filter still finds `<if>` when the user has typed `if` after `<`.
 */
function toItemForBracketContext(def: CompletionDef): vscode.CompletionItem {
    const item = new vscode.CompletionItem(def.label, def.kind);
    item.detail = def.detail;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    }
    const base = def.insertText ?? def.label;
    item.insertText = new vscode.SnippetString(base.startsWith('<') ? base.slice(1) : base);
    // Help VS Code filter: match the text the user types AFTER `<`
    if (def.label.startsWith('<')) {
        item.filterText = def.label.slice(1);
    }
    return item;
}

/**
 * Builds a completion item for subscription targets shown after `->`.
 *
 * Both `-` and `>` are word separators, so VS Code inserts the text at the
 * cursor (right after `->`) without replacing anything.  To avoid producing
 * `-> -><register>`, we strip the leading `->` from the insertText so only
 * `<register>` (etc.) is appended.
 */
function toItemForArrowSubscription(def: CompletionDef): vscode.CompletionItem {
    const item = new vscode.CompletionItem(def.label, def.kind);
    item.detail = def.detail;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    }
    const base = def.insertText ?? def.label;
    item.insertText = new vscode.SnippetString(base.startsWith('->') ? base.slice(2) : base);
    return item;
}

/**
 * Builds a completion item for broadcast targets shown after `->`.
 *
 * CSMScript syntax requires a space: `-> <status>`.  Since the cursor sits
 * right after `->` with nothing else, we prepend a space to the inserted text.
 */
function toItemForArrowBroadcast(def: CompletionDef): vscode.CompletionItem {
    const item = new vscode.CompletionItem(def.label, def.kind);
    item.detail = def.detail;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    }
    const base = def.insertText ?? def.label;
    item.insertText = new vscode.SnippetString(' ' + base);
    return item;
}

// ---------------------------------------------------------------------------
// CSMScriptCompletionProvider
// ---------------------------------------------------------------------------

export class CSMScriptCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const line = document.lineAt(position.line).text;
        const textBefore = line.substring(0, position.character);

        // Skip comment lines
        if (textBefore.trimStart().startsWith('//')) {
            return [];
        }

        // ── Context: after `[` ─ pre-definition section headers ───────────
        if (/\[\w*$/.test(textBefore)) {
            return SECTION_COMPLETIONS.map(toCompletionItem);
        }

        // ── Context: after `->` ─ subscription and broadcast targets ───────
        // Must test before the plain `<` check because `->` can precede `<`
        if (/->$/.test(textBefore)) {
            return [
                ...SUBSCRIPTION_COMPLETIONS.map(toItemForArrowSubscription),
                ...BROADCAST_COMPLETIONS.map(toItemForArrowBroadcast),
            ];
        }

        // ── Context: after `<` ─ control-flow keywords, broadcast targets, `<`-prefixed operators, and user-defined anchors
        if (/<\w*$/.test(textBefore)) {
            const anchorItems = collectAnchorLabels(document).map(name => {
                const item = new vscode.CompletionItem('<' + name + '>', vscode.CompletionItemKind.Reference);
                item.detail = '用户定义锚点';
                item.insertText = new vscode.SnippetString(name + '>');
                item.filterText = name;
                return item;
            });
            const items = [
                ...CONTROL_FLOW_COMPLETIONS.map(toItemForBracketContext),
                ...BROADCAST_COMPLETIONS.map(toItemForBracketContext),
                ...OPERATOR_COMPLETIONS
                    .filter(op => op.label.startsWith('<'))
                    .map(toItemForBracketContext),
                ...anchorItems,
            ];

            // When autoClosingPairs inserts `>` immediately after `<`, the
            // completion insertText already contains the closing `>`.  Set a
            // replacement range that also covers that auto-closed `>` so it is
            // consumed rather than left as a duplicate.
            const textAfter = line.substring(position.character);
            if (textAfter.startsWith('>')) {
                const wordMatch = /<(\w*)$/.exec(textBefore);
                const wordLen = wordMatch ? wordMatch[1].length : 0;
                const replaceRange = new vscode.Range(
                    position.line, position.character - wordLen,
                    position.line, position.character + 1,
                );
                for (const item of items) {
                    item.range = replaceRange;
                }
            }

            return items;
        }

        // ── Context: after `$` ─ variable reference ─────────────────────────
        if (/\$$/.test(textBefore)) {
            return VARIABLE_COMPLETIONS.map(toCompletionItem);
        }

        // ── Context: inside EXPRESSION ─ string comparison functions ────────
        if (/^\s*EXPRESSION\s*>>/i.test(textBefore)) {
            return [
                ...STRING_FUNC_COMPLETIONS,
                ...OPERATOR_COMPLETIONS,
            ].map(toCompletionItem);
        }

        // ── Default: return all top-level items ─────────────────────────────
        // (VS Code filters by the word the user has typed so far)
        return [
            ...PREFIX_COMPLETIONS,
            ...COMMAND_COMPLETIONS,
            ...CONTROL_FLOW_COMPLETIONS,
            ...OPERATOR_COMPLETIONS,
            ...SECTION_COMPLETIONS,
        ].map(toCompletionItem);
    }
}
