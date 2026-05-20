# 更新日志

本文件记录 "csm-vsc-support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布] / [Unreleased]

## [0.0.20] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


### 变更

- UI：移除模块列表内重复的 `Refresh modules` 条目，刷新入口统一保留在视图标题栏
- UI：模块主条目名称改为高亮显示，保留来源与可见性标签，增强卡片式层次感

## [0.0.19] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.18] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.17] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.16] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.15] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.14] - 2026-05-20

### 变更

- 阶段一：修复 `CSM Modules: Sign In to GitHub` 授权后视图不刷新的问题，登录成功后立即触发模块列表加载
- 回归测试：新增登录成功后自动刷新模块列表测试

## [0.0.13] - 2026-05-20

### 变更

- 构建：修复 hook 安装目标目录不一致问题，安装与校验统一使用同一 extensions-dir 路径

## [0.0.12] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.11] - 2026-05-20

### 变更

- 构建：本地结束 hook 支持“按需自动打包并加载 VSIX”，仅在检测到扩展运行相关改动时触发
- 构建：支持 `--force-vsix` 参数，在任意改动场景下强制执行 VSIX 打包、安装与校验

## [0.0.10] - 2026-05-20

### 变更

- UI：修复 CSM Modules 侧边栏容器图标显示，改用 activity bar 兼容的单色 SVG 图标
- 阶段一：视图初始化时自动静默加载模块列表，已登录 GitHub 用户无需先手动刷新

## [0.0.9] - 2026-05-20

### 变更

- 构建：调整本地结束 hook，编译完成后立即执行 VSIX 打包、安装与本地校验，实现编译后自动加载

## [0.0.8] - 2026-05-20

### 变更

- 构建：新增本地安装校验脚本 `npm run vsix:verify-local`，用于检查目标版本是否实际安装到本地扩展目录
- 构建：`hook:finish` 改为安装后强制执行版本校验，校验失败时流程直接失败

## [0.0.7] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装


## [0.0.6] - 2026-05-20

### 变更

- 阶段一：README 查看从纯文本 webview 切换为 VS Code Markdown 预览流程
- 回归测试：新增鉴权失败分支测试（静默/交互会话获取异常处理）
- 回归测试：新增 GitHub 网络失败分支测试（仓库接口非 2xx、README 404 降级）

## [0.0.5] - 2026-05-20

### 新增

- 阶段一：新增 `CSM Modules` 侧边栏视图与命令（登录、刷新、README 查看）
- 阶段一：新增 GitHub 模块扫描（topic: `csm-modsets`）、README 读取与本地缓存能力
- 构建：新增本地结束 hook（`npm run hook:finish`），自动执行版本递增、文档同步、编译测试、VSIX 打包与安装

### 变更

- 鉴权：优先静默复用 VS Code 已登录 GitHub 会话，缺失时再进入交互授权

### 新增

- `.lvcsm`：Outline 大纲支持 —— INI 节 `[section]` 显示为大纲条目（`SymbolKind.Module`）

### 变更

- `.csmlog`：默认开启 `files.autoGuessEncoding`，降低 GBK/GB2312 文件乱码风险
- 图标主题：新增 `CSM File Icons`，为 `.csmlog` / `.lvcsm` 提供专用文件图标（可在文件图标主题中启用）
- `.csmlog`：移除默认 `editor.fontSize = 14` 配置，避免覆盖用户字号偏好
- `.csmlog` Hover：修复日志内容区 `@` 操作符悬停无提示的问题
- Hover 缓存：在文档关闭时清理 anchor 缓存条目，避免长期运行时缓存持续累积
- `.csmlog` Hover：仅当光标位于 `[SECTION]` 标题括号范围内时才返回 section 悬停提示
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
