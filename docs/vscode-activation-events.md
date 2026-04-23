# VSCode 激活事件（Activation Events）速查手册

> 原文档：[Activation Events | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/activation-events)  
> 整理日期：2026-03-06

---

## 目录

1. [概述](#1-概述)
2. [激活事件一览（通用速查）](#2-激活事件一览通用速查)
3. [语言插件推荐配置（CSMScript 示例）](#3-语言插件推荐配置csmscript-示例)
4. [激活事件汇总表（含语言扩展关联度）](#4-激活事件汇总表含语言扩展关联度)
5. [语言扩展核心事件详解](#5-语言扩展核心事件详解)
   - [onLanguage](#onlanguage)
   - [workspaceContains](#workspacecontains)
   - [onCommand](#oncommand)
   - [onStartupFinished](#onstartupfinished)
   - [onDebug 系列](#ondebug-系列)
   - [onView](#onview)
   - [onWebviewPanel](#onwebviewpanel)
   - [onTaskType](#ontasktype)
6. [其他事件详解（参考）](#6-其他事件详解参考)
   - [onFileSystem](#onfilesystem)
   - [onUri](#onuri)
   - [onCustomEditor](#oncustomeditor)
   - [onAuthenticationRequest](#onauthenticationrequest)
   - [onEditSession](#oneditsession)
   - [onSearch](#onsearch)
   - [onOpenExternalUri](#onopenexternaluri)
   - [onNotebook](#onnotebook)
   - [onRenderer](#onrenderer)
   - [onTerminal 系列](#onterminal-系列)
   - [onWalkthrough](#onwalkthrough)
   - [onIssueReporterOpened](#onissuereporteropened)
   - [onChatParticipant](#onchatparticipant)
   - [onLanguageModelTool](#onlanguagemodeltool)
   - [*（启动时激活）](#启动时激活)
7. [最佳实践](#7-最佳实践)

---

## 1. 概述

**激活事件（Activation Events）** 是在插件 `package.json` 清单文件的 `activationEvents` 字段中声明的一组 JSON 条目，用于控制插件何时被 VSCode 加载（激活）。合理设置激活事件可以避免插件在不需要时占用资源，从而提升编辑器整体性能。

```jsonc
// package.json 示例
{
  "activationEvents": [
    "onLanguage:csmscript",
    "onCommand:csmscript.helloWorld"
  ]
}
```

> **重要说明（VSCode 1.74.0+）：** 从 1.74.0 版本起，以下情况无需再手动声明对应的激活事件，VSCode 会自动处理：
> - 插件自身**贡献**的语言（`onLanguage`）
> - 插件自身**注册**的命令（`onCommand`）
> - 插件自身**贡献**的视图（`onView`）
> - 插件自身**贡献**的自定义编辑器（`onCustomEditor`）
> - 插件自身**贡献**的认证提供者（`onAuthenticationRequest`）
> - 插件自身**贡献**的任务类型（`onTaskType`，1.76.0+）

---

## 2. 激活事件一览（通用速查）

> 本节是对 VSCode 全部激活事件的简明汇总，不涉及任何具体项目，供通用参考。  
> 如只关注 CSMScript 语言插件的配置，可直接跳至 [第 3 节](#3-语言插件推荐配置csmscript-示例)。

### 所有激活事件一览

| 激活事件 | 触发时机 | 典型用途 |
|---------|---------|---------|
| `onLanguage:<id>` | 打开指定语言类型的文件时 | 语言工具、语法检查、格式化 |
| `onCommand:<cmd>` | 执行指定命令时 | 命令面板操作 |
| `onDebug` | 调试会话启动前 | 调试适配器扩展 |
| `onDebugInitialConfigurations` | 生成 `launch.json` 前 | 提供初始调试配置 |
| `onDebugDynamicConfigurations` | 用户请求动态调试配置时 | 提供动态调试配置 |
| `onDebugResolve:<type>` | 解析指定类型调试配置前 | 精细化调试激活 |
| `onDebugAdapterProtocolTracker:<type>` | 指定类型调试会话即将启动且需要协议追踪器时 | 调试协议追踪 |
| `workspaceContains:<glob>` | 打开工作区且包含匹配文件时 | 检测项目类型、初始化服务 |
| `onFileSystem:<scheme>` | 读取指定 scheme 的文件/文件夹时 | 自定义文件系统 |
| `onView:<id>` | 指定视图在侧边栏展开时 | 自定义视图/面板 |
| `onUri` | 插件专属的系统 URI 被打开时 | URI 处理器 |
| `onWebviewPanel:<viewType>` | VSCode 需要恢复指定 viewType 的 Webview 时 | Webview 持久化 |
| `onCustomEditor:<viewType>` | VSCode 需要创建指定 viewType 的自定义编辑器时 | 自定义编辑器 |
| `onAuthenticationRequest:<id>` | 请求指定提供者的认证会话时 | 认证提供者 |
| `onStartupFinished` | VSCode 启动完成后的某个时刻 | 轻量后台功能 |
| `onTaskType:<type>` | 需要列出或解析指定类型任务时 | 任务提供者 |
| `onEditSession:<scheme>` | 访问指定 scheme 的编辑会话时 | 编辑会话同步 |
| `onSearch:<scheme>` | 在指定 scheme 的文件夹中发起搜索时 | 自定义搜索 |
| `onOpenExternalUri` | 打开外部 URI（如 http/https 链接）时 | 链接处理 |
| `onNotebook:<type>` | 打开指定类型的 Notebook 文档时 | Notebook 扩展 |
| `onRenderer:<id>` | 使用指定 Notebook 输出渲染器时 | Notebook 渲染器 |
| `onTerminal:<shellType>` | 打开指定 Shell 类型的终端时 | 终端增强 |
| `onTerminalProfile:<id>` | 启动指定终端配置文件时 | 终端配置文件 |
| `onTerminalShellIntegration:<shellType>` | 指定类型终端的 Shell 集成激活时 | Shell 集成 |
| `onWalkthrough:<id>` | 打开指定演练（Walkthrough）时 | 引导式教程 |
| `onIssueReporterOpened` | Issue 报告器被打开时 | 问题反馈集成 |
| `onChatParticipant:<id>` | 调用指定聊天参与者时 | Copilot Chat 扩展 |
| `onLanguageModelTool:<id>` | 调用指定语言模型工具时 | AI 工具集成 |
| `*` | VSCode 启动时立即激活 | 仅作最后手段 |

### 通用最佳实践

1. **精准激活**：尽量使用最具体的激活事件，避免不必要地加载插件。
2. **优先 `onStartupFinished` 而非 `*`**：如无需在启动过程中激活，`onStartupFinished` 对用户体验更友好。
3. **多事件组合**：可同时声明多个激活事件，任意一个触发均会激活插件。
4. **导出 `activate` / `deactivate`**：插件必须导出 `activate()` 函数；若有异步清理逻辑，`deactivate()` 应返回 `Promise`。
5. **利用 1.74.0+ 自动激活**：插件自身贡献的语言、命令、视图等，VSCode 1.74.0+ 会自动处理对应的激活事件，无需手动声明。

> 各事件的完整说明请见 [§5 语言扩展核心事件详解](#5-语言扩展核心事件详解) 和 [§6 其他事件详解](#6-其他事件详解参考)。

---

## 3. 语言插件推荐配置（CSMScript 示例）

对于 **新脚本语言支持类插件**（如 CSMScript），绝大多数功能仅需以下几个激活事件的组合：

```jsonc
// package.json（CSMScript 语言插件典型配置）
{
  "activationEvents": [
    // 1. 打开 CSMScript 文件时激活（语法高亮、补全、诊断等）
    //    VSCode 1.74+ 中，若 contributes.languages 已声明该语言，此行可省略
    "onLanguage:csmscript",

    // 2. 工作区包含 CSMScript 特征文件时激活（项目级功能）
    //    适合需要在项目打开时就初始化的场景，如语言服务器
    "workspaceContains:**/*.csms",

    // 3. 启动完成后激活（后台索引、状态栏等非紧迫功能）
    //    比 "*" 更友好，不阻塞启动
    "onStartupFinished"
  ],
  "contributes": {
    "languages": [{
      "id": "csmscript",
      "aliases": ["CSMScript"],
      "extensions": [".csms"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "csmscript",
      "scopeName": "source.csmscript",
      "path": "./syntaxes/csmscript.tmLanguage.json"
    }],
    "snippets": [{
      "language": "csmscript",
      "path": "./snippets/csmscript.code-snippets"
    }]
  }
}
```

### 功能场景 → 激活事件速查

| 要实现的功能 | 推荐激活事件 | 说明 |
|------------|------------|------|
| 语法高亮（TextMate Grammar） | 无需激活事件 | 纯声明式，`contributes.grammars` 即可，无需 `activationEvents` |
| 代码片段（Snippets） | 无需激活事件 | 纯声明式，`contributes.snippets` 即可 |
| 代码补全 / 悬停 / 诊断（需要代码逻辑） | `onLanguage:csmscript` | 文件打开时激活，初始化各 Provider |
| 语言服务器（LSP） | `onLanguage:csmscript` 或 `workspaceContains:**/*.csms` | 按场景选择；项目级服务器推荐 `workspaceContains` |
| 自定义命令（格式化、运行脚本等） | 无需声明（1.74.0+）或 `onCommand:csmscript.*` | 插件贡献的命令会自动触发激活 |
| 自定义侧边栏视图 | 无需声明（1.74.0+）或 `onView:<viewId>` | 插件贡献的视图会自动触发激活 |
| 调试支持 | `onDebug` / `onDebugInitialConfigurations` / `onDebugResolve:csmscript` | 根据调试功能复杂度选择，见[调试系列详解](#ondebug-系列) |
| 任务提供者（Run/Build Task） | 无需声明（1.76.0+）或 `onTaskType:csmscript` | 插件贡献的任务类型会自动触发激活 |

---

## 4. 激活事件汇总表（含语言扩展关联度）

> 图例：★★★ 语言扩展核心 / ★★ 语言扩展常用 / ★ 语言扩展偶尔用 / — 一般不用

| 激活事件 | 触发时机 | 典型用途 | 语言扩展关联度 |
|---------|---------|---------|:---:|
| `onLanguage:<id>` | 打开指定语言类型的文件时 | 语法检查、补全、诊断、LSP | ★★★ |
| `workspaceContains:<glob>` | 打开工作区且包含匹配文件时 | 项目级语言服务器初始化 | ★★★ |
| `onCommand:<cmd>` | 执行指定命令时 | 格式化、运行脚本等命令 | ★★★ |
| `onStartupFinished` | VSCode 启动完成后的某个时刻 | 后台索引、状态栏更新 | ★★ |
| `onDebug` | 调试会话启动前 | 调试适配器扩展 | ★★ |
| `onDebugInitialConfigurations` | 生成 `launch.json` 前 | 提供初始调试配置 | ★★ |
| `onDebugDynamicConfigurations` | 用户请求动态调试配置时 | 提供动态调试配置 | ★★ |
| `onDebugResolve:<type>` | 解析指定类型调试配置前 | 精细化调试激活 | ★★ |
| `onDebugAdapterProtocolTracker:<type>` | 指定类型调试会话即将启动且需要协议追踪器时 | 调试协议追踪 | ★ |
| `onView:<id>` | 指定视图在侧边栏展开时 | 自定义视图/面板（调用层次、大纲等） | ★★ |
| `onWebviewPanel:<viewType>` | VSCode 需要恢复指定 viewType 的 Webview 时 | 语言预览面板（如 Markdown 预览） | ★ |
| `onTaskType:<type>` | 需要列出或解析指定类型任务时 | 任务提供者（Run/Build Task） | ★★ |
| `onFileSystem:<scheme>` | 读取指定 scheme 的文件/文件夹时 | 自定义文件系统 | — |
| `onUri` | 插件专属的系统 URI 被打开时 | URI 处理器 | — |
| `onCustomEditor:<viewType>` | VSCode 需要创建指定 viewType 的自定义编辑器时 | 可视化编辑器 | — |
| `onAuthenticationRequest:<id>` | 请求指定提供者的认证会话时 | 认证提供者 | — |
| `onEditSession:<scheme>` | 访问指定 scheme 的编辑会话时 | 编辑会话同步 | — |
| `onSearch:<scheme>` | 在指定 scheme 的文件夹中发起搜索时 | 自定义搜索 | — |
| `onOpenExternalUri` | 打开外部 URI（如 http/https 链接）时 | 链接处理 | — |
| `onNotebook:<type>` | 打开指定类型的 Notebook 文档时 | Notebook 扩展 | — |
| `onRenderer:<id>` | 使用指定 Notebook 输出渲染器时 | Notebook 渲染器 | — |
| `onTerminal:<shellType>` | 打开指定 Shell 类型的终端时 | 终端增强 | — |
| `onTerminalProfile:<id>` | 启动指定终端配置文件时 | 终端配置文件 | — |
| `onTerminalShellIntegration:<shellType>` | 指定类型终端的 Shell 集成激活时 | Shell 集成 | — |
| `onWalkthrough:<id>` | 打开指定演练（Walkthrough）时 | 引导式教程 | — |
| `onIssueReporterOpened` | Issue 报告器被打开时 | 问题反馈集成 | — |
| `onChatParticipant:<id>` | 调用指定聊天参与者时 | Copilot Chat 扩展 | — |
| `onLanguageModelTool:<id>` | 调用指定语言模型工具时 | AI 工具集成 | — |
| `*` | VSCode 启动时立即激活 | 仅作最后手段 | — |

---

## 5. 语言扩展核心事件详解

### onLanguage

当打开解析为特定语言的文件时触发。**这是语言扩展最核心的激活事件。**

```json
"activationEvents": [
  "onLanguage:csmscript"
]
```

可声明多种语言：

```json
"activationEvents": [
  "onLanguage:json",
  "onLanguage:markdown",
  "onLanguage:typescript"
]
```

使用通用形式（不带语言 ID）可在任意语言使用前激活：

```json
"activationEvents": [
  "onLanguage"
]
```

> **注意：** 语言 ID 参考 [Language Identifiers](https://code.visualstudio.com/docs/languages/identifiers)。  
> **最佳实践：** 仅列出插件实际支持的语言，不要对所有语言激活。  
> **语言扩展提示：** VSCode 1.74.0+ 中，若 `contributes.languages` 已声明该语言，则无需手动添加 `onLanguage` 激活事件。

---

### workspaceContains

打开工作区文件夹，且该文件夹中存在至少一个与 [glob 模式](https://code.visualstudio.com/docs/editor/glob-patterns) 匹配的文件时触发。

**语言扩展场景：** 适合需要在项目层面初始化的功能（如语言服务器），打开包含 CSMScript 文件的工程目录时即自动启动。

```json
"activationEvents": [
  "workspaceContains:**/*.csms"
]
```

> **与 `onLanguage` 的选择：**
> - 功能以"文件"为粒度（如语法高亮、单文件补全）→ 使用 `onLanguage`
> - 功能以"项目"为粒度（如语言服务器、项目级索引）→ 使用 `workspaceContains`
> - 两者可同时声明，互不冲突

---

### onCommand

当指定命令被调用时触发。

```json
"activationEvents": [
  "onCommand:csmscript.runScript"
]
```

> **语言扩展提示：** VSCode 1.74.0+ 中，插件自身贡献的命令（`contributes.commands`）无需手动声明 `onCommand`。

---

### onStartupFinished

VSCode 完成启动后的某个时刻触发（晚于 `*`，但比 `*` 对启动性能影响更小）。目前在所有 `*` 激活的插件完成激活后触发。

**语言扩展场景：** 适合后台索引、状态栏更新、欢迎页等非紧迫功能，无需等待用户打开文件。

```json
"activationEvents": [
  "onStartupFinished"
]
```

> **与 `*` 的区别：** `*` 会在启动时立即激活插件，可能拖慢启动速度；`onStartupFinished` 延迟到启动完成后，对用户体验友好。

---

### onDebug 系列

#### onDebug

调试会话启动前触发（粗粒度）：

```json
"activationEvents": [
  "onDebug"
]
```

#### onDebugInitialConfigurations

在调用 `DebugConfigurationProvider.provideDebugConfigurations` 方法生成初始配置（如创建 `launch.json`）前触发：

```json
"activationEvents": [
  "onDebugInitialConfigurations"
]
```

#### onDebugDynamicConfigurations

用户请求动态调试配置时触发（如通过 "Select and Start Debugging" 命令）：

```json
"activationEvents": [
  "onDebugDynamicConfigurations"
]
```

#### onDebugResolve

在调用 `DebugConfigurationProvider.resolveDebugConfiguration` 解析指定类型配置前触发（细粒度）：

```json
"activationEvents": [
  "onDebugResolve:node"
]
```

#### onDebugAdapterProtocolTracker

当指定类型的调试会话即将启动且可能需要调试协议追踪器时触发：

```json
"activationEvents": [
  "onDebugAdapterProtocolTracker:csmscript"
]
```

> **选型建议：**  
> - 激活开销小 → 使用 `onDebug`  
> - 激活开销大 → 根据实现的方法选择 `onDebugInitialConfigurations` 和/或 `onDebugResolve`

---

### onView

当指定 ID 的视图在 VSCode 侧边栏中展开时触发。内置视图不会触发此事件。

**语言扩展场景：** 适用于自定义的调用层次（Call Hierarchy）视图、符号大纲（Outline）扩展等。

```json
"activationEvents": [
  "onView:csmscriptCallHierarchy"
]
```

> **语言扩展提示：** VSCode 1.74.0+ 中，插件自身贡献的视图无需手动声明此事件。

---

### onWebviewPanel

当 VSCode 需要恢复指定 `viewType` 的 [Webview](https://code.visualstudio.com/api/extension-guides/webview) 时触发（如重启后恢复持久化 Webview）。

**语言扩展场景：** 如果语言插件提供了自定义预览面板（类似 Markdown 预览），重启 VSCode 后 VSCode 会通过此事件通知插件恢复面板。

```json
"activationEvents": [
  "onWebviewPanel:csmscriptPreview"
]
```

> **说明：** 初次创建 Webview 通常需要配合其他激活事件（如 `onCommand`）。

---

### onTaskType

当需要列出或解析指定类型的任务时触发：

```json
"activationEvents": [
  "onTaskType:csmscript"
]
```

> **语言扩展提示：** VSCode 1.76.0+ 中，插件自身贡献的任务类型无需手动声明此事件。

---

## 6. 其他事件详解（参考）

以下事件与新脚本语言支持的核心功能关联较低，按需参阅。

### onFileSystem

读取指定 scheme 的文件或文件夹时触发（常用于自定义文件系统提供者）：

```json
"activationEvents": [
  "onFileSystem:sftp"
]
```

---

### onUri

当插件专属的系统 URI 被打开时触发。URI 的 scheme 固定为 `vscode` 或 `vscode-insiders`，authority 必须是插件 ID，其余部分任意。

```json
"activationEvents": [
  "onUri"
]
```

示例（假设插件 ID 为 `vscode.git`）：

- `vscode://vscode.git/init`
- `vscode://vscode.git/clone?url=https%3A%2F%2Fgithub.com%2FMicrosoft%2Fvscode-vsce.git`
- `vscode-insiders://vscode.git/init`

---

### onCustomEditor

当 VSCode 需要创建指定 `viewType` 的[自定义编辑器](https://code.visualstudio.com/api/extension-guides/custom-editors)时触发：

```json
"activationEvents": [
  "onCustomEditor:catCustoms.pawDraw"
]
```

---

### onAuthenticationRequest

当其他插件通过 `authentication.getSession()` API 请求指定提供者 ID 的认证会话时触发：

```json
"activationEvents": [
  "onAuthenticationRequest:github"
]
```

---

### onEditSession

当使用指定 scheme 访问编辑会话时触发：

```json
"activationEvents": [
  "onEditSession:file"
]
```

---

### onSearch

在具有指定 scheme 的文件夹中发起搜索时触发：

```json
"activationEvents": [
  "onSearch:file"
]
```

---

### onOpenExternalUri

打开外部 URI（如 `http` 或 `https` 链接）时触发：

```json
"activationEvents": [
  "onOpenExternalUri"
]
```

---

### onNotebook

打开指定类型的 Notebook 文档时触发：

```json
"activationEvents": [
  "onNotebook:jupyter-notebook",
  "onNotebook:interactive"
]
```

---

### onRenderer

使用指定 Notebook 输出渲染器时触发：

```json
"activationEvents": [
  "onRenderer:ms-toolsai.jupyter-renderers"
]
```

---

### onTerminal 系列

#### onTerminal

打开具有指定 Shell 类型的终端时触发：

```json
"activationEvents": [
  "onTerminal:bash"
]
```

#### onTerminalProfile

启动指定终端配置文件时触发：

```json
"activationEvents": [
  "onTerminalProfile:terminalTest.terminal-profile"
]
```

#### onTerminalShellIntegration

具有指定 Shell 类型的终端完成 Shell 集成激活时触发：

```json
"activationEvents": [
  "onTerminalShellIntegration:bash"
]
```

---

### onWalkthrough

打开指定 ID 的演练（Walkthrough）时触发：

```json
"activationEvents": [
  "onWalkthrough:nodejsWelcome"
]
```

---

### onIssueReporterOpened

Issue 报告器被打开时触发（例如通过 **帮助 → 报告问题**）：

```json
"activationEvents": [
  "onIssueReporterOpened"
]
```

---

### onChatParticipant

调用指定聊天参与者时触发（用于 GitHub Copilot Chat 扩展）：

```json
"activationEvents": [
  "onChatParticipant:my-chat-participant"
]
```

---

### onLanguageModelTool

调用指定语言模型工具时触发：

```json
"activationEvents": [
  "onLanguageModelTool:my-language-model-tool"
]
```

---

### \*（启动时激活）

VSCode 启动时立即激活插件：

```json
"activationEvents": [
  "*"
]
```

> **注意：** 仅在没有其他激活事件组合能满足需求时才使用 `*`，以避免影响启动性能。  
> 一个插件可以同时监听多个激活事件，优先使用具体事件而非 `*`。

---

## 7. 最佳实践

1. **精准激活**：尽量使用最具体的激活事件，避免不必要地加载插件。
2. **优先使用 `onStartupFinished` 而非 `*`**：如果插件必须在启动后立刻可用但不需要在启动过程中激活，使用 `onStartupFinished` 可以减少对启动速度的影响。
3. **多事件组合**：一个插件可以声明多个激活事件，各事件相互独立，任意一个触发均会激活插件。
4. **导出 `activate` 和 `deactivate`**：
   - 插件**必须**从主模块导出 `activate()` 函数，激活事件触发时 VSCode 会调用它（且仅调用一次）。
   - 插件**应当**导出 `deactivate()` 函数以在 VSCode 关闭时执行清理操作；如果清理是异步的，必须返回 `Promise`。
5. **利用 1.74.0+ 的自动激活**：对于插件自身贡献的语言、命令、视图等，无需再手动添加对应的激活事件声明。

---

*参考：[Activation Events | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/activation-events)*
