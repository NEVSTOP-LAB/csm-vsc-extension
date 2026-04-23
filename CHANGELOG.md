# 更新日志

本文件记录 "csm-vsc-support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布] / [Unreleased]

### 变更

- CI：修复无 VS Code 单元测试任务引用已删除 `out/test/grammar.test.js` 的问题，改为运行现有 csmlog standalone 测试
- 构建：`esbuild.js` 增强错误处理
  - `location` 为空时不再二次报错
  - 非 watch 构建在 `rebuild()` 返回 errors 时显式以非零退出
- Outline：`src/csmlogDocumentSymbolProvider.ts` 的模块生命周期匹配放宽
  - 相对时间戳改为可选
  - 模块名缺失时使用 `<unknown-module>` 占位
- 元数据：扩展名与 VSIX 产物命名统一为 `csm-vsc-support`
- 文档：README / CONTRIBUTING / 架构说明同步到当前仓库能力（`.csmlog` + `.lvcsm`）

## [0.0.4] - 2026-03-29

### 新增

- `.csmlog` 语言支持（语法高亮、Hover、Outline）
- `.lvcsm` 语言支持（INI 语法复用）
- CI 流水线（类型检查、lint、单元测试、VSIX 打包与校验）

## [0.0.3] - 2026-03-20

### 新增（基于 CSMScript_User_Manual 完整重设计）

- **语法高亮**（`syntaxes/csmscript.tmLanguage.json`）大幅扩展，根据 CSMScript_User_Manual.md 补全全部语言特性：
  - **控制流**：`<if expr>`, `<else>`, `<end_if>`, `<while expr>`, `<end_while>`, `<do_while>`, `<end_do_while expr>`, `<foreach var in list>`, `<end_foreach>`
  - **引入文件**：`<include filepath.csmscript>`
  - **跳转锚点**：`<anchor_name>` 通用标签
  - **变量引用**：`${varname}` 和 `${varname:default}`
  - **返回值保存**：`=> varname`
  - **范围运算符**：`∈`（在范围内）、`!∈`（不在范围内）
  - **条件跳转**：`?? goto`（错误跳转）、`?expression? goto`（条件跳转）
  - **内置命令**：GOTO/JUMP、WAIT/SLEEP（含 `(ms)/(s)` 变体）、BREAK/CONTINUE、AUTO_ERROR_HANDLE_ENABLE/ANCHOR、ECHO/ECHO0–9、EXPRESSION、RANDOM 系列、对话框命令、INI_VAR_SPACE_*、TAGDB_* 命令全集
  - **预定义区**：INI 风格 `[SECTION_NAME]` 段头（CommandAlias/AUTO_ERROR_HANDLE/INI_VAR_SPACE/TAGDB_VAR_SPACE）和 `key = value` 键值对
- **语言配置**（`language-configuration.json`）：
  - 新增 `<` → `>` 自动补全（控制流标签 / 锚点）
  - 新增 `${` → `}` 自动补全（变量引用）
- **测试**：新增 `Grammar Pattern Tests`、`Variable Reference Tests`、`Return Value and Range Operator Tests`、`Conditional Jump Tests`、`Pre-definition Section Tests`、`Grammar Integration Smoke Tests` 六个测试套件，全面覆盖新增特性
- **设计文档**（`docs/design/m1-language-definition-design.md`）：完整更新语言特性描述（2.x 节）、顶层规则表（6.2）、Scope 命名表（6.3）、高亮示例（6.4）
- **代码片段**（`snippets/csmscript.code-snippets`）：覆盖控制流、通信操作符、变量引用等高频代码模式
- **代码补全**（`src/completionProvider.ts`）：IntelliSense 补全项，触发字符：`<`、`[`、`>`、`$`、`?`，支持 Tab 占位符（Snippet String）
- **悬停提示**（`src/hoverProvider.ts`）：关键字的 Markdown 文档说明，用户定义锚点另显示定义行号及行内注释
- **语法诊断**（`src/diagnosticProvider.ts`）：诊断规则（CSMSCRIPT001–008），覆盖未闭合标签、变量引用错误、EXPRESSION 使用限制等
- **CI/CD**（`.github/workflows/ci.yml`）：并行 Job（lint + 语法测试 + 集成测试），支持无头环境（xvfb）

## [0.0.2] - 2026-03-20

### 新增 (M1)
- **语言定义**：注册 `csmscript` 语言，关联文件扩展名 `.csmscript`
- **语言配置** (`language-configuration.json`)：
  - 行注释 `//`
- **语法高亮** (`syntaxes/csmscript.tmLanguage.json`)：
  - 行注释
  - 转移与调度运算符：`>>`、`->`、`-@`、`->|`
  - 广播目标标记：`<status>`、`<broadcast>`、`<interrupt>`、`<all>`
  - 订阅操作：`-><register>`、`-><unregister>`、`-><register as interrupt>`、`-><register as status>`
  - 模块地址符 `@`（如 `Status@SourceModule`）
  - 状态名前缀：`API:`、`Macro:`
  - 系统预置状态名（如 `Response`、`Async Response`、`Error Handler`、`Target Timeout Error` 等）
- **测试用例**：新增与语言定义和语法高亮配置相关的基础单元测试（grammar/config/package.json 验证）

## [0.0.1] - 2026-03-06

### 新增
- 项目初始化，使用 `yo code` 脚手架生成
- 基础项目结构搭建（TypeScript + ESBuild）
- 文档中文化（README、CHANGELOG、快速入门指南）
- 开发环境配置完成
- 项目文档备份机制
- **扩展占位符图标** (128x128 PNG/SVG)
  - 蓝色渐变背景，状态机图形元素
  - 包含替换指南文档

### 技术栈
- TypeScript 5.x
- ESBuild 打包
- ESLint 代码检查
- VS Code Extension API 1.60.0+
