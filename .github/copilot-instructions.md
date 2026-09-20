# Copilot 项目指令 — csm-vsc-support

本仓库是 CSM VS Code 扩展：为 `.csmlog` / `.lvcsm` 文件提供语言支持，并提供 CSM 模块管理（GitHub 侧边栏）。

## 仓库结构与入口

- 功能域：语言功能 `src/language/`、模块管理 `src/modules/`、共享工具 `src/common/`、本地化 `src/i18n/`
- 详细开发规范：`.github/agents/`（`vscode-ext-dev` 开发、`vscode-ext-review` 审查）与 `docs/architecture.md`
- 测试：`src/test/`（Mocha + vscode-mock）；`npm run compile-tests` 后直接跑单元测试

## 本地化完整性（每次修改必须检查）

- 详细检查清单与禁止项见 `.github/instructions/i18n.instructions.md`

## 临时文件

- 统一用 `src/common/tempPaths.ts` 的 `getTempRoot()`，**禁止**直接 `os.tmpdir()`；开发环境落在项目根 `tmp/`（已 gitignore）

## 版本号铁律

`engines.vscode` 是运行时最低版本唯一权威来源；`@types/vscode` 只是类型声明版本、不代表运行时要求；文档版本引用一律以 `engines.vscode` 为准，禁止用 `@types/vscode` 版本号。

## 文档同步（强制）

| 源文件变更                   | 必须检查的文档                                  |
| ---------------------------- | ----------------------------------------------- |
| `engines.vscode`             | README.md（安装要求）、CHANGELOG.md（技术栈）   |
| `version`                    | CHANGELOG.md（版本号章节）                      |
| `contributes` 新增           | README.md（功能列表）、CHANGELOG.md（变更记录） |
| `src/` 新功能                | README.md（功能列表）、CHANGELOG.md（变更记录） |
| `src/language/logFold/` 变更 | README.md（设置表格）、CHANGELOG.md（新增章节） |
| `syntaxes/` 变更             | README.md、`docs/` 相关设计文档                 |
