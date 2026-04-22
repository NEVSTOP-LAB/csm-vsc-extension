# .csmlog 悬浮提示设计文档

> 功能：.csmlog Hover Tooltip
> 关联 Issue：[.csmlog 实现悬浮提示](https://github.com/nevstop/CSMScript-vsc-Support/issues/75)
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
- 对日志内容区的脚本片段复用 `CSMScriptHoverProvider`。

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
6. `|` 之后内容区（委托 `CSMScriptHoverProvider`）

若多个条件同时可命中，按上述顺序返回首个结果。

---

## 4. 实现架构

### 4.1 文件

- `src/csmlogHoverProvider.ts`
- `src/hoverProvider.ts`（被委托）
- `src/extension.ts`（注册）
- `src/test/csmlogHoverProvider.test.ts`

### 4.2 类结构

```ts
export class CSMLogHoverProvider implements vscode.HoverProvider {
  private readonly csmscriptHover = new CSMScriptHoverProvider();

  provideHover(document: vscode.TextDocument, position: vscode.Position) {
    // 1) 判断是否配置行
    // 2) 判断字段区域（时间戳/事件类型/来源标记）
    // 3) 内容区委托给 csmscriptHover
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

词条内容以 `src/csmlogHoverProvider.ts` 中的 `CSMLOG_HOVER_DB` 为唯一维护点。

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
