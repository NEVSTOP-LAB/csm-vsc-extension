# 设计文档：是否引入 Language Server Protocol（LSP）

> **文档类型：** 架构决策  
> **状态：** ✅ 已决策  
> **创建日期：** 2026-03-21  
> **关联 Issue：** [是否需要 Language Server Protocol (LSP)](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/)  
> **参考文档：**
> - [technology-selection.md](../research/technology-selection.md)
> - [vscode-language-extension-overview.md §8](../research/vscode-language-extension-overview.md)
> - [scripting-language-support.md §8](../research/scripting-language-support.md)
> - [marketplace-similar-plugins-survey.md §4.3](../research/marketplace-similar-plugins-survey.md)

---

## 目录

1. [背景](#1-背景)
2. [两种架构方案对比](#2-两种架构方案对比)
3. [判断标准：五个维度](#3-判断标准五个维度)
4. [CSM 插件现状评估](#4-csm-插件现状评估)
5. [决策结论](#5-决策结论)
6. [未来触发 LSP 迁移的条件](#6-未来触发-lsp-迁移的条件)
7. [对 technology-selection.md 的更新](#7-对-technology-selectionmd-的更新)

---

## 1. 背景

VSCode 语言插件实现语言服务功能（代码补全、悬停提示、诊断、跳转定义等）有两种主流方式：

1. **内联 Provider 方式**：在插件主进程（Extension Host）内直接注册 `CompletionItemProvider`、`HoverProvider`、`DiagnosticCollection` 等。
2. **LSP 方式（Language Server Protocol）**：将语言逻辑抽离到独立的 Language Server 子进程，插件侧仅运行轻量的 Language Client，通过 JSON-RPC 与服务端通信。

两种方式都能实现同等的用户体验，关键差异在于**复杂度**、**性能**和**可维护性**。选错架构会带来不必要的成本，因此需要明确的判断依据。

---

## 2. 两种架构方案对比

### 2.1 内联 Provider 架构

```
┌─────────────────────────────────┐
│         Extension Host          │
│  ┌────────────────────────────┐ │
│  │  extension.ts              │ │
│  │  ├─ CompletionProvider     │ │
│  │  ├─ HoverProvider          │ │
│  │  └─ DiagnosticCollection   │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

**优点：**
- 架构简单，无需进程间通信
- 调试方便（单进程，直接打断点）
- 无额外依赖（不需要 `vscode-languageserver`）
- 适合轻量到中等复杂度的语言功能

**缺点：**
- 语言逻辑与 VS Code API 深度耦合，无法跨编辑器复用
- 重量级计算（如全量 AST 解析）会阻塞 Extension Host，影响编辑器响应
- 服务崩溃会波及整个 Extension Host

---

### 2.2 LSP 架构

```
┌──────────────────────────────────────┐
│           Extension Host             │
│  ┌───────────────────────────────┐   │
│  │   Language Client             │   │
│  │   (vscode-languageclient)     │   │
│  └──────────────┬────────────────┘   │
└─────────────────┼────────────────────┘
                  │  JSON-RPC（IPC / stdio / TCP）
                  │
┌─────────────────┼────────────────────┐
│  Language Server Process             │
│  ┌──────────────┴────────────────┐   │
│  │   Language Server             │   │
│  │   (vscode-languageserver)     │   │
│  │   ├─ 词法 / 语法分析           │   │
│  │   ├─ 语义分析（跨文件）         │   │
│  │   ├─ CompletionHandler        │   │
│  │   ├─ HoverHandler             │   │
│  │   └─ DiagnosticsHandler       │   │
│  └───────────────────────────────┘   │
└──────────────────────────────────────┘
```

**优点：**
- 独立进程，重计算不阻塞编辑器
- 崩溃隔离：服务端崩溃不影响 VS Code 主进程
- 协议标准化：同一 Language Server 可在 Vim / Emacs / Neovim / Zed 等编辑器中复用
- 便于单独测试服务端逻辑（无需启动 VS Code）

**缺点：**
- 引入进程间通信，调试复杂度翻倍
- 需要新增依赖：`vscode-languageserver`、`vscode-languageclient`、`vscode-languageserver-textdocument`
- 项目结构复杂化（需维护 `client/` + `server/` 两个模块）
- 协议版本升级（LSP 3.x → 4.x）会带来迁移成本

---

## 3. 判断标准：五个维度

以下五个维度从不同角度衡量"是否需要 LSP"。**每个维度单独给出一个信号（🟢 不需要 / 🟡 可选 / 🔴 需要），综合五个信号作出最终判断。**

---

### 维度 1：语言功能复杂度

| 功能范围 | 信号 | 说明 |
|---------|:----:|------|
| 只需语法高亮 + 代码片段 | 🟢 | 声明式即可，完全不需要 TypeScript |
| 需要补全 + 悬停，逻辑量小（< 2000 行）| 🟢 | 内联 Provider 足够 |
| 补全 / 悬停 / 诊断逻辑量中等（2000–5000 行）| 🟡 | 内联可行，LSP 可选 |
| 需要**跨文件**分析（定义跳转、引用查找）| 🔴 | 强烈推荐 LSP |
| 需要完整 AST + 类型推断 | 🔴 | 必须 LSP |

**判断依据：** 单文件 + 固定关键词匹配的补全/悬停逻辑适合内联；一旦需要跨文件索引（如 `<include>` 文件中的锚点跳转），单进程内联难以高效维护全量索引。

---

### 维度 2：性能影响

| 分析方式 | 信号 | 说明 |
|---------|:----:|------|
| 基于正则匹配或单行扫描 | 🟢 | 耗时 < 1ms，内联无影响 |
| 基于文件级扫描（几十行至数百行文件）| 🟡 | 耗时 < 50ms，内联可接受 |
| 基于工作区全量扫描（数十个文件）| 🔴 | 可能卡顿，应放入独立进程 |
| 需要持续后台索引 | 🔴 | 必须 LSP |

**判断依据：** Extension Host 与编辑器渲染共用事件循环，超过 50ms 的同步操作会造成编辑器卡顿。LSP 将重计算移入子进程，避免阻塞。

---

### 维度 3：跨编辑器复用需求

| 场景 | 信号 | 说明 |
|-----|:----:|------|
| 仅支持 VS Code | 🟢 | 内联 Provider 即可 |
| 计划未来支持 Neovim / Helix / Emacs 等 | 🔴 | LSP 是唯一跨编辑器方案 |
| 计划提供 Web 版（vscode.dev）| 🟡 | Web 扩展支持受限，可能需要重新评估 |

**判断依据：** LSP 是标准化协议，一个 Language Server 可被多个兼容 LSP 的编辑器直接使用，是构建编辑器无关语言工具链的最佳选择。

---

### 维度 4：稳定性与崩溃隔离

| 场景 | 信号 | 说明 |
|-----|:----:|------|
| 语言逻辑稳定、不涉及外部进程/文件系统 | 🟢 | 内联崩溃概率低 |
| 语言服务需调用外部工具（解析器、编译器）| 🔴 | 必须 LSP，防止崩溃波及编辑器 |
| 可能遇到复杂输入导致无限循环 | 🟡 | 建议 LSP |

**判断依据：** Language Server 运行在独立进程中，即使服务端崩溃，VS Code 本身仍正常运行，客户端会自动尝试重启服务端。

---

### 维度 5：代码可维护性与团队协作

| 场景 | 信号 | 说明 |
|-----|:----:|------|
| 语言逻辑 < 3000 行，单人维护 | 🟢 | 内联维护成本可接受 |
| 语言逻辑 > 5000 行，多人协作 | 🔴 | LSP 分层有助于测试和分工 |
| 需要独立测试语言逻辑（不依赖 VS Code）| 🟡 | LSP 的服务端可用 Jest/Mocha 独立测试 |

**判断依据：** 内联 Provider 依赖 `vscode` 模块，单元测试需要模拟或启动 VS Code 环境。LSP 服务端是纯 Node.js 模块，可以用任意测试框架直接测试。

---

### 综合决策流程

```
开始
  │
  ├─ 需要跨文件分析（定义跳转/引用/工作区索引）？
  │    └─ 是 → 🔴 引入 LSP
  │
  ├─ 需要跨编辑器支持（Neovim / Helix 等）？
  │    └─ 是 → 🔴 引入 LSP
  │
  ├─ 分析操作耗时可能超过 50ms？
  │    └─ 是 → 🔴 引入 LSP
  │
  ├─ 语言逻辑超过 5000 行或多人协作？
  │    └─ 是 → 🟡 考虑 LSP
  │
  └─ 以上均否 → 🟢 继续使用内联 Provider
```

---

## 4. CSM 插件现状评估

### 4.1 已实现功能清单

| 文件 | 行数 | 功能描述 |
|------|:----:|---------|
| `extension.ts` | 78 | 插件入口，注册 Provider 与事件监听 |
| `completionProvider.ts` | 880 | 代码补全（关键词、内置命令、锚点、变量） |
| `hoverProvider.ts` | 1274 | 悬停文档（操作符、命令、控制流、系统状态） |
| `diagnosticProvider.ts` | 246 | 8 条诊断规则（控制流嵌套、变量引用等） |
| **合计** | **2478** | |

### 4.2 五个维度评估

| 维度 | 当前状态 | 信号 | 说明 |
|------|---------|:----:|------|
| **语言功能复杂度** | 补全 + 悬停 + 诊断，逻辑量约 2478 行，均为单文件逻辑 | 🟡 | 当前量级内联可行；`<include>` 跨文件锚点跳转若实现则需 LSP |
| **性能影响** | 基于行级正则扫描，单文件耗时极低（< 5ms） | 🟢 | 当前无性能压力 |
| **跨编辑器复用** | 目前仅支持 VS Code，无跨编辑器计划 | 🟢 | 暂不需要 |
| **稳定性** | 纯 TypeScript 逻辑，无外部进程调用，崩溃风险低 | 🟢 | 当前无需隔离 |
| **可维护性** | 单人维护，代码量 < 3000 行，已有测试覆盖 | 🟢 | 当前维护成本可接受 |

### 4.3 综合评分

| 维度 | 信号 | 权重 |
|------|:----:|:----:|
| 语言功能复杂度 | 🟡 | 高 |
| 性能影响 | 🟢 | 高 |
| 跨编辑器复用 | 🟢 | 中 |
| 稳定性 | 🟢 | 中 |
| 可维护性 | 🟢 | 低 |

**当前结论：四绿一黄，不满足引入 LSP 的触发条件。**

---

## 5. 决策结论

### ✅ 当前阶段（M1–M3）：继续使用内联 Provider，不引入 LSP

**理由：**

1. **功能范围匹配**：现有功能（补全、悬停、诊断）均为单文件、基于正则的轻量逻辑，内联 Provider 完全胜任。
2. **性能充足**：行级扫描耗时远低于 50ms 阈值，不存在阻塞编辑器的风险。
3. **架构成本不合理**：引入 LSP 需要拆分 `client/` + `server/` 目录、新增 3 个 npm 依赖、重写进程通信层，在当前功能规模下收益远低于成本。
4. **当前无跨编辑器需求**：项目目标明确为 VS Code 插件，无需 LSP 协议标准化带来的跨编辑器能力。

### 📋 后续阶段（M4+）：按需评估，满足触发条件时迁移

LSP 不是永远不需要，而是**等待合适的触发条件**（见第 6 节）。

---

## 6. 未来触发 LSP 迁移的条件

以下任意一条成立时，应启动 LSP 迁移评估：

| 编号 | 触发条件 | 预期实现功能 |
|:----:|---------|-------------|
| T1 | 实现 `<include>` 文件的**跨文件锚点跳转**（Go to Definition） | 需要跨文件索引，内联难以高效维护 |
| T2 | 实现工作区级别的**引用查找**（Find All References） | 需要全量工作区扫描 |
| T3 | 全量 Provider 代码超过 **6000 行**，维护困难 | 分层架构有助于团队协作与独立测试 |
| T4 | 有明确需求支持 **Neovim / Helix / Zed** 等编辑器 | LSP 是唯一跨编辑器方案 |
| T5 | 引入外部**解析器/编译器**进程，需要崩溃隔离 | 独立进程保护编辑器稳定性 |

### 迁移时的参考资源

- [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide) — 官方 LSP 开发指南
- [lsp-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample) — 官方最小 LSP 示例
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) — 官方 TypeScript 实现
- 本文档 §2.2 中的 LSP 架构图与代码骨架，可作为迁移起点

---

## 7. 对 technology-selection.md 的更新

本决策文档完成后，[technology-selection.md](../research/technology-selection.md) 中语言服务器一行的状态由 **⏳ 待评估** 更新为：

| 类别 | 选型结果 | 状态 |
|------|---------|------|
| 语言服务器 | 内联 Provider（M1–M3）；满足触发条件 T1–T5 后迁移至 LSP | ✅ 已决策，见 [lsp-decision-criteria.md](../design/lsp-decision-criteria.md) |

---

*文档创建日期：2026-03-21*
