# 代码架构（src/ 模块划分）

> 范围：`src/` 目录下的运行时代码组织。
> 关联：[csmlog-support-design.md](./csmlog-support-design.md) ·
> [csmlog-highlight-design.md](./csmlog-highlight-design.md) ·
> [csmlog-hover-design.md](./csmlog-hover-design.md) ·
> [csmlog-outline-design.md](./csmlog-outline-design.md)
> 更新日期：2026-04-30
> 状态：维护中

本文档只描述当前 `src/` 的模块结构、依赖方向与运行时数据流，作为新加功能/调整代码时的"代码地图"。具体规则（高亮 / Hover / Outline）请直接看对应专题文档。

---

## 1. 顶层结构

```
src/
├── extension.ts                       # activate(): 仅做语言 Provider 注册
├── csmlogHoverProvider.ts             # CSMLogHoverProvider（编排器）
├── csmlogDocumentSymbolProvider.ts    # CSMLogDocumentSymbolProvider
├── lvcsmDocumentSymbolProvider.ts     # LvcsmDocumentSymbolProvider
│
├── csmlog/                            # .csmlog 行解析与日志头词条
│   ├── logLineParser.ts               #   正则常量 + parseLogLineZones()
│   └── headerHoverDb.ts               #   事件类型 / 时间戳 / 配置键 / <- 词条
│
├── hover/                             # 内容区 Hover 子系统（被 csmlog Provider 复用）
│   ├── types.ts                       #   HoverEntry + 唯一的 buildHover()
│   ├── contentHover.ts                #   provideContentHover() + 查询/锚点缓存
│   └── db/
│       ├── index.ts                   #     聚合所有词条 → CONTENT_HOVER_DB
│       ├── operators.ts               #     -@ -> ->| => @ <register> ${...} 等
│       ├── sections.ts                #     [COMMAND_ALIAS] 等预定义节 + API:/Macro:
│       ├── commands.ts                #     GOTO/WAIT/ECHO/EXPRESSION/TAGDB_*/对话框
│       ├── controlFlow.ts             #     <if> <while> <foreach> + ∈ + equal() + ??
│       └── systemStates.ts            #     CSM 框架内置状态（Async Response 等）
│
├── symbols/                           # Outline 共享工具
│   └── flatSymbols.ts                 #   FlatSymbolEntry → DocumentSymbol[]（折叠 range）
│
└── test/                              # 独立 Mocha 测试（vscode-mock 拦截）
```

测试文件与 `vscode` 真实模块解耦，依靠 `src/test/setup.ts` 把 `require('vscode')` 重定向到 `src/test/vscode-mock.ts`，因此本目录下的代码可在 Node 环境直接运行单元测试。

---

## 2. 依赖方向（自顶向下，禁止反向引用）

```
extension.ts
   │
   ├──► csmlogHoverProvider.ts ───────► csmlog/logLineParser.ts
   │           │                       csmlog/headerHoverDb.ts
   │           └────► hover/types.ts
   │                  hover/contentHover.ts ──► hover/db/index.ts
   │                                              ├──► db/operators.ts
   │                                              ├──► db/sections.ts
   │                                              ├──► db/commands.ts
   │                                              ├──► db/controlFlow.ts
   │                                              └──► db/systemStates.ts
   │                                          (上述均 import HoverEntry)
   │
   ├──► csmlogDocumentSymbolProvider.ts ──► symbols/flatSymbols.ts
   └──► lvcsmDocumentSymbolProvider.ts  ──► symbols/flatSymbols.ts
```

约束：

- `hover/db/*` 只 import `hover/types.ts`，不依赖任何 vscode API（保持纯数据）。
- `hover/contentHover.ts` 是内容区入口，所有词条查询都在此文件集中编排。
- `csmlog/*` 处理 `.csmlog` 专属解析与日志头词条；不应依赖 `hover/db/*` 的具体类别文件，应只通过 `provideContentHover` 间接复用内容区数据。
- `symbols/flatSymbols.ts` 不感知具体语言；新加 Outline Provider 应复用它。

---

## 3. Hover 运行时数据流

