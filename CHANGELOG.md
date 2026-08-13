# 更新日志

本文件记录 "csm-vsc-support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布] / [Unreleased]

### 新增

- **配置文件版本自动迁移**：`csm-modules.yaml` 的 `version` 字段改为记录写入时的插件版本；加载时发现旧版本（含旧 schema 的 `"2"`）自动按可扩展迁移步骤列表（`configService.DEFAULT_CONFIG_MIGRATIONS`）静默补齐默认字段并写回当前版本，未来插件升级只需在列表追加新步骤
- **git 操作后自动同步与刷新侧边栏工作区状态**（issue #90）：监听当前仓库 `.git` 目录的变化，父仓库或子模块中提交 / pull / checkout 后去抖自动重算侧边栏，无需手动刷新

- **模块版本概念**（issue #37）：更新模块时支持选择具体版本——更新到分支最新，或从提交记录 / git 标签 / GitHub Release / 分支中选择目标版本（含回退到旧版本）；版本来源数据优先走 GitHub REST API，未登录或网络受限时用 git CLI 兜底
- **应用模块时（单选）支持选择具体版本**（issue #37）：应用单个模块时可选择版本来源（置顶「使用默认分支」，与更新一致）；多选批量应用沿用默认分支；确认框展示目标版本；`submodule` / `copy` 均支持指定分支 / 提交 / 标签 / Release 应用
- **使用 GitHub Release = 下载其附件**（issue #37）：选择 Release 后下载该 Release 的全部附件（排除 `Source code` 自动附件）；zip / tar.gz 自动解压（剥离顶层单目录），其它格式直接复制；单附件放模块根、多附件各自放独立子目录；submodule 方式回退为 git tag 检出
- **GitHub Release 提升为独立引入方式**（issue #37）：与 `submodule` / `copy` 同级，应用 / 更新时可直接选择该方式；release 模块不显示「分支」徽章，版本标签显示 release 的 tag 名（非标题）
- **三种引入方式互相切换**（issue #37）：侧边栏弹出三选一选择器（submodule / copy / GitHub Release），切到 Release 时再选具体 Release；`copy` / `submodule` → `release` 下载附件整体替换，`release` → `copy` 重新克隆默认分支，`release` → `submodule` 检出当前 release 的 tag
- 每个已管理模块记录 `versionKind`（`branch` / `commit` / `tag` / `release`）与 `versionRef`，`ref` 始终指向实际应用的提交 SHA；旧配置自动兼容
- 本地模块卡片展示当前版本（`短SHA · 提交信息 · 相对日期`，tag / Release 优先显示名称），提交信息在更新/应用成功时缓存，避免每次在线查询
- 新增 `src/modules/versionService.ts`（版本来源列表 + git 兜底）与对应单元测试
- **CSMLog 日志重复折叠**：自动检测并折叠 `.csmlog` 中重复日志行，支持精确 / 参数变化 / 多行块 / 交错 4 种重复模式；三级递进算法（连续匹配 → Rabin-Karp 哈希 → token 确认）实现 100K 行约 265ms 检测。提供 `csmlog.folding.*` 配置与 `toggleAllFolds` / `showStats` 命令，通过编辑器工具栏 👁 按钮按文件激活
- 折叠区以 4 种底色区分重复类型（灰蓝精确 / 灰紫参数 / 灰绿块 / 灰橙交错），概要标签显示重复次数、时间跨度与频率
- 新增 `src/logFold/`（types / normalizer / detector / foldingProvider / decorations）与 `src/test/logFold/`（28 项测试覆盖归一化、检测、Provider、性能）
- 本地模块卡片新增 LabVIEW 开发版本徽章（如 `lv2020` / `lv2020(64bit)`）；版本来源优先级：`DEV ENVIRONMENT` 标记 → `.lvproj` → `.lvlib` → `.vi` 文件头
- 新增 `src/moduleManager/labviewVersionDetector.ts`（BCD 解码 + 8.0~2025 版本映射）

### 变更

- **branch 版本来源的子模块随本地实际 HEAD 展示并同步管理信息**（issue #90）：卡片显示 `分支名 · 短SHA · 提交信息 · 相对日期`；子模块通过扩展之外的 git 操作（提交 / pull / checkout / submodule update --remote）更新后，刷新时自动读取实际 HEAD 写回配置 `ref` 并缓存提交信息（来自本地 git log，未推送的提交也能展示）；手动刷新在线目录时检测远端分支，有新提交则卡片提示 `远端有新提交`
- 更新模块流程改为两步 QuickPick（版本来源 → 具体版本）+ 确认对话框（当前版本 → 目标版本，copy 方式附 zip 备份提示）
- `copy` / `submodule` 更新均支持指定版本：copy 按目标版本拉取后整体覆盖，submodule 通过 fetch + checkout 检出到指定提交（detached HEAD）
- 升级 `engines.vscode` 最低版本至 `^1.63.0`，以支持 pre-release 发布

