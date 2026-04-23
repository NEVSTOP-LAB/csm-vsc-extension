# VSCode 贡献点（Contribution Points）摘要

> 原文档：[Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points)

---

## 什么是贡献点？

贡献点（Contribution Points）是在插件的 `package.json` 的 `contributes` 字段中进行的**静态声明**，用于告知 VSCode 该插件扩展了哪些功能。无需运行时代码即可向 VSCode 注册命令、菜单、快捷键、语言、主题等能力。

```jsonc
// package.json（示例骨架）
{
  "contributes": {
    "commands": [...],
    "menus": {...},
    "keybindings": [...],
    "configuration": {...},
    "languages": [...],
    "grammars": [...],
    "snippets": [...],
    "views": {...},
    // ...
  }
}
```

---

## 贡献点完整速查表

| 贡献点 | 用途 |
|--------|------|
| `commands` | 注册命令（显示于命令面板） |
| `menus` | 将命令添加到各类菜单 |
| `keybindings` | 绑定键盘快捷键 |
| `configuration` | 声明插件设置项（出现在设置 UI） |
| `configurationDefaults` | 覆盖语言或其他设置的默认值 |
| `languages` | 注册新的编程语言 |
| `grammars` | 提供 TextMate 语法高亮文件 |
| `snippets` | 注册代码片段 |
| `themes` | 添加颜色主题 |
| `iconThemes` | 添加文件图标主题 |
| `productIconThemes` | 替换 VSCode 内置产品图标 |
| `colors` | 定义可主题化的 UI 颜色 |
| `icons` | 注册命令或 UI 专用图标 |
| `views` | 在侧边栏 / 面板中添加自定义视图 |
| `viewsContainers` | 在活动栏 / 面板中注册新容器 |
| `viewsWelcome` | 为视图空状态提供欢迎内容 |
| `walkthroughs` | 添加交互式上手引导流程 |
| `submenus` | 将多个命令归入子菜单 |
| `debuggers` | 接入新的调试适配器 |
| `breakpoints` | 为语言启用断点支持 |
| `taskDefinitions` | 定义自定义任务类型 |
| `problemMatchers` | 定义终端输出的错误解析规则 |
| `problemPatterns` | 辅助 problemMatchers 的正则模式 |
| `terminal` | 注册终端 Profile / 快捷操作 |
| `notebooks` | 定义新的 Notebook 类型 |
| `customEditors` | 注册特定文件类型的自定义编辑器 |
| `jsonValidation` | 为 JSON 文件关联 JSON Schema |
| `authentication` | 提供第三方身份验证 Provider |
| `semanticTokenTypes` | 声明自定义语义着色 Token 类型 |
| `semanticTokenModifiers` | 声明自定义语义着色 Token 修饰符 |
| `semanticTokenScopes` | 将语义 Token 映射到 TextMate Scope |
| `typescriptServerPlugins` | 扩展 TypeScript 语言服务 |
| `resourceLabelFormatters` | 自定义资源路径的显示标签 |

### When Clause 常用上下文变量（`when`）

`when` 字段用于控制命令、菜单、快捷键在何种上下文下生效：

| 变量 | 含义 |
|------|------|
| `editorIsOpen` | 有文件打开 |
| `editorTextFocus` | 编辑器文本聚焦 |
| `editorLangId == 'xxx'` | 当前语言为 xxx |
| `resourceExtname == '.csm'` | 文件扩展名匹配 |
| `view == 'myExt.treeView'` | 指定视图处于焦点 |
| `isLinux` / `isMac` / `isWindows` | 操作系统 |

