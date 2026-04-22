# VSCode 插件能力概览（Extension Capabilities Overview）

> **来源：** [https://code.visualstudio.com/api/extension-capabilities/overview](https://code.visualstudio.com/api/extension-capabilities/overview)  
> **目的：** 了解 VSCode 插件可以做什么，为 CSMScript 插件功能选型提供参考。

---

## 目录

1. [概述](#1-概述)
2. [通用能力（Common Capabilities）](#2-通用能力common-capabilities)
3. [主题定制（Theming）](#3-主题定制theming)
4. [声明式语言功能（Declarative Language Features）](#4-声明式语言功能declarative-language-features)
5. [编程式语言功能（Programmatic Language Features）](#5-编程式语言功能programmatic-language-features)
6. [工作台扩展（Workbench Extensions）](#6-工作台扩展workbench-extensions)
7. [调试支持（Debugging）](#7-调试支持debugging)
8. [能力分类汇总表](#8-能力分类汇总表)
9. [对 CSMScript 插件的启示](#9-对-csmscript-插件的启示)

---

## 1. 概述

VSCode 的插件系统（Extension API）按能力领域划分为以下几大类别：

| 类别 | 核心能力 |
|------|---------|
| **通用能力** | 命令、配置、快捷键、通知、状态栏、进度条、数据存储等 |
| **主题定制** | 颜色主题、文件图标主题、产品图标主题 |
| **声明式语言功能** | 语法高亮、代码片段、语言配置（括号、缩进、注释等） |
| **编程式语言功能** | 代码补全、悬停提示、诊断、跳转定义、格式化、重构等 |
| **工作台扩展** | 自定义视图、Webview、自定义编辑器、树视图、活动栏等 |
| **调试支持** | 调试适配器协议（DAP）、断点、变量、调用栈等 |

> 💡 VSCode 官方建议：**能用声明式实现的功能，尽量不要用编程式**。声明式方式（如 TextMate Grammar、`.code-snippets`）更轻量、更稳定。

---

## 2. 通用能力（Common Capabilities）

这些能力几乎所有插件都会用到，与具体语言无关。

### 2.1 命令（Commands）

- 通过 `commands.registerCommand` 注册自定义命令
- 通过 `contributes.commands` 在命令面板（`Ctrl+Shift+P`）中暴露命令
- 可绑定到菜单项、快捷键、按钮等

**参考：** [Command Guide](https://code.visualstudio.com/api/extension-guides/command)

### 2.2 配置（Configuration）

- 在 `contributes.configuration` 中声明插件配置项
- 用户可在设置（Settings）中修改
- 通过 `workspace.getConfiguration()` 读取

### 2.3 快捷键（Keybindings）

- 在 `contributes.keybindings` 中绑定快捷键到命令
- 支持 `when` 条件表达式（如仅在特定语言文件中生效）

### 2.4 上下文菜单（Context Menus）

- 在 `contributes.menus` 中注册右键菜单项
- 支持编辑器上下文菜单、文件资源管理器菜单、编辑器标题栏菜单等

### 2.5 数据存储（Data Storage）

| 存储类型 | API | 作用域 | 持久化 |
|---------|-----|--------|-------|
| `ExtensionContext.workspaceState` | Memento | 工作区 | ✅ |
| `ExtensionContext.globalState` | Memento | 全局 | ✅ |
| `ExtensionContext.storageUri` | 文件系统 | 工作区 | ✅ |
| `ExtensionContext.globalStorageUri` | 文件系统 | 全局 | ✅ |
| `ExtensionContext.secrets` | SecretStorage | 全局 | ✅（加密） |

### 2.6 通知与对话框（Notifications & Dialogs）

```typescript
// 三种通知级别
vscode.window.showInformationMessage('信息');
vscode.window.showWarningMessage('警告');
vscode.window.showErrorMessage('错误');

// 带按钮的通知
const result = await vscode.window.showInformationMessage('确认？', '是', '否');

// 模态对话框
vscode.window.showWarningMessage('警告信息', { modal: true }, '确定');
```

### 2.7 快速选择（Quick Pick）

- `window.showQuickPick` — 从列表中选择一项
- `window.showInputBox` — 输入单行文本
- `window.createQuickPick` — 完全自定义的快速选择面板

### 2.8 进度条（Progress）

```typescript
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: '处理中...',
  cancellable: true
}, async (progress, token) => {
  // 执行耗时操作
});
```

支持在通知、状态栏、源代码管理视图等位置显示进度。

### 2.9 输出通道（Output Channel）

- `window.createOutputChannel` — 创建专属的输出面板
- 用于记录插件运行日志，便于调试

### 2.10 状态栏（Status Bar）

- `window.createStatusBarItem` — 在底部状态栏显示自定义内容
- 可绑定点击命令、设置颜色、显示图标

### 2.11 编辑器装饰（Editor Decorations）

- `window.createTextEditorDecorationType` — 高亮代码行/文字，添加行内文字或图标
- 常见用例：错误下划线、Git 变更指示、代码覆盖率显示

---

## 3. 主题定制（Theming）

| 主题类型 | 说明 | 参考文档 |
|---------|------|---------|
| **颜色主题（Color Theme）** | 自定义编辑器及 UI 的颜色方案 | [Color Theme Guide](https://code.visualstudio.com/api/extension-guides/color-theme) |
| **文件图标主题（File Icon Theme）** | 自定义文件资源管理器中的文件图标 | [File Icon Theme Guide](https://code.visualstudio.com/api/extension-guides/file-icon-theme) |
| **产品图标主题（Product Icon Theme）** | 自定义 VSCode UI 中的内置图标（活动栏、状态栏等） | [Product Icon Theme Guide](https://code.visualstudio.com/api/extension-guides/product-icon-theme) |

> 主题插件通常**不需要激活代码**，完全通过 `package.json` 中的 `contributes` 字段声明即可工作。

---

## 4. 声明式语言功能（Declarative Language Features）

无需编写激活代码，仅通过 `package.json` 和相关配置文件即可实现。

### 4.1 语言定义（Language Definition）

在 `contributes.languages` 中注册新语言，声明：
- 语言 ID（唯一标识符）
- 文件扩展名（`extensions`）
- 文件名（`filenames`）
- 文件名匹配模式（`filenamePatterns`）
- 注释符号、括号配对等

### 4.2 语法高亮（Syntax Highlighting）

- 使用 **TextMate Grammar**（`.tmLanguage` 或 `.tmLanguage.json`）
- 在 `contributes.grammars` 中注册
- 将语法规则映射为作用域（scope），由颜色主题决定颜色

**参考：** [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

### 4.3 代码片段（Snippets）

- 使用 `.code-snippets` JSON 文件定义模板
- 在 `contributes.snippets` 中注册
- 支持 Tab 占位符（`$1`, `$2`）、变量（`$TM_FILENAME`）、选择列表

**参考：** [Snippet Guide](https://code.visualstudio.com/api/language-extensions/snippet-guide)

### 4.4 语言配置（Language Configuration）

通过 `contributes.languages[].configuration` 关联配置文件，可声明：

| 配置项 | 说明 |
|--------|------|
| `comments` | 行注释符 / 块注释符 |
| `brackets` | 括号配对（影响自动缩进和括号高亮） |
| `autoClosingPairs` | 自动补全括号/引号 |
| `surroundingPairs` | 选中内容后输入括号时自动包裹 |
| `folding` | 折叠标记（`markers` 指定折叠起止标记） |
| `wordPattern` | 定义"单词"的正则表达式 |
| `indentationRules` | 自动缩进规则 |

**参考：** [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide)

---

## 5. 编程式语言功能（Programmatic Language Features）

需要编写 TypeScript/JavaScript 代码，通过实现各种 **Provider 接口** 向 VSCode 注册能力。  
对于复杂场景，推荐使用 **Language Server Protocol（LSP）** 将语言逻辑拆分到独立进程。

### 5.1 功能一览

| 功能 | Provider 接口 | 说明 |
|------|--------------|------|
| **悬停提示（Hover）** | `HoverProvider` | 鼠标悬停时显示文档/类型信息 |
| **代码补全（Completion）** | `CompletionItemProvider` | IntelliSense 自动补全 |
| **签名帮助（Signature Help）** | `SignatureHelpProvider` | 函数调用时显示参数提示 |
| **跳转定义（Go to Definition）** | `DefinitionProvider` | `F12` 跳转到定义 |
| **跳转实现（Go to Implementation）** | `ImplementationProvider` | 跳转到接口实现 |
| **跳转类型定义（Go to Type Definition）** | `TypeDefinitionProvider` | 跳转到类型定义 |
| **查找引用（Find References）** | `ReferenceProvider` | 查找所有引用 |
| **文档符号（Document Symbols）** | `DocumentSymbolProvider` | 文件大纲（Outline）、符号列表 |
| **工作区符号（Workspace Symbols）** | `WorkspaceSymbolProvider` | 全局符号搜索（`Ctrl+T`） |
| **代码操作（Code Actions）** | `CodeActionProvider` | 快速修复（`Ctrl+.`）、重构建议 |
| **代码诊断（Diagnostics）** | `DiagnosticCollection` | 错误/警告下划线标注 |
| **文档格式化（Formatting）** | `DocumentFormattingEditProvider` | 格式化整个文档（`Shift+Alt+F`） |
| **范围格式化（Range Formatting）** | `DocumentRangeFormattingEditProvider` | 格式化选中区域 |
| **输入时格式化（On-Type Formatting）** | `OnTypeFormattingEditProvider` | 输入特定字符时触发格式化 |
| **重命名（Rename）** | `RenameProvider` | 重命名符号（`F2`） |
| **折叠范围（Folding Range）** | `FoldingRangeProvider` | 自定义代码折叠 |
| **颜色选择器（Color）** | `DocumentColorProvider` | 颜色预览与选择器 |
| **链接（Links）** | `DocumentLinkProvider` | 文档中的可点击链接 |
| **选中高亮（Document Highlight）** | `DocumentHighlightProvider` | 高亮当前符号的所有出现位置 |
| **内联提示（Inlay Hints）** | `InlayHintsProvider` | 在代码行内显示额外信息（如类型注解） |
| **语义着色（Semantic Tokens）** | `DocumentSemanticTokensProvider` | 比 TextMate Grammar 更精准的语义高亮 |

**参考：** [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)

### 5.2 Language Server Protocol（LSP）

对于功能丰富的语言插件，推荐将上述逻辑移入 Language Server：

- **优点：** 独立进程，不阻塞 UI；可复用于多个编辑器；崩溃不影响编辑器
- **客户端：** `vscode-languageclient`（在插件中运行）
- **服务端：** `vscode-languageserver`（在独立 Node.js 进程中运行）

**参考：** [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 6. 工作台扩展（Workbench Extensions）

### 6.1 树视图（Tree View）

- 在侧边栏或面板中创建自定义树形视图
- 实现 `TreeDataProvider` 接口
- 在 `contributes.views` 中注册视图容器

**参考：** [Tree View Guide](https://code.visualstudio.com/api/extension-guides/tree-view)

### 6.2 Webview

- 在编辑器区域嵌入完整的 HTML/CSS/JS 网页
- 适合复杂的自定义 UI（预览面板、可视化工具等）
- 通过消息传递与插件主进程通信

**参考：** [Webview Guide](https://code.visualstudio.com/api/extension-guides/webview)

### 6.3 自定义编辑器（Custom Editor）

- 为特定文件类型提供自定义的编辑界面（替代默认文本编辑器）
- 适合二进制文件、图形化编辑场景
- 分为 **Custom Text Editor**（文本格式）和 **Custom Editor**（任意格式）

**参考：** [Custom Editor Guide](https://code.visualstudio.com/api/extension-guides/custom-editors)

### 6.4 虚拟文档（Virtual Documents）

- 通过 `TextDocumentContentProvider` 提供只读的虚拟文件
- 用于显示生成内容（如反编译结果、AST 展示等）

### 6.5 任务（Tasks）

- 在 `contributes.taskDefinitions` 中定义自定义任务类型
- 实现 `TaskProvider` 让 VSCode 自动发现和运行任务

**参考：** [Task Provider Guide](https://code.visualstudio.com/api/extension-guides/task-provider)

### 6.6 源代码管理（SCM）

- 通过 `SourceControl` API 集成自定义版本控制系统
- 控制资源状态（修改、暂存等）和操作

### 6.7 测试（Testing）

- 通过 `TestController` API 在 VSCode 测试视图中集成测试框架
- 支持测试发现、运行、结果展示

**参考：** [Testing Extensions](https://code.visualstudio.com/api/extension-guides/testing)

---

## 7. 调试支持（Debugging）

VSCode 提供两个层次的调试扩展接入方式：

### 7.1 调试适配器协议（Debug Adapter Protocol, DAP）

- 通过实现 **Debug Adapter** 接入任意调试后端
- 调试适配器运行在独立进程，通过 DAP 与 VSCode 通信
- 在 `contributes.debuggers` 中注册

**参考：** [Debugger Extension Guide](https://code.visualstudio.com/api/extension-guides/debugger-extension)

### 7.2 断点（Breakpoints）

- 通过 `contributes.breakpoints` 声明支持断点的语言类型

### 7.3 调试 API

| API | 说明 |
|-----|------|
| `debug.startDebugging` | 以编程方式启动调试会话 |
| `debug.onDidStartDebugSession` | 监听调试会话开始事件 |
| `debug.activeDebugSession` | 获取当前活跃调试会话 |
| `DebugConfigurationProvider` | 动态生成或修改调试配置 |

---

## 8. 能力分类汇总表

| 能力 | 实现方式 | 复杂度 | 对 CSMScript 的价值 |
|------|---------|--------|---------------------|
| 语法高亮 | TextMate Grammar（声明式） | ⭐⭐ | ⭐⭐⭐⭐⭐ 必做 |
| 语言配置 | `.json` 配置文件（声明式） | ⭐ | ⭐⭐⭐⭐⭐ 必做 |
| 代码片段 | `.code-snippets`（声明式） | ⭐ | ⭐⭐⭐⭐ 推荐 |
| 自定义命令 | `commands.registerCommand` | ⭐⭐ | ⭐⭐⭐ 可选 |
| 代码补全 | `CompletionItemProvider` | ⭐⭐⭐ | ⭐⭐⭐⭐ 推荐 |
| 悬停提示 | `HoverProvider` | ⭐⭐ | ⭐⭐⭐⭐ 推荐 |
| 代码诊断 | `DiagnosticCollection` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 代码格式化 | `DocumentFormattingEditProvider` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 跳转定义 | `DefinitionProvider` | ⭐⭐⭐ | ⭐⭐⭐ 可选 |
| 语言服务器（LSP） | `vscode-languageserver` | ⭐⭐⭐⭐⭐ | ⭐⭐ 后期可选 |
| 树视图 | `TreeDataProvider` | ⭐⭐⭐ | ⭐⭐ 可选 |
| Webview | HTML/CSS/JS | ⭐⭐⭐⭐ | ⭐ 暂不需要 |
| 调试支持 | DAP | ⭐⭐⭐⭐⭐ | ⭐ 暂不需要 |
| 颜色主题 | `.json` 声明（声明式） | ⭐ | ⭐ 可选 |

---

## 9. 对 CSMScript 插件的启示

根据 Extension Capabilities Overview 的分类，为 CSMScript 语言支持插件建议以下**分阶段实施路径**：

### 第一阶段：最小可用插件（声明式，无代码）

1. **语言定义** — 注册 CSMScript 语言 ID 和文件扩展名
2. **语法高亮** — 编写 TextMate Grammar，高亮关键字、字符串、注释等
3. **语言配置** — 配置括号、注释符号、自动缩进规则
4. **代码片段** — 提供常用 CSMScript 代码模板

> 以上内容**无需编写 TypeScript 代码**，仅通过配置文件即可完成，适合快速发布 v0.1.0。

### 第二阶段：增强智能提示（编程式）

5. **代码补全** — 补全 CSMScript 内置关键字、API、状态名称
6. **悬停提示** — 显示关键字或 API 的说明文档
7. **代码诊断** — 基础语法错误检测

### 第三阶段：深度集成（可选）

8. **跳转定义 / 查找引用** — 支持 CSMScript 状态机符号导航
9. **代码格式化** — 统一 CSMScript 代码风格
10. **语言服务器（LSP）** — 将语言逻辑迁移到独立 Language Server，提升性能与可维护性

---

## 参考资料

| 资源 | 链接 |
|------|------|
| Extension Capabilities Overview | https://code.visualstudio.com/api/extension-capabilities/overview |
| Common Capabilities | https://code.visualstudio.com/api/extension-capabilities/common-capabilities |
| Theming | https://code.visualstudio.com/api/extension-capabilities/theming |
| Declarative Language Features | https://code.visualstudio.com/api/language-extensions/overview |
| Programmatic Language Features | https://code.visualstudio.com/api/language-extensions/programmatic-language-features |
| Extending the Workbench | https://code.visualstudio.com/api/extension-capabilities/extending-workbench |
| Debugger Extension Guide | https://code.visualstudio.com/api/extension-guides/debugger-extension |

---

*文档创建日期：2026-03-06*  
*如有讨论，请在对应 Issue 或 PR 中留言。*
