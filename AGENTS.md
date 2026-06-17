# AGENTS.md

**详细开发规范和 agent 分派规则**见 `.github/agents/` 下的 agent 文件。本项目通过 5 个专业子 agent 覆盖所有 VS Code 扩展开发场景，以下仅保留全局通用约定。

---

## 项目架构

| 模块 | 路径 | 职责 |
|------|------|------|
| 扩展入口 | `src/extension.ts` | 注册 Provider、命令、状态栏 |
| 日志折叠 | `src/logFold/` | 归一化 → 检测 → FoldingRangeProvider → 装饰器 |
| 语法高亮 | `syntaxes/*.tmLanguage.json` | csmlog / lvcsm TextMate 语法 |
| 语言功能 | `src/csmlogHoverProvider.ts`, `src/csmlogDocumentSymbolProvider.ts` | Hover 提示、Outline 大纲 |
| 模块管理 | `src/moduleManager/` | 侧边栏 Webview、GitHub/Git 操作 |
| 共享工具 | `src/common/`, `src/hoverData/`, `src/i18n.ts` | 常量、Hover 数据、国际化 |

## 使用中文

所有注释、回复和总结均使用中文。

## 禁止 Reload Window

开发过程中**不要**执行 `Developer: Reload Window`（或等效的窗口重载操作）。Reload Window 会中断当前 LLM 会话的思考过程，导致上下文丢失。当需要验证修改效果时，应优先考虑以下替代方案：

- **自动化测试**：运行单元测试（如 `npm test`）或集成测试验证逻辑正确性。
- **终端命令**：通过 `run_in_terminal` 执行脚本或 Node 代码片段直接验证结果。
- **检查编译输出**：查看 watch 任务的 TypeScript/esbuild 编译/打包输出是否有错误。
- **利用 Pylance/Hover**：通过语言服务工具检查符号、诊断信息等。

## 代码修改注意事项
- 禁止直接在 main 分支上进行开发，需要根据需求，创建 branch，来承接修改任务
- **开始代码修改任务后，第一时间创建 feature branch 并切换过去**，不要在 main 上积累未提交的修改
- 在保证commit完整性的同时，尽可能多的提交
- 每个commit，都要保证能够编译通过，并且通过所有的测试

## 临时文件管理
- 所有临时文件/目录统一使用 `src/common/tempPaths.ts` 中的 `getTempRoot()` 获取临时根目录
- **禁止**直接使用 `os.tmpdir()`，违反此规则会导致临时文件散落在系统临时目录中，难以管理和清理
- 开发环境下 `getTempRoot()` 返回项目根目录下的 `tmp/`，生产环境回退到 `os.tmpdir()`
- `tmp/` 已加入 `.gitignore`，不会被 git 追踪

## 开发工作流

按以下流程完成一个需求的开发，整个过程**自主执行，无需等待用户确认**：

### 1. 分支创建
- 收到需求后，先从 `main` 创建 `feature/<功能简述>` 分支
- 在开始任何代码修改前完成

### 2. 实现 + 频繁提交
- 按功能模块拆分为多个小提交（类型定义 → 逻辑实现 → 配置注册 → 国际化 → 测试）
- 每个提交保证：`tsc --noEmit` 通过 + `npm test`（单元测试）全部通过，`npm run lint` 无新增告警
- 提交信息简洁描述变更内容，保持中英文混合风格

### 3. Review → 修复循环
- 实现完成后调用 `review` 子 agent 审查当前分支
- 根据 review 结果修复问题，再提交
- **重复 review → fix → commit 直到 review 无阻塞项**
- 每次修复后推送：`git push`

### 4. 提交 PR
- 使用 `gh pr create` 创建 PR，包含概述、修改列表、关键设计决策
- 若 `gh` 未认证，告诉用户 PR 链接

### 5. 收尾
- 切换回 `main` 并拉取：`git checkout main && git pull`
- 等待用户指定下一个任务
