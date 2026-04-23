# 新脚本语言 VSCode 支持调研

> 本文档分两部分：**第一部分**是对 VSCode 插件开发全流程与技术选型的简要概览（原始规划内容摘要，详情见 [`docs/plan/vscode-extension-development-plan.md`](../plan/vscode-extension-development-plan.md) 与 [`docs/research/technology-selection.md`](../research/technology-selection.md)）；**第二部分**聚焦于为新脚本语言添加 VSCode 支持所需的关键技术细节。
>
> 关联 Issue：[M0 调研与环境准备](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/2)

---

## 第一部分：VSCode 插件开发全流程概览（摘要）

> 本部分内容摘自前期调研文档，保留核心结论，供快速参考。完整内容请查阅 [`docs/plan/vscode-extension-development-plan.md`](../plan/vscode-extension-development-plan.md)。

### 四个开发阶段

| 阶段 | 核心任务 | 关键输出 |
|-----|---------|---------|
| **阶段一：调研** | 了解 VSCode 插件体系、确定功能范围、技术选型、环境准备 | 功能清单、技术选型结论、开发环境 |
| **阶段二：开发** | 项目初始化（`yo code`）、语言定义、语法高亮、代码片段、IntelliSense/LSP | 可运行的插件 |
| **阶段三：测试** | 单元测试（mocha）、集成测试（`@vscode/test-cli`）、CI 接入（GitHub Actions） | 通过的测试套件 |
| **阶段四：发布** | 注册 Publisher 账号、`vsce package` 打包、`vsce publish` 发布、Open VSX 可选 | Marketplace 上线的插件 |

### 里程碑计划

| 里程碑 | 目标 | 大致周期 |
|--------|------|---------|
| **M0** | 调研完成，确定功能范围，搭建开发环境 | 第 1 周 |
| **M1** | 语言定义 + 语法高亮，可本地安装验证 | 第 2–3 周 |
| **M2** | 代码片段 + 基础 IntelliSense | 第 3–4 周 |
| **M3** | 测试完善 + CI 接入 + 首次发布 v0.1.0 | 第 4–5 周 |
| **M4** | 根据反馈迭代，发布稳定版 v1.0.0 | 第 6–8 周 |

### 技术选型结论

> 详细分析见 [`docs/research/technology-selection.md`](../research/technology-selection.md)。

| 类别 | 选型结果 | 状态 |
|------|---------|------|
| 开发语言 | **TypeScript**（官方推荐，类型安全） | ✅ 已确认 |
| 打包工具 | **esbuild**（`yo code` 默认提供，构建快） | ✅ 已确认 |
| 包管理器 | **npm** 或 **pnpm** | ✅ 已确认 |
| 脚手架 | **yo code**（`npm install -g yo generator-code`） | ✅ 已确认 |
| 语言服务器 | `vscode-languageserver`（按需引入） | ⏳ 待评估 |

### 关键工具速查

| 工具 | 用途 | 链接 |
|------|------|------|
| `yo code` | 项目骨架生成器 | https://github.com/Microsoft/vscode-generator-code |
| `@vscode/vsce` | 打包与发布 | https://github.com/microsoft/vscode-vsce |
| `@vscode/test-cli` | 官方测试框架 | https://github.com/microsoft/vscode-test-cli |
| `vscode-tmgrammar-test` | 语法高亮快照测试 | https://github.com/PanAeon/vscode-tmgrammar-test |
| `vscode-extension-tester` | E2E 测试 | https://github.com/redhat-developer/vscode-extension-tester |
| `ovsx` | 发布到 Open VSX | https://github.com/eclipse/openvsx |

### 发布前检查清单（摘要）

- [ ] 所有测试通过，三平台（Windows / macOS / Linux）验证
- [ ] `README.md` 包含截图或 GIF 演示，`CHANGELOG.md` 已更新
- [ ] `package.json` 的 `publisher`、`repository`、`icon` 等字段完整
- [ ] `.vscodeignore` 配置正确，本地 `vsce package` 打包验证

---

## 第二部分：新脚本语言支持技术细节

---

## 目录

