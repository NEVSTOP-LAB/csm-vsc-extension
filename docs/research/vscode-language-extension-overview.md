# VSCode 语言扩展能力详解（Language Extension Features）

> **适用场景：** 为一门新的脚本语言（如 CSMScript）开发 VSCode 支持插件  
> **参考来源：**
> - [Language Extensions Overview](https://code.visualstudio.com/api/language-extensions/overview)  
> - [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)  
> - [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 目录

0. [VSCode 插件能力概览（摘要）](#0-vscode-插件能力概览摘要)
1. [语言扩展的两条路径](#1-语言扩展的两条路径)
2. [语言定义与注册](#2-语言定义与注册)
3. [语言配置（Language Configuration）](#3-语言配置language-configuration)
4. [语法高亮（TextMate Grammar）](#4-语法高亮textmate-grammar)
5. [语义着色（Semantic Tokens）](#5-语义着色semantic-tokens)
6. [代码片段（Snippets）](#6-代码片段snippets)
7. [编程式语言功能——所有 Provider 详解](#7-编程式语言功能所有-provider-详解)
8. [语言服务器协议（LSP）](#8-语言服务器协议lsp)
9. [嵌入式语言（Embedded Languages）](#9-嵌入式语言embedded-languages)
10. [对 CSMScript 的实施建议](#10-对-csmscript-的实施建议)

---

## 0. VSCode 插件能力概览（摘要）

> 💡 本节是 [`vscode-extension-capabilities-overview.md`](./vscode-extension-capabilities-overview.md) 的精简摘要，完整内容请查阅原文档。

VSCode 的插件系统（Extension API）按能力领域划分为六大类别：

| 类别 | 核心能力 | 对 CSMScript 的价值 |
|------|---------|---------------------|
| **通用能力** | 命令、配置、快捷键、上下文菜单、通知、状态栏、进度条、数据存储、编辑器装饰 | ⭐⭐⭐ 可选辅助功能 |
| **主题定制** | 颜色主题、文件图标主题、产品图标主题 | ⭐ 可选 |
| **声明式语言功能** | 语法高亮（TextMate Grammar）、代码片段、语言配置 | ⭐⭐⭐⭐⭐ **必做** |
| **编程式语言功能** | 代码补全、悬停提示、诊断、跳转定义、格式化、重构等各类 Provider | ⭐⭐⭐⭐ 推荐渐进实现 |
| **工作台扩展** | 树视图、Webview、自定义编辑器、虚拟文档、任务、测试集成 | ⭐⭐ 后期可选 |
| **调试支持** | 调试适配器协议（DAP）、断点、调试会话 API | ⭐ 暂不需要 |

> 💡 VSCode 官方建议：**能用声明式实现的功能，尽量不要用编程式**。声明式方式（如 TextMate Grammar、`.code-snippets`）更轻量、更稳定。

### 0.1 通用能力快速参考

| 能力 | API / 配置点 | 说明 |
|------|------------|------|
| 命令 | `commands.registerCommand` + `contributes.commands` | 在命令面板中暴露自定义命令 |
| 配置 | `contributes.configuration` + `workspace.getConfiguration()` | 插件配置项，用户可在 Settings 中修改 |
| 快捷键 | `contributes.keybindings` | 绑定快捷键到命令，支持 `when` 条件 |
| 上下文菜单 | `contributes.menus` | 右键菜单、编辑器标题栏菜单等 |
| 通知 | `window.showInformationMessage` / `showWarningMessage` / `showErrorMessage` | 三种级别的通知，支持按钮和模态对话框 |
| 状态栏 | `window.createStatusBarItem` | 底部状态栏显示语言相关信息（如当前状态名） |
| 编辑器装饰 | `window.createTextEditorDecorationType` | 高亮代码行/文字，添加行内图标 |
| 输出通道 | `window.createOutputChannel` | 插件专属输出面板，用于记录日志 |

### 0.2 主题定制快速参考

| 主题类型 | 说明 |
|---------|------|
| 颜色主题 | 自定义编辑器及 UI 颜色方案（`.json` 声明，无需代码） |
| 文件图标主题 | 自定义文件资源管理器中 `.csm` 文件的图标 |
| 产品图标主题 | 自定义 VSCode UI 内置图标 |

### 0.3 工作台扩展快速参考

| 扩展类型 | 接口 / 配置点 | CSMScript 潜在用途 |
|---------|-------------|------------------|
| 树视图 | `TreeDataProvider` + `contributes.views` | 状态机结构可视化 |
| Webview | `window.createWebviewPanel` | 状态图可视化面板 |
| 自定义编辑器 | `CustomTextEditorProvider` | 可视化状态机编辑器（高级） |
| 虚拟文档 | `TextDocumentContentProvider` | 展示生成的状态机代码或 AST |
| 任务 | `TaskProvider` + `contributes.taskDefinitions` | CSMScript 编译/运行任务 |

### 0.4 能力优先级汇总表

| 能力 | 实现方式 | 复杂度 | 对 CSMScript 的价值 |
|------|---------|--------|---------------------|
| 语法高亮 | TextMate Grammar（声明式） | ⭐⭐ | ⭐⭐⭐⭐⭐ 必做 |
| 语言配置 | `.json` 配置文件（声明式） | ⭐ | ⭐⭐⭐⭐⭐ 必做 |
| 代码片段 | `.code-snippets`（声明式） | ⭐ | ⭐⭐⭐⭐ 推荐 |
| 代码补全 | `CompletionItemProvider` | ⭐⭐⭐ | ⭐⭐⭐⭐ 推荐 |
| 悬停提示 | `HoverProvider` | ⭐⭐ | ⭐⭐⭐⭐ 推荐 |
| 代码诊断 | `DiagnosticCollection` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 代码格式化 | `DocumentFormattingEditProvider` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 跳转定义 | `DefinitionProvider` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 自定义命令 | `commands.registerCommand` | ⭐⭐ | ⭐⭐⭐ 可选 |
| 语言服务器（LSP） | `vscode-languageserver` | ⭐⭐⭐⭐⭐ | ⭐⭐ 后期可选 |
| 树视图 | `TreeDataProvider` | ⭐⭐⭐ | ⭐⭐ 可选 |
| Webview | HTML/CSS/JS | ⭐⭐⭐⭐ | ⭐ 暂不需要 |
| 调试支持 | DAP | ⭐⭐⭐⭐⭐ | ⭐ 暂不需要 |
| 颜色主题 | `.json` 声明（声明式） | ⭐ | ⭐ 可选 |

### 0.5 分阶段实施路径（概述）

| 阶段 | 目标 | 主要功能 | 是否需要 TypeScript |
|------|------|---------|:-----------------:|
| **第一阶段** | 最小可用版本 | 语言定义、语法高亮、语言配置、代码片段 | ❌ 无需 |
| **第二阶段** | IntelliSense | 代码补全、悬停提示、代码诊断 | ✅ |
| **第三阶段** | 深度集成 | 跳转定义/引用、重命名、格式化 | ✅ |
| **第四阶段** | LSP 架构 | 语言服务器独立进程 | ✅ |

> 详细内容请继续阅读本文档后续各节。

---

## 1. 语言扩展的两条路径

VSCode 语言支持插件分为两大类：

| 路径 | 实现方式 | 适合场景 |
|------|---------|---------|
| **声明式（Declarative）** | 仅 `package.json` + 配置/语法文件，**无需激活代码** | 语法高亮、代码片段、括号配对等静态功能 |
| **编程式（Programmatic）** | TypeScript 代码 + `vscode.languages.*` API | IntelliSense、诊断、格式化、跳转定义等动态功能 |

> 💡 **最佳实践**：能用声明式实现的功能，优先用声明式——更轻量、更稳定、启动更快。  
> 编程式功能可以渐进式叠加，无需一次性全部实现。

---

## 2. 语言定义与注册

### 2.1 在 `package.json` 中注册语言

```jsonc
{
  "contributes": {
    "languages": [
      {
        "id": "csmscript",                   // 语言唯一 ID（全局命名空间，建议带品牌前缀）
        "aliases": ["CSMScript", "csm"],     // 显示名称，用于语言选择器
        "extensions": [".csm", ".csmscript"], // 文件扩展名（含点号）
        "filenames": [],                      // 精确文件名匹配（可选）
        "filenamePatterns": [],               // glob 模式匹配（可选）
        "mimetypes": ["text/x-csmscript"],   // MIME 类型（可选）
        "firstLine": "^#!.*csmscript",       // 首行正则匹配（可选，用于 shebang）
        "configuration": "./language-configuration.json",  // 语言配置文件路径
        "icon": {                            // 文件图标（可选）
          "light": "./icons/csmscript-light.svg",
          "dark": "./icons/csmscript-dark.svg"
        }
      }
    ]
  }
}
```

**关键点：**
- `id` 是全局唯一标识符，之后注册语法、配置、Provider 都需要引用它
- `extensions` 数组决定哪些文件自动被识别为该语言
- `configuration` 指向语言配置 JSON 文件（见下节）

---

## 3. 语言配置（Language Configuration）

语言配置文件（`language-configuration.json`）控制编辑器的**基础编辑行为**，无需任何代码。

### 3.1 完整配置项说明

```jsonc
{
  // ① 注释符号
  "comments": {
    "lineComment": "//",          // 行注释（Ctrl+/ 使用）
    "blockComment": ["/*", "*/"]  // 块注释（Shift+Alt+A 使用）
  },

  // ② 括号配对（影响：括号高亮、自动缩进、`editor.matchBrackets`）
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],

  // ③ 自动补全括号/引号（输入左括号时自动插入右括号）
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "'", "close": "'", "notIn": ["string", "comment"] },
    { "open": "\"", "close": "\"", "notIn": ["string"] },
    { "open": "`", "close": "`", "notIn": ["string"] }
  ],

  // ④ 选中后输入括号自动包裹（选中文本后按 { 自动变成 {文本}）
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["'", "'"],
    ["\"", "\""],
    ["`", "`"]
  ],

  // ⑤ 自动删除配对括号（删除左括号时同时删除右括号）
  "autoCloseBefore": ";:.,=}])>` \n\t",

  // ⑥ 代码折叠标记（基于正则，适合不依赖缩进的折叠）
  "folding": {
    "markers": {
      "start": "^\\s*//\\s*#region\\b",
      "end": "^\\s*//\\s*#endregion\\b"
    },
    // offSide: true 表示基于缩进折叠（适合 Python 类语言）
    "offSide": false
  },

  // ⑦ "单词"的正则定义（影响双击选词、Ctrl+D 扩展选择、单词导航）
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)",

  // ⑧ 自动缩进规则
  "indentationRules": {
    "increaseIndentPattern": "^\\s*[\\{\\[]\\s*$",   // 当前行匹配时，下一行增加缩进
    "decreaseIndentPattern": "^\\s*[\\}\\]]\\s*$"    // 当前行匹配时，当前行减少缩进
  },

  // ⑨ 基于 Enter 键的缩进规则（更精细的控制）
  "onEnterRules": [
    {
      // 在块注释行内按 Enter，自动插入 " * "
      "beforeText": "^\\s*/\\*\\*(?!/)([^\\*]|\\*(?!/))*$",
      "action": {
        "indent": "indent",
        "appendText": " * "
      }
    },
    {
      // 在 */ 之前按 Enter，自动插入 " * /" 并减少缩进
      "beforeText": "^\\s* \\*[^/]*$",
      "action": {
        "indent": "outdent",
        "appendText": " * "
      }
    }
  ]
}
```

### 3.2 各配置项效果总结

| 配置项 | 用户可见效果 |
|--------|------------|
| `comments` | `Ctrl+/` 切换注释、`Shift+Alt+A` 块注释 |
| `brackets` | 括号高亮、匹配括号跳转 |
| `autoClosingPairs` | 输入 `{` 自动插入 `}` |
| `surroundingPairs` | 选中文本后按引号自动包裹 |
| `folding.markers` | 代码折叠箭头，支持 `#region` 风格 |
| `wordPattern` | 双击选词边界、`Ctrl+D` 多选 |
| `indentationRules` | `Enter` 后自动缩进级别 |
| `onEnterRules` | 特定上下文的 `Enter` 行为（如注释块） |

**参考：** [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide)

---

## 4. 语法高亮（TextMate Grammar）

### 4.1 基本原理

VSCode 使用 **TextMate Grammar**（`.tmLanguage.json` 或 `.plist`）进行词法着色：

1. 语法文件定义正则规则，将源码划分为各种**作用域（scope）**
2. 颜色主题根据 scope 名称决定着色方案
3. 用户更换颜色主题时，语法高亮颜色自动变化

```
源码文本  →  TextMate Grammar 解析  →  scope 标记  →  颜色主题着色  →  编辑器显示
```

### 4.2 在 `package.json` 中注册

```jsonc
{
  "contributes": {
    "grammars": [
      {
        "language": "csmscript",             // 对应 contributes.languages[].id
        "scopeName": "source.csmscript",     // 根作用域名（全局唯一）
        "path": "./syntaxes/csmscript.tmLanguage.json",
        "embeddedLanguages": {               // 如果语法中嵌入其他语言（可选）
          "meta.embedded.block.javascript": "javascript"
        },
        "tokenTypes": {                      // 覆盖 token 类型（可选）
          "meta.template.expression": "other"
        }
      }
    ]
  }
}
```

### 4.3 语法文件结构（`.tmLanguage.json`）

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "CSMScript",
  "scopeName": "source.csmscript",    // 根 scope，与 package.json 一致

  // 顶层规则：按顺序匹配，先匹配到的规则优先
  "patterns": [
    { "include": "#comments" },
    { "include": "#keywords" },
    { "include": "#strings" },
    { "include": "#numbers" },
    { "include": "#operators" },
    { "include": "#state-names" }
  ],

  // 规则库（repository），在 patterns 中通过 include 引用
  "repository": {

    // ── 注释 ──────────────────────────────────────────────────
    "comments": {
      "patterns": [
        {
          // 块注释：begin/end 模式，匹配多行
          "name": "comment.block.csmscript",
          "begin": "/\\*",
          "end": "\\*/",
          "beginCaptures": {
            "0": { "name": "punctuation.definition.comment.begin.csmscript" }
          },
          "endCaptures": {
            "0": { "name": "punctuation.definition.comment.end.csmscript" }
          }
        },
        {
          // 行注释：match 模式，匹配单行
          "name": "comment.line.double-slash.csmscript",
          "match": "//.*$"
        }
      ]
    },

    // ── 关键字 ────────────────────────────────────────────────
    "keywords": {
      "patterns": [
        {
          // 控制流关键字
          "name": "keyword.control.csmscript",
          "match": "\\b(if|else|while|for|return|break|continue)\\b"
        },
        {
          // 声明关键字
          "name": "keyword.declaration.csmscript",
          "match": "\\b(state|action|trigger|param|var|const)\\b"
        },
        {
          // 内置值
          "name": "constant.language.csmscript",
          "match": "\\b(true|false|null|undefined)\\b"
        }
      ]
    },

    // ── 字符串 ────────────────────────────────────────────────
    "strings": {
      "patterns": [
        {
          // 双引号字符串
          "name": "string.quoted.double.csmscript",
          "begin": "\"",
          "end": "\"",
          "beginCaptures": {
            "0": { "name": "punctuation.definition.string.begin.csmscript" }
          },
          "endCaptures": {
            "0": { "name": "punctuation.definition.string.end.csmscript" }
          },
          "patterns": [
            {
              // 转义序列
              "name": "constant.character.escape.csmscript",
              "match": "\\\\[\\\\\"nrtbf]"
            }
          ]
        }
      ]
    },

    // ── 数字 ──────────────────────────────────────────────────
    "numbers": {
      "patterns": [
        {
          "name": "constant.numeric.csmscript",
          "match": "\\b-?(?:0x[0-9A-Fa-f]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b"
        }
      ]
    },

    // ── 运算符 ────────────────────────────────────────────────
    "operators": {
      "name": "keyword.operator.csmscript",
      "match": "[+\\-*/=<>!&|^~%]+"
    },

    // ── 状态名（CSMScript 特有）──────────────────────────────
    "state-names": {
      "patterns": [
        {
          // 状态定义：state MyState { ... }
          "match": "\\b(state)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b",
          "captures": {
            "1": { "name": "keyword.declaration.state.csmscript" },
            "2": { "name": "entity.name.type.state.csmscript" }
          }
        }
      ]
    }
  }
}
```

### 4.4 常用 Scope 命名规范（TextMate 标准）

| Scope 类别 | 典型名称 | 用途 |
|-----------|---------|------|
| `comment.line.*` | `comment.line.double-slash` | 行注释 |
| `comment.block.*` | `comment.block` | 块注释 |
| `keyword.control` | `keyword.control` | if/else/for/while |
| `keyword.declaration` | `keyword.declaration` | var/const/function/state |
| `keyword.operator` | `keyword.operator` | +, -, *, = 等 |
| `string.quoted.*` | `string.quoted.double` | 字符串字面量 |
| `constant.numeric` | `constant.numeric` | 数字字面量 |
| `constant.language` | `constant.language` | true/false/null |
| `constant.character.escape` | `constant.character.escape` | \\n, \\t 等转义 |
| `entity.name.type` | `entity.name.type.class` | 类/类型名称 |
| `entity.name.function` | `entity.name.function` | 函数名 |
| `variable.other` | `variable.other` | 普通变量 |
| `variable.parameter` | `variable.parameter` | 函数参数 |
| `support.function` | `support.function` | 内置函数 |
| `meta.*` | `meta.function-call` | 结构划分（不直接着色） |
| `punctuation.*` | `punctuation.definition.string.begin` | 标点符号 |
| `invalid` | `invalid.illegal` | 非法语法（红色高亮） |

> 💡 **调试工具**：在 VSCode 中按 `Ctrl+Shift+P` → `Developer: Inspect Editor Tokens and Scopes`，可查看光标处的 scope 名称，便于调试语法规则。

### 4.5 begin/end 模式 vs match 模式

| 模式 | 语法 | 适用场景 |
|------|------|---------|
| `match` | `"match": "正则"` | 单行、简单 token（关键字、数字等） |
| `begin/end` | `"begin": "正则", "end": "正则"` | 跨行结构（字符串、块注释、函数体等） |
| `while` | `"begin": "正则", "while": "正则"` | 每行都需匹配的模式（Python 的块）|

**参考：** [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

---

## 5. 语义着色（Semantic Tokens）

### 5.1 与 TextMate Grammar 的区别

| 维度 | TextMate Grammar | 语义着色 |
|------|-----------------|---------|
| 原理 | 纯正则，逐行词法分析 | 需要理解整个文件/项目结构 |
| 速度 | 快（启动即可用） | 稍慢（需等待解析完成） |
| 精度 | 有限（无跨行上下文） | 高（知道变量是参数/字段/局部变量） |
| 实现 | 声明式（JSON 文件） | 编程式（TypeScript） |
| 推荐场景 | 基础高亮（必做） | 精确区分变量类型（可选，增强体验） |

### 5.2 实现语义着色

```typescript
// extension.ts
import * as vscode from 'vscode';

// 定义语义 token 类型和修饰符
const tokenTypes = ['class', 'function', 'variable', 'parameter', 'state', 'action'];
const tokenModifiers = ['declaration', 'readonly', 'static', 'deprecated'];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'csmscript' },
      new CSMScriptSemanticTokensProvider(),
      legend
    )
  );
}

class CSMScriptSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider {

  provideDocumentSemanticTokens(
    document: vscode.TextDocument
  ): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(legend);

    // 遍历文档，为每个 token 添加语义标注
    // builder.push(line, char, length, tokenTypeIndex, tokenModifierBitset)
    // 示例：第 2 行，第 10 列，长度 8 的 token，类型 'state'，修饰符 'declaration'
    builder.push(2, 10, 8, tokenTypes.indexOf('state'), 0b01);

    return builder.build();
  }
}
```

**参考：** [Semantic Highlight Guide](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)

---

## 6. 代码片段（Snippets）

### 6.1 注册

```jsonc
// package.json
{
  "contributes": {
    "snippets": [
      {
        "language": "csmscript",
        "path": "./snippets/csmscript.code-snippets"
      }
    ]
  }
}
```

### 6.2 片段文件格式

```jsonc
// snippets/csmscript.code-snippets
{
  // 片段名称（内部标识）
  "State Definition": {
    "prefix": "state",              // 触发前缀
    "description": "定义一个状态",  // 描述（显示在 IntelliSense 中）
    "body": [                       // 片段主体（数组中每个元素是一行）
      "state ${1:StateName} {",
      "\ton_entry: ${2:// entry actions}",
      "\ton_exit: ${3:// exit actions}",
      "\t$0",                       // $0：最终光标位置
      "}"
    ]
  },

  "State Transition": {
    "prefix": "transition",
    "description": "状态转换",
    "body": [
      "transition ${1:TargetState} when ${2:event} [${3:condition}];"
    ]
  },

  "Action Block": {
    "prefix": "action",
    "description": "动作块",
    "body": [
      "action ${1:actionName}(${2:params}) {",
      "\t$0",
      "}"
    ]
  },

  "File Header": {
    "prefix": "header",
    "description": "文件头注释",
    "body": [
      "/**",
      " * @file ${TM_FILENAME}",              // 内置变量：当前文件名
      " * @description ${1:description}",
      " * @date ${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}",
      " */"
    ]
  }
}
```

### 6.3 片段变量

| 变量 | 含义 |
|------|------|
| `$1`, `$2`, ... | Tab 停靠点（按 Tab 键依次跳转） |
| `$0` | 最终光标位置 |
| `${1:默认值}` | 带默认值的 Tab 停靠点 |
| `${1\|选项1,选项2\|}` | 下拉选择列表 |
| `$TM_FILENAME` | 当前文件名（含扩展名） |
| `$TM_FILENAME_BASE` | 当前文件名（不含扩展名） |
| `$TM_DIRECTORY` | 当前文件目录 |
| `$CURRENT_YEAR` / `$CURRENT_MONTH` / `$CURRENT_DATE` | 当前日期 |
| `$CLIPBOARD` | 剪贴板内容 |
| `$SELECTION` | 当前选中文本（用于 surround snippet） |

**参考：** [Snippet Guide](https://code.visualstudio.com/api/language-extensions/snippet-guide)

---

## 7. 编程式语言功能——所有 Provider 详解

所有编程式功能都通过 `vscode.languages.register*Provider` 注册，并在 `activate` 函数中调用：

```typescript
// 通用注册模式
context.subscriptions.push(
  vscode.languages.registerXxxProvider(
    { language: 'csmscript' },  // 语言选择器
    new MyXxxProvider()
  )
);
```

---

### 7.1 悬停提示（HoverProvider）

**效果：** 鼠标悬停在 token 上时弹出文档/类型信息。

```typescript
class CSMScriptHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const wordRange = document.getWordRangeAtPosition(position);
    const word = document.getText(wordRange);

    // 查找关键字文档
    const doc = getDocumentationForKeyword(word);
    if (doc) {
      return new vscode.Hover(
        new vscode.MarkdownString(doc),  // 支持 Markdown（代码块、链接等）
        wordRange
      );
    }
    return null;  // 返回 null 表示此位置无悬停内容
  }
}
```

**注册：**
```typescript
vscode.languages.registerHoverProvider({ language: 'csmscript' }, new CSMScriptHoverProvider());
```

---

### 7.2 代码补全（CompletionItemProvider）

**效果：** 输入时触发 IntelliSense 自动补全列表。

```typescript
class CSMScriptCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext  // context.triggerCharacter 触发字符
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

    const items: vscode.CompletionItem[] = [];

    // 关键字补全
    for (const kw of ['state', 'action', 'transition', 'trigger']) {
      const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
      item.detail = 'CSMScript keyword';
      item.documentation = new vscode.MarkdownString(`CSMScript 关键字 \`${kw}\``);
      items.push(item);
    }

    // 函数/API 补全（带插入代码片段）
    const funcItem = new vscode.CompletionItem('sendMessage', vscode.CompletionItemKind.Function);
    funcItem.insertText = new vscode.SnippetString('sendMessage(${1:target}, ${2:message})');
    funcItem.documentation = new vscode.MarkdownString('向指定状态机发送消息');
    items.push(funcItem);

    return items;
  }

  // （可选）选中补全项后获取更多详情（如 documentation 较耗时时延迟加载）
  resolveCompletionItem(
    item: vscode.CompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    // 在这里延迟填充 item.documentation、item.detail 等
    return item;
  }
}
```

**注册（可指定触发字符）：**
```typescript
vscode.languages.registerCompletionItemProvider(
  { language: 'csmscript' },
  new CSMScriptCompletionProvider(),
  '.', ':'  // triggerCharacters：输入这些字符时自动触发
);
```

**CompletionItemKind 枚举（图标种类）：**

| Kind | 图标 | 典型用途 |
|------|------|---------|
| `Text` | abc | 普通文本 |
| `Method` | 方块+箭头 | 方法 |
| `Function` | f() | 函数 |
| `Constructor` | new | 构造函数 |
| `Field` | 字段 | 结构体字段 |
| `Variable` | x | 变量 |
| `Class` | C | 类 |
| `Interface` | I | 接口 |
| `Module` | 方块 | 模块 |
| `Property` | p | 属性 |
| `Unit` | u | 单位 |
| `Value` | v | 值 |
| `Enum` | E | 枚举 |
| `Keyword` | K | 关键字 |
| `Snippet` | ... | 代码片段 |
| `Color` | 色块 | 颜色 |
| `File` | 文件 | 文件路径 |
| `Reference` | & | 引用 |
| `Folder` | 文件夹 | 目录 |
| `EnumMember` | e | 枚举成员 |
| `Constant` | π | 常量 |
| `Struct` | S | 结构体 |
| `Event` | ⚡ | 事件 |
| `Operator` | ± | 运算符 |
| `TypeParameter` | T | 类型参数 |

---

### 7.3 签名帮助（SignatureHelpProvider）

**效果：** 输入函数调用的 `(` 或 `,` 时，在光标上方显示参数列表提示。

```typescript
class CSMScriptSignatureHelpProvider implements vscode.SignatureHelpProvider {
  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    const help = new vscode.SignatureHelp();

    const sig = new vscode.SignatureInformation(
      'sendMessage(target: string, message: string): void',
      new vscode.MarkdownString('向目标状态机发送消息')
    );
    sig.parameters = [
      new vscode.ParameterInformation('target: string', '目标状态机名称'),
      new vscode.ParameterInformation('message: string', '消息内容'),
    ];

    help.signatures = [sig];
    help.activeSignature = 0;
    help.activeParameter = 0;  // 高亮当前正在输入的参数

    return help;
  }
}
```

**注册：**
```typescript
vscode.languages.registerSignatureHelpProvider(
  { language: 'csmscript' },
  new CSMScriptSignatureHelpProvider(),
  '(',   // 触发字符（开始调用）
  ','    // 重触发字符（切换参数）
);
```

---

### 7.4 跳转定义（DefinitionProvider）

**效果：** `F12` 或 `Ctrl+点击` 跳转到符号定义处。

```typescript
class CSMScriptDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    const word = document.getText(document.getWordRangeAtPosition(position));

    // 在工作区中查找该符号的定义位置
    const location = findDefinitionInWorkspace(word);
    if (location) {
      return new vscode.Location(
        vscode.Uri.file(location.filePath),
        new vscode.Position(location.line, location.character)
      );
    }
    return null;
  }
}
```

> 相关 Provider：`ImplementationProvider`（跳转实现）、`TypeDefinitionProvider`（跳转类型定义）、`DeclarationProvider`（跳转声明）

---

### 7.5 查找引用（ReferenceProvider）

**效果：** `Shift+F12` 查找符号的所有使用位置。

```typescript
class CSMScriptReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,  // context.includeDeclaration 是否包含定义
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    const word = document.getText(document.getWordRangeAtPosition(position));
    return findAllReferences(word);  // 返回 Location[] 数组
  }
}
```

---

### 7.6 文档符号（DocumentSymbolProvider）

**效果：** 填充大纲视图（Outline）和 `Ctrl+Shift+O` 符号列表。

```typescript
class CSMScriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const symbols: vscode.DocumentSymbol[] = [];

    // 扫描文档，找到所有 state 定义
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const match = line.text.match(/\bstate\s+(\w+)\s*\{/);
      if (match) {
        const sym = new vscode.DocumentSymbol(
          match[1],                      // 符号名
          'CSMScript State',             // 详情
          vscode.SymbolKind.Class,       // 图标类型
          line.range,                    // 完整范围
          line.range                     // 选择范围（用于大纲选中）
        );
        symbols.push(sym);
      }
    }

    return symbols;
  }
}
```

---

### 7.7 代码诊断（DiagnosticCollection）

**效果：** 在编辑器中显示错误/警告下划线，Problems 面板中列出问题。

```typescript
// 创建诊断集合（通常在 activate 中创建一次，整个生命周期复用）
const diagnosticCollection = vscode.languages.createDiagnosticCollection('csmscript');
context.subscriptions.push(diagnosticCollection);

