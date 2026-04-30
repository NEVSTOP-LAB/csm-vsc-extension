import { HoverEntry } from '../types';

/**
 * Communication operators, return-value capture, subscription markers,
 * broadcast targets and variable references.
 *
 * Keys are the exact operator literal (case-sensitive for the token text
 * itself) — note that subscription/broadcast keys are stored upper-cased
 * because the lookup table normalises tokens to upper case.
 */
export const OPERATOR_HOVERS: Record<string, HoverEntry> = {

    // -----------------------------------------------------------------------
    // Communication operators
    // -----------------------------------------------------------------------
    '-@': {
        summary: '`-@` — 同步调用 (Synchronous Call)',
        detail: [
            '向目标模块发送消息并**等待其返回**后继续执行。',
            '',
            '**格式**',
            '```',
            'API: StateName >> Arguments -@ TargetModule',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
            'API: StateName >> Arguments -> TargetModule',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
            'API: StateName >> Arguments ->| TargetModule',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
            'Status@SourceModule >> Handler@HandlerModule -><register>',
            '```',
        ].join('\n'),
    },
    '=>': {
        summary: '`=>` — 返回值保存 (Return Value Save)',
        detail: [
            '将指令的返回值保存到指定变量，后续可通过 `${变量名}` 引用。',
            '',
            '支持使用分号 `;` 分隔多个变量名以保存多个返回值。',
            '',
            '**格式**',
            '```',
            'Instruction >> Arguments => varName',
            'API: QueryInfo >> args -@ Module => field1;field2;field3',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
            'Status@SourceModule >> Handler@HandlerModule -><register>',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
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
            '```',
            '${varname}          // 无默认值',
            '${varname:default}  // 带默认值',
            '${section.varname}  // 指定 INI 节名称',
            '${tagdb.varname}    // 指定 TagDB 名称',
            '```',
        ].join('\n'),
    },
};
