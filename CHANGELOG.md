# 更新日志

本文件记录 "csm-vsc-support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布] / [Unreleased]

### 新增

- 阶段二：`CSM Modules` 视图支持多选模块，并新增 `Apply to Current Repository` 入口
- 阶段二：首次应用模块时可初始化本地模块目录，默认生成 `csm/csm-modules.yaml`，也支持仓库内自定义相对目录
- 阶段二：支持 `submodule` / `copy` 两种模块引入方式，并将模块名、源仓库地址、锁定版本、默认分支与本地路径写入本地 YAML 配置文件
- 阶段二：当仓库已存在 `csm/` 目录及其中的 submodule，但缺少配置文件时，可自动反向生成 `csm/csm-modules.yaml`
- 阶段四：新增设置项 `csmModules.defaultModuleRoot`，用于为首次初始化 / 首次应用预设默认模块根目录
- 本地化：扩展全部用户可见字符串现已支持中英文切换，覆盖 package 清单文案、模块管理 UI/提示与 `.csmlog` / `.lvcsm` Hover 内容
- 阶段四：`CSM Modules` 容器新增独立的 `Workspace Modules` 原生视图，可同时显示已管理模块与当前模块根目录下的未管理文件夹，而上方 `Available Modules` 保持原有 GitHub 目录行为
- 阶段四：已登录 GitHub 时，未管理本地模块文件夹可通过向导一键创建并发布 GitHub 仓库，默认使用 private 可见性并附带 `labview-csm`、`csm-modsets` topics；若本机缺少 Git 作者信息，会在首次发布前补充询问

### 变更

- 阶段一：模块发现继续基于 GitHub 全局 `topic:csm-modsets` 搜索；侧边栏启动时改为只显示本地缓存，登录成功后会自动执行一次网络刷新，之后仍通过手动刷新同步当前账号可访问的 public / private 模块
- 阶段四：public 模块 README 支持未登录时匿名加载，避免公共模块浏览流程被 GitHub 登录前置阻断
- 构建：`@types/js-yaml` 已移入 `devDependencies`，`tsconfig.json` 明确 `outDir = out`，并清理过时的 `skipLibCheck` 注释
- CI：VSIX 校验步骤改为在 Linux / Windows 上统一使用 PowerShell `Expand-Archive`，并在发布到 Marketplace 前显式检查 `VSCE_PAT`
- 维护：拆分 module manager 的 README 预览 / 用户可见错误转换服务，以及侧边栏 webview HTML 渲染模块；`moduleManagerController` 测试开始迁移到依赖注入式 mock，减少 `as any`
- 文档：补充 `CONTRIBUTING.md` 的本地开发、调试、VSIX 验证与 PR 规范，并完善工作区 `.vscode/settings.json`
- UI：`CSM Modules` 侧边栏样式收敛为更接近扩展列表的扁平卡片布局，移除左侧头像图标；单卡 `Apply` 按钮已移除，`README` 保留在卡片右上角，checkbox 仅在 hover 或已选中时显示
- UI：顶部搜索框固定在最上方，原有头部摘要内容下移到搜索框下方；批量 `Apply Selected` 改由视图标题栏在存在勾选模块时提供，Webview 内不再重复放置登录 / 刷新 / 批量 Apply 按钮
- UI：模块卡片重新整理为“顶行标题/provider + 工具条、全宽摘要、底部全宽 tags”布局，减少左右分栏造成的压缩感
- UI：侧边栏整体字号与图标尺寸上调一档；模块卡片与 fallback tree 中会自动隐藏内部发现用 topic（如 `csm-modsets`、`labview-csm`），并且这些内部 topic 不再参与侧边栏前端搜索
- UI：侧边栏继续显示当前工作区摘要，已应用到当前仓库配置的模块会显示 `Applied` 状态徽标
- UI：多选模块时，标题栏批量操作会按所选模块的当前状态拆分显示；混合选择同时显示 `Apply to Current Repository` 与 `Remove from Current Repository`，全未安装仅显示 `Apply`，全已安装仅显示 `Remove`
- UI：模块卡片右键菜单改为 VS Code 原生 `webview/context` 菜单，`Apply` / `Update` / `Remove` / `Open README` / 选择操作会按当前模块状态自动启用、禁用或切换
- UI：侧边栏顶部搜索框改为更接近扩展市场的搜索栏样式，末尾集成 `Filter` 菜单；菜单内拆分 `Type` 与 `Order` 两组排序选项，并将 `applied / available / selected` 状态信息合并到同一行展示
- UI：点击模块卡片正文可在侧边栏内展开 README Markdown 预览，右上角 `README` 按钮继续保留完整 README 面板入口
- UI：修复侧边栏 README Markdown 预览中的图片资源加载，仓库内相对图片以及 GitHub `user-attachments` 这类原生 `<img>` 图片现在都可正常显示
- UI：已登录时将账号摘要上移到顶部摘要行，并将模块总数改为 `public / private` 拆分，移除冗长的 `Loaded ...` 文案
- UI：已登录时，原生侧边栏视图标题会从 `Available Modules` 动态切换为 `Signed in as ...`
- UI：已登录 GitHub 时，模块卡片会在 `README` 按钮旁显示仓库 `Star` 状态，并支持直接 `Star` / `Unstar`；取消 Star 前会要求二次确认
- UI：已登录 GitHub 时，`CSM Modules` 标题栏会显示 `Sign Out` 入口，便于从扩展内直接切换账号；侧边栏摘要继续显示当前账号
- 交互：当仓库存在 `csm/` 目录与 `*.lvproj` 但尚未初始化本地模块管理时，打开侧边栏会主动弹出初始化提示，并显示专用标题栏初始化按钮
- 交互：工作区初始化、首次应用与主动初始化提示会遵循 `csmModules.defaultModuleRoot` 作为默认目录；若仓库内已存在 `csm-modules.yaml`，仍以配置文件中的 `root` 为准
- 交互：已登录 GitHub 时，通过模块管理器把社区模块引入当前仓库后，会自动为对应 GitHub 仓库补 Star
- 缓存：启动时仅复用本地模块列表与 README 缓存，不再在后台偷偷刷新；若本地记录仍是同一 GitHub 账号，会直接展示对应 private 缓存；`Cached list` 横幅已移除，仅在标题栏显示上次刷新时间
- 兼容：旧版 `csm-modules.lvcsm` 配置可继续读取，并在后续写回时迁移到 YAML
- 交互：应用模块前增加方式选择与二次确认，并补齐非 Git 仓库、重复目标路径、copy 目标已存在等基础错误提示
- 交互：非 Git 工作区应用模块时不再直接报错，而是保留 `submodule` 模式为不可用提示，并仅允许继续使用 `copy` 模式
- 交互：非 Git 工作区现在也可移除以 `copy` 模式引入的模块；仅在目标模块为 `submodule` 时才强制要求 Git 仓库，并继续保留移除前二次确认
- 交互：非 Git 工作区现在也可更新以 `copy` 模式引入的模块；更新前会先比较远端分支最新提交，确认后把当前模块目录打包到备份文件夹中的 zip，再重新下载替换整个目录
- UI：非 Git 工作区的模块列表现在会优先根据本地 `csm-modules.yaml` 配置文件标记已应用模块，不再错误依赖 Git submodule 状态
- 错误处理：刷新 / 应用 / 更新 / 删除模块时，会把常见 GitHub HTTP 状态、Git 权限失败、Git 缺失、网络错误与 YAML 解析错误转换为更可操作的提示

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