// 在文档变化时更新诊断
function updateDiagnostics(document: vscode.TextDocument): void {
  if (document.languageId !== 'csmscript') return;

  const diagnostics: vscode.Diagnostic[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);

    // 示例：检测未闭合的字符串
    if ((line.text.match(/"/g) || []).length % 2 !== 0) {
      const range = new vscode.Range(i, 0, i, line.text.length);
      const diagnostic = new vscode.Diagnostic(
        range,
        '未闭合的字符串字面量',
        vscode.DiagnosticSeverity.Error   // Error / Warning / Information / Hint
      );
      diagnostic.code = 'CSM001';         // 错误代码（可选）
      diagnostic.source = 'csmscript';    // 来源标识（显示在问题面板）
      diagnostics.push(diagnostic);
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

// 监听文档变化
context.subscriptions.push(
  vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document)),
  vscode.workspace.onDidOpenTextDocument(updateDiagnostics)
);
```

**DiagnosticSeverity 级别：**

| 级别 | 显示 | 下划线颜色 |
|------|------|----------|
| `Error` | ❌ | 红色波浪线 |
| `Warning` | ⚠️ | 黄色波浪线 |
| `Information` | ℹ️ | 蓝色波浪线 |
| `Hint` | 💡 | 灰色点线 |

---

### 7.8 代码操作（CodeActionProvider）

**效果：** 光标处出现 💡 灯泡，提供快速修复（Quick Fix）或重构建议。

```typescript
class CSMScriptCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,  // context.diagnostics 相关的诊断
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const actions: vscode.CodeAction[] = [];

    // 对诊断提供修复
    for (const diag of context.diagnostics) {
      if (diag.code === 'CSM001') {
        const fix = new vscode.CodeAction(
          '添加缺失的闭合引号',
          vscode.CodeActionKind.QuickFix
        );
        fix.diagnostics = [diag];
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.insert(document.uri, diag.range.end, '"');
        fix.isPreferred = true;  // 标记为首选修复
        actions.push(fix);
      }
    }

    return actions;
  }
}
```

---

### 7.9 代码格式化（FormattingProvider）

```typescript
// 格式化整个文档
class CSMScriptDocumentFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions  // options.tabSize, options.insertSpaces
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    const formatted = formatCSMScript(document.getText(), options);
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    return [vscode.TextEdit.replace(fullRange, formatted)];
  }
}

