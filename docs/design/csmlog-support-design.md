# .csmlog 文件支持设计总览

> 功能：.csmlog 文件支持（总览与文档索引）
> 关联 Issue：[.csmlog 文件支持](https://github.com/nevstop/csm-vsc-extension/issues/66)
> 更新日期：2026-03-29
> 状态：维护中

---

## 1. 文档定位

本文档只保留 .csmlog 支持的总览信息，不再重复高亮规则、颜色表、流程图、悬浮数据库等细节。

详细设计请直接查看：
- 代码架构与模块划分（唯一权威）：[code-architecture.md](./code-architecture.md)
- 高亮设计（唯一权威）：[csmlog-highlight-design.md](./csmlog-highlight-design.md)
- 悬浮设计（唯一权威）：[csmlog-hover-design.md](./csmlog-hover-design.md)
- 大纲设计（唯一权威）：[csmlog-outline-design.md](./csmlog-outline-design.md)

---

## 2. 目标与范围

### 2.1 目标

- 为 `.csmlog` 提供可读性优先的浏览体验。
- 支持事件优先级高亮，便于快速定位关键日志。
- 提供事件类型、时间戳、配置键等核心字段的悬浮提示。

### 2.2 包含

- 语言注册（`csmlog`，扩展名 `.csmlog`）
- TextMate 语法高亮
- Hover 提示
- 大纲视图（Document Symbol / Outline）
- 文档与测试

### 2.3 不包含

- Completion
- Diagnostics
- Formatting
- 跨文件日志分析

---

## 3. 最小格式约定

`.csmlog` 常见两类行：

1. 配置行
```text
- Key | Value
```

2. 日志行
```text
YYYY/MM/DD HH:MM:SS.mmm [HH:MM:SS.mmm] [EventType] Module | Content
```

说明：
- 相对时间戳在部分事件中可选。
- 部分事件允许无模块名或无 `| Content` 变体。
- 事件类型集合和边界变体以高亮设计文档为准。

---

## 4. 统一原则

- `.csmlog` 作为独立语言处理（language id: `csmlog`）。
- 文档去重：规则、颜色、流程图仅在专题文档维护一次。
- 高亮与悬浮共用同一术语体系（事件类型命名、优先级口径一致）。
- 代码实现与文档口径不一致时，以代码和测试结果为准，并回写文档。

---

## 5. 文档边界（避免重复）

- 本文档：只写范围、边界、索引与验收基线。
- `code-architecture.md`：只写 `src/` 模块划分与运行时数据流。
- `csmlog-highlight-design.md`：只写高亮规则与可视化流程。
- `csmlog-hover-design.md`：只写 Hover 触发区域、词条与委托策略。
- `csmlog-outline-design.md`：只写大纲匹配规则、符号名格式与范围计算。

---

## 6. 验收基线

- `.csmlog` 文件可被正确识别为 `csmlog` 语言。
- 关键事件类型具备稳定高亮（含边界变体）。
- Hover 在核心字段可触发，且不与高亮策略冲突。
- 大纲面板可显示配置参数、Module Created/Destroyed 及 Logger 系统消息。
- 文档链接有效、职责边界清晰、无重复大段规则表。

---

## 7. 变更维护流程

发生以下变更时，请同步更新对应专题文档：

- 新增/修改事件类型：更新高亮设计 + Hover 设计。
- 调整 token scope/颜色：更新高亮设计 + 实现计划。
- 调整 Hover 词条或区域：更新 Hover 设计。

本文档仅在“范围或边界变化”时更新。
