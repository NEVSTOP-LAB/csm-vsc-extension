import { HoverEntry } from '../types';

/**
 * Control-flow tags (`<if>` / `<while>` / ...), range/string operators used
 * in `EXPRESSION`, and the conditional jump shorthand `??`.
 *
 * Word-leading lookups go through `getWordAt`, so keys for control-flow
 * starts (e.g. `<IF`, `<WHILE`, `<INCLUDE`) intentionally omit the trailing
 * space/argument; closing tags use the full `<END_IF>` form.
 */
export const CONTROL_FLOW_HOVERS: Record<string, HoverEntry> = {

    // -----------------------------------------------------------------------
    // Conditional / loop tags
    // -----------------------------------------------------------------------
    '<IF': {
        summary: '`<if condition>` — 条件分支 (If Statement)',
        detail: [
            '开始一个条件分支块。条件为真时执行块内代码，否则跳转到 `<else>` 或 `<end_if>`。',
            '',
            '**格式**',
            '```',
            '<if condition>',
            '  // 条件成立时执行',
            '<else>',
            '  // 条件不成立时执行',
            '<end_if>',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
            '<while condition>',
            '  // 循环体',
            '<end_while>',
            '```',
            '',
            '**示例**',
            '```',
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
            '```',
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
            '```',
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
            '```',
            '<foreach varName in ${listVar:a;b;c}>',
            '  // 每次循环 varName 取列表中的一个元素',
            '<end_foreach>',
            '```',
            '',
            '**示例**',
            '```',
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
            '将另一个脚本文件的内容嵌入到当前脚本中执行，类似函数调用。',
            '',
            '**格式**',
            '```',
            '<include path/to/script>',
            '```',
            '',
            '**示例**',
            '```',
            '<include samples/include-sequence>',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // Range operators (used inside EXPRESSION)
    // -----------------------------------------------------------------------
    '∈': {
        summary: '`∈` — 范围内运算符 (In Range)',
        detail: [
            '判断变量值是否在指定区间内。用于 `EXPRESSION` 指令中。',
            '支持多个区间用分号 `;` 分隔（逻辑"或"）。',
            '',
            '**格式**',
            '```',
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
            '```',
            'EXPRESSION >> ${var} !∈ [min, max] => outRange',
            '```',
        ].join('\n'),
    },

    // -----------------------------------------------------------------------
    // String comparison functions (used inside EXPRESSION)
    // -----------------------------------------------------------------------
    'EQUAL': {
        summary: '`equal(value)` — 字符串相等比较（大小写不敏感）',
        detail: [
            '判断变量值是否与指定字符串**相等**（忽略大小写）。用于 `EXPRESSION` 指令中。',
            '',
            '**格式**',
            '```',
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
            '```',
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
            '```',
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
            '```',
            '?${var}=0? goto >> <anchor>',
            '?${count}>10? goto >> <done>',
            '```',
        ].join('\n'),
    },
};
