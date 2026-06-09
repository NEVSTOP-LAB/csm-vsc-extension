# AGENTS.md

**详细开发规范和 agent 分派规则**见 `.github/agents/` 下的 agent 文件。本项目通过 5 个专业子 agent 覆盖所有 VS Code 扩展开发场景，以下仅保留全局通用约定。

---

## 使用中文

所有注释、回复和总结均使用中文。

## 禁止 Reload Window

开发过程中**不要**执行 `Developer: Reload Window`（或等效的窗口重载操作）。Reload Window 会中断当前 LLM 会话的思考过程，导致上下文丢失。当需要验证修改效果时，应优先考虑以下替代方案：

- **自动化测试**：运行单元测试（如 `npm test`）或集成测试验证逻辑正确性。
- **终端命令**：通过 `run_in_terminal` 执行脚本或 Node 代码片段直接验证结果。
- **检查编译输出**：查看 watch 任务的 TypeScript/esbuild 编译/打包输出是否有错误。
- **利用 Pylance/Hover**：通过语言服务工具检查符号、诊断信息等。