完整列表：[When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

---

> 本文后续章节聚焦于**为新脚本语言（如 CSMScript）提供 VSCode 支持**所需的贡献点，以功能目标为主线进行组织。

---

## 语言支持专题

为一门新语言提供 VSCode 支持，核心要做的事情可以归纳为以下五个层次：

```
【必做】语言注册 → 语法高亮 → 代码片段
【推荐】语义高亮 → 语言命令 / 菜单 / 快捷键 → 插件设置
【可选】构建 & 运行集成 → 调试支持 → 文件图标主题
```

---

## 一、语言基础（必做）

### 1.1 `languages` — 注册语言

告知 VSCode 这是一门新语言：文件扩展名、别名、注释规则、括号匹配等。**所有其他语言相关贡献点都依赖先注册语言 ID。**

```json
"contributes": {
  "languages": [
    {
      "id": "csmscript",
      "aliases": ["CSMScript", "csm"],
      "extensions": [".csm"],
      "firstLine": "^#!.*\\bcsmscript\\b",
      "configuration": "./language-configuration.json"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `id` | 语言唯一标识，贯穿所有贡献点 |
| `aliases` | 命令面板和状态栏显示的名称列表 |
| `extensions` | 触发语言的文件扩展名 |
| `firstLine` | 通过首行正则识别语言（如 shebang） |
| `configuration` | 指向 `language-configuration.json` 文件 |

**`language-configuration.json` 关键字段：**

```jsonc
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [["(", ")"], ["{", "}"], ["[", "]"]],
  "autoClosingPairs": [
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"", "notIn": ["string"] }
  ],
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)",
  "indentationRules": {
    "increaseIndentPattern": "\\{\\s*$",
    "decreaseIndentPattern": "^\\s*\\}"
  }
}
```

---

### 1.2 `grammars` — TextMate 语法高亮

将 `.tmLanguage.json` 文件与语言绑定，实现关键字、字符串、注释等的颜色区分。是**零代码实现语法着色**的核心方式。

```json
"contributes": {
  "grammars": [
    {
      "language": "csmscript",
      "scopeName": "source.csmscript",
      "path": "./syntaxes/csmscript.tmLanguage.json"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `language` | 对应 `languages` 中注册的 `id` |
| `scopeName` | TextMate scope 根名，惯例为 `source.<langId>` |
| `path` | `.tmLanguage.json` 文件路径 |

> **提示：** 也可以不指定 `language`，单独注册 grammar（用于注入到其他语言，如在字符串中嵌入 CSMScript 语法）。

`.tmLanguage.json` 的结构（简化示例）：

```json
{
  "name": "CSMScript",
  "scopeName": "source.csmscript",
  "patterns": [
    { "include": "#keywords" },
    { "include": "#strings" },
    { "include": "#comments" }
  ],
  "repository": {
    "keywords": {
      "match": "\\b(if|else|while|return|function)\\b",
      "name": "keyword.control.csmscript"
    },
    "strings": {
      "begin": "\"",
      "end": "\"",
      "name": "string.quoted.double.csmscript"
    },
    "comments": {
      "match": "//.*$",
      "name": "comment.line.double-slash.csmscript"
    }
  }
}
```

常用 TextMate scope 命名规范：

| Scope | 用途 |
|-------|------|
| `keyword.control` | 控制流关键字（if/else/while） |
| `keyword.operator` | 运算符 |
| `entity.name.function` | 函数名 |
| `entity.name.type` | 类型名 |
| `variable.other` | 普通变量 |
| `string.quoted.double` | 双引号字符串 |
| `comment.line` | 单行注释 |
| `constant.numeric` | 数字字面量 |
| `support.function` | 内置函数 |

---

### 1.3 `snippets` — 代码片段

为语言提供常用代码模板，用户输入前缀即可展开。

```json
"contributes": {
  "snippets": [
    {
      "language": "csmscript",
      "path": "./snippets/csmscript.code-snippets"
    }
  ]
}
```

`.code-snippets` 文件示例：

```json
{
  "If Statement": {
    "prefix": "if",
    "body": [
      "if (${1:condition}) {",
      "\t$0",
      "}"
    ],
    "description": "If statement"
  },
  "Function Definition": {
    "prefix": "fn",
    "body": [
      "function ${1:name}(${2:params}) {",
      "\t$0",
      "}"
    ],
    "description": "Define a function"
  }
}
```

片段语法说明：`$1`、`$2` 为 Tab 跳转位，`$0` 为最终光标位，`${1:placeholder}` 带默认值。

---

## 二、语义高亮（推荐）

TextMate Grammar 基于正则，无法理解语言语义。如果插件实现了 Language Server（LSP）或 `SemanticTokensProvider`，可通过以下贡献点声明自定义语义 Token，实现更精准的着色。

### 2.1 `semanticTokenTypes` — 自定义 Token 类型

```json
"contributes": {
  "semanticTokenTypes": [
    {
      "id": "stateVariable",
      "superType": "variable",
      "description": "CSMScript 状态变量"
    }
  ]
}
```

### 2.2 `semanticTokenModifiers` — 自定义 Token 修饰符

```json
"contributes": {
  "semanticTokenModifiers": [
    {
      "id": "exported",
      "description": "导出的符号"
    }
  ]
}
```

### 2.3 `semanticTokenScopes` — 映射到 TextMate Scope

将自定义语义 Token 映射到 TextMate scope，使其在不支持语义高亮的主题下也能降级着色。

```json
"contributes": {
  "semanticTokenScopes": [
    {
      "language": "csmscript",
      "scopes": {
        "stateVariable": ["variable.other.csmscript"],
        "stateVariable.exported": ["variable.other.exported.csmscript"]
      }
    }
  ]
}
```

---

## 三、语言命令与交互（推荐）

### 3.1 `commands` — 注册命令

为语言注册专属命令（如格式化、运行当前文件、重启语言服务等），在代码中通过 `vscode.commands.registerCommand` 实现。

```json
"contributes": {
  "commands": [
    {
      "command": "csmscript.runFile",
      "title": "Run CSMScript File",
      "icon": "$(play)",
      "category": "CSMScript"
    },
    {
      "command": "csmscript.restartLanguageServer",
      "title": "Restart Language Server",
      "category": "CSMScript"
    }
  ]
}
```

- `category`：命令面板中显示为 `CSMScript: Run CSMScript File`，便于归类和发现
- `icon`：用于菜单/标题栏按钮

### 3.2 `menus` — 将命令显示到 UI

控制命令在哪些菜单位置出现、何时显示（`when`）、如何分组（`group`）。

```json
"contributes": {
  "menus": {
    "editor/title": [
      {
        "command": "csmscript.runFile",
        "when": "editorLangId == 'csmscript'",
        "group": "navigation"
      }
    ],
    "editor/context": [
      {
        "command": "csmscript.runFile",
        "when": "editorLangId == 'csmscript'",
        "group": "1_run@1"
      }
    ],
    "commandPalette": [
      {
        "command": "csmscript.restartLanguageServer",
        "when": "editorLangId == 'csmscript'"
      }
    ]
  }
}
```

语言插件常用菜单位置：

| 菜单 ID | 位置 | 语言插件用途 |
|---------|------|------------|
| `editor/title` | 编辑器标题栏右侧按钮区 | 运行 / 格式化当前文件按钮 |
| `editor/context` | 编辑器右键菜单 | 运行选中代码、查看文档等 |
| `commandPalette` | 命令面板 | 控制命令是否显示在命令面板（`when` 过滤） |
| `explorer/context` | 资源管理器右键菜单 | 对 `.csm` 文件执行操作 |

**`when` 语言过滤常用写法：**

```
editorLangId == 'csmscript'           // 当前文件是 CSMScript
resourceExtname == '.csm'             // 文件扩展名为 .csm（用于 explorer）
```

### 3.3 `keybindings` — 键盘快捷键

为语言命令绑定快捷键，用 `when` 限定只在 CSMScript 文件中生效。

```json
"contributes": {
  "keybindings": [
    {
      "command": "csmscript.runFile",
      "key": "ctrl+f5",
      "mac": "cmd+f5",
      "when": "editorLangId == 'csmscript'"
    }
  ]
}
```

### 3.4 `configuration` — 插件设置

声明用户可在设置 UI / `settings.json` 中调整的选项；代码通过 `vscode.workspace.getConfiguration('csmscript')` 读取。

```json
"contributes": {
  "configuration": {
    "title": "CSMScript",
    "properties": {
      "csmscript.executablePath": {
        "type": "string",
        "default": "",
        "description": "CSMScript 解释器的路径（留空则使用 PATH）",
        "scope": "machine-overridable"
      },
      "csmscript.linting.enable": {
        "type": "boolean",
        "default": true,
        "description": "启用实时语法检查"
      },
      "csmscript.formatting.indentSize": {
        "type": "number",
        "default": 2,
        "minimum": 1,
        "description": "格式化缩进空格数"
      },
      "csmscript.languageServer.trace": {
        "type": "string",
        "enum": ["off", "messages", "verbose"],
        "default": "off",
        "description": "语言服务器通信日志级别"
      }
    }
  }
}
```

`scope` 可选值说明：

| scope | 说明 |
|-------|------|
| `application` | 仅全局生效，不可被工作区覆盖 |
| `machine` | 机器级别（不同步到云端） |
| `machine-overridable` | 机器级但允许工作区覆盖（推荐用于路径类配置） |
| `window` | 全局或工作区级别（默认） |
| `resource` | 可按文件 / 文件夹覆盖 |
| `language-overridable` | 可按语言覆盖（适合格式化、缩进等） |

### 3.5 `configurationDefaults` — 覆盖默认设置

为 CSMScript 语言覆盖 VSCode 内置编辑器设置（如 Tab 大小、格式化器等）。

```json
"contributes": {
  "configurationDefaults": {
    "[csmscript]": {
      "editor.tabSize": 2,
      "editor.insertSpaces": true,
      "editor.defaultFormatter": "your-publisher.csmscript-support",
      "editor.semanticHighlighting.enabled": true
    }
  }
}
```

---

## 四、构建与运行集成（可选）

### 4.1 `taskDefinitions` — 自定义任务类型

允许用户在 `.vscode/tasks.json` 中使用 CSMScript 专属任务类型，配合 `TaskProvider` 自动检测项目中的构建/运行任务。

```json
"contributes": {
  "taskDefinitions": [
    {
      "type": "csmscript",
      "required": ["script"],
      "properties": {
        "script": {
          "type": "string",
          "description": "要执行的 CSMScript 文件路径"
        },
        "args": {
          "type": "array",
          "description": "传递给脚本的参数"
        }
      }
    }
  ]
}
```

`tasks.json` 中的使用方式：

```json
{
  "type": "csmscript",
  "script": "build.csm",
  "args": ["--release"],
  "label": "CSMScript: Build"
}
```

### 4.2 `problemMatchers` — 错误输出解析

解析 CSMScript 编译器 / 运行时在终端输出的错误信息，自动在编辑器中标注诊断（Problems 面板）。

```json
"contributes": {
  "problemMatchers": [
    {
      "name": "csmscript",
      "owner": "csmscript",
      "fileLocation": ["relative", "${workspaceFolder}"],
      "pattern": {
        "regexp": "^(.+):(\\d+):(\\d+):\\s+(error|warning):\\s+(.+)$",
        "file": 1,
        "line": 2,
        "column": 3,
        "severity": 4,
        "message": 5
      }
    }
  ]
}
```

在 `tasks.json` 中引用：

```json
{
  "type": "csmscript",
  "script": "main.csm",
  "problemMatcher": "$csmscript"
}
```

### 4.3 `problemPatterns` — 多行错误模式

当编译错误跨越多行输出时，先在 `problemPatterns` 中定义模式，再在 `problemMatchers` 中引用。

```json
"contributes": {
  "problemPatterns": [
    {
      "name": "csmscript-multiline",
      "patterns": [
        {
          "regexp": "^(.+):(\\d+)$",
          "file": 1,
          "line": 2
        },
        {
          "regexp": "^\\s+(error|warning):\\s+(.+)$",
          "severity": 1,
          "message": 2
        }
      ]
    }
  ]
}
```

---

## 五、调试支持（可选）

### 5.1 `debuggers` — 调试适配器

通过实现 [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) 接入 VSCode 调试界面（断点、变量查看、单步执行等）。

```json
"contributes": {
  "debuggers": [
    {
      "type": "csmscript",
      "label": "CSMScript Debug",
      "program": "./out/debugAdapter.js",
      "runtime": "node",
      "languages": ["csmscript"],
      "configurationAttributes": {
        "launch": {
          "required": ["program"],
          "properties": {
            "program": {
              "type": "string",
              "description": "要调试的 CSMScript 文件",
              "default": "${file}"
            },
            "stopOnEntry": {
              "type": "boolean",
              "description": "启动时在第一行暂停",
              "default": false
            }
          }
        }
      },
      "initialConfigurations": [
        {
          "type": "csmscript",
          "request": "launch",
          "name": "调试当前文件",
          "program": "${file}"
        }
      ],
      "configurationSnippets": [
        {
          "label": "CSMScript: Launch",
          "description": "启动并调试 CSMScript 文件",
          "body": {
            "type": "csmscript",
            "request": "launch",
            "name": "${1:调试当前文件}",
            "program": "^\"\\${file}\""
          }
        }
      ]
    }
  ]
}
```

### 5.2 `breakpoints` — 启用断点

声明哪些语言支持断点，VSCode 才会在对应文件的行号旁显示断点圆圈。

```json
"contributes": {
  "breakpoints": [
    { "language": "csmscript" }
  ]
}
```

---

## 六、文件图标（可选）

### `iconThemes` — 文件图标主题

为 `.csm` 文件提供专属图标，改善资源管理器中的视觉辨识度。

```json
"contributes": {
  "iconThemes": [
    {
      "id": "csmscript-icons",
      "label": "CSMScript Icons",
      "path": "./fileicons/csmscript-icon-theme.json"
    }
  ]
}
```

`csmscript-icon-theme.json` 中按扩展名映射图标：

```json
{
  "iconDefinitions": {
    "_csm": { "iconPath": "./icons/csm.svg" }
  },
  "fileExtensions": {
    "csm": "_csm"
  }
}
```

---

## 贡献点与语言功能对应总结

| 想实现的功能 | 需要的贡献点 | 是否需要运行时代码 |
|-------------|------------|-----------------|
| 文件类型识别 / 括号匹配 / 注释 | `languages` | ❌ 纯声明 |
| 关键字 / 字符串 / 注释着色 | `grammars` | ❌ 纯声明 |
| 代码模板补全 | `snippets` | ❌ 纯声明 |
| 精准语义着色（变量类型区分） | `semanticTokenTypes/Modifiers/Scopes` + `SemanticTokensProvider` | ✅ 需要 |
| 语言专属命令（运行 / 格式化） | `commands` + `menus` + `keybindings` | ✅ 需要 |
| 用户可配置选项 | `configuration` + `configurationDefaults` | ❌ 纯声明 |
| 构建 / 运行任务集成 | `taskDefinitions` + `problemMatchers` | ✅ 可选（TaskProvider） |
| 编译器错误自动标注 | `problemMatchers` / `problemPatterns` | ❌ 纯声明（配合 task） |
| 断点 / 单步调试 | `debuggers` + `breakpoints` | ✅ 需要实现 DAP |
| `.csm` 文件专属图标 | `iconThemes` | ❌ 纯声明 |

---

## 语言插件最小可用 `package.json` 模板

以下是为 CSMScript 提供基础语言支持的 `package.json` 骨架：

```jsonc
{
  "name": "csmscript-support",
  "displayName": "CSMScript Support",
  "description": "VSCode support for CSMScript language",
  "version": "0.1.0",
  "publisher": "nevstop-lab",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Programming Languages"],
  "contributes": {
    // ① 语言注册（必做）
    "languages": [{
      "id": "csmscript",
      "aliases": ["CSMScript"],
      "extensions": [".csm"],
      "configuration": "./language-configuration.json"
    }],
    // ② 语法高亮（必做）
    "grammars": [{
      "language": "csmscript",
      "scopeName": "source.csmscript",
      "path": "./syntaxes/csmscript.tmLanguage.json"
    }],
    // ③ 代码片段（推荐）
    "snippets": [{
      "language": "csmscript",
      "path": "./snippets/csmscript.code-snippets"
    }],
    // ④ 覆盖默认编辑器设置（推荐）
    "configurationDefaults": {
      "[csmscript]": {
        "editor.tabSize": 2,
        "editor.insertSpaces": true
      }
    }
  }
}
```

---

## 参考链接

| 文档 | 链接 |
|------|------|
| Contribution Points 官方参考 | [https://code.visualstudio.com/api/references/contribution-points](https://code.visualstudio.com/api/references/contribution-points) |
| 语法高亮指南 | [https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide) |
| 语言配置指南 | [https://code.visualstudio.com/api/language-extensions/language-configuration-guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide) |
| 代码片段指南 | [https://code.visualstudio.com/api/language-extensions/snippet-guide](https://code.visualstudio.com/api/language-extensions/snippet-guide) |
| 语义高亮指南 | [https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide) |
| 编程式语言特性（IntelliSense 等） | [https://code.visualstudio.com/api/language-extensions/programmatic-language-features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features) |
| 调试适配器协议 | [https://microsoft.github.io/debug-adapter-protocol/](https://microsoft.github.io/debug-adapter-protocol/) |
| When Clause Contexts | [https://code.visualstudio.com/api/references/when-clause-contexts](https://code.visualstudio.com/api/references/when-clause-contexts) |

---

*整理日期：2026-03-06*
