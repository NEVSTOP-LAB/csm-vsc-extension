import { HoverEntry } from '../types';

/** Pre-definition `[SECTION]` headers and the API/Macro state prefixes. */
export const SECTION_HOVERS: Record<string, HoverEntry> = {

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
    // State prefixes
    // -----------------------------------------------------------------------
    'API': {
        summary: '`API:` — API 状态前缀 (API State Prefix)',
        detail: [
            '标记该行为 CSM **API 调用**状态，通常与通信操作符（`-@`、`->`、`->|`）一起使用。',
            '',
            '**格式**',
            '```',
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
            '```',
            'Macro: MacroName >> Arguments -@ TargetModule',
            '```',
        ].join('\n'),
    },
};