// 格式化选中区域
class CSMScriptRangeFormatter implements vscode.DocumentRangeFormattingEditProvider {
  provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    const text = document.getText(range);
    const formatted = formatCSMScript(text, options);
    return [vscode.TextEdit.replace(range, formatted)];
  }
}
```

**注册：**
```typescript
vscode.languages.registerDocumentFormattingEditProvider({ language: 'csmscript' }, new CSMScriptDocumentFormatter());
vscode.languages.registerDocumentRangeFormattingEditProvider({ language: 'csmscript' }, new CSMScriptRangeFormatter());
```

---

### 7.10 重命名（RenameProvider）

**效果：** `F2` 重命名符号，批量替换所有引用位置。

```typescript
class CSMScriptRenameProvider implements vscode.RenameProvider {
  // （可选）验证重命名是否合法，返回当前名称的范围
  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) throw new Error('此位置不支持重命名');
    return { range: wordRange, placeholder: document.getText(wordRange) };
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    const locations = findAllReferences(document.getText(document.getWordRangeAtPosition(position)));
    for (const loc of locations) {
      edit.replace(loc.uri, loc.range, newName);
    }
    return edit;
  }
}
```

---

### 7.11 折叠范围（FoldingRangeProvider）

**效果：** 在编辑器左侧显示自定义的代码折叠箭头。

```typescript
class CSMScriptFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const ranges: vscode.FoldingRange[] = [];
    const stack: number[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      if (line.includes('{')) stack.push(i);
      if (line.includes('}') && stack.length > 0) {
        const start = stack.pop()!;
        ranges.push(new vscode.FoldingRange(
          start, i,
          vscode.FoldingRangeKind.Region  // Region / Imports / Comment
        ));
      }
    }

    return ranges;
  }
}
```

---

### 7.12 内联提示（InlayHintsProvider）

**效果：** 在代码行内嵌入参数名、类型等额外信息（灰色小字）。

```typescript
class CSMScriptInlayHintsProvider implements vscode.InlayHintsProvider {
  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    // 示例：在函数调用的参数前显示参数名
    // sendMessage("StateMachine", "start")
    //             ↑target:        ↑message:
    for (let i = range.start.line; i <= range.end.line; i++) {
      const line = document.lineAt(i);
      const match = line.text.match(/sendMessage\(([^,]+),/);
      if (match) {
        const pos = new vscode.Position(i, match.index! + 'sendMessage('.length);
        hints.push(new vscode.InlayHint(pos, 'target:', vscode.InlayHintKind.Parameter));
      }
    }

    return hints;
  }
}
```

---

### 7.13 文档链接（DocumentLinkProvider）

**效果：** 将文档中的特定文本变为可点击链接。

```typescript
class CSMScriptDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      // 示例：将 import "filename" 中的文件名变为链接
      const match = line.text.match(/import\s+"([^"]+)"/);
      if (match) {
        const start = line.text.indexOf('"') + 1;
        const range = new vscode.Range(i, start, i, start + match[1].length);
        const uri = vscode.Uri.file(`${path.dirname(document.uri.fsPath)}/${match[1]}`);
        links.push(new vscode.DocumentLink(range, uri));
      }
    }

    return links;
  }
}
```

---

## 8. 语言服务器协议（LSP）

### 8.1 什么时候需要 LSP？

| 场景 | 建议 |
|------|------|
| 功能简单（hover、补全），逻辑少 | 直接在插件主进程实现 Provider，**不需要 LSP** |
| 语言功能复杂，需要完整 AST、类型推断 | 使用 LSP，将逻辑移到独立进程 |
| 需要跨编辑器复用（Vim/Emacs/Neovim） | 使用 LSP |
| 语言服务可能崩溃 | 使用 LSP（崩溃不影响编辑器进程） |

### 8.2 LSP 架构

```
┌─────────────────────────────────────────┐
│  VSCode 编辑器进程                        │
│  ┌─────────────────────────────┐        │
│  │  Extension Host Process     │        │
│  │  ┌─────────────────────┐   │        │
│  │  │ Language Client      │   │        │
│  │  │ (vscode-languageclient)│  │        │
│  │  └──────────┬──────────┘   │        │
│  └─────────────┼───────────────┘        │
└────────────────┼────────────────────────┘
                 │ JSON-RPC（stdin/stdout 或 TCP）
                 │