### 重构

- 移除 `CSM File Icons` 图标主题，改用 `FileDecorationProvider` 文件 Badge（`C` / `L`），兼容用户自定义图标主题
- 共享 CSM 正则提取到 `src/common/constants.ts`，消除三个 Provider 的正则重复
- 新增 `src/common/symbols.ts` 通用 DocumentSymbol 构建工具，统一两个 Provider 的 Range 逻辑（-30 行）
- Hover 数据迁至 `hoverData/` 模块化目录（events / timestamps / config / markers），消除 ~280 行硬编码重复
- 清理废弃代码：删除 `moduleTreeDataProvider.ts`（`ViewState` / `ModuleTreeItem` 移至 `moduleTreeTypes.ts`）与死代码 `csmlogHoverTranslations.ts`
- 测试：新增 `i18n` / `hoverDataModules` / `sort` 测试（13 / 12 / 16 项），总数 76 → 119，并纳入 CI
- 简化 AI 开发设施：Copilot 自动 hook 收敛为单个 `Stop` hook（会话结束执行 `npm run compile`，不再自动打包安装 VSIX），删除 `hook:finish`、`vsix:package`、`vsix:verify-local` 等手动脚本
- custom agents 5 → 2 个（`vscode-ext-dev` 开发、`vscode-ext-review` 审查），并精简 `AGENTS.md`
- 清理 `.vscode/settings.json` 中失效的 `chat.tools.terminal.autoApprove` 配置

### 新增

- `CSM Modules` 支持多选与批量 `Apply to Current Repository`；首次应用可初始化本地模块目录（默认 `csm/csm-modules.yaml`，支持自定义相对目录）
- 支持 `submodule` / `copy` 两种引入方式，模块名、源仓库、锁定版本、默认分支与本地路径写入 YAML；已有 `csm/` + submodule 但缺配置时可自动反向生成 `csm-modules.yaml`
- 新增设置：`csmModules.defaultModuleRoot`（默认模块根目录）、`csmModules.hiddenTopics`（默认隐藏 `csm-modsets`、`lv-csm-app`、`labview-csm`、`labview`）
- 全部用户可见字符串支持中英文切换（package 清单、模块 UI、`.csmlog` / `.lvcsm` Hover）
- 视图收敛为单一原生视图，本地与 GitHub 模块目录合并，提供 `All / Workspace / Catalog` 范围切换
- `Catalog` 卡片新增 GitHub 仓库直达按钮
- 未管理模块文件夹可通过向导一键创建并发布 GitHub 仓库（默认 private，附 `labview-csm` / `csm-modsets` topics；缺 Git 作者信息时先询问）
- 模块卡片支持原生右键菜单：已管理模块提供 Open Folder / Open README / Update / Remove（后三项仅在在线目录存在时显示），未管理提供 Open Folder

### 变更