1. [VSCode 语言扩展能力概览](#1-vscode-语言扩展能力概览)
2. [贡献点（Contribution Points）](#2-贡献点contribution-points)
3. [激活事件（Activation Events）](#3-激活事件activation-events)
4. [语言注册与语言配置](#4-语言注册与语言配置)
5. [语法高亮（TextMate Grammar）](#5-语法高亮textmate-grammar)
6. [代码片段（Snippets）](#6-代码片段snippets)
7. [程序化语言功能（IntelliSense / Hover / 诊断）](#7-程序化语言功能intellisense--hover--诊断)
8. [语言服务器协议（LSP）](#8-语言服务器协议lsp)
9. [同类脚本语言插件参考](#9-同类脚本语言插件参考)
10. [VSCode Marketplace 同类插件调研](#10-vscode-marketplace-同类插件调研)

---

## 1. VSCode 语言扩展能力概览

VSCode 插件体系对语言支持提供了从轻量到完整的分层能力。新脚本语言通常按以下顺序逐步实现：

| 能力层次 | 实现方式 | 复杂度 | 说明 |
|---------|---------|-------|------|
| 语言识别 | `contributes.languages` | ⭐ | 注册语言 ID、文件扩展名、图标 |
| 语言配置 | `language-configuration.json` | ⭐ | 注释、括号匹配、自动缩进等 |
| 语法高亮 | TextMate Grammar (`.tmLanguage.json`) | ⭐⭐ | 基于正则的词法着色 |
| 代码片段 | `.code-snippets` 文件 | ⭐ | 常用模板，Tab 键展开 |
| 代码补全 | `CompletionItemProvider` | ⭐⭐⭐ | 关键字、API、变量补全 |
| 悬停提示 | `HoverProvider` | ⭐⭐ | 鼠标悬停显示文档 |
| 代码诊断 | `DiagnosticCollection` | ⭐⭐⭐ | 错误/警告标注 |
| 跳转定义 | `DefinitionProvider` | ⭐⭐⭐ | Go to Definition |
| 查找引用 | `ReferenceProvider` | ⭐⭐⭐ | Find All References |
| 代码格式化 | `DocumentFormattingEditProvider` | ⭐⭐⭐ | 格式化整个文档 |
| 语言服务器 | Language Server Protocol (LSP) | ⭐⭐⭐⭐ | 将语言逻辑独立为后台进程 |

**官方文档：** [Extension Capabilities Overview](https://code.visualstudio.com/api/extension-capabilities/overview)

---

## 2. 贡献点（Contribution Points）

`package.json` 中的 `contributes` 字段是语言插件的核心声明，常用贡献点如下：

```jsonc
{
  "contributes": {
    "languages": [
      {
        "id": "csmscript",
        "aliases": ["CSMScript", "csm"],
        "extensions": [".csm"],
        "configuration": "./language-configuration.json",
        "icon": {
          "light": "./icons/csmscript-light.svg",
          "dark":  "./icons/csmscript-dark.svg"
        }
      }
    ],
    "grammars": [
      {
        "language": "csmscript",
        "scopeName": "source.csmscript",
        "path": "./syntaxes/csmscript.tmLanguage.json"
      }
    ],
    "snippets": [
      {
        "language": "csmscript",
        "path": "./snippets/csmscript.code-snippets"
      }
    ],
    "commands": [
      {
        "command": "csmscript.run",
        "title": "Run CSMScript File"
      }
    ]
  }
}
```

**关键贡献点说明：**

| 贡献点 | 作用 | 文档 |
|-------|------|------|
| `languages` | 注册语言 ID、扩展名、图标 | [languages](https://code.visualstudio.com/api/references/contribution-points#contributes.languages) |
| `grammars` | 关联 TextMate Grammar，启用语法高亮 | [grammars](https://code.visualstudio.com/api/references/contribution-points#contributes.grammars) |
| `snippets` | 关联代码片段文件 | [snippets](https://code.visualstudio.com/api/references/contribution-points#contributes.snippets) |
| `commands` | 注册命令（可绑定快捷键） | [commands](https://code.visualstudio.com/api/references/contribution-points#contributes.commands) |
| `configuration` | 插件设置项（用户可在 Settings 中修改） | [configuration](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration) |
| `menus` | 右键菜单、标题栏菜单等 | [menus](https://code.visualstudio.com/api/references/contribution-points#contributes.menus) |

**官方文档：** [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)

---

## 3. 激活事件（Activation Events）

激活事件控制插件在何时被加载，合理配置可避免影响 VSCode 启动性能。

| 激活事件 | 触发条件 | 推荐场景 |
|---------|---------|---------|
| `onLanguage:csmscript` | 打开 CSMScript 文件时 | **语言插件首选** |
| `onCommand:csmscript.run` | 用户执行指定命令时 | 命令触发类功能 |
| `workspaceContains:**/*.csm` | 工作区包含指定文件时 | 需要感知工作区时 |
| `*` | VSCode 启动时立即加载 | 应避免使用，影响性能 |

**现代插件（VSCode ≥ 1.74）推荐做法：** `activationEvents` 可留空数组 `[]`，VSCode 会根据 `contributes` 中声明的内容自动推断激活时机。

```jsonc
// package.json
{
  "activationEvents": []   // 留空，让 VSCode 自动推断
}
```

**官方文档：** [Activation Events](https://code.visualstudio.com/api/references/activation-events)

---

## 4. 语言注册与语言配置

### 4.1 语言注册

在 `package.json` 的 `contributes.languages` 中注册：

```jsonc
{
  "id": "csmscript",           // 语言唯一 ID，在代码中通过此 ID 引用
  "aliases": ["CSMScript"],    // 显示名称
  "extensions": [".csm"],      // 文件扩展名（支持多个）
  "firstLine": "^#!.*csm",     // 可选：根据文件首行识别语言（shebang）
  "configuration": "./language-configuration.json"
}
```

### 4.2 语言配置文件（`language-configuration.json`）

```jsonc
{
  // 注释
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  // 括号定义（影响括号匹配着色）
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  // 自动关闭括号
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"" },
    { "open": "'", "close": "'" }
  ],
  // 选中文本后输入此字符会自动包裹
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""],
    ["'", "'"]
  ],
  // 触发缩进的关键字（如 if/for 等块开始）
  "indentationRules": {
    "increaseIndentPattern": "^.*(\\{|\\[|\\()\\s*$",
    "decreaseIndentPattern": "^\\s*(\\}|\\]|\\))"
  },
  // 单词分隔符（影响双击选词）
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)"
}
```

**官方文档：** [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide)

---

## 5. 语法高亮（TextMate Grammar）

### 5.1 基本结构

TextMate Grammar 是一个 JSON（或 YAML）文件，通过**正则表达式**将代码词法单元映射到**作用域名称**（scope name），再由主题配色方案为作用域着色。

```jsonc
// syntaxes/csmscript.tmLanguage.json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "CSMScript",
  "scopeName": "source.csmscript",    // 顶层作用域，在 package.json grammars 中引用
  "patterns": [
    { "include": "#comments" },
    { "include": "#keywords" },
    { "include": "#strings" },
    { "include": "#numbers" }
  ],
  "repository": {
    "comments": {
      "patterns": [
        {
          "name": "comment.line.double-slash.csmscript",
          "match": "//.*$"
        },
        {
          "name": "comment.block.csmscript",
          "begin": "/\\*",
          "end": "\\*/"
        }
      ]
    },
    "keywords": {
      "patterns": [
        {
          "name": "keyword.control.csmscript",
          "match": "\\b(if|else|while|for|return|break|continue)\\b"
        },
        {
          "name": "keyword.other.csmscript",
          "match": "\\b(var|let|const|function)\\b"
        }
      ]
    },
    "strings": {
      "name": "string.quoted.double.csmscript",
      "begin": "\"",
      "end": "\"",
      "patterns": [
        {
          "name": "constant.character.escape.csmscript",
          "match": "\\\\."
        }
      ]
    },
    "numbers": {
      "name": "constant.numeric.csmscript",
      "match": "\\b\\d+(\\.\\d+)?\\b"
    }
  }
}
```

### 5.2 常用作用域名称（Scope Names）

遵循 TextMate 约定的作用域名称可获得大多数主题的最佳着色支持：

| 作用域 | 用途 |
|-------|------|
| `keyword.control` | 流程控制关键字（if/else/while） |
| `keyword.other` | 其他关键字（var/function） |
| `string.quoted.double` | 双引号字符串 |
| `string.quoted.single` | 单引号字符串 |
| `constant.numeric` | 数字字面量 |
| `constant.language` | 语言内置常量（true/false/null） |
| `comment.line` | 行注释 |
| `comment.block` | 块注释 |
| `entity.name.function` | 函数名 |
| `entity.name.type` | 类型名 |
| `variable.parameter` | 函数参数 |
| `support.function` | 内置函数 |
| `storage.type` | 类型声明关键字 |
| `operator.expression` | 运算符 |

### 5.3 调试工具

- **Scope Inspector**：按 `Ctrl+Shift+P` → "Developer: Inspect Editor Tokens and Scopes"，可查看光标处的 scope 信息
- **vscode-textmate**：在 Node.js 中测试 grammar 解析结果
- **vscode-tmgrammar-test**：为 grammar 编写快照测试

**官方文档：** [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

---

## 6. 代码片段（Snippets）

`.code-snippets` 文件格式：

```jsonc
// snippets/csmscript.code-snippets
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
  "For Loop": {
    "prefix": "for",
    "body": [
      "for (${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {",
      "\t$0",
      "}"
    ],
    "description": "For loop"
  },
  "Function Definition": {
    "prefix": "fn",
    "body": [
      "function ${1:name}(${2:params}) {",
      "\t$0",
      "}"
    ],
    "description": "Function definition"
  }
}
```

**占位符说明：**

| 语法 | 说明 |
|-----|------|
| `$1`, `$2` | Tab 跳转位置，数字表示顺序 |
| `$0` | 最终光标位置 |
| `${1:default}` | 带默认值的占位符 |
| `${1\|option1,option2\|}` | 下拉选择占位符 |

**官方文档：** [Snippet Guide](https://code.visualstudio.com/api/language-extensions/snippet-guide)

---

## 7. 程序化语言功能（IntelliSense / Hover / 诊断）

通过在 `extension.ts` 中注册 Provider 实现。

### 7.1 代码补全（CompletionItemProvider）

```typescript
import * as vscode from 'vscode';

const completionProvider = vscode.languages.registerCompletionItemProvider(
  'csmscript',
  {
    provideCompletionItems(document, position) {
      const keywords = ['if', 'else', 'while', 'for', 'return', 'function', 'var'];
      return keywords.map(kw => {
        const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
        item.detail = 'CSMScript keyword';
        return item;
      });
    }
  }
);
```

### 7.2 悬停提示（HoverProvider）

```typescript
const hoverProvider = vscode.languages.registerHoverProvider(
  'csmscript',
  {
    provideHover(document, position) {
      const word = document.getText(document.getWordRangeAtPosition(position));
      const docs: Record<string, string> = {
        'if': '**if** statement: Conditionally execute a block of code.',
        // ...
      };
      if (docs[word]) {
        return new vscode.Hover(new vscode.MarkdownString(docs[word]));
      }
    }
  }
);
```

### 7.3 代码诊断（DiagnosticCollection）

```typescript
const diagnosticCollection = vscode.languages.createDiagnosticCollection('csmscript');

function updateDiagnostics(document: vscode.TextDocument): void {
  if (document.languageId !== 'csmscript') { return; }
  const diagnostics: vscode.Diagnostic[] = [];
  // 解析文档，生成错误/警告
  // ...
  diagnosticCollection.set(document.uri, diagnostics);
}
```

**官方文档：** [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)

---

## 8. 语言服务器协议（LSP）

当语言的语义分析逻辑较复杂时，推荐将语言功能独立为一个 **Language Server** 进程，与插件（Language Client）通过 LSP 通信。

### 8.1 架构

```
VSCode 编辑器
    │
    │  Language Server Protocol (JSON-RPC over stdio / socket)
    ▼
Language Client（extension.ts）
    │
    │  进程间通信
    ▼
Language Server（独立 Node.js 进程）
  - 解析 / 词法分析
  - 语义分析
  - 提供 completion / hover / diagnostics / definition 等
```

### 8.2 关键依赖包

```bash
# Language Client（在插件端使用）
npm install vscode-languageclient

# Language Server（在 server 端使用）
npm install vscode-languageserver vscode-languageserver-textdocument
```

### 8.3 何时使用 LSP

| 场景 | 建议 |
|-----|------|
| 只需语法高亮、片段 | **不需要** LSP，直接用 Grammar + Snippets |
| 需要简单补全/悬停 | 可用内联 Provider，不一定需要 LSP |
| 需要跨文件分析（引用、定义跳转） | **推荐** LSP |
| 语言逻辑复杂（类型检查、错误诊断） | **推荐** LSP |
| 未来计划支持其他编辑器（Vim/Emacs/Neovim） | **推荐** LSP（一次实现多编辑器可用） |

**官方文档：** [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 9. 同类脚本语言插件参考

以下插件可作为实现新脚本语言支持的参考对象，按复杂度排列：

### 9.1 仅语法高亮类（轻量，适合起步参考）

| 插件 | 语言 | 关键技术 | 仓库 |
|-----|------|---------|------|
| vscode-lua (lite) | Lua | TextMate Grammar | [github](https://github.com/actboy168/lua-debug) |
| vscode-toml | TOML | Grammar + 语言配置 | [github](https://github.com/tamasfe/taplo) |
| vscode-ini | INI | 极简 Grammar | 内置 |

### 9.2 Grammar + Snippets + 基础补全（中等，推荐参考）

| 插件 | 语言 | 关键技术 | 仓库 |
|-----|------|---------|------|
| vscode-groovy | Groovy | Grammar + Snippets | [github](https://github.com/hoovercj/vscode-power-mode) |
| vscode-bat | Bat/CMD | Grammar + 语言配置 | 内置 VSCode |
| vscode-makefile | Makefile | Grammar + 基础补全 | 内置 VSCode |

### 9.3 完整语言服务器类（复杂，供长期参考）

| 插件 | 语言 | 关键技术 | 仓库 |
|-----|------|---------|------|
| vscode-lua (sumneko) | Lua | LSP（lua-language-server） | [github](https://github.com/LuaLS/lua-language-server) |
| vscode-python | Python | LSP（Pylance）+ 调试 | [github](https://github.com/microsoft/vscode-python) |
| vscode-yaml | YAML | LSP（yaml-language-server） | [github](https://github.com/redhat-developer/vscode-yaml) |
| vscode-json | JSON | 内置 JSON Language Server | 内置 VSCode |

### 9.4 官方示例项目

| 示例 | 说明 | 链接 |
|-----|------|------|
| `lsp-sample` | 完整的 LSP 插件示例（Client + Server） | [github](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample) |
| `language-configuration-sample` | 语言配置示例 | [github](https://github.com/microsoft/vscode-extension-samples/tree/main/language-configuration-sample) |
| `completions-sample` | 代码补全示例 | [github](https://github.com/microsoft/vscode-extension-samples/tree/main/completions-sample) |

---

## 10. VSCode Marketplace 同类插件调研

> 关联任务：[Issue #10 - 在 VSCode Marketplace 搜索同类插件](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/10)

调研同类插件时，重点关注以下维度：

### 10.1 调研清单

- [ ] 搜索关键词：`scripting language support`、`DSL`、`language grammar`
- [ ] 记录下载量 Top 3 的同类插件，分析其 `package.json` 贡献点结构
- [ ] 查看这些插件的 Grammar 文件写法，提取正则模式参考
- [ ] 了解这些插件是否采用 LSP，以及理由
- [ ] 记录用户评价中的高频需求（补全、诊断、格式化等）

### 10.2 调研记录模板

| 插件名 | 下载量 | 语言 | 核心功能 | 是否用 LSP | 参考价值 |
|-------|-------|------|---------|-----------|---------|
| （待填写） | | | | | |

### 10.3 Marketplace 搜索地址

- **按语言支持筛选：** https://marketplace.visualstudio.com/search?target=VSCode&category=Programming%20Languages&sortBy=Installs
- **直接搜索：** https://marketplace.visualstudio.com/vscode

---

## 文件结构建议

完成 M1 后，典型的 CSMScript 插件项目结构如下：

```
csmscript-support/
├── .vscode/
│   └── launch.json               # F5 调试配置
├── syntaxes/
│   └── csmscript.tmLanguage.json # TextMate Grammar
├── snippets/
│   └── csmscript.code-snippets   # 代码片段
├── icons/
│   ├── csmscript-light.svg       # 文件图标（浅色主题）
│   └── csmscript-dark.svg        # 文件图标（深色主题）
├── src/
│   └── extension.ts              # 插件入口（注册 Provider）
├── language-configuration.json   # 语言配置（括号/注释/缩进）
├── package.json                   # 插件清单（贡献点声明）
├── tsconfig.json
└── README.md
```

---

*文档创建日期：2026-03-06*  
*关联 Issue：[M0 调研与环境准备](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/2)*
