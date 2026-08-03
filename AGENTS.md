# AGENTS.md

**详细开发规范**见 `.github/agents/`（`vscode-ext-dev` 开发、`vscode-ext-review` 审查）与 `docs/architecture.md`。以下仅保留全局通用约定。

## 通用约定
- **使用中文**：所有注释、回复和总结使用中文
- **禁止 Reload Window**：验证修改效果用自动化测试 / 终端命令 / 编译输出，不要重载窗口（会中断会话上下文）

## 代码修改
- 禁止直接在 main 分支开发；开始任务后先建 feature branch 并切换
- 每个 commit 保证编译通过 + 所有测试通过，尽量多提交

## 临时文件
- 临时文件统一用 `src/common/tempPaths.ts` 的 `getTempRoot()`，**禁止**直接 `os.tmpdir()`；开发环境落在项目根 `tmp/`（已 gitignore）

## Shell / gh / git 避坑
- Bash on Windows 路径用正斜杠（反斜杠是转义符）
- `git add` 指定文件，不用 `-A`（避免误暂存 `nul`、`.codegraph/`）
- `gh` 传整数用 `--input -` + JSON；PR 正文含特殊字符用 `--body-file`
- `fs.mkdtemp` 前先 `fs.mkdirSync(dir, { recursive: true })`
- Windows 路径比较：统一 `replace(/\\/g, '/').toLowerCase()`（git 大写 / Node 小写）
