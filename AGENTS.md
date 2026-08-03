# AGENTS.md

**详细开发规范**见 `.github/agents/`（`vscode-ext-dev` 开发、`vscode-ext-review` 审查）与 `docs/architecture.md`。以下仅保留全局通用约定。

## 通用约定

- **使用中文**：所有注释、回复和总结使用中文
- **禁止 Reload Window**：验证修改效果用自动化测试 / 终端命令 / 编译输出，不要重载窗口（会中断会话上下文）
- **PR留言**：提交同时要检查是否在 github PR 中，如果是，需要在 PR 留言中留言修改的背景和修改目的，方便 reviewer 理解和审查
- 创建 Skill 时只描述问题和约束，提供必要的事实性信息，不要贴具体代码，保持简洁。
- 创建 Skill 需要独立，不要引用仓库中的其他文件夹内容和资源。
- 每次修改，都要检查是否检查是否需要更新文档，确保文档与代码保持一致。

## 代码修改

- 禁止直接在 main 分支开发；开始任务后先建 feature branch 并切换；若分支名冲突，检查现有分支是否属于当前任务以复用，或追加唯一标识（时间戳/issue 号）
- 每个独立的逻辑修改、功能点或错误修复完成后立即提交；commit 前保证编译通过 + 所有测试通过，若编译或测试失败，自行分析终端输出的报错并修复代码，直到通过后再执行 commit

## 临时文件

- 临时文件统一用 `src/common/tempPaths.ts` 的 `getTempRoot()`，**禁止**直接 `os.tmpdir()`；开发环境落在项目根 `tmp/`（已 gitignore）

## Shell / gh / git 避坑

- Bash on Windows 路径用正斜杠（反斜杠是转义符）
- `git add` 指定文件，不用 `-A`（避免误暂存 `nul`、`.codegraph/`）
- `gh` 传整数用 `--input -` + JSON；PR 正文含特殊字符用 `--body-file`
- `fs.mkdtemp` 前先 `fs.mkdirSync(dir, { recursive: true })`
- Windows 路径比较：统一 `replace(/\\/g, '/').toLowerCase()`（git 大写 / Node 小写）
