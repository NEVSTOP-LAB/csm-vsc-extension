# 代码库架构说明

> 本文档以中文详细介绍 **CSMScript VSCode 支持** 扩展的仓库结构、技术选型和代码组织方式，帮助贡献者快速理解整个项目。

---

## 目录

1. [项目定位](#1-项目定位)
2. [仓库目录结构](#2-仓库目录结构)
3. [关键技术栈](#3-关键技术栈)
4. [源代码组织（src/）](#4-源代码组织src)
5. [配置与静态资源](#5-配置与静态资源)
6. [构建系统](#6-构建系统)
7. [测试体系](#7-测试体系)
8. [CI/CD 流水线](#8-cicd-流水线)
9. [文档体系（docs/）](#9-文档体系docs)
10. [数据流与各模块协作关系](#10-数据流与各模块协作关系)

---

## 1. 项目定位

**csm-vsc-support** 是一个 Visual Studio Code 语言扩展，当前聚焦为 CSM 生态中的 `.csmlog` 与 `.lvcsm` 文件提供编辑器支持。

### 当前支持范围

当前代码库中，扩展主要提供以下能力：

- `.csmlog`：语法高亮、悬停提示、大纲（Outline）
- `.lvcsm`：基于 `source.ini` 的 INI 语法高亮

### 扩展提供的能力

| 功能 | 状态 |
|------|------|
| `.csmlog` 语法高亮 | ✅ |
| `.csmlog` 悬停提示 | ✅ |
| `.csmlog` Outline | ✅ |
| `.lvcsm` 语言支持 | ✅ |
| `.csmscript` 语言注册 | ❌（当前未注册） |

---

## 2. 仓库目录结构

```
CSMSript-vsc-Support/
├── .github/
│   └── workflows/
│       ├── ci.yml                        # GitHub Actions CI 流水线
│       └── create-tracking-issues.yml    # 自动创建追踪 Issue 的工作流
│
├── .vscode/
│   ├── launch.json                       # 调试配置（F5 启动 Extension Host）
│   ├── tasks.json                        # 构建任务
│   ├── settings.json                     # 工作区设置
│   └── extensions.json                   # 推荐安装的扩展
│
├── docs/                                 # 全部文档（设计、调研、计划、架构）
│   ├── design/
│   │   ├── m1-language-definition-design.md  # M1 语言定义设计文档
│   │   ├── csmlog-support-design.md          # .csmlog 语法与语义设计文档
│   │   ├── csmlog-hover-design.md            # .csmlog 悬停提示设计文档
│   │   └── flow-visualization-design.md      # 流程可视化设计文档
│   ├── plan/
│   │   └── vscode-extension-development-plan.md  # 开发计划（M0–M4 里程碑）
│   ├── research/                         # 调研报告（5 篇）
│   ├── ARCHITECTURE.md                   # 本文档
│   ├── CSMScript_User_Manual.md          # CSMScript 语言规范手册
│   ├── SWIMLANE_CHANGES.md               # 泳道图功能变更日志
│   ├── hover-keyword-tracking.md         # Hover 关键字覆盖追踪表
│   ├── images-guide.md                   # 扩展图标规格与替换指南
│   ├── quickstart.md                     # VS Code 生成的快速入门文档
│   ├── vscode-activation-events.md       # VS Code 激活事件说明
│   └── vscode-contribution-points-summary.md  # Contribution Points 汇总
│
├── images/
│   └── icon.png                          # 扩展图标（128×128）
│
├── samples/
│   ├── manual-full-coverage.csmscript    # 手动测试样例（覆盖全部语法模式）
│   ├── include-sequence.csmscript        # `<include>` 子样例
│   └── swimlane-demo.csmscript           # 泳道图演示样例
│
├── snippets/
│   └── csmscript.code-snippets           # 代码片段定义
│
├── syntaxes/
│   ├── csmscript.tmLanguage.json         # TextMate 语法规则
│   └── csmlog.tmLanguage.json            # .csmlog 文件语法规则
│
├── src/                                  # TypeScript 源代码（见第 4 节）
│   ├── extension.ts                      # 扩展入口
│   ├── types.ts                          # 共享类型定义
│   ├── hoverData.ts                      # 共享悬停数据库和查找逻辑
│   ├── hoverProvider.ts                  # CSMScript 悬停文档提供者
│   ├── csmlogHoverProvider.ts            # .csmlog 悬停文档提供者
│   ├── completionProvider.ts             # IntelliSense 补全提供者
│   ├── diagnosticProvider.ts             # 语法诊断提供者
│   ├── documentSymbolProvider.ts         # 大纲视图提供者
│   ├── csmlogDocumentSymbolProvider.ts   # .csmlog 大纲视图提供者
│   ├── formattingProvider.ts             # 代码格式化提供者
│   ├── flowParser.ts                     # CSMScript → FlowGraph 解析器（流程图）
│   ├── mermaidGenerator.ts               # FlowGraph → Mermaid flowchart 生成器
│   ├── swimlaneParser.ts                 # CSMScript → SwimlaneGraph 解析器（通讯泳道图）
│   ├── swimlaneGenerator.ts              # SwimlaneGraph → Mermaid sequenceDiagram 生成器
│   ├── flowVisualizationPanel.ts         # 流程可视化 Webview 面板（流程图 + 泳道图）
│   └── test/                             # 单元测试与集成测试
│       └── fixtures/                     # 测试数据文件
│
├── .vscode-test.mjs                      # VSCode 测试运行器配置
├── .vscodeignore                         # 打包时排除的文件
├── .gitignore
├── CHANGELOG.md                          # 版本更新日志（中文）
├── CONTRIBUTING.md                       # 贡献指南
├── README.md                             # 项目主文档（中文）
├── esbuild.js                            # ESBuild 打包脚本
├── eslint.config.mjs                     # ESLint 配置
├── language-configuration.json           # VS Code 语言配置（注释、括号等）
├── package.json                          # NPM 清单 + VS Code 扩展贡献点
├── package-lock.json
└── tsconfig.json                         # TypeScript 编译配置
```

---

## 3. 关键技术栈

### 3.1 核心语言与运行时

| 技术 | 版本 | 用途 |
|------|------|------|
| **TypeScript** | 5.9.3 | 所有源码，开启严格模式（`strict: true`） |
| **Node.js** | 18+ | 扩展运行时（CommonJS 格式） |
| **VS Code Extension API** | 1.60.0+ | 语言特性集成（Hover/Completion/Diagnostic） |

TypeScript 编译目标为 **ES2022**，模块解析模式为 **Node16**。

### 3.2 构建与打包

| 工具 | 版本 | 用途 |
|------|------|------|
| **ESBuild** | 0.27.3 | 生产打包（快速、支持 Tree-shaking、source map） |
| **tsc** | （随 TypeScript） | 类型检查（`--noEmit`）及测试代码编译 |
| **npm-run-all** | 4.1.5 | 并行执行多个 watch 任务 |

打包入口：`src/extension.ts` → 输出：`dist/extension.js`（生产模式启用压缩，开发模式生成 source map）。

### 3.3 代码质量

| 工具 | 版本 | 用途 |
|------|------|------|
| **ESLint** | 9.39.3 | 代码风格与质量检查 |
| **typescript-eslint** | 8.56.1 | TypeScript 专属 lint 规则（命名规范、禁止 throw 字面量等） |

### 3.4 测试框架

| 工具 | 版本 | 用途 |
|------|------|------|
| **Mocha** | （内置于 @vscode/test-cli） | TDD 风格测试框架 |
| **@vscode/test-cli** | 0.0.12 | 命令行测试运行器配置 |
| **@vscode/test-electron** | 2.5.2 | 在真实 VS Code 进程中运行集成测试 |

### 3.5 语法高亮

TextMate 语法规则（`syntaxes/csmscript.tmLanguage.json`）是一个 **JSON 格式的 TextMate 语法文件**，通过正则表达式匹配 token 并分配 scope 名称，VS Code 据此进行颜色渲染。这是 VS Code 语言扩展中最常见的语法高亮方案，无需运行时代码。

---

## 4. 源代码组织（src/）

### 4.1 extension.ts — 扩展入口

扩展被激活时，VS Code 调用 `activate(context)` 函数。该函数负责：

1. **注册 HoverProvider（CSMScript）** — 为 `.csmscript` 文件提供悬停文档说明
2. **注册 HoverProvider（CSMLog）** — 为 `.csmlog` 文件提供日志字段悬停说明，并将内容区委托给 CSMScript HoverProvider
3. **注册 CompletionProvider** — 监听触发字符（`<` `[` `>` `$` `?`）并提供补全建议
4. **注册 FormattingProvider** — 提供文档格式化功能（`Shift+Alt+F`）
5. **注册流程可视化命令** — 注册 `csmscript.showFlowVisualization` 命令及编辑器标题栏按钮，调用 `FlowVisualizationPanel.createOrShow()`
6. **注册 DocumentSymbolProvider** — 为 `.csmscript` 文件提供大纲视图（Outline），列出预定义段头（`[COMMAND_ALIAS]` 等，以 Array 图标（`[]`）显示）和锚点定义（`<entry>` 等，以 Function 图标显示）
7. **创建 DiagnosticCollection** — 用于向编辑器报告语法错误
8. **监听文档事件** — 在文档打开、修改、关闭时触发语法诊断

```
activate(context)
 ├── registerHoverProvider('csmscript', CSMScriptHoverProvider)
 ├── registerHoverProvider('csmlog',    CSMLogHoverProvider)
 ├── registerCompletionItemProvider('csmscript', CSMScriptCompletionProvider, '<','[','>','$','?')
 ├── registerDocumentFormattingEditProvider('csmscript', CSMScriptFormattingProvider)
 ├── registerCommand('csmscript.showFlowVisualization', FlowVisualizationPanel.createOrShow)
 ├── registerDocumentSymbolProvider('csmscript', CSMScriptDocumentSymbolProvider)
 ├── createDiagnosticCollection('csmscript')
 └── onDidOpen/Change/Close → updateDiagnostics()
```

### 4.2 hoverProvider.ts — CSMScript 悬停文档

**核心类**：`CSMScriptHoverProvider`，实现 `vscode.HoverProvider` 接口。

**数据结构**：内部维护一张静态字典 `HOVER_DB: Record<string, HoverEntry>`，收录关键字条目，每条包含：
- `summary`：关键字的简要说明
- `detail`：更完整的详细说明（Markdown 格式）

**工作流程**：
1. 用户将鼠标悬停在某个 token 上
2. `provideHover()` 根据当前光标所在的单词查询 `HOVER_DB`
3. 若命中关键字条目，则返回对应的 Hover 文档（通常包含简要说明和详细说明）
4. 若为锚点名称（`<anchorName>`，非内置关键字），调用 `findAnchorInDocument()` 定位定义位置，并通过 `buildAnchorHover()` 构建包含行号和行内注释的 Hover 文档

**覆盖的关键字类别**：

| 类别 | 示例 |
|------|------|
| 通信操作符 | `-@`、`->`、`->|` |
| 控制流 | `if`、`while`、`foreach`、`else`、`end_if` 等 |
| 内置命令 | `GOTO`、`WAIT`、`ECHO`、`EXPRESSION`、`RANDOM` |
| 变量与操作符 | `${...}`、`∈`、`!∈`、`??`、`?expr?` |
| 系统状态 | `Response`、`Async Response`、`Error Handler` 等 |

### 4.2.1 csmlogHoverProvider.ts — CSMLog 悬停文档

**核心类**：`CSMLogHoverProvider`，实现 `vscode.HoverProvider` 接口，注册于 `language: 'csmlog'`。

**设计理念**：按"区域（zone）"解析日志行，根据光标落在哪个区域返回对应的悬停说明：

```
2026/03/20 17:32:59.425 [17:32:59.425] [State Change] AI | Macro: Initialize
|←── zone 1 (date ts) ─→||←── zone 2 ──→||←─ zone 3 ─→||←4→||←── zone 5 ──→|
```

| 区域 | 内容 | 悬停来源 |
|------|------|---------|
| Zone 1 | 完整时间戳（日志处理时间） | `CSMLOG_HOVER_DB['__TIMESTAMP_DATE__']` |
| Zone 2 | 相对时间戳（事件源时间） | `CSMLOG_HOVER_DB['__TIMESTAMP_TIME__']` |
| Zone 3 | 事件类型 `[EventType]` | `CSMLOG_HOVER_DB['[EVENT TYPE]']`（12 种） |
| Zone 4 | 模块名 | 无悬停 |
| Zone 5 | 日志内容（`\|` 之后） | 委托给 `CSMScriptHoverProvider` |

**额外支持**：
- 配置行键名（`PeriodicLog.Enable`、`PeriodicLog.Threshold(#/s)` 等）
- File Logger 行（双空格格式，无事件类型）的时间戳悬停
- 日志来源标记 `<-` 的悬停说明

**委托关系**：`CSMLogHoverProvider` 持有 `CSMScriptHoverProvider` 实例，日志内容区（`|` 之后）的所有 CSMScript 语法（操作符、变量、命令）悬停均透传给后者处理，避免重复实现。

### 4.3 completionProvider.ts — 代码补全

**核心类**：`CSMScriptCompletionProvider`，实现 `vscode.CompletionItemProvider` 接口。

**补全数据**：以多个静态数组存储 `CompletionDef` 对象，每个对象包含：
- `label`：显示名称
- `insertText`：插入文本（**始终以 `vscode.SnippetString` 包装**，支持 `${1:placeholder}` Tab 占位符）
- `kind`：补全类型（Keyword / Snippet / Function 等）
- `detail`：右侧说明文字
- `documentation`：鼠标悬停时的完整文档

**补全分组（概念层）**：

| 分组（概念） | 触发场景 | 示例 |
|--------------|---------|------|
| 前缀类补全 | 行首 | `API:`、`Macro:` |
| 控制流补全 | 遇到控制流起始标记（如 `<`） | `<if ${1:expr}>`…`<end_if>` |
| 内置指令补全 | 普通语句行中 | `GOTO`、`WAIT`、`EXPRESSION` |
| 通讯相关补全 | 通讯操作符（如 `>`、`-@`、`->`）附近 | `-@`、`->`、`->|` |
| 变量占位补全 | `$` 字符 | `${varname}`、`${varname:default}` |
| 其他场景补全 | 多种复杂上下文 | 广播操作、条件跳转等 |

**`provideCompletionItems()`** 会先获取光标前的文本片段 `textBefore`，通过一组正则表达式判断当前所处的上下文（如行首、控制流块内、变量占位、通讯语句等），再从上述各类补全集合中过滤并返回合适的补全项；当前实现**未**使用 `context.triggerCharacter` 作为分发依据。

> ⚠️ CSMScript 的 `wordPattern` 将 `<`、`>`、`-`、`@` 定义为单词分隔符（`$` 是单词字符），因此 insertText 需要特别处理以避免重复插入触发字符。

### 4.4 diagnosticProvider.ts — 语法诊断

**核心函数**：`analyzeDiagnostics(document): vscode.Diagnostic[]`（纯函数，无副作用，便于单元测试）。

该函数逐行扫描文档，使用栈结构追踪控制流嵌套，检测以下 8 种错误：

| 错误码 | 描述 | 检测方式 |
|--------|------|---------|
| `CSMSCRIPT001` | 未闭合的开标签（`<if>`/`<while>`/`<foreach>`） | 文件末尾栈非空 |
| `CSMSCRIPT002` | 闭合标签不匹配（如 `<end_if>` 对应的不是 `<if>`） | 出栈时类型比对 |
| `CSMSCRIPT003` | `<else>` 前没有对应的 `<if>` | 栈顶不是 `if` |
| `CSMSCRIPT004` | `${...}` 变量引用未闭合 | 正则检测 `${` 无对应 `}` |
| `CSMSCRIPT005` | `<include>` 缺少文件路径 | 正则检测空路径 |
| `CSMSCRIPT006` | 范围检查与条件跳转在同一行冲突 | 同行同时检测 `∈` 和 `??` |
| `CSMSCRIPT007` | 字符串比较与 `&&`/`\|\|` 混用 | 正则检测 |
| `CSMSCRIPT008` | `EXPRESSION` 中使用了不支持的 `rnd()` | 正则检测 |

**`updateDiagnostics()`** 将 `analyzeDiagnostics()` 返回的诊断结果写入 `DiagnosticCollection`，在编辑器中以波浪线标注。

### 4.5 formattingProvider.ts — 代码格式化

**核心函数**：`formatCSMScript(text, options): string`（纯函数，无副作用，便于单元测试）。

该函数逐行扫描文档，应用以下格式化规则：

| 规则 | 描述 |
|-----|------|
| 1. 移除尾部空白 | 删除每行末尾的空白字符 |
| 2. 保留空行 | 空行保持原样不变 |
| 3. INI 段头对齐 | `[SECTION_NAME]` 放置在第 0 列，并重置缩进级别为 0 |
| 4. 锚点定义对齐 | `<anchorName>` 放置在第 0 列 |
| 5. 控制流开标签缩进 | `<if>`、`<while>`、`<do_while>`、`<foreach>` 放置在当前缩进级别，然后缩进级别加 1 |
| 6. else 标签对齐 | `<else>` 放置在与匹配的 `<if>` 相同的缩进级别（当前级别减 1） |
| 7. 控制流闭标签缩进 | `<end_if>`、`<end_while>`、`<end_do_while>`、`<end_foreach>` 先减少缩进级别，再放置 |
| 8. 常规行缩进 | 其他所有行（命令、注释、键值对）放置在当前缩进级别 |

**核心类**：`CSMScriptFormattingProvider`，实现 `vscode.DocumentFormattingEditProvider` 接口。

**工作流程**：
1. 用户按下 `Shift+Alt+F` 或执行"格式化文档"命令
2. `provideDocumentFormattingEdits()` 获取文档全文
3. 调用 `formatCSMScript()` 生成格式化后的文本
4. 返回 `TextEdit` 对象数组，VS Code 应用编辑

### 4.6 flowParser.ts / mermaidGenerator.ts / swimlaneParser.ts / swimlaneGenerator.ts / flowVisualizationPanel.ts — 可视化预览

以下模块共同实现 `.csmscript` 文件的可视化预览功能，详见 [`docs/design/flow-visualization-design.md`](design/flow-visualization-design.md)。

#### 数据流概览

```
CSMScript 文档
    │
    ├─── [flowParser.ts] parseFlowGraph()
    │         ↓
    │    FlowGraph { nodes, edges, subgraphs }
    │         ↓
    │    [mermaidGenerator.ts] generateMermaidDiagram()
    │         ↓
    │    Mermaid flowchart 代码（flowchart TD …）
    │
    └─── [swimlaneParser.ts] parseSwimlaneGraph()
              ↓
         SwimlaneGraph { participants, messages }
              ↓
         [swimlaneGenerator.ts] generateSwimlaneDiagram()
              ↓
         Mermaid sequenceDiagram 代码（sequenceDiagram …）

    ↓（两条路径均汇入）
[flowVisualizationPanel.ts] _getHtmlForWebview()
    ↓
HTML + Mermaid CDN + 渲染脚本
    ↓
VS Code Webview（工具栏含 ⇄ Swimlane / ⇄ Flowchart 切换按钮）
```

#### flowParser.ts — 控制流图解析器

**核心函数**：`parseFlowGraph(document): FlowGraph`（纯函数，接受 `TextDocumentLike` 接口，无 VS Code 依赖，便于单元测试）。

**主要数据类型**：

| 类型 | 说明 |
|------|------|
| `FlowNode` | 流程节点（id、label、type：`start`/`end`/`anchor`/`condition`/`block`/`goto`/`include` 等） |
| `FlowEdge` | 流程边（from、to、label、dashed） |
| `FlowSubgraph` | 控制流子图（id、label、direction、nodeIds、children，支持嵌套） |
| `FlowGraph` | 完整流程图（nodes、edges、subgraphs） |

**解析规则摘要**：

| CSMScript 元素 | 转换结果 |
|---------------|---------|
| 连续普通语句 | 合并为单个 `block` 节点（空行强制创建新节点） |
| `[SECTION]` 等 PREDEF 区 | 合并为 `predef` 节点（显示实际内容），置于 Start 之前 |
| `<anchorName>` | `anchor` 节点 |
| `<if expr>` / `<while expr>` / `<foreach var in list>` | `condition` 节点，附带类型标记边界节点（`If`/`While`/`Foreach`） |
| `<else>` | 开始条件假分支 |
| `<end_if>` / `<end_while>` / `<end_foreach>` | 弹出控制流栈，合并分支到 `end_if`/`end_while`/`end_foreach` 边界节点 |
| `<do_while>` / `<end_do_while expr>` | do-while 循环，`condition` 回边至 `Do_while` 起始边界节点 |
| `GOTO >> <anchor>` / `JUMP >> <anchor>` | 独立 `goto` 节点 + 虚线（dashed）边到目标锚点，中断顺序流 |
| `?expr? goto >> <anchor>` | `condition` 节点 + `goto` 节点，Yes 分支到 `goto`，再由虚线到目标锚点；No 分支继续顺序流 |
| `?? goto >> <anchor>` | 同上，条件标签为 `??` |

#### mermaidGenerator.ts — 流程图代码生成

**核心函数**：`generateMermaidDiagram(graph): string`，将 `FlowGraph` 转换为完整的 Mermaid `flowchart TD` 字符串。

**节点形状映射**：

| FlowNode.type | Mermaid 形状 | 语法示例 |
|--------------|-------------|---------|
| `start` / `end` | 圆角矩形 | `start1(["Start"])` |
| `anchor` | 六边形 | `anchor_entry{{"<entry>"}}` |
| `condition` | 菱形（带双引号）| `cond_0{"${x}>0"}` |
| `block` | 矩形 | `node_0["ECHO >> Test"]` |
| `predef` | 矩形（琥珀色） | `node_0["[COMMAND_ALIAS]<br/>..."]` |

**标签转义**：仅转义 `#`（→ `#35;`）和 `"`（→ `#quot;`），所有标签用双引号 Mermaid 语法包裹（如 `["..."]`、`{"..."}`），使 `<`、`>`、`&&`、`()`、`[]` 等字符无需 HTML 实体即可按字面值渲染。

**条件标签换行**：长条件表达式会在生成 Mermaid 代码时优先按 `&&`、`||`、逗号和空格插入换行，再由 `escapeMermaidLabel()` 转换为 `<br/>`。这样 Mermaid 在布局阶段就会按多行文本测量菱形节点，避免 Webview 端后置 CSS 换行导致的文字裁切。

**条件分支着色**：条件出边会根据内部 `Yes` / `No` 分支额外生成 `linkStyle` 规则，分别固定为绿色（Yes）和红色（No）；边上不再渲染 Yes/No 文本标签。

**行内条件链横排子图**：对 `前置语句 ?? goto >> <anchor>` / `前置语句 ?expr? goto >> <anchor>` / `前置语句 ?expr? 普通语句`，解析器会将相关的“前置语句节点、条件节点、goto/动作节点”归入一个 `direction LR` 的专用子图，使这段局部条件链横向呈现。

**条件执行链样式**：在行内条件链里，条件成立后进入 `goto/动作` 节点的边会标记为专用 `conditional-exec` 样式，并以绿色虚线渲染；条件后的执行节点使用独立 `conditionalAction` 节点样式，与普通块/普通 goto 节点区分。

**输出顺序**：先声明顶层节点，再输出 subgraph 块（递归，每个 subgraph 内插入 `direction TB`），最后输出所有边和 classDef。

**样式**（`classDef`，均含 `color:#000` 以保证可读性）：

| 类型 | 填充色 |
|------|-------|
| `startEnd` | 浅绿色（#90EE90） |
| `anchor` | 天蓝色（#87CEEB） |
| `condition` | 金黄色（#FFD700） |
| `block` | 浅紫色（#DDA0DD） |
| `predef` | 琥珀色（#FFD580） |
| `ifStart` / `ifEnd` | 浅红色（#FF9999） |
| `whileStart` / `whileEnd` | 橙色（#FFB347） |
| `foreachStart` / `foreachEnd` | 绿色（#77DD77） |
| `doWhileStart` / `doWhileEnd` | 淡蓝色（#AEC6CF） |

**子图样式**：`stroke-dasharray:5`（虚线边框）。

#### swimlaneParser.ts — 通讯泳道图解析器

- **输入**：`TextDocumentLike`
- **输出**：`SwimlaneGraph { participants: string[], messages: SwimlaneMessage[] }`
- **固定规则**：`Engine` 始终作为第一个参与者（泳道最左侧）
- **识别的通讯模式**：

  | 消息类型 | 操作符 | 说明 |
  |---------|--------|------|
  | `sync` | `-@` | 同步调用，含可选返回值 |
  | `async` | `->` | 异步调用，含可选返回值 |
  | `fire-forget` | `->|` | 无应答异步 |
  | `subscribe` | `-><register>` | 订阅事件 |
  | `subscribe-interrupt` | `-><register as interrupt>` | 注册为中断订阅 |
  | `subscribe-status` | `-><register as status>` | 注册为状态订阅 |
  | `unsubscribe` | `-><unregister>` | 取消订阅 |

- **过滤规则**：跳过配置段头（`[COMMAND_ALIAS]` 等）及其内部所有行、控制流标签（`<if>` 等）、锚点定义

#### swimlaneGenerator.ts — 通讯泳道图代码生成

- **输入**：`SwimlaneGraph`
- **输出**：Mermaid `sequenceDiagram` 代码字符串
- **每条消息用 `rect` 块包裹，以背景颜色区分通讯类型**：

  | 消息类型 | 背景颜色 | 请求箭头 | 返回箭头 |
  |---------|---------|---------|---------|
  | `sync` | 🔵 蓝色 | `->>` | `-->>` |
  | `async` | 🟢 绿色 | `-)` | `--)` |
  | `fire-forget` | 🟠 橙色 | `-)` | 无 |
  | `subscribe/*` / `unsubscribe` | 🟣 紫色 | `->>` | 无 |

- 参与者名中的非单词字符（如 `-`）通过 `toParticipantId()` 替换为 `_`

#### flowVisualizationPanel.ts — Webview 面板管理

**核心类**：`FlowVisualizationPanel`，管理单例 Webview 面板的创建、更新和生命周期。

**状态字段** `_viewMode: 'flow' | 'swimlane'`（默认 `'flow'`）控制当前显示哪种图表。

工具栏切换按钮（`⇄ Swimlane` / `⇄ Flowchart`）向 Extension Host 发送 `{ command: 'switchView', view: '...' }` 消息，Extension Host 更新 `_viewMode` 并重新渲染 HTML。

工具栏分为两行：首行是浏览器式地址栏（刷新按钮 + 只读文件路径 + "打开源文件"按钮），次行放置视图切换、缩放、导出等控制，路径显示始终占满首行。

**事件监听**：

| 事件 | 触发动作 |
|------|---------|
| `window.onDidChangeActiveTextEditor` | 切换到 `.csmscript` 文件时更新预览 |
| `workspace.onDidChangeTextDocument` | 编辑当前文档时实时更新预览 |
| `panel.onDidChangeViewState` | 面板从隐藏变为可见时更新预览 |
| `window.onDidChangeTextEditorSelection` | 光标行变化时将预览滚动并高亮到最近节点 |

**渲染机制**：

- 使用 `mermaid.render()` 编程式 API（非 `startOnLoad`），Mermaid 代码通过 `JSON.stringify()` 注入为 JS 字符串，避免 HTML 实体被浏览器预解码
- 跳过重复渲染：`_lastRenderedUri`/`_lastRenderedVersion` 追踪，未更改的文档不触发重渲染
- 首次渲染后自动测量 SVG 宽度并计算适应视口的缩放比（≤1x）
- 重绘或适配视口后自动水平居中图表，光标联动触发的平移使用轻微动画
- 条件节点的 `foreignObject`、`.label` 与 `.nodeLabel` 会启用多行显示和可见溢出，配合 Mermaid 源码中的 `<br/>` 保证长判断表达式完整显示
- 渲染完成后会读取节点实际填充色并计算文字对比度，自动应用高可读字体色；条件节点额外叠加标签背景 chip，保证深浅主题下文本清晰
- Yes/No 分支颜色由 Mermaid `linkStyle` 直接控制，Webview 不再依赖边标签可见性来表达分支语义
- Webview 渲染后会检查默认线条、箭头和子图边框的颜色；若与主题前景色或 Mermaid 默认暗色线接近，则自动替换为相对背景的高反差色，同时保留红/绿等语义线色
- 条件标签采用紧凑布局（更早换行 + 最大宽度 + 更小字号/行高/内边距），在保持可读的同时减少判断节点占用面积
- 工具栏会实时显示当前缩放百分比；缩放、Fit、自动适配和窗口尺寸变化都会刷新该数值

**交互功能**：缩放（工具栏按钮 + Ctrl+Scroll，0.1x–5x）、左键拖拽平移、Mermaid 源码可折叠区域（含复制按钮）、光标联动（最近节点高亮）。

| 功能 | 说明 |
|------|------|
| 缩放 | 工具栏按钮（Zoom In/Out/100%/Fit Width/Fit Height/Fit Both）+ Ctrl+鼠标滚轮（0.1x–5x） |
| 平移 | 左键拖拽 |
| 垂直滚动 | 无 Ctrl 的鼠标滚轮 |
| 操作提示 | 工具栏提示栏："Ctrl+Scroll: Zoom \| Drag: Pan \| Scroll: Move" |
| Mermaid 源码 | 可折叠区域，默认收起，含"复制"按钮（`navigator.clipboard.writeText`） |
| 光标联动 | 编辑器光标变化时，预览图自动平移+高亮最近节点（蓝色发光，短暂消失）；滚动采用顶部优先并在首尾位置进行边界钳制 |

**安全策略（CSP）**：
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
               img-src ${webview.cspSource} data:;">
```
所有工具栏按钮使用 `addEventListener`（非内联 `onclick`）以符合 nonce 限制。

### 4.7 test/ — 测试代码

详见 [第 7 节](#7-测试体系)。

---

## 5. 配置与静态资源

### 5.1 package.json — 扩展贡献点

VS Code 扩展通过 `contributes` 字段声明其能力，无需运行时注册：

```jsonc
"contributes": {
  "languages": [{
    "id": "csmscript",          // 语言 ID
    "extensions": [".csmscript"],
    "configuration": "./language-configuration.json"
  }],
  "grammars": [{
    "language": "csmscript",
    "scopeName": "source.csmscript",
    "path": "./syntaxes/csmscript.tmLanguage.json"  // TextMate 语法
  }],
  "snippets": [{
    "language": "csmscript",
    "path": "./snippets/csmscript.code-snippets"     // 代码片段
  }]
}
```

Hover 和 Completion 能力通过 `src/extension.ts` 在运行时动态注册（见第 4.1 节）。

### 5.2 language-configuration.json — 语言行为配置

定义语言的编辑行为（不涉及高亮）：

| 配置项 | 值 |
|--------|-----|
| 行注释 | `//` |
| 自动补全括号 | `<>` → `<>` |
| 自动补全变量 | `${` → `${|}` |
| 单词字符 | `wordPattern` 采用排除字符集：连续的"非空白且不在 `<>@\|/;:` 中"的字符被视为同一个单词，空白和 `<>@\|/;:` 等分隔符会打断单词 |
| 折叠策略 | 基于缩进 |

额外默认设置：`configurationDefaults` 中为 `[csmscript]` 开启 `files.autoGuessEncoding: true`，以便在打开 GBK/GB2312 等非 UTF-8 编码的 CSMScript 文件时自动识别编码。

### 5.3 syntaxes/csmscript.tmLanguage.json — TextMate 语法

通过正则表达式将 token 映射到标准 TextMate scope 名称：

| 规则名（repository key） | 覆盖语法 | Scope 示例 |
|--------------------------|---------|-----------|
| `line-comment` | `// 注释` | `comment.line.double-slash.csmscript` |
| `predef-section` | `[COMMAND_ALIAS]` 等段头及键值对 | `entity.name.section.predef.csmscript` |
| `variable-reference` | `${var}` / `${var:default}` | `variable.other.csmscript` |
| `control-flow` | `<if>` / `<while>` / `<foreach>` 等（含 `<include>`） | `keyword.control.flow.csmscript` |
| `anchor` | `<anchorName>` | `entity.name.label.anchor.csmscript` |
| `return-value-save` | `=> varname` | `keyword.operator.csmscript` |
| `range-operator` | `∈` / `!∈` | `keyword.operator.range-not-in.csmscript` |
| `string-comparison-function` | 字符串比较函数 | `support.function.string-compare.csmscript` |
| `conditional-jump` | `??` / `?expr?` | `keyword.control.csmscript` |
| `builtin-command` | `GOTO`、`WAIT`、`ECHO` 等 | `keyword.control.jump.csmscript` 等 |
| `subscription-op` | `-><register>` 等 | `keyword.operator.csmscript` |
| `broadcast-target-with-op` | `<status>` / `<broadcast>` 等（含运算符） | `constant.language.csmscript` |
| `communication-operator` | `->|`、`-@`、`->` | `keyword.operator.async-no-reply.csmscript` 等 |
| `argument-separator` | `>>` | `keyword.operator.argument-separator.csmscript` |
| `module-address` | `@ModuleName` | `punctuation.separator.module.csmscript` |
| `state-prefix` | `API:`、`Macro:` | `keyword.other.api-prefix.csmscript` |
| `system-state` | `Response`、`Error Handler` 等 | `support.constant.system-state.csmscript` |

### 5.4 snippets/csmscript.code-snippets — 代码片段

每个片段包含：
- `prefix`：触发词（用户键入后 VS Code 显示）
- `body`：插入内容（支持 `${1:placeholder}`、`$0` 等 snippet 语法）
- `description`：说明文字

片段覆盖控制流结构、通信模板、变量引用等高频代码模式。

### 5.5 .csmlog 文件支持

`.csmlog` 是 CSM 系统自动生成的日志文件，记录模块创建、消息传递、状态变化等运行时事件，本扩展为其提供语法高亮支持。

#### 实现方式

1. **语言注册** (`package.json`)
   - 独立语言定义（language id: `csmlog`）
   - 文件扩展名：`.csmlog`
   - 复用 `language-configuration.json`（注释符号相同）

2. **语法规则** (`syntaxes/csmlog.tmLanguage.json`)
   - 日志行格式识别：`YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [Event Type] ModuleName | content`（相对时间戳可选）
   - File logger 行格式：`YYYY/MM/DD HH:MM:SS.mmm  信息内容`（时间戳后两个或更多空格，无事件类型括号）
   - 配置行格式：`- Key | Value`
   - 日志来源标记 `<-` 及其后的来源信息差异化着色
   - 复用 `source.csmscript` 语法规则处理日志内容中的 CSMScript 代码
   - Scope 定义（按优先级排序）：
     - `comment.line.timestamp.date.csmlog` — 完整时间戳（日志处理时间）
     - `comment.line.timestamp.time.csmlog` — 相对时间戳（源时间，可选字段）
     - `invalid.illegal.event-type.error.csmlog` — Error
     - `string.other.log-message.filelogger.csmlog` — File logger 消息文本
     - `markup.changed.event-type.userlog.csmlog` — User Log
     - `keyword.control.event-type.lifecycle.csmlog` — Module Created/Destroyed
     - `storage.type.event-type.register.csmlog` — Register/Unregister
     - `keyword.control.event-type.interrupt.csmlog` — Interrupt
     - `keyword.other.event-type.message.csmlog` — Sync/Async/No-Rep Async Message
     - `entity.name.tag.event-type.status.csmlog` — Status
     - `meta.log.event-type.state.csmlog` — State Change（使用默认前景色，不特殊着色）
     - `support.type.event-type.other.csmlog` — 其他未知事件类型
     - `entity.name.namespace.module.csmlog` — 模块名（加粗，青绿色）
     - `keyword.operator.direction.origin.csmlog` — 日志来源标记 `<-`
     - `variable.other.log-origin.csmlog` — `<-` 后的来源模块/消息名（灰色斜体）
     - `variable.other.config-key.csmlog` — 配置键
     - `constant.other.config-value.csmlog` — 配置值

3. **主题无关颜色** (`package.json` — `configurationDefaults.editor.tokenColorCustomizations.textMateRules`)
   - 所有 csmlog 专属 scope 通过 `textMateRules` 设置精确颜色，确保颜色效果不受用户所选主题影响（优先级高于活跃主题）
   - 优先级层次：Error（红）> File Logger（深红）> User Log（橙）> Module Created/Destroyed（紫）> Register/Unregister（品红）> Interrupt（琥珀）> Sync/Async/No-Rep Async Message（蓝）> Status（青）> State Change（默认色）
   - 时间戳差异化：完整时间戳（#6a737d，斜体）+ 相对时间戳（#7c8389）
   - 模块名独立着色：青绿色（#00838f），加粗
   - 视觉强调：前 3 级优先级事件类型使用加粗字体
   - 来源信息差异化：`<-` 标记（灰色斜体）+ 后续来源文本（更淡灰色斜体）
   - 整体和谐：配置行使用低饱和度颜色

4. **默认编辑器设置** (`package.json` — `configurationDefaults`)
   - `[csmlog]` 语言默认字号设为 12px（小于 VS Code 默认值），便于在单屏显示更多日志行
   - `[csmlog]` 默认开启 `files.autoGuessEncoding: true`，打开日志时自动识别 GBK/GB2312 等非 UTF-8 编码，减少乱码
   - 用户可通过 VS Code 设置 (`editor.fontSize`) 覆盖此默认值
   - `editor.tokenColorCustomizations.textMateRules` 为所有 csmlog 专属 scope 设置精确颜色，确保颜色效果不受用户所选主题影响（优先级高于活跃主题）

#### 功能范围

- ✅ 语法高亮（时间戳、事件类型、模块名、CSMScript 代码）
- ✅ 悬停提示（见第 4.2.1 节 CSMLogHoverProvider）
- ❌ 代码补全（日志文件不需要）
- ❌ 语法检查（日志文件不需要）
- ❌ 代码格式化（日志文件不需要）

#### 设计文档

详见 [`docs/design/csmlog-support-design.md`](design/csmlog-support-design.md)

### 5.6 .lvcsm 文件支持

`.lvcsm` 是 CSM 系统使用的配置文件格式（INI 格式）。为避免与全局 `ini` 设置混淆、并在中文环境下自动探测 GBK/GB2312 编码，本扩展为其注册独立的 `lvcsm` 语言，语法规则通过 include 内置的 `source.ini` 复用 INI 高亮。

#### 实现方式

**语言与语法** (`package.json` + `syntaxes/lvcsm.tmLanguage.json`)
- 在 `contributes.languages` 中注册语言 ID `lvcsm`（扩展名 `.lvcsm`，别名 `LVCSM`）
- 在 `contributes.grammars` 中为 `lvcsm` 绑定 `syntaxes/lvcsm.tmLanguage.json`，该文件仅包含 `$schema` 和 `{ "include": "source.ini" }`，复用 VS Code 内置 INI 语法高亮

**默认设置** (`configurationDefaults`)
- `[lvcsm]` 开启 `files.autoGuessEncoding: true`，打开配置文件时自动探测 GBK/GB2312 等非 UTF-8 编码

#### 功能范围

- ✅ 语法高亮（复用 VS Code 内置 INI 语言）
- ❌ 代码补全（配置文件不需要）
- ❌ 悬停提示（配置文件不需要）
- ❌ 语法检查（配置文件不需要）
- ❌ 代码格式化（配置文件不需要）
---

## 6. 构建系统

### 6.1 npm 脚本

```bash
npm run compile          # 类型检查 + lint + ESBuild（开发模式）
npm run package          # 类型检查 + lint + ESBuild（生产模式，启用压缩）
npm run watch            # 并行运行 watch:esbuild + watch:tsc（开发热重载）
npm run compile-tests    # 用 tsc 编译测试代码到 out/
npm run check-types      # 仅执行 TypeScript 类型检查（不产生输出文件）
npm run lint             # ESLint 检查 src/ 下所有 TypeScript 文件
npm test                 # 运行完整测试套件（需要 VS Code 环境）
```

### 6.2 esbuild.js — 打包配置

```
入口: src/extension.ts
输出: dist/extension.js
格式: CommonJS (cjs)
平台: node
外部依赖: vscode（由 VS Code 主机注入，不打包）
开发模式: sourcemap=true, minify=false
生产模式: sourcemap=false, minify=true
```

### 6.3 tsconfig.json — TypeScript 配置

```jsonc
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "strict": true,           // 严格模式（noImplicitAny, strictNullChecks 等）
    "sourceMap": true,
    "rootDir": "src"          // 源码根目录；测试的 outDir 由 `npm run compile-tests` 通过 `--outDir out` 指定（扩展本身由 ESBuild 输出到 dist/）
  }
}
```

---

## 7. 测试体系

### 7.1 测试文件总览

| 文件 | 测试类型 | 主要内容 |
|------|---------|---------|
| `grammar.test.ts` | 单元测试（无需 VS Code） | 语法模式正则验证 |
| `extension.test.ts` | 集成测试（需要 VS Code） | 扩展激活、Provider 注册、端到端功能 |
| `hoverProvider.test.ts` | 单元测试 | Hover 文档生成逻辑 |
| `csmlogHoverProvider.test.ts` | 单元测试 | CSMLog 悬停区域解析逻辑 |
| `completionProvider.test.ts` | 单元测试 | 补全项过滤与生成 |
| `diagnosticProvider.test.ts` | 单元测试 | 诊断规则（CSMSCRIPT001–008）的各种触发场景 |
| `documentSymbolProvider.test.ts` | 单元测试 | 大纲符号提取逻辑（段头 + 锚点） |
| `formattingProvider.test.ts` | 单元测试 | 各种格式化场景 |
| `flowVisualization.test.ts` | 单元测试（无需 VS Code） | 流程图解析（锚点/GOTO/控制流/子图）+ Mermaid 代码生成 |
| `swimlaneVisualization.test.ts` | 单元测试（无需 VS Code） | 通讯消息解析（-@/->/->|/订阅/广播）+ 泳道图代码生成 |
| `setup.ts` | 测试工具 | 初始化辅助函数 |
| `vscode-mock.ts` | Mock 对象 | 模拟 VS Code API，支持无 VS Code 运行单元测试 |

### 7.2 无需 VS Code 的单元测试

`grammar.test.ts`、`hoverProvider.test.ts`、`completionProvider.test.ts`、`diagnosticProvider.test.ts`、`formattingProvider.test.ts` 均通过 `vscode-mock.ts` 模拟 VS Code API，可直接用 Mocha 在命令行运行：

```bash
npm run compile-tests
npx mocha --ui tdd --require ./out/test/setup.js \
  out/test/diagnosticProvider.test.js \
  out/test/hoverProvider.test.js \
  out/test/completionProvider.test.js \
  out/test/formattingProvider.test.js \
  out/test/grammar.test.js
```

### 7.3 集成测试（需要 VS Code）

`extension.test.ts` 使用 `@vscode/test-electron` 在真实 VS Code 进程中执行，验证扩展在完整环境下的行为：

```bash
npm test   # 内部调用 vscode-test（见 .vscode-test.mjs）
```

在无图形界面的 CI 环境中通过 `xvfb-run` 启动虚拟显示器（见第 8 节）。

---

## 8. CI/CD 流水线

`.github/workflows/ci.yml` 先通过 `prepare-deps` Job 在 `ubuntu-latest` 上准备一次 Node 22 运行环境与 `node_modules` 缓存，随后再并行执行 lint/语法测试/集成测试；`build-vsix` 在其全部通过后执行，`validate-vsix` 在 `build-vsix` 成功后执行：

```
┌────────────────────────────────────────────────────────────┐
│ push / pull_request (main branch)                          │
│  Job 1: prepare-deps                                      │
│  ─────────────────────────────────────────────────────────│
│  ubuntu-latest / Node 22                                  │
│  恢复 node_modules 缓存；未命中时执行 npm ci               │
│  保存缓存，供后续 ubuntu Job 直接复用                      │
└────────────────────────────────────────────────────────────┘
                         ↓（依赖环境就绪后）
┌────────────────┬───────────────────┬───────────────────────┐
│  Job 2         │  Job 3            │  Job 4                │
│  lint-and-     │  grammar-tests    │  extension-tests      │
│  typecheck     │  ─────────────   │  ──────────────────   │
│  ─────────     │  ubuntu-latest   │  ubuntu-latest        │
│  ubuntu-latest │  Node 22         │  Node 22              │
│  restore       │  restore         │  restore              │
│  node_modules  │  node_modules    │  node_modules         │
│  check-types   │  compile-tests   │  xvfb-run npm test    │
│  lint          │  mocha grammar   │  （完整集成测试）        │
│  （类型与风格检查） │  （语法规则单元测试） │                       │
└────────────────┴───────────────────┴───────────────────────┘
                         ↓（三者全部通过后）
┌────────────────────────────────────────────────────────────┐
│  Job 5: build-vsix                                         │
│  ─────────────────────────────────────────────────────────│
│  ubuntu-latest / Node 22 / restore node_modules            │
│  计算版本号：<package.json version>-build.<github.run_number> │
│  vsce package <版本号> --no-update-package-json  →  生成 VSIX │
│  上传 Artifact（保留 30 天）                                 │
└────────────────────────────────────────────────────────────┘
                         ↓（build-vsix 通过后）
┌────────────────────────────────────────────────────────────┐
│  Job 6: validate-vsix                                      │
│  ─────────────────────────────────────────────────────────│
│  OS 矩阵：ubuntu-latest、windows-latest                     │
│  仅安装 Node 22，不再执行 npm ci                            │
│  下载 Artifact → 验证 VSIX：                                │
│    ZIP 完整性 + semver 版本 + 必需字段 + 主入口文件           │
└────────────────────────────────────────────────────────────┘
```

`prepare-deps` Job 会基于 `package-lock.json` 的哈希生成缓存键，优先恢复上一轮已构建好的 `node_modules`；只有缓存未命中时才执行一次 `npm ci`，然后将结果保存回缓存。后续所有 Ubuntu Job 都只做缓存恢复，不再重复安装依赖，从而显著缩短重复测试和打包的耗时。

代码检查、语法规则单元测试、扩展集成测试三个 Job 仅在 `ubuntu-latest` 上并行执行，追求快速反馈，避免跨平台运行器的随机故障；`build-vsix` Job 在三者全部通过后打包 VSIX 并上传 Artifact；`validate-vsix` Job 在 `ubuntu-latest` 和 `windows-latest` 两平台上并行验证 VSIX，确认生成的扩展包在主流平台上均可被 VS Code 正常加载。验证阶段只保留 Node.js 运行时，不再安装测试依赖。

**VSIX 验证步骤：** 下载 Artifact 后，CI 会执行三项检查以确保生成的 VSIX 可被 VS Code 正常加载：① `unzip -t` 验证 ZIP 结构完整性；② 解析 `extension/package.json`，使用内联 semver 正则校验版本号合法性，并校验关键字段是否存在（VS Code 必需字段：`name`、`publisher`、`engines.vscode`；本扩展必需字段：`main`、`contributes`）；③ 确认主入口文件（`dist/extension.js`）存在于 VSIX 包内。三项检查全部通过后流水线才算完整成功。

**VSIX 版本号规则：** 打包时版本号采用符合 semver 的预发布格式 `MAJOR.MINOR.PATCH-build.BUILD`，其中前三位来自 `package.json` 的 `version` 字段，`BUILD` 为 GitHub Actions 的 `run_number`（全局递增，例如 `0.0.3-build.42`）。使用 semver 预发布格式（而非四位格式 `0.0.3.42`）是因为 VS Code 的扩展扫描器使用 semver 解析版本号，四位版本会被 `semver.valid()` 返回 `null`，导致安装时出现"无法读取扩展"错误。`package.json` 本身不修改——版本号通过 `vsce package <版本号> --no-update-package-json` 注入到 VSIX 包（`package.json` 与 `.vsixmanifest`）中，不影响源码。注意：`run_number` 在所有 workflow run 之间全局递增，切换 `MAJOR.MINOR.PATCH` 时不会归零，仅用于区分同一基础版本下的不同 CI 构建。

---

## 9. 文档体系（docs/）

### 内部设计文档

| 文件 | 用途 |
|------|------|
| `docs/design/m1-language-definition-design.md` | M1 语法设计规范：TextMate scope 命名约定、顶层规则表、高亮示例 |
| `docs/design/csmlog-support-design.md` | .csmlog 文件语法与语义设计：事件类型、时间戳格式、scope 命名约定 |
| `docs/design/csmlog-hover-design.md` | .csmlog 悬停提示设计：区域划分、数据库结构、委托关系 |
| `docs/design/flow-visualization-design.md` | 流程可视化设计规范：流程图 + 通讯泳道图，解析规则、Mermaid 映射、Webview 面板交互、测试策略 |
| `docs/plan/vscode-extension-development-plan.md` | 完整开发计划，定义 M0–M4 里程碑与每阶段任务清单 |

### 调研报告（docs/research/）

| 文件 | 用途 |
|------|------|
| `marketplace-similar-plugins-survey.md` | Marketplace 同类扩展横向对比 |
| `technology-selection.md` | 技术选型决策记录 |
| `vscode-extension-capabilities-overview.md` | VS Code 扩展能力全景综述 |
| `vscode-language-extension-overview.md` | 语言扩展专项说明 |
| `scripting-language-support.md` | 脚本语言支持方案调研 |

### 语言规范

`docs/CSMScript_User_Manual.md` 是 CSMScript 的官方语言手册，记录了全部语法规则、内置命令和使用示例，是开发 Hover 文档库和补全条目的主要参考来源。

---

## 10. 数据流与各模块协作关系

```
用户打开 .csmscript 文件
         │
         ▼
  VS Code 激活扩展（activation event）
         │
         ├─── TextMate 语法（syntaxes/csmscript.tmLanguage.json）
         │         └→ 语法高亮（由 VS Code 内核处理，不经过扩展代码）
         │
         └─── extension.ts activate()
                   │
                   ├─── HoverProvider ←── hoverProvider.ts
                   │         HOVER_DB
                   │         └→ 用户鼠标悬停 → Markdown 文档弹窗
                   │
                   ├─── CompletionProvider ←── completionProvider.ts
                   │         触发字符: < [ > $ ?
                   │         └→ 用户键入触发字符 → 补全列表
                   │
                   ├─── DiagnosticCollection ←── diagnosticProvider.ts
                   │         文档事件（打开/修改/关闭）
                   │         └→ analyzeDiagnostics() → 错误波浪线标注
                   │
                   └─── FlowVisualizationPanel（命令：showFlowVisualization）
                             │
                             ├─── viewMode = 'flow'（默认）
                             │         flowParser.ts → FlowGraph
                             │         mermaidGenerator.ts → flowchart TD …
                             │         └→ Webview 渲染流程图
                             │
                             └─── viewMode = 'swimlane'（切换后）
                                       swimlaneParser.ts → SwimlaneGraph
                                       swimlaneGenerator.ts → sequenceDiagram …
                                       └→ Webview 渲染通讯泳道图
```

**静态资源**（语法、片段、语言配置）由 VS Code 内核加载，**不经过 TypeScript 运行时代码**。动态功能（Hover、Completion、Diagnostics、FlowVisualization）则由 `extension.ts` 在激活时注册，通过 VS Code Provider 接口响应用户操作。

---

*本文档基于 CSMScript Language Support v0.0.3 编写。如有更新，请同步修改本文件。*