```
        cursor on .csmlog line
                  │
                  ▼
   CSMLogHoverProvider.provideHover()
                  │
   ┌──────────────┼─────────────────────────────────────┐
   ▼              ▼                                     ▼
配置行          标准日志行                       File Logger 行
(- Key | …)   parseLogLineZones()              (timestamp + 文本)
   │              │                                     │
   │       ┌──────┼──────┬──────────┬─────────┐         │
   │       ▼      ▼      ▼          ▼         ▼         ▼
   │     date     rel    eventType  <-      content     date
   │     ts       ts                marker  area        ts
   │     │        │      │          │       │           │
   ▼     ▼        ▼      ▼          ▼       ▼           ▼
   HEADER_HOVER_DB[ … ]  ─────────────────► provideContentHover()
            │                                       │
            ▼                                       ▼
        buildHover()                  CONTENT_HOVER_DB（运算符 / 命令
                                       / 控制流 / 系统状态 / 锚点 …）
                                                │
                                                ▼
                                            buildHover()
```

要点：

- **入口分支固定**：配置行 / File Logger / 标准日志，三种行型互斥，避免多重匹配。
- **委托而非复制**：内容区不会重复维护事件类型/时间戳词条，统一从 `HEADER_HOVER_DB` 与 `CONTENT_HOVER_DB` 各自取词条；二者无重叠。
- **`buildHover` 唯一**：所有 Hover 都经 `hover/types.ts::buildHover()` 渲染，渲染策略（`isTrusted=false` / `supportHtml=false`）只在该处声明一次。

---

## 4. Outline 运行时数据流

```
.csmlog 文档                               .lvcsm 文档
   │                                          │
   ▼                                          ▼
逐行扫描                                逐行扫描
   ├─ 配置行     → Property                ├─ [Section] → Module
   ├─ Module Created  → Constructor
   ├─ Module Destroyed → Event
   └─ Logger 系统消息 → Key
   │                                          │
   └────────► FlatSymbolEntry[] ◄─────────────┘
                       │
                       ▼
            buildFlatSymbols(document, entries)
                       │
                       ▼
       vscode.DocumentSymbol[]（带可折叠 range）
```

要点：

- 两个语言的 Provider 共享 `buildFlatSymbols`，区别仅在"识别哪些行 + 给什么 SymbolKind"。
- range 计算逻辑只存在于 `symbols/flatSymbols.ts`；新增 Provider 不应自行计算 range。

---

## 5. 高亮的位置

高亮由 TextMate 语法 + 主题配色驱动，**没有运行时 TypeScript 代码参与**：

- `syntaxes/csmlog.tmLanguage.json` —— `.csmlog` 的全部高亮规则（事件类型 / 时间戳 / 模块名 / 内容 / `<-` 等）。
- `syntaxes/lvcsm.tmLanguage.json` —— `.lvcsm` 仅声明 `include: source.ini`，复用 VS Code 内置 INI 高亮。
- `package.json` 的 `contributes.configurationDefaults.editor.tokenColorCustomizations.textMateRules` —— 为各 scope 提供默认配色。

详细规则与颜色见 [csmlog-highlight-design.md](./csmlog-highlight-design.md)。

---

## 6. 新增 / 修改时的指引

| 想做的事 | 改这里 |
|---------|-------|
| 新增/修改一个内容区词条（命令、操作符等） | `src/hover/db/<对应类别>.ts` |
| 新增一类内容区词条文件 | 新增 `src/hover/db/foo.ts` 并在 `db/index.ts` 中 spread 进 `CONTENT_HOVER_DB` |
| 新增/修改日志头词条（事件类型、配置键） | `src/csmlog/headerHoverDb.ts` |
| 调整日志行结构识别 | `src/csmlog/logLineParser.ts` 中的正则与 `parseLogLineZones` |
| 调整 Hover 触发分支 | `src/csmlogHoverProvider.ts` |
| 调整 `${...}` / `<anchor>` 等内容区匹配顺序 | `src/hover/contentHover.ts::provideContentHover` |
| 新增一类 Outline 条目 | `src/csmlogDocumentSymbolProvider.ts` 增加匹配分支 |
| 调整 Outline 折叠 range 计算 | `src/symbols/flatSymbols.ts`（影响所有语言） |
| 修改高亮规则或配色 | `syntaxes/csmlog.tmLanguage.json` + `package.json` 的 textMateRules |
| 新增独立语言 | `package.json` 注册 + 新建 `src/<lang>DocumentSymbolProvider.ts`，复用 `symbols/flatSymbols.ts` |