- 构建：`.github/hooks/local-finish-stop.json` 仅注册 `Stop` hook，会话结束时执行 `npm run compile`（check-types + lint + esbuild）；编译失败首次阻止结束并回传原因，重复失败时放行避免死循环
- 交互：从未管理文件夹发布仓库后接管为 Git submodule 并写回 YAML；非 Git 工作区保持 `copy` 并刷新
- 交互：未管理文件夹可直接关联在线模块仓库（先 `copy` 登记，后续可更新 / 移除 / 切 `submodule`）；已关联目录为现有 submodule 时保留其远端 / 分支 / 锁定提交
- 交互：`csm/` 下的嵌套 Git 仓库（自带 `.git`）会被接管并补登记为真实 submodule；发布仓库后等待在线目录刷新完成
- 交互：已管理模块可在 Git 工作区内切换 `submodule` / `copy` / `GitHub Release` 三种引入方式，非 Git 工作区禁用切换
- 交互：已管理模块默认进入 lock 状态（递归只读），侧边栏提供锁定 / 解锁（需确认），状态写回 YAML
- 错误处理：lock 同步失败改为 warning 并继续刷新，不中断 Apply / Remove / Update
- 维护：`ModuleManagerController` 直接调用锁定接口，移除运行时 `Partial` / `typeof` 兜底
- 配置：缺 `locked` 字段的旧 YAML 自动补写显式布尔值
- 锁定：单文件 `chmod` 失败不中断整目录处理；Windows 仅切换 write bit；权限位已符合时跳过写入
- 交互：`submodule ↔ copy` 切换后先确认目标目录存在再重新加锁
- 交互：标题栏 `Refresh` 完成后重新评估工作区状态，远端失败也更新本地显示
- 阶段一：模块发现基于 `topic:csm-modsets`；启动只显示本地缓存，登录后自动刷新一次，之后手动刷新
- 阶段四：public 模块 README 支持未登录匿名加载
- 构建：`@types/js-yaml` 移入 devDependencies，`tsconfig.json` 明确 `outDir = out`，清理过时 `skipLibCheck` 注释
- CI：VSIX 校验统一用 PowerShell `Expand-Archive`，发布前显式检查 `VSCE_PAT`
- 维护：拆分 README 预览 / 错误转换 / webview 渲染模块；controller 测试迁移到依赖注入 mock
- 文档：补充 `CONTRIBUTING.md` 本地开发 / 调试 / VSIX 验证 / PR 规范，完善 `.vscode/settings.json`
- UI：侧边栏收敛为扁平卡片布局，移除头像与单卡 `Apply`，README 保留右上角，checkbox 仅 hover / 选中显示；搜索框固定顶部，批量 `Apply Selected` 移至标题栏
- UI：卡片改为顶行标题 / 工具条 + 全宽摘要 + 底部 tags；列表以内联分组区分 `Workspace` / `Catalog`；字号与图标上调一档
- UI：内部发现 topic 自动隐藏且不参与搜索；已应用模块显示 `Applied` 徽标
- UI：多选时标题栏按状态拆分操作（混合 = Apply + Remove，全未装 = Apply，全已装 = Remove）
- UI：卡片右键菜单改为原生 `webview/context` 菜单，按状态启用 / 禁用操作
- UI：搜索框改为市场风格并集成 `Filter` 菜单（Type / Order 排序，状态信息合并展示）
- UI：卡片正文可展开 README 预览；修复预览中仓库相对图片与 `user-attachments` 图片加载
- UI：已登录时账号摘要上移，模块数改为 `public / private` 拆分，移除 `Loaded ...` 文案；标题动态显示 `Signed in as ...`
- UI：已登录时卡片支持 `Star` / `Unstar`（取消需二次确认），标题栏提供 `Sign Out`
- 交互：存在 `csm/` 与 `*.lvproj` 但未初始化时弹出初始化提示 + 标题栏按钮；默认目录遵循 `defaultModuleRoot`，已有配置以 `root` 为准
- 交互：引入社区模块后自动为对应仓库补 Star
- 缓存：启动只复用本地列表与 README 缓存（不后台刷新），同账号直接展示 private 缓存；移除 `Cached list` 横幅，标题栏显示上次刷新时间
- 兼容：旧版 `csm-modules.lvcsm` 配置可读并在写回时迁移到 YAML
- 交互：应用模块前增加方式选择与二次确认，补齐非 Git / 重复路径 / copy 目标已存在等错误提示；非 Git 工作区仅允许 `copy` 模式
- 交互：非 Git 工作区也可移除 / 更新 `copy` 模块（更新前比较远端提交，确认后 zip 备份再替换）
- UI：非 Git 工作区按 `csm-modules.yaml` 标记已应用模块，不依赖 submodule 状态
- 错误处理：刷新 / 应用 / 更新 / 删除时把 GitHub HTTP、Git 权限 / 缺失、网络与 YAML 错误转为可操作提示

## [0.0.25] - 2026-05-20

### 变更

- 构建：`hook:finish` 默认始终执行 VSIX 打包、安装与版本校验，避免因条件跳过而误判“hook 未触发”
- 构建：Windows 下改为显式解析 Node/NPM/VS Code CLI，并在安装阶段使用同步 `Start-Process -Wait` 路径，规避空格路径、批处理宿主与 shell 引号问题
- 构建：版本递增时会把 `Unreleased` 内容自动归档到新版本节，避免 CHANGELOG 顶部结构错位


## [0.0.20] - 2026-05-20

### 变更

- 阶段一：新增 GitHub 认证与 CSM 模块发现侧边栏基础能力
- 构建：新增本地结束 hook，支持自动版本递增、文档同步、VSIX 打包与安装

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
