# CSMScript VSCode 插件开发计划

> 本文档记录为 **CSMScript**（一种面向状态机的领域特定脚本语言）开发并发布 VSCode 插件的全流程计划，涵盖调研、开发、测试、发布四个阶段。
>
> **相关文档：** [VSCode Marketplace 同类插件调研报告](../research/marketplace-similar-plugins-survey.md) — 状态机 DSL 类插件横向对比与技术选型建议。

---

## 速查：通用 VSCode 插件开发流程

> 以下摘要**适用于任何 VSCode 插件的开发**，不局限于 CSMScript，可作为快速参考或入门概览。  
> 具体到 CSMScript 的背景与目标，见 [§1 背景与目标](#1-背景与目标)；完整细节见各章节或 [VSCode Extension API](https://code.visualstudio.com/api)。

### 开发四阶段

| 阶段 | 主要工作 | 关键工具 / 参考 |
|------|---------|--------------|
| **阶段一：调研** | 了解 VSCode 插件体系、确定功能范围、技术选型、搭建环境 | [Extension Capabilities](https://code.visualstudio.com/api/extension-capabilities/overview)、[Contribution Points](https://code.visualstudio.com/api/references/contribution-points) |
| **阶段二：开发** | `yo code` 初始化骨架、编写语言定义 / 语法高亮 / 代码片段 / IntelliSense / LSP | TypeScript、esbuild、`yo code` |
| **阶段三：测试** | 单元测试 + 集成测试 + CI/CD 接入（GitHub Actions）| `@vscode/test-cli`、mocha、`vscode-tmgrammar-test` |
| **阶段四：发布** | 打包、发布至 VSCode Marketplace（可选 Open VSX）、自动化发布流程 | `@vscode/vsce`、Azure DevOps PAT |

### 常见插件功能与实现方式

| 功能 | VSCode 实现方式 | 复杂度 |
|------|---------------|:------:|
| 语法高亮 | TextMate Grammar（`.tmLanguage.json`）| ⭐ |
| 代码片段（Snippets）| `.code-snippets` 文件 | ⭐ |
| 实时预览（WebView）| `vscode.window.createWebviewPanel` | ⭐⭐ |
| IntelliSense / Hover | `CompletionItemProvider` / `HoverProvider` | ⭐⭐⭐ |
| 诊断 / 跳转定义 | `DiagnosticCollection` / `DefinitionProvider` | ⭐⭐⭐⭐ |
| 完整语言服务 | Language Server Protocol（LSP）| ⭐⭐⭐⭐ |
| 可视化双向编辑 | `CustomTextEditorProvider` + WebView | ⭐⭐⭐⭐⭐ |

### 常用工具速查

| 工具 | 用途 |
|------|------|
| `yo code` | 项目脚手架生成器（`npm i -g yo generator-code` → `yo code`）|
| `@vscode/vsce` | 打包（`vsce package`）与发布（`vsce publish`）|
| `@vscode/test-cli` | 官方插件测试框架 |
| `vscode-tmgrammar-test` | TextMate Grammar 快照测试 |
| `vscode-extension-tester` | E2E 测试（模拟用户操作）|

---

## 目录

0. [速查：通用 VSCode 插件开发流程](#速查通用-vscode-插件开发流程)
1. [背景与目标](#1-背景与目标)
2. [阶段一：调研](#2-阶段一调研)
3. [阶段二：开发](#3-阶段二开发)
4. [阶段三：测试](#4-阶段三测试)
5. [阶段四：发布](#5-阶段四发布)
6. [附录：工具与资源汇总](#6-附录工具与资源汇总)

---

## 1. 背景与目标

| 项目 | 说明 |
|------|------|
| 仓库 | [NEVSTOP-LAB/CSMSript-vsc-Support](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support) |
| 目标 | 开发一款可发布至 VSCode Marketplace 的插件，为 CSMScript 这门新的状态机脚本语言提供编辑器支持 |
| 语言特点 | CSMScript 是面向状态机的领域特定脚本语言（DSL），核心概念包括状态（State）、迁移（Transition）和通信（Communication） |
| 插件功能规划 | 语法高亮 → 代码片段 → IntelliSense → 状态机可视化预览 → 完整语言服务（分阶段交付，详见下方里程碑） |

---

## 2. 阶段一：调研

### 2.1 了解 VSCode 插件体系

| 任务 | 说明 | 参考链接 |
|------|------|---------|
| 插件能力概览 | 了解 VSCode 插件可以做什么（UI、语言支持、主题、调试等） | [Extension Capabilities Overview](https://code.visualstudio.com/api/extension-capabilities/overview) |
| 插件 API 文档 | 完整的 API 参考 | [VSCode Extension API](https://code.visualstudio.com/api) |
| 贡献点（Contribution Points） | `package.json` 中声明的各类贡献点（commands、languages、grammars 等） | [Contribution Points](https://code.visualstudio.com/api/references/contribution-points) |
| 激活事件（Activation Events） | 控制插件何时被加载 | [Activation Events](https://code.visualstudio.com/api/references/activation-events) |
| 已有同类插件调研 | 在 Marketplace 搜索类似功能的插件，了解实现思路。**详见：** [VSCode Marketplace 同类插件调研报告](../research/marketplace-similar-plugins-survey.md) | [VSCode Marketplace](https://marketplace.visualstudio.com/vscode) |

### 2.2 确定插件功能范围

根据 CSMScript 作为状态机脚本语言的特点，需要决定实现哪些功能。参考[同类插件调研报告](../research/marketplace-similar-plugins-survey.md)中推荐的分阶段策略，常见的语言支持类插件功能包括：

| 功能 | VSCode 实现方式 | 参考文档 |
|------|---------------|---------|
| 语法高亮 | TextMate Grammar（`.tmLanguage`） | [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide) |
| 代码片段（Snippets） | `.code-snippets` 文件 | [Snippets Guide](https://code.visualstudio.com/api/language-extensions/snippet-guide) |
| 代码补全（IntelliSense） | `CompletionItemProvider` | [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features) |
| 悬停提示（Hover） | `HoverProvider` | 同上 |
| 代码诊断（Diagnostics） | `DiagnosticCollection` | 同上 |
| 语言服务器（LSP） | Language Server Protocol | [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide) |
| 主题 / 图标 | Color Theme / Icon Theme | [Color Theme Guide](https://code.visualstudio.com/api/extension-guides/color-theme) |
| 自定义命令 | `commands.registerCommand` | [Command Guide](https://code.visualstudio.com/api/extension-guides/command) |
| 代码格式化 | `DocumentFormattingEditProvider` | [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features) |
| 跳转定义 / 引用 | `DefinitionProvider` / `ReferenceProvider` | 同上 |

### 2.3 技术选型

| 项目 | 选项 | 推荐 |
|------|------|------|
| 开发语言 | TypeScript / JavaScript | **TypeScript**（官方推荐，类型安全） |
| 包管理器 | npm / yarn / pnpm | npm 或 pnpm |
| 打包工具 | esbuild / webpack / rollup | **esbuild**（yo code 脚手架默认提供） |
| 脚手架工具 | `yo code` | 官方推荐，快速生成项目骨架 |
| 语言服务器 | `vscode-languageserver` 系列包 | 如需 LSP 支持则采用 |

**相关链接：**
- [TypeScript 官网](https://www.typescriptlang.org/)
- [yo code 生成器](https://github.com/Microsoft/vscode-generator-code)
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)

### 2.4 环境准备清单

- [ ] 安装 [Node.js](https://nodejs.org/)（建议 LTS 版本，≥ 18）
- [ ] 安装 [Visual Studio Code](https://code.visualstudio.com/)
- [ ] 安装脚手架：`npm install -g yo generator-code`
- [ ] 安装发布工具：`npm install -g @vscode/vsce`
- [ ] 注册 [Azure DevOps](https://dev.azure.com/) 账号（发布插件需要）
- [ ] 注册 [Visual Studio Marketplace Publisher](https://marketplace.visualstudio.com/manage) 账号
- [ ] 准备插件图标（建议 128×128 PNG）

---

## 3. 阶段二：开发

### 3.1 项目初始化

```bash
# 使用官方脚手架生成项目骨架
npm install -g yo generator-code
yo code
```

生成器会询问插件类型（New Extension / New Language Support / New Color Theme 等），根据实际需求选择。生成的项目包含：

```
my-extension/
├── .vscode/          # 调试配置
├── src/
│   └── extension.ts  # 插件入口
├── package.json      # 清单文件（最重要）
├── tsconfig.json
└── README.md
```

**参考：** [Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)

### 3.2 `package.json` 关键字段

`package.json` 是插件的清单文件，控制插件的元数据、能力声明和激活条件。

```jsonc
{
  "name": "csmscript-support",           // 插件 ID（唯一）
  "displayName": "CSMScript Support",    // 显示名称
  "description": "...",                   // 简短描述
  "version": "0.0.1",
  "publisher": "your-publisher-id",       // 发布者 ID（需在 Marketplace 注册）
  "engines": { "vscode": "^1.85.0" },    // 最低支持的 VSCode 版本
  "categories": ["Programming Languages"],
  "activationEvents": [],                 // 激活事件（现代插件可留空，用 * 或按需填写）
  "contributes": {                        // 贡献点
    "languages": [...],
    "grammars": [...],
    "snippets": [...],
    "commands": [...]
  },
  "main": "./out/extension.js",           // 入口文件
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  }
}
```

**参考：** [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)

### 3.3 核心开发任务拆解

#### 任务 1：语言定义（必做）
- 为 CSMScript 注册一种新语言（`id`、文件扩展名、注释符号等）
- **文档：** [Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide)

#### 任务 2：语法高亮（必做）
- 编写 TextMate Grammar（JSON / YAML 格式的 `.tmLanguage` 文件）
- 工具推荐：[vscode-textmate](https://github.com/microsoft/vscode-textmate) 用于调试，[Scope Inspector](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide#scope-inspector) 用于查看作用域
- **文档：** [Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

#### 任务 3：代码片段（推荐）
- 创建 `.code-snippets` 文件，提供常用模板
- **文档：** [Snippet Guide](https://code.visualstudio.com/api/language-extensions/snippet-guide)

#### 任务 4：IntelliSense / Hover（可选，提升体验）
- 实现 `CompletionItemProvider`、`HoverProvider`
- 根据功能复杂度，可选择内联实现或使用 LSP
- **文档：** [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)

#### 任务 5：语言服务器（可选，复杂语言推荐）
- 将语言逻辑拆分到独立的 Language Server 进程中
- 使用 `vscode-languageserver` 和 `vscode-languageclient` 包
- **文档：** [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

### 3.4 调试插件

VSCode 内置插件调试支持：

1. 打开插件项目文件夹
2. 按 `F5` 启动扩展宿主（Extension Development Host）
3. 在新打开的窗口中测试插件功能
4. 在源文件中打断点，查看 Debug Console

**文档：** [Extension Development](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

### 3.5 版本控制规范

- 使用 [Semantic Versioning](https://semver.org/)：`MAJOR.MINOR.PATCH`
- 维护 `CHANGELOG.md`，记录每个版本的变更
- **参考格式：** [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)

---

## 4. 阶段三：测试

### 4.1 测试框架选择

VSCode 官方推荐使用 `@vscode/test-cli` + `mocha` 进行插件测试。

```bash
npm install --save-dev @vscode/test-cli @vscode/test-electron
```

**文档：** [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

### 4.2 测试类型

| 测试类型 | 工具 | 说明 |
|---------|------|------|
| 单元测试 | mocha + assert / chai | 测试纯逻辑函数（不依赖 VSCode API） |
| 集成测试 | `@vscode/test-cli` | 在真实 VSCode 环境中运行测试 |
| 端到端测试 | 手动 / vscode-extension-tester | 模拟用户操作 |
| 语法高亮测试 | `vscode-tmgrammar-test` | 快照测试 TextMate Grammar | 

**相关工具：**
- [vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester) — Red Hat 开发的 E2E 测试工具
- [vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test) — 语法高亮测试

### 4.3 测试配置示例

`.vscode-test.mjs`：

```js
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
});
```

`package.json` 脚本：

```json
{
  "scripts": {
    "test": "vscode-test"
  }
}
```

### 4.4 CI/CD 集成

使用 GitHub Actions 在每次 Push / PR 时自动运行测试：

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: xvfb-run -a npm test   # Linux 需要虚拟显示
```

**参考：**
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
- [GitHub Actions for VS Code Extension](https://github.com/microsoft/vscode-extension-samples/blob/main/.github/workflows/ci.yml)

### 4.5 发布前检查清单

- [ ] 所有单元测试通过
- [ ] 在 Windows / macOS / Linux 三平台验证
- [ ] `README.md` 包含截图或 GIF 演示
- [ ] `CHANGELOG.md` 更新
- [ ] `package.json` 中 `version`、`description`、`publisher`、`repository` 等字段完整
- [ ] 插件图标已准备（128×128 PNG）
- [ ] `.vscodeignore` 配置正确，排除不必要文件
- [ ] 在本地用 `vsce package` 打包并手动安装验证

---

## 5. 阶段四：发布

### 5.1 注册发布者账号

1. 访问 [Azure DevOps](https://dev.azure.com/) 注册账号
2. 在 `dev.azure.com/{your-org}/_usersSettings/tokens` 创建 **Personal Access Token（PAT）**
   - 范围（Scopes）：**Marketplace → Manage**
   - 记录 Token（仅显示一次）
3. 访问 [Visual Studio Marketplace Publisher 管理页](https://marketplace.visualstudio.com/manage)，创建 Publisher
   - Publisher ID 必须与 `package.json` 中的 `publisher` 字段一致

**文档：** [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

### 5.2 安装并配置 vsce

```bash
# 安装发布工具
npm install -g @vscode/vsce

# 使用 PAT 登录
vsce login <publisher-id>
```

### 5.3 打包与发布流程

```bash
# 本地打包（生成 .vsix 文件，可手动安装测试）
vsce package

# 发布到 Marketplace
vsce publish

# 发布指定版本
vsce publish 1.0.0

# 使用 PAT 直接发布（CI 场景）
vsce publish -p <token>
```

**文档：** [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)

### 5.4 `.vscodeignore` 配置

排除不需要打包进插件的文件，减小 `.vsix` 体积：

```
.vscode/**
.vscode-test/**
src/**
.gitignore
tsconfig.json
**/*.map
node_modules/**   # 如已打包则排除
```

### 5.5 自动化发布（GitHub Actions）

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Publish to VSCode Marketplace
        run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
      - name: Publish to Open VSX (可选)
        run: npx ovsx publish -p ${{ secrets.OVSX_TOKEN }}
```

**说明：** 需要在 GitHub 仓库的 Settings → Secrets 中配置 `VSCE_PAT`。

### 5.6 发布到 Open VSX（可选）

[Open VSX Registry](https://open-vsx.org/) 是 VSCode Marketplace 的开源替代，供 VSCodium、Gitpod 等使用。

```bash
npm install -g ovsx
ovsx publish -p <open-vsx-token>
```

**文档：** [Open VSX Publishing](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)

### 5.7 版本迭代与维护

| 任务 | 说明 |
|------|------|
| 响应 Issue | 在 GitHub Issues 中及时回复用户反馈 |
| 语义化版本 | 修复用 patch，新功能用 minor，破坏性变更用 major |
| 更新 CHANGELOG | 每次发布前更新 `CHANGELOG.md` |
| 废弃旧版本 | 通过 `vsce unpublish` 或在 Marketplace 后台操作 |

---

## 6. 附录：工具与资源汇总

### 官方文档

| 资源 | 链接 |
|------|------|
| VSCode Extension API 首页 | https://code.visualstudio.com/api |
| 插件示例集合 | https://github.com/microsoft/vscode-extension-samples |
| 贡献点参考 | https://code.visualstudio.com/api/references/contribution-points |
| Extension Manifest | https://code.visualstudio.com/api/references/extension-manifest |
| 发布插件指南 | https://code.visualstudio.com/api/working-with-extensions/publishing-extension |
| 测试插件指南 | https://code.visualstudio.com/api/working-with-extensions/testing-extension |
| CI 集成 | https://code.visualstudio.com/api/working-with-extensions/continuous-integration |

### 工具

| 工具 | 用途 | 链接 |
|------|------|------|
| `yo code` | 项目脚手架生成器 | https://github.com/Microsoft/vscode-generator-code |
| `@vscode/vsce` | 打包与发布工具 | https://github.com/microsoft/vscode-vsce |
| `@vscode/test-cli` | 官方测试框架 | https://github.com/microsoft/vscode-test-cli |
| `vscode-textmate` | TextMate Grammar 调试 | https://github.com/microsoft/vscode-textmate |
| `vscode-tmgrammar-test` | 语法高亮快照测试 | https://github.com/PanAeon/vscode-tmgrammar-test |
| `vscode-extension-tester` | E2E 测试 | https://github.com/redhat-developer/vscode-extension-tester |
| `ovsx` | 发布到 Open VSX | https://github.com/eclipse/openvsx |

### 参考插件（可作为实现参考）

| 插件 | 特点 | 仓库 |
|------|------|------|
| vscode-python | 完整的语言支持（LSP + 调试） | https://github.com/microsoft/vscode-python |
| vscode-markdown | 语法高亮 + 预览 | https://github.com/yzhang-gh/vscode-markdown |
| vscode-lua | 语言服务器示例 | https://github.com/sumneko/lua-language-server |
| vscode-yaml | YAML 支持（基于 LSP） | https://github.com/redhat-developer/vscode-yaml |
| vscode-extension-samples | 官方示例合集 | https://github.com/microsoft/vscode-extension-samples |

### 有用的社区资源

| 资源 | 链接 |
|------|------|
| VSCode Extension 开发讨论区 | https://github.com/microsoft/vscode/discussions |
| Stack Overflow `vscode-extensions` 标签 | https://stackoverflow.com/questions/tagged/vscode-extensions |
| VSCode Dev Slack | https://aka.ms/vscode-dev-community |
| Marketplace 统计面板 | https://marketplace.visualstudio.com/manage |

---

## 里程碑建议

| 里程碑 | 目标 | 大致周期 |
|--------|------|---------|
| M0 | 调研完成，确定功能范围，环境搭建 | 第 1 周 |
| M1 | 完成语言定义 + 语法高亮，可本地安装测试 | 第 2-3 周 |
| M2 | 完成代码片段 + 基础 IntelliSense | 第 3-4 周 |
| M3 | 测试完善，CI 接入，首次发布 v0.1.0 | 第 4-5 周 |
| M4 | 根据反馈迭代，发布稳定版 v1.0.0 | 第 6-8 周 |

---

## 当前开发进度

开发进度通过 [GitHub Issues](https://github.com/NEVSTOP-LAB/CSMScript-vsc-Support/issues) 追踪，按里程碑分组：

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| M0 | 调研完成，确定功能范围，环境搭建 | ✅ 已完成 |
| M1 | 语言定义 + 语法高亮，可本地安装测试 | ✅ 已完成 |
| M2 | 代码片段 + IntelliSense + 悬停提示 + 语法诊断 | ✅ 已完成 |
| M3 | 测试完善，CI 接入，首次发布 v0.1.0 | ✅ 已完成 |
| M4 | 自动化发布，根据反馈迭代，发布稳定版 v1.0.0 | 📋 计划中 |

---

*文档创建日期：2026-03-06*  
*如有讨论，请在对应 Issue 或 PR 中留言。*