┌────────────────┼────────────────────────┐
│  Language Server Process               │
│  ┌─────────────┴───────────────┐       │
│  │ Language Server             │       │
│  │ (vscode-languageserver)     │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### 8.3 最小 LSP 示例

**客户端（插件侧）：**

```typescript
// extension.ts
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'csmscript' }],
    // 可选：同步给服务端的设置
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.csm')
    }
  };

  client = new LanguageClient('csmscriptLsp', 'CSMScript Language Server', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

**服务端（独立 Node.js 进程）：**

```typescript
// server/src/server.ts
import {
  createConnection, TextDocuments, ProposedFeatures,
  InitializeParams, TextDocumentSyncKind,
  CompletionItem, CompletionItemKind, Hover, MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    completionProvider: { resolveProvider: true, triggerCharacters: ['.', ':'] },
    definitionProvider: true,
    referencesProvider: true,
    documentSymbolProvider: true,
    diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false }
  }
}));

connection.onHover(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri)!;
  const word = getWordAtPosition(doc, position);
  const documentation = getDocumentation(word);
  if (!documentation) return null;
  return {
    contents: { kind: MarkupKind.Markdown, value: documentation }
  } as Hover;
});

connection.onCompletion(({ textDocument, position }) => {
  // 返回补全列表
  return [
    { label: 'state', kind: CompletionItemKind.Keyword },
    { label: 'action', kind: CompletionItemKind.Keyword },
  ] as CompletionItem[];
});

