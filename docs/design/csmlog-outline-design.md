# .csmlog 大纲视图设计文档

> 功能：.csmlog Document Symbol / Outline
> 关联 Issue：[.csmlog 文件支持](https://github.com/nevstop/csm-vsc-extension/issues/66)
> 更新日期：2026-03-29
> 状态：维护中
> 依赖：[csmlog-support-design.md](./csmlog-support-design.md)

---

## 1. 文档定位

本文档只描述 .csmlog 大纲视图（Outline）的设计，不重复高亮规则、颜色方案或 Hover 词条。

相关文档：
- 总览与边界：[csmlog-support-design.md](./csmlog-support-design.md)
- 高亮规则与流程：[csmlog-highlight-design.md](./csmlog-highlight-design.md)
- 悬浮设计：[csmlog-hover-design.md](./csmlog-hover-design.md)

---

## 2. 目标与范围

### 2.1 目标

- 为 `.csmlog` 文件提供大纲视图，在 VS Code 资源管理器的大纲面板中显示文档结构。
- 提取关键结构元素（配置参数、模块生命周期、Logger 系统消息）用于快速导航。
- 忽略大量重复的普通日志行，只聚焦于结构性信息。

### 2.2 包含

- 配置参数提取
- Module Created / Module Destroyed 提取
- Logger 系统消息提取
- 符号范围计算（支持大纲折叠）

### 2.3 不包含

- 普通日志行（State Change、Sync/Async Message、Error 等）
- 层级嵌套（所有符号平铺）
- 跨文件符号分析

---

## 3. 匹配规则与优先级

按逐行从上到下扫描，每行按以下顺序匹配，命中即停止：

| 优先级 | 行类型 | 正则模式 | 符号名示例 | SymbolKind |
|--------|--------|----------|------------|------------|
| 1 | 配置行 | `/^-\s+([^|]+?)\s+\|\s+.+$/` | `PeriodicLog.Enable` | Property |
| 2a | Module Created | `/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\[[\d:.]+\]\s+\[(Module Created\|Module Destroyed)\]\s+(\S+)/` | `Module Created: AI` | Constructor |
| 2b | Module Destroyed | （同上） | `Module Destroyed: AI` | Event |
| 3 | Logger 系统消息 | `/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+<([^>]+)>/` | `<Logger Thread Exit>` | Key |

不匹配任何规则的行不产生符号。

---

## 4. 符号名称格式

### 4.1 配置行

从 `- Key | Value` 中提取 `Key` 部分（去除前后空白），直接作为符号名。

```
- PeriodicLog.Enable | 1         →  PeriodicLog.Enable
- PeriodicLog.Threshold(#/s) | 2.00  →  PeriodicLog.Threshold(#/s)
```

### 4.2 模块生命周期

格式为 `事件类型: 模块名`，事件类型取自 `[Module Created]` 或 `[Module Destroyed]`。

```
2026/03/20 17:32:59.425 [...] [Module Created] AI | ...   →  Module Created: AI
2026/03/20 17:33:05.250 [...] [Module Destroyed] AI        →  Module Destroyed: AI
```

### 4.3 Logger 系统消息

保留角括号，格式为 `<标签文本>`。角括号中的内容为任意文本。

```
2026/03/11 18:09:47.330 <Logger Thread Exit> 0 logs ...   →  <Logger Thread Exit>
```

---

## 5. 符号范围计算

每个符号的范围（`range`）从其所在行延伸到下一个符号前一行（或文档末尾），使大纲条目支持折叠。

```
Line 0:  - PeriodicLog.Enable | 1          ← symbol 0, range = [0, 2]
Line 1:  - PeriodicLog.Threshold(#/s) | 2  ← symbol 1, range = [1, 2]
Line 2:  (empty or log line)
Line 3:  [...] [Module Created] AI | ...   ← symbol 2, range = [3, lastLine]
```

`selectionRange` 仅覆盖符号定义行本身。

---

## 6. SymbolKind 选择依据

| SymbolKind | 用于 | 选择理由 |
|------------|------|----------|
| `Property` (6) | 配置参数 | 配置行是键值对，与"属性"语义一致 |
| `Constructor` (8) | Module Created | 模块创建，与"构造"语义一致 |
| `Event` (23) | Module Destroyed | 模块销毁属于生命周期事件 |
| `Key` (19) | Logger 系统消息 | Logger 标签是系统级标记，`Key` 图标适合标识 |

> SymbolKind 影响大纲面板中的图标显示，如实际效果不理想可调整。

---

## 7. 实现架构

### 7.1 文件

| 文件 | 职责 |
|------|------|
| `src/csmlogDocumentSymbolProvider.ts` | `.csmlog` Provider 实现（按优先级匹配每行） |
| `src/symbols/flatSymbols.ts` | 共享辅助：`FlatSymbolEntry` → `vscode.DocumentSymbol[]`（计算可折叠 range） |
| `src/extension.ts` | 注册 Provider 到 `csmlog` 语言 |
| `src/test/csmlogDocumentSymbolProvider.test.ts` | 单元测试 |

### 7.2 类结构

```ts
export class CSMLogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document, token): vscode.DocumentSymbol[] {
        // 1) 逐行扫描，按优先级匹配配置行 → 模块生命周期 → Logger 消息
        // 2) 收集 entries: { lineIndex, name, kind }[]
        // 3) 计算每个 entry 的 range（延伸到下一 entry 前一行）
        // 4) 返回 DocumentSymbol[] — 平铺，无嵌套
    }
}
```

---

## 8. 被忽略的行类型

以下行类型 **不** 产生大纲符号：

- `[State Change]` — 状态变更（数量大，无结构意义）
- `[Sync Message]` / `[Async Message]` / `[No-Rep Async Message]` — 消息通信
- `[Error]` — 错误事件
- `[User Log]` — 用户日志
- `[Register]` / `[Unregister]` — 注册/注销
- `[Interrupt]` — 中断信号
- `[Status]` — 状态上报
- File Logger 行（时间戳后仅跟空格和文本，无方括号或角括号）
- 空行

---

## 9. 测试建议

| 场景 | 预期 |
|------|------|
| 空文档 | 返回空数组 |
| 纯普通日志行 | 返回空数组 |
| 单配置行 | 1 个 Property 符号，名称为 key |
| 多配置行 | 按顺序返回，名称含括号等特殊字符 |
| Module Created | Event 符号，名称 `Module Created: ModuleName` |
| Module Destroyed | Event 符号，名称 `Module Destroyed: ModuleName` |
| Logger 系统消息 | Key 符号，名称 `<LabelText>` |
| 混合文档 | 按出现顺序平铺，普通行被跳过 |
| 符号范围 | 正确延伸到下一符号前一行 |
| selectionRange | 仅覆盖定义行 |

---

## 10. 与其他文档的职责分离

- 本文档负责：大纲匹配规则、符号名格式、SymbolKind 选择、范围计算。
- 高亮文档负责：正则规则、scope、颜色、流程图。
- Hover 文档负责：触发区域、词条策略、委托逻辑。

禁止在多份文档重复维护同一规则表。
