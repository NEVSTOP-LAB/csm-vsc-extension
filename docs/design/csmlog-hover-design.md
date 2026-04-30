# .csmlog 悬浮提示设计文档

> 功能：.csmlog Hover Tooltip
> 关联 Issue：[.csmlog 实现悬浮提示](https://github.com/nevstop/csm-vsc-extension/issues/75)
> 更新日期：2026-03-29
> 状态：维护中
> 依赖：[csmlog-support-design.md](./csmlog-support-design.md)

---

## 1. 文档定位

本文档只描述 Hover 相关设计，不重复高亮规则与颜色方案。

相关文档：
- 总览与边界：[csmlog-support-design.md](./csmlog-support-design.md)
- 高亮规则与流程：[csmlog-highlight-design.md](./csmlog-highlight-design.md)

---

## 2. 目标与范围

### 2.1 目标

- 在 `.csmlog` 中提供上下文敏感悬浮提示。
- 解释关键字段：时间戳、事件类型、配置键、来源标记。
- 对日志内容区的脚本片段复用 `hover/db/*` 中聚合的关键字条目。

### 2.2 包含

- 事件类型 Hover
- 时间戳 Hover
- 配置键 Hover
- `<-` 来源标记 Hover
- 内容区委托 Hover（复用现有脚本 Hover）

### 2.3 不包含

- 模块名跳转/定义
- 跨文件追踪

---

## 3. 触发区域与优先级

按同一行从左到右判断：

1. 配置行键名区域
2. 完整时间戳区域
3. 相对时间戳区域（可选）
4. 事件类型区域
5. 来源标记 `<-` 区域
6. `|` 之后内容区（委托 `provideContentHover`）

若多个条件同时可命中，按上述顺序返回首个结果。

---

## 4. 实现架构

### 4.1 文件

| 文件 | 职责 |
|------|------|
| `src/csmlogHoverProvider.ts` | `CSMLogHoverProvider` 编排：分支到 配置行 / File Logger / 标准日志行 |
| `src/csmlog/logLineParser.ts` | 标准日志行的正则常量与 `parseLogLineZones`（时间戳/事件类型/内容起点） |
| `src/csmlog/headerHoverDb.ts` | 日志头词条：事件类型、时间戳、配置键、`<-` 来源标记 |
| `src/hover/types.ts` | `HoverEntry` 接口与共享 `buildHover` 实现 |
| `src/hover/contentHover.ts` | 内容区委托入口 `provideContentHover` 与查询辅助函数 / 锚点缓存 |
| `src/hover/db/index.ts` | 内容区词条总表（拼接各类别） |
| `src/hover/db/operators.ts` | 通信操作符、`=>` 返回值、`->` 订阅、广播目标、`${...}` |
| `src/hover/db/sections.ts` | `[COMMAND_ALIAS]` 等预定义节、`API:` / `Macro:` 状态前缀 |
| `src/hover/db/commands.ts` | 内置脚本指令（GOTO、WAIT、ECHO、TAGDB_*、对话框 等） |
| `src/hover/db/controlFlow.ts` | 控制流（`<if>` / `<while>` / ...）、范围/字符串运算符、`??` |
| `src/hover/db/systemStates.ts` | CSM 框架内置状态名（含多词短语） |
| `src/extension.ts` | 注册 Provider |
| `src/test/csmlogHoverProvider.test.ts` | 单元测试 |

### 4.2 类结构

```ts
export class CSMLogHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position) {
    // 1) 判断是否配置行
    // 2) 判断字段区域（时间戳/事件类型/来源标记）
    // 3) 内容区委托给 provideContentHover（来自 src/hover/contentHover.ts）
    // 4) 无命中返回 undefined
  }
}
```

---

## 5. Hover 词条策略

- 事件类型：标题 + 优先级 + 含义 + 示例
- 时间戳：字段含义 + 与另一时间戳的关系
- 配置键：参数说明 + 取值语义
- 来源标记：链路方向说明

词条内容拆分维护：

- 日志头部词条（事件类型、时间戳、配置键、`<-`）：`src/csmlog/headerHoverDb.ts`
- 内容区词条（操作符、指令、控制流、系统状态等）：`src/hover/db/*.ts`，由 `src/hover/db/index.ts` 聚合。

---

## 6. 测试建议

- 事件类型全覆盖（含变体）
- 可选相对时间戳场景
- 无 `|` 变体
- 内容区委托命中
- 非命中返回 `undefined`

---

## 7. 与高亮文档的职责分离

- 高亮文档负责：正则规则、scope、颜色、流程图
- Hover 文档负责：触发区域、词条策略、委托逻辑

禁止在两份文档重复维护同一规则表。