documents.listen(connection);
connection.listen();
```

**所需依赖：**
```bash
# 客户端
npm install vscode-languageclient

# 服务端（在 server/ 子项目中）
npm install vscode-languageserver vscode-languageserver-textdocument
```

**参考：** [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 9. 嵌入式语言（Embedded Languages）

当 CSMScript 文件中嵌入其他语言（如内嵌 JavaScript 表达式）时，可以声明嵌入式语言支持：

```jsonc
// package.json
{
  "contributes": {
    "grammars": [{
      "language": "csmscript",
      "scopeName": "source.csmscript",
      "path": "./syntaxes/csmscript.tmLanguage.json",
      "embeddedLanguages": {
        "meta.embedded.block.javascript": "javascript",
        "meta.embedded.block.sql": "sql"
      }
    }]
  }
}
```

在 TextMate Grammar 中，嵌入段的根 scope 需要与 `embeddedLanguages` 中的键对应：

```jsonc
{
  "name": "meta.embedded.block.javascript",
  "begin": "<script>",
  "end": "</script>",
  "contentName": "source.js",
  "patterns": [{ "include": "source.js" }]
}
```

> 声明嵌入语言后，VSCode 会自动在嵌入区域内提供对应语言的所有功能（高亮、补全、诊断等）。

**参考：** [Embedded Languages](https://code.visualstudio.com/api/language-extensions/embedded-languages)

---

## 10. 对 CSMScript 的实施建议

### 10.1 功能优先级矩阵

| 功能 | 实现复杂度 | 用户体验提升 | 推荐阶段 |
|------|----------|------------|---------|
| 语言定义（文件关联） | ⭐ | ⭐⭐⭐⭐⭐ | **阶段 1** |
| 语言配置（注释/括号） | ⭐ | ⭐⭐⭐⭐⭐ | **阶段 1** |
| TextMate 语法高亮 | ⭐⭐ | ⭐⭐⭐⭐⭐ | **阶段 1** |
| 代码片段 | ⭐ | ⭐⭐⭐⭐ | **阶段 1** |
| 悬停提示 | ⭐⭐ | ⭐⭐⭐⭐ | **阶段 2** |
| 代码补全 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **阶段 2** |
| 文档符号（大纲） | ⭐⭐ | ⭐⭐⭐⭐ | **阶段 2** |
| 代码诊断 | ⭐⭐⭐ | ⭐⭐⭐⭐ | **阶段 2** |
| 代码操作（快速修复） | ⭐⭐⭐ | ⭐⭐⭐ | **阶段 2** |
| 签名帮助 | ⭐⭐ | ⭐⭐⭐ | **阶段 2** |
| 跳转定义 | ⭐⭐⭐ | ⭐⭐⭐⭐ | **阶段 3** |
| 查找引用 | ⭐⭐⭐ | ⭐⭐⭐ | **阶段 3** |
| 重命名 | ⭐⭐⭐ | ⭐⭐⭐ | **阶段 3** |
| 代码格式化 | ⭐⭐⭐ | ⭐⭐⭐ | **阶段 3** |
| 语义着色 | ⭐⭐⭐ | ⭐⭐⭐ | **阶段 3** |
| 内联提示 | ⭐⭐ | ⭐⭐ | **阶段 3** |
| LSP 迁移 | ⭐⭐⭐⭐⭐ | 架构升级 | **阶段 4** |

### 10.2 阶段一：声明式最小可用版本（v0.1.0）

**目标：** 打开 `.csm` 文件后有语法颜色，且基础编辑体验良好。

**需要创建的文件：**
```
csmscript-support/
├── package.json                  ← 注册语言、语法、配置、片段
├── language-configuration.json  ← 括号、注释符号、缩进规则
├── syntaxes/
│   └── csmscript.tmLanguage.json  ← 语法高亮规则
└── snippets/
    └── csmscript.code-snippets    ← 常用代码模板
