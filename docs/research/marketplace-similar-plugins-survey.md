# VSCode Marketplace 同类插件调研报告

> 本文档对应开发计划中 **阶段一·调研** 的子任务：在 [VSCode Marketplace](https://marketplace.visualstudio.com/vscode) 搜索同类插件，了解实现思路。  
> 调研目标：为 CSMScript VSCode 插件的开发提供参考，涵盖功能对比、技术实现方式与选型建议。  
> **相关文档：** [VSCode 插件开发完整计划](../plan/vscode-extension-development-plan.md)

---

## 目录

1. [搜索关键词与范围](#1-搜索关键词与范围)
2. [同类插件清单](#2-同类插件清单)
   - [2.1 状态机 / 工作流类](#21-状态机--工作流类)
   - [2.2 图表 / 可视化 DSL 类](#22-图表--可视化-dsl-类)
   - [2.3 通用 DSL / 自定义语言类](#23-通用-dsl--自定义语言类)
3. [实现方式横向对比](#3-实现方式横向对比)
4. [关键技术点归纳](#4-关键技术点归纳)
5. [对 CSMScript 插件的启示与建议](#5-对-csmscript-插件的启示与建议)
6. [参考资料](#6-参考资料)

---

## 1. 搜索关键词与范围

在 [VSCode Marketplace](https://marketplace.visualstudio.com/vscode) 及 GitHub 上以如下关键词进行搜索：

| 关键词 | 说明 |
|--------|------|
| `state machine` | 状态机相关插件 |
| `DSL language support` | 领域特定语言支持 |
| `custom language` / `grammar` | 自定义语言 / TextMate 语法 |
| `diagram` / `PlantUML` / `Mermaid` | 文本描述型图表语言 |
| `scripting language support` | 脚本语言支持插件 |

---

## 2. 同类插件清单

### 2.1 状态机 / 工作流类

#### XState VSCode（`statelyai.stately-vscode`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=statelyai.stately-vscode |
| 开源仓库 | https://github.com/statelyai/xstate-vscode |
| 核心功能 | 可视化状态机编辑器、状态/迁移的 IntelliSense、跳转定义、代码片段、实时类型生成 |
| 实现方式 | 自定义 WebView Panel（可视化编辑器）+ 编程式 API（CompletionItemProvider、DefinitionProvider）|
| 语言服务 | 内置 Language Server（TypeScript 实现），通过 LSP 提供诊断和补全 |
| 适用场景 | XState（JavaScript/TypeScript 状态机库）的编辑器支持 |

**对 CSMScript 的参考价值：**
- CSMScript 同样是状态机脚本语言，XState VSCode 的整体架构（语言服务 + 可视化面板）值得重点参考。
- 其 `StateChart` 可视化面板的实现方式（VSCode WebView API + 双向同步）展示了如何将文本编辑与图形可视化结合。

---

#### PlatformIO IDE（`platformio.platformio-ide`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide |
| 核心功能 | 嵌入式开发工具，内置项目管理、构建、上传、串口监视 |
| 实现方式 | Python Language Server + 自定义 Activity Bar + Terminal Provider |
| 适用场景 | 物联网 / 嵌入式（常见状态机模式场景） |

**对 CSMScript 的参考价值：** 展示了如何将外部工具链（非 JavaScript/TypeScript）集成进 VSCode 插件。

---

### 2.2 图表 / 可视化 DSL 类

图表类插件提供"**文本 → 预览**"的开发范式，与 CSMScript 的文本脚本 → 状态机图形预览需求高度相似。

#### PlantUML（`jebbs.plantuml`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml |
| 开源仓库 | https://github.com/qjebbs/vscode-plantuml |
| 核心功能 | 实时预览（WebView）、导出（PNG/SVG/PDF）、代码片段、语法高亮 |
| 实现方式 | TextMate Grammar（语法高亮）+ WebView（预览）+ 子进程调用（Java/PlantUML Server）|
| 语法高亮 | `.tmLanguage.json` 正则规则 |

**对 CSMScript 的参考价值：**
- **文本编辑 → 实时预览** 模式：可借鉴其 WebView 刷新与节流（debounce）策略。
- **外部渲染器集成**：通过 `child_process` 调用外部进程进行渲染的方式，可参考用于调用 CSMScript 解析器。

---

#### Mermaid 系列

| 插件 | Marketplace 链接 | 核心功能 |
|------|-----------------|---------|
| Markdown Preview Mermaid Support（`bierner.markdown-mermaid`）| https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid | 在 Markdown 预览中渲染 Mermaid 图表 |
| Mermaid Chart（`MermaidChart.vscode-mermaid-chart`）| https://marketplace.visualstudio.com/items?itemName=MermaidChart.vscode-mermaid-chart | 官方插件，支持 AI 辅助生成、实时预览 |

**对 CSMScript 的参考价值：**
- Mermaid 支持 `stateDiagram-v2` 语法，其语法高亮的 TextMate Grammar 文件可作为**状态机 DSL 语法规则**的直接参考。
- `bierner.markdown-mermaid` 的源码展示了如何通过 Markdown 扩展点注入自定义预览渲染器。

---

#### Draw.io Integration（`hediet.vscode-drawio`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio |
| 开源仓库 | https://github.com/hediet/vscode-drawio |
| 核心功能 | 将 `.drawio` / `.svg` 文件作为 GUI 图形编辑器打开（Custom Editor API）|
| 实现方式 | **Custom Editor Provider**（`vscode.CustomTextEditorProvider`）+ WebView |

**对 CSMScript 的参考价值：**
- 如果后期需要支持**可视化编辑 `.csms` 文件**（图形 ↔ 文本双向同步），Draw.io Integration 的 Custom Editor Provider 实现是最直接的参考案例。

---

### 2.3 通用 DSL / 自定义语言类

#### Assorted Languages（`EdwinKofler.vscode-assorted-languages`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=EdwinKofler.vscode-assorted-languages |
| 核心功能 | 为多种小众/DSL 文件类型提供语法高亮 |
| 实现方式 | 纯声明式：多个 `.tmLanguage.json` + `package.json` 贡献点声明 |

**对 CSMScript 的参考价值：** 展示了**纯声明式插件**（无 TypeScript 代码）的最精简实现方式，适合作为 CSMScript 插件的第一个可运行版本的参考。

---

#### DslLang（`dsl.dsl-lang`）

| 项目 | 说明 |
|------|------|
| Marketplace 链接 | https://marketplace.visualstudio.com/items?itemName=dsl.dsl-lang |
| 核心功能 | XML、Solidity 等 DSL 文件的语法高亮与可视化编辑 |
| 实现方式 | TextMate Grammar + 自定义 WebView |

---

## 3. 实现方式横向对比

| 实现方式 | 代表插件 | 语法高亮 | 代码片段 | 补全/Hover | 诊断 | 跳转定义 | 可视化预览 | 复杂度 |
|---------|---------|:-------:|:-------:|:---------:|:---:|:-------:|:---------:|:-----:|
| 纯声明式（Grammar + snippets）| Assorted Languages | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⭐ |
| 声明式 + WebView 预览 | PlantUML, Mermaid | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⭐⭐ |
| 编程式（内联 Provider）| 轻量 IntelliSense 插件 | ✅ | ✅ | ✅ | 部分 | 部分 | ❌ | ⭐⭐⭐ |
| LSP（Language Server Protocol）| XState VSCode | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⭐⭐⭐⭐ |
| LSP + Custom Editor / WebView | XState VSCode, Draw.io | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |

---

## 4. 关键技术点归纳

### 4.1 语法高亮（TextMate Grammar）

- 所有同类插件均使用 TextMate Grammar（`.tmLanguage.json`）实现语法高亮。
- **调试工具**：使用 VSCode 内置的 `Developer: Inspect Editor Tokens and Scopes` 命令（即 Scope Inspector）验证 Token 着色是否正确。
- **测试工具**：[vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test) 支持对 Grammar 做快照测试。

### 4.2 实时预览（WebView）

- 实现 `vscode.window.createWebviewPanel`，监听文本变更事件，通过 `postMessage` 将最新文本内容传入 WebView，由前端渲染。
- 节流策略：避免每次击键都重新渲染，通常使用 200–500 ms 的 debounce。
- 参考实现：[PlantUML 预览源码](https://github.com/qjebbs/vscode-plantuml)

### 4.3 语言服务器（LSP）

- 对于需要**语义级别**功能（补全、悬停、诊断、跳转）的场景，推荐使用 LSP 架构。
- 使用 `vscode-languageserver` 和 `vscode-languageclient` 两个 npm 包。
- 语言服务器可以用任意语言实现（TypeScript、Python、Java 等），便于复用 CSMScript 的现有解析逻辑。
- 参考：[Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

### 4.4 代码片段（Snippets）

- 以 `.code-snippets` 文件（JSON 格式）声明，与语言 ID 绑定后自动在 IntelliSense 中显示。
- 所有调研的插件均提供代码片段，是**用户体验提升最快、实现成本最低**的功能点。

### 4.5 Custom Editor（双向同步编辑）

- 通过 `vscode.CustomTextEditorProvider` 注册自定义编辑器，可实现图形编辑器与文本文件的**双向同步**。
- 参考实现：[Draw.io Integration](https://github.com/hediet/vscode-drawio)

---

## 5. 对 CSMScript 插件的启示与建议

### 推荐分阶段实现

| 阶段 | 功能 | 技术方案 | 参考插件 |
|------|------|---------|---------|
| **v0.1**（最小可用版本）| 语法高亮 + 代码片段 + 语言配置 | 纯声明式（Grammar + snippets）| Assorted Languages |
| **v0.2** | 状态机图预览 | WebView Panel + 文本解析 | PlantUML, Mermaid |
| **v0.3** | IntelliSense（补全 + Hover）| 内联 Provider 或轻量 LSP | XState VSCode |
| **v1.0** | 完整语言服务（诊断、跳转）| LSP（TypeScript 或复用现有解析器）| XState VSCode |
| **v1.x**（可选）| 可视化双向编辑 | Custom Editor + WebView | Draw.io Integration |

### 核心建议

1. **优先交付 v0.1**：仅需 `package.json` + TextMate Grammar + snippets 文件，无需 TypeScript 代码，即可发布至 Marketplace，快速收集用户反馈。
2. **Grammar 参考 Mermaid StateDiagram**：[mermaid-vscode 的 Grammar](https://github.com/mermaid-js/mermaid) 中包含状态机语法规则，可直接参考并改造用于 CSMScript。
3. **预览优先于 LSP**：状态机的核心价值在于可视化，建议 v0.2 的实时预览功能优先于 v0.3 的 IntelliSense。
4. **复用现有解析器**：如果 CSMScript 已有解析器（任意语言），可通过 LSP 架构在语言服务器进程中复用，避免在 TypeScript 中重写解析逻辑。

---

## 6. 参考资料

| 资源 | 链接 |
|------|------|
| VSCode Marketplace | https://marketplace.visualstudio.com/vscode |
| XState VSCode 插件 | https://marketplace.visualstudio.com/items?itemName=statelyai.stately-vscode |
| PlantUML 插件 | https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml |
| Mermaid Chart 插件 | https://marketplace.visualstudio.com/items?itemName=MermaidChart.vscode-mermaid-chart |
| Draw.io Integration 插件 | https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio |
| Assorted Languages 插件 | https://marketplace.visualstudio.com/items?itemName=EdwinKofler.vscode-assorted-languages |
| VSCode Syntax Highlight Guide | https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide |
| VSCode Language Server Guide | https://code.visualstudio.com/api/language-extensions/language-server-extension-guide |
| VSCode WebView API | https://code.visualstudio.com/api/extension-guides/webview |
| VSCode Custom Editor API | https://code.visualstudio.com/api/extension-guides/custom-editors |
| vscode-tmgrammar-test | https://github.com/PanAeon/vscode-tmgrammar-test |
| vscode-extension-samples | https://github.com/microsoft/vscode-extension-samples |

---

*文档创建日期：2026-03-06*  
*如有补充或讨论，请在对应 Issue 中留言。*
