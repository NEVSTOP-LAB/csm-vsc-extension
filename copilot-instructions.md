# Copilot 项目指令 — csm-vsc-support

本仓库是 CSM VS Code 扩展：为 `.csmlog` / `.lvcsm` 文件提供语言支持，并提供 CSM 模块管理（GitHub 侧边栏）。以下为本仓库相关的开发规范（通用工程纪律见 `AGENTS.md`）。

## 仓库结构与入口

- 功能域：语言功能 `src/language/`、模块管理 `src/modules/`、共享工具 `src/common/`、本地化 `src/i18n/`
- 详细开发规范：`.github/agents/`（`vscode-ext-dev` 开发、`vscode-ext-review` 审查）与 `docs/architecture.md`
- 测试：`src/test/`（Mocha + vscode-mock）；`npm run compile-tests` 后直接跑单元测试

## 本地化完整性（每次修改必须检查）

新增/改动的用户可见内容必须本地化完整：

- **唯一入口 `src/i18n/`**：`core.ts`（基础设施）/ `messages.ts`（模块管理文案，`t()`）/ `logFold.ts`（折叠文案）/ `language.ts`（语言功能文案）
- **清单级**：`package.nls.json` + `package.nls.zh-cn.json`，两文件键集合必须一一对应
- **详细检查清单与禁止项**见 `.github/instructions/i18n.instructions.md`

## PR 留言流程

每完成一个阶段（一批提交）后：

1. 用 `gh pr status` 检查当前分支是否有关联的 open PR
2. 若有关联，用 `gh pr comment` 留言本阶段修改的背景、内容与关键决策
3. 用 `gh pr edit --body-file` 更新 PR 整体描述（在"变更内容"中追加本阶段变更），方便 reviewer 理解与审查

## 临时文件

- 统一用 `src/common/tempPaths.ts` 的 `getTempRoot()`，**禁止**直接 `os.tmpdir()`；开发环境落在项目根 `tmp/`（已 gitignore）

## Shell / gh / git 避坑

- Bash on Windows 路径用正斜杠（反斜杠是转义符）
- `git add` 指定文件，不用 `-A`（避免误暂存 `nul`、`.codegraph/`）
- `gh` 传整数用 `--input -` + JSON；PR 正文含特殊字符用 `--body-file`
- `fs.mkdtemp` 前先 `fs.mkdirSync(dir, { recursive: true })`
- Windows 路径比较：统一 `replace(/\\/g, '/').toLowerCase()`（git 大写 / Node 小写）
- `gh pr comment` / `gh pr create` 即使终端输出被截断或看似失败，也可能已成功发布；重复执行前必须先确认，勿想当然
- 判断 issue/PR 评论是否已发布，用 `gh api repos/{owner}/{repo}/issues/{n}/comments` 查询；不要用 PR fetch 工具返回的 `comments` 字段判断——那是 review comments（行内评审），不含 issue comments（正文下普通评论）