```

**此阶段无需 `src/extension.ts`，无需编译步骤。**

### 10.3 阶段二：编程式 IntelliSense（v0.2.0）

**目标：** 提供代码补全、悬停文档、大纲视图、基础错误检测。

**新增文件：**
```
src/
├── extension.ts                  ← activate/deactivate
├── providers/
│   ├── completionProvider.ts     ← CompletionItemProvider
│   ├── hoverProvider.ts          ← HoverProvider
│   ├── symbolProvider.ts         ← DocumentSymbolProvider
│   └── diagnosticProvider.ts    ← DiagnosticCollection
└── data/
    └── keywords.ts               ← CSMScript 关键字和 API 定义
```

### 10.4 阶段三：深度语言支持（v0.5.0）

**目标：** 支持跨文件的符号导航和重命名。

**新增：** `DefinitionProvider`、`ReferenceProvider`、`RenameProvider`、`FoldingRangeProvider`、语义着色

**技术要点：** 需要构建 CSMScript 的**符号表（Symbol Table）**，跟踪整个工作区中所有状态、动作、触发器的定义和引用位置。

### 10.5 阶段四：语言服务器（v1.0.0）

**目标：** 将语言逻辑迁移到独立的 Language Server，提升性能和可维护性。

**项目结构变化：**
```
csmscript-support/
├── client/           ← 插件主代码（LanguageClient）
├── server/           ← 语言服务器（独立 Node.js 进程）
│   ├── src/
│   │   ├── server.ts
│   │   └── parser/   ← CSMScript 解析器
│   └── package.json
└── package.json      ← 根 package.json
```

---

## 参考资料

| 资源 | 链接 |
|------|------|
| Language Extensions Overview | https://code.visualstudio.com/api/language-extensions/overview |
| Language Configuration Guide | https://code.visualstudio.com/api/language-extensions/language-configuration-guide |
| Syntax Highlight Guide | https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide |
| Snippet Guide | https://code.visualstudio.com/api/language-extensions/snippet-guide |
| Programmatic Language Features | https://code.visualstudio.com/api/language-extensions/programmatic-language-features |
| Semantic Highlight Guide | https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide |
| Language Server Extension Guide | https://code.visualstudio.com/api/language-extensions/language-server-extension-guide |
| Embedded Languages | https://code.visualstudio.com/api/language-extensions/embedded-languages |
| TextMate Grammar 规范 | https://macromates.com/manual/en/language_grammars |
| VSCode Extension Samples（语言支持示例） | https://github.com/microsoft/vscode-extension-samples |
| vscode-languageserver-node | https://github.com/microsoft/vscode-languageserver-node |

---

*文档创建日期：2026-03-06*  
*如有讨论，请在对应 Issue 或 PR 中留言。*
