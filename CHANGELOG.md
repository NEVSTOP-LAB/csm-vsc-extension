# 更新日志

本文件记录 "csm-vsc-support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布] / [Unreleased]

### 变更

- `.csmlog`：默认开启 `files.autoGuessEncoding`，降低 GBK/GB2312 文件乱码风险
- CI：修复无 VS Code 单元测试任务引用已删除 `out/test/grammar.test.js` 的问题，改为运行现有 csmlog standalone 测试
- 构建：`esbuild.js` 增强错误处理
  - `location` 为空时不再二次报错
  - 非 watch 构建在 `rebuild()` 返回 errors 时显式以非零退出
- Outline：`src/csmlogDocumentSymbolProvider.ts` 的模块生命周期匹配放宽
  - 相对时间戳改为可选
  - 模块名缺失时使用 `<unknown-module>` 占位
- 元数据：扩展名与 VSIX 产物命名统一为 `csm-vsc-support`
- 文档：README / CONTRIBUTING / 架构说明同步到当前仓库能力（`.csmlog` + `.lvcsm`）
- 文档：清理脚手架/占位符残留，`docs/quickstart.md`、`CONTRIBUTING.md`、`docs/images-guide.md` 与当前已发布扩展状态保持一致

## [0.0.4] - 2026-03-29

### 新增

- `.csmlog` 语言支持（语法高亮、Hover、Outline）
- `.lvcsm` 语言支持（INI 语法复用）
- CI 流水线（类型检查、lint、单元测试、VSIX 打包与校验）

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
