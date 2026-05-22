# 贡献指南

欢迎提交 Issue 和 Pull Request。本文档聚焦本仓库当前的本地开发、调试、验证与提交流程。

## 环境要求

- Node.js 22.x
- npm 10+
- Git
- Visual Studio Code 1.60.0 或更高版本

> 在 Windows PowerShell 中，如果执行策略阻止 `npm.ps1`，请改用 `npm.cmd` / `npx.cmd`。

## 本地开发

```bash
# 克隆仓库
git clone https://github.com/nevstop/csm-vsc-extension.git
cd csm-vsc-extension

# 安装依赖
npm install

# 一次性编译（类型检查 + lint + esbuild）
npm run compile
```

### 增量开发

```bash
# 监听 TypeScript 与 esbuild
npm run watch

# 监听测试编译
npm run watch-tests
```

在 VS Code 中也可以直接运行工作区里的 `watch` / `watch-tests` 任务。

## 调试扩展

### F5 调试（推荐）

1. 用 VS Code 打开仓库根目录。
2. 按 `F5`，启动新的 Extension Development Host 窗口。
3. 在新窗口中验证以下能力：
   - `.csmlog` 语法高亮、Hover、Outline
   - `.lvcsm` 语法高亮、Outline
   - `CSM Modules` 侧边栏的加载、搜索、排序、README 预览、模块操作
4. 如需检查语法作用域，运行 `Developer: Inspect Editor Tokens and Scopes`。

### 手动测试文件

- [src/test/fixtures/sample.csmlog](src/test/fixtures/sample.csmlog)
- 任意新建的 `.lvcsm` 文件

## 自动化验证

### 代码检查与类型检查

```bash
npm run check-types
npm run lint
```

### 无 VS Code 单元测试

```bash
# 编译测试输出
npm run compile-tests

# 运行全部 standalone 测试
npx mocha --ui tdd --timeout 10000 --require out/test/setup.js out/test/*.test.js
```

如果只验证模块管理相关改动，优先运行窄测试：

```bash
npx mocha --ui tdd --timeout 10000 --require out/test/setup.js out/test/moduleManagerController.test.js out/test/moduleManager.test.js
```

### 完整扩展测试

```bash
npm test
```

`npm test` 会启动 VS Code 进程。在 Linux 无头环境中，可配合 `xvfb-run -a npm test`。

## VSIX 构建与本地验证

```bash
# 仅打包 VSIX
npm run vsix:package

# 校验本地已安装版本
npm run vsix:verify-local

# 本地收尾流程：同步文档、编译、打包、安装、校验
npm run hook:finish
```

如果需要手动安装 VSIX：

```bash
code --install-extension csm-vsc-support-*.vsix
```

## 代码风格约定

- 源码位于 `src/`，TypeScript 严格模式开启。
- `npm run lint` 仅检查 `src/`。
- 模块管理相关逻辑优先通过依赖注入保持可测试性，避免在测试中直接覆写私有字段。
- `CompletionDef.insertText` 需要使用 `vscode.SnippetString` 包装，保留占位符能力。

## 提交 PR 规范

- 每个 PR 应聚焦单一主题，避免混入无关改动。
- 提交前请关联对应 Issue，并在 PR 描述中写明验证命令与结果。
- 涉及功能、配置或运行要求变更时，同步更新 `README.md`、`CHANGELOG.md` 及相关设计/使用文档。
- 提交前至少完成以下检查：
  - `npm run check-types`
  - `npm run lint`
  - `npm run compile-tests`
  - 受影响范围内的窄测试，必要时再跑 `npm test`

## 扩展图标

当前仓库中的 [images/icon.png](images/icon.png) 为已发布版本使用的图标资源。若需要迭代，请参考 [docs/images-guide.md](docs/images-guide.md)。
