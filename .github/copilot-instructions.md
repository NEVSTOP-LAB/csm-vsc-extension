# Copilot 项目指令 — csm-vsc-support

本仓库是 CSM VS Code 扩展：为 `.csmlog` / `.lvcsm` 文件提供语言支持，并提供 CSM 模块管理（GitHub 侧边栏）。

## 仓库结构与入口

- 功能域：语言功能 `src/language/`、模块管理 `src/modules/`、共享工具 `src/common/`、本地化 `src/i18n/`
- 详细开发规范：`.github/agents/`（`vscode-ext-dev` 开发、`vscode-ext-review` 审查）与 `docs/architecture.md`
- 测试：`src/test/`（Mocha + vscode-mock）；`npm run compile-tests` 后直接跑单元测试

## 本地化完整性（每次修改必须检查）

新增/改动的用户可见内容必须本地化完整：

- **唯一入口 `src/i18n/`**：`core.ts`（基础设施）/ `messages.ts`（模块管理文案，`t()`）/ `logFold.ts`（折叠文案）/ `language.ts`（语言功能文案）
- **清单级**：`package.nls.json` + `package.nls.zh-cn.json`，两文件键集合必须一一对应
- **详细检查清单与禁止项**见 `.github/instructions/i18n.instructions.md`

## 临时文件

- 统一用 `src/common/tempPaths.ts` 的 `getTempRoot()`，**禁止**直接 `os.tmpdir()`；开发环境落在项目根 `tmp/`（已 gitignore）
