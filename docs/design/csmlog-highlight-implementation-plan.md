# CSMLog 高亮显示重构实现计划

> 分支：`feat/csmlog-highlight-refactor`
> 设计文档：[csmlog-highlight-design.md](./csmlog-highlight-design.md)
> 更新日期：2026-03-29
> 状态：进行中

---

## 1. 计划定位

本文档仅记录“执行状态与下一步动作”。

不再重复以下内容：
- 规则细节（见高亮设计文档）
- 颜色全量表（见高亮设计文档）
- 大段流程图（见高亮设计文档）

---

## 2. 当前进度

### 2.1 已完成

- 高亮设计文档已建立并可评审。
- `syntaxes/csmlog.tmLanguage.json` 已实现规则框架。
- `State Change + Filter Marker` 规则已接入并完成初步配置。
- `package.json` 的相关 token 配色已落地。
- README / CHANGELOG 已补充对应说明。

### 2.2 进行中

- 在真实 `.csmlog` 样本上进行视觉验证。
- 检查边界变体与 fallback 命中顺序。

### 2.3 待处理

- 增补/更新测试用例（覆盖过滤标记与无相对时间戳场景）。
- 根据测试结果微调颜色和匹配顺序。
- 完成最终自测并整理 PR 描述。

---

## 3. 验证清单

- [ ] `npm run compile` 通过。
- [ ] 关键样本高亮符合设计文档预期。
- [ ] 过滤标记行优先命中专用规则。
- [ ] fallback 不抢占已定义事件类型。
- [ ] README / CHANGELOG 与实现一致。

---

## 4. 风险与应对

### 风险 1：规则顺序导致误命中

应对：固定“专用规则在前、兜底规则在后”的顺序，并使用样本回归验证。

### 风险 2：颜色对比不足

应对：先保证优先级可辨识，再做主题兼容微调。

### 风险 3：文档再次膨胀

应对：规则和颜色只在高亮设计文档维护一次，本文件只保留状态。

---

## 5. 下一步（执行顺序）

1. 完成样本回归（含边界格式）。
2. 修正规则顺序/捕获细节。
3. 补齐测试并跑全量。
4. 准备 PR。

---

## 6. 相关文档

- 高亮设计：[csmlog-highlight-design.md](./csmlog-highlight-design.md)
- 悬浮设计：[csmlog-hover-design.md](./csmlog-hover-design.md)
- 总览索引：[csmlog-support-design.md](./csmlog-support-design.md)
