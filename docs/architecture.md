# CSM VS Code 扩展 — 架构文档

> 对应 PR：#68（重构 v0.0.27）
> 更新日期：2026-07-29

---

## 1. 项目概述

`csm-vsc-support` 是一个 VS Code 扩展，为 Communicable State Machine (CSM) 框架提供编辑器支持。核心功能分为两大域：

| 域           | 路径            | 职责                                                   |
|--------------|-----------------|--------------------------------------------------------|
| **语言功能** | `src/language/` | `.csmlog` / `.lvcsm` 文件的语法高亮、Hover、Outline、折叠 |
| **模块管理** | `src/modules/`  | 侧边栏 Webview 浏览/搜索/引入/更新 CSM 模块            |
| **共享工具** | `src/common/`   | 国际化、常量、临时路径、DocumentSymbol 构建               |

---

## 2. 目录结构

```
src/
├── extension.ts                  # 扩展入口（注册 Provider、命令、状态栏）
│
├── language/                     # 语言功能域
│   ├── csmlogHoverProvider.ts    # CSMLog Hover 提示提供者
│   ├── csmlogDocumentSymbolProvider.ts  # CSMLog Outline 大纲
│   ├── lvcsmDocumentSymbolProvider.ts   # LVCSM Outline 大纲
│   ├── fileDecorationProvider.ts # 文件装饰（Badge C/L）
│   ├── hoverData.ts              # Hover 数据库 barrel 导出
│   ├── hoverData/                # Hover 知识库
│   │   ├── types.ts              # HoverEntry 接口
│   │   ├── db.ts                 # 数据库聚合（中/英缓存）
│   │   ├── lookup.ts             # 查找引擎（操作符优先、系统状态、控制流等）
│   │   ├── operators.ts          # 操作符数据
│   │   ├── commands.ts           # 命令数据
│   │   ├── controlFlow.ts        # 控制流数据
│   │   ├── systemStates.ts       # 系统状态数据
│   │   ├── events.ts             # 事件类型数据
│   │   ├── timestamps.ts         # 时间戳数据
│   │   ├── markers.ts            # 标记符号数据
│   │   ├── config.ts             # 配置项数据
│   │   ├── localize.ts           # 英文翻译应用器
│   │   └── translations.ts       # 英文翻译库
│   └── logFold/                  # 日志折叠
│       ├── types.ts              # LineSignature, FoldRegion, FoldOptions
│       ├── normalizer.ts         # 行签名归一化引擎
│       ├── detector.ts           # 三级递进重复检测算法
│       ├── foldingProvider.ts    # VS Code FoldingRangeProvider
│       └── decorations.ts        # 装饰器视觉呈现
│
├── modules/                      # 模块管理域
│   ├── index.ts                  # barrel 导出
│   ├── types.ts                  # 所有核心类型定义
│   ├── constants.ts              # 命令 ID、视图 ID、配置键
│   ├── logger.ts                 # 输出通道日志器
│   ├── moduleManagerController.ts # 主控制器（命令注册、状态管理）
│   ├── moduleSidebarViewProvider.ts # WebView 侧边栏提供者
│   ├── moduleSidebarHtml.ts      # 侧边栏 HTML 模板
│   ├── moduleTreeTypes.ts        # 模块树视图类型
│   ├── authService.ts            # GitHub 认证
│   ├── githubModuleService.ts    # GitHub API 服务（含模块版本来源 API：提交/标签/Release/分支）
│   ├── versionService.ts         # 模块版本来源服务（API 优先、git CLI 兜底，issue #37）
│   ├── gitService.ts             # Git CLI 安全封装
│   ├── workspaceModuleService.ts # 模块应用/更新/移除（更新支持指定版本）
│   ├── configService.ts          # YAML 配置读写（含 versionKind/versionRef）
│   ├── cacheStore.ts             # 持久化缓存
│   ├── sort.ts                   # 模块排序
│   ├── topics.ts                 # 话题过滤
│   ├── utils.ts                  # 工具函数
│   ├── userFacingErrors.ts       # 用户友好错误消息
│   ├── labviewVersionDetector.ts # LabVIEW 版本检测
│   ├── readmeAssetCache.ts       # README 资源缓存
│   └── readmePreviewService.ts   # README 预览
│
├── i18n/                         # 本地化模块（统一入口）
│   ├── index.ts                  # barrel：对外唯一入口
│   ├── core.ts                   # 本地化基础设施（语言检测、{en, zh} bundle 替换）
│   ├── messages.ts               # 模块管理 UI 文案（中/英）+ 辅助函数
│   ├── logFold.ts                # CSMLog 日志折叠 UI 文案（中/英）
│   └── language.ts               # 语言功能 UI 文案（outline 符号名、文件徽章）
│
├── common/                       # 跨域共享
│   ├── constants.ts              # CSM 日志正则与常量
│   ├── symbols.ts                # DocumentSymbol 构建工具
│   └── tempPaths.ts              # 临时目录管理
│
└── test/                         # 测试（镜像源码结构）
    ├── setup.ts                  # Mocha 启动钩子（拦截 require('vscode')）
    ├── vscode-mock.ts            # VS Code API mock
    ├── language/                 # language/ 测试
    ├── modules/                  # modules/ 测试
    ├── common/                   # common/ 测试
    ├── providers/                # Provider 测试
    └── logFold/                  # 折叠算法测试
```

---

## 3. 数据流

### 3.1 语言功能激活

```
extension.ts activate()
  ├── registerHoverProvider(language:csmlog) → CSMLogHoverProvider
  │     └── hoverData/db.ts → hoverData/lookup.ts
  ├── registerDocumentSymbolProvider(csmlog) → CSMLogDocumentSymbolProvider
  ├── registerDocumentSymbolProvider(lvcsm) → LvcsmDocumentSymbolProvider
  ├── registerFileDecorationProvider → CsmFileDecorationProvider
  └── 折叠功能（按需激活/停用）
        ├── CSMLogFoldingRangeProvider
        │     ├── normalizer.ts → 行归一化
        │     ├── detector.ts   → 重复检测
        │     └── decorations.ts → 装饰器渲染
        └── 状态栏统计
```

### 3.2 模块管理激活

```
extension.ts activate()
  └── ModuleManagerController
        ├── 注册 19 个 VS Code 命令
        ├── 创建 ModuleSidebarViewProvider（WebView）
        ├── 依赖注入：authService, githubService, workspaceService, configService
        ├── git watcher：监听仓库 .git 目录，提交后去抖自动重算侧边栏工作区状态（issue #90）
        └── 状态机：认证 → 缓存恢复 → 模块列表渲染 → 用户交互
```

### 3.3 模块应用流程

```
用户点击 Apply
  → controller.applyToWorkspaceCommand()
    → resolveWorkspaceContext()     # 统一上下文解析
    → configService.loadConfig()    # 读取 YAML
    → promptApplyMethod()           # submodule / copy
    → promptApplyTargetNamespace()  # 命名空间
    → 单选：promptVersionSelection()  # 版本来源（issue #37）：置顶「使用默认分支」
    → workspaceModuleService.applyModule(versionSelection?)
        ├── submodule: git submodule add + fetch + checkout（指定版本时 detached HEAD）
        ├── copy:      按分支/tag/commit 拉取后复制
        └── configService.withAppliedModule() + writeConfig()  # 写入 versionKind/versionRef
    → cacheStore.setModuleVersionCache()  # 单选指定版本时缓存提交信息
    → 刷新侧边栏
```

### 3.4 模块更新流程（版本选择，issue #37）

```
用户触发 Update
  → controller.updateModuleCommand()
    → 第一步 QuickPick：选择版本来源
        ├── 更新到最新（{当前分支}）   # 行为与现状一致
        ├── 提交记录 / 标签 / Release / 分支
        └── versionService.list*()   # GitHub API 优先，git CLI 兜底
    → 第二步 QuickPick：选择具体版本（分支来源需再选提交）
    → 确认对话框（当前版本 → 目标版本 + 备份提示）
    → workspaceModuleService.updateModule(selection)
        ├── copy:      按 commit/tag/release/latest 拉取目标版本后整体覆盖
        ├── submodule: git submodule update --init + fetch + checkout（detached HEAD）
        └── configService.withAppliedModule() + writeConfig()  # 写入 versionKind/versionRef
    → cacheStore.setModuleVersionCache()  # 缓存提交信息（owner/name → {ref, commitInfo, date}）
    → 刷新侧边栏
```

**branch 版本来源展示**（issue #90）：`versionKind=branch` 的子模块卡片与更新确认对话框显示 `分支名 · 短SHA · 提交信息 · 相对日期`，跟随本地实际 HEAD——每次刷新时 `syncTrackedSubmoduleVersions` 读取子模块实际 HEAD（`git rev-parse` + `git log`），与配置 `ref` 不一致时写回配置并更新版本缓存；手动刷新在线目录时 `backfillAppliedModuleVersionInfos` 比较远端分支 HEAD 与本地 HEAD，标记「远端有新提交」；commit / tag / release 保持固定版本语义。

**固定版本子模块一致性恢复**（issue #96）：commit / tag / release 版本来源的子模块——刷新时 `syncFixedVersionSubmodules` 逐个读取本地 HEAD（只读、不联网），与配置 `ref` 不一致时经 `analyzeSubmoduleDivergence`（`git merge-base --is-ancestor`，本地只读）分析分歧类型，合并弹窗（modal）列出全部模块（`当前SHA → 配置SHA`）并给出**两个选项**：「跟随本地版本」——`followSubmoduleLocalHead` 将模块切换为 branch 跟踪语义（`versionKind: branch` + 当前分支名 + HEAD 写回配置与版本缓存），之后由 `syncTrackedSubmoduleVersions` 自动跟随本地，不再触发检查；「根据配置恢复」——保持固定版本，逐个 `restoreSubmoduleToRef`（先临时解锁 → `submodule update --init` → `fetch --tags origin`（可能联网）→ `checkout <ref>`（detached HEAD）→ 恢复锁定）。弹窗为每个模块标注推荐：配置 commit 是本地 HEAD 祖先（疑似本地 git 操作更新）推荐跟随本地，否则推荐恢复配置。取消则本会话内跳过不再重复弹窗；检查 → 弹窗 → 执行全程由 `fixedVersionSyncInFlight` 并发锁保护，启动 / git watcher / 手动刷新重叠时只弹一次。branch 来源由 `syncTrackedSubmoduleVersions` 反向同步（跟随本地 HEAD），copy / release 附件方式无 git HEAD 概念不校验。触发时机：插件启动（`register()` 后台刷新）与所有现有刷新路径（手动刷新、git watcher 去抖刷新）。

---

## 4. 关键设计决策

### 4.1 依赖注入

`ModuleManagerControllerDeps` 接口将 AuthService、GitHubModuleService、ModuleSidebarViewProvider 等作为依赖注入，便于单元测试 mock。

### 4.2 纯函数优先

- `configService.ts`：所有配置读写函数无状态，纯函数或仅依赖文件系统
- `sort.ts`、`utils.ts`、`topics.ts`：纯函数，零副作用
- `logFold/normalizer.ts`、`logFold/detector.ts`：纯算法，可独立测试

### 4.3 三级递进检测算法

日志折叠采用精确匹配 → 参数化匹配 → 块匹配三级递进检测，100K 行文档 ≤ 1000ms 约束。

### 4.4 旧路径兼容层

重构后的旧路径（`src/moduleManager/`、`src/hoverData/`、`src/logFold/`）保留 `export * from '../new-path'` 重导出，确保持有旧导入路径的代码不受影响。

### 4.5 git 自动刷新与 submodule 版本同步（issue #90）

`ModuleManagerController` 为当前仓库的**真实 git 目录**（经 `git rev-parse --absolute-git-dir` 解析，兼容 linked worktree / 子模块中 `.git` 为文件的情况）创建递归 `FileSystemWatcher`，在父仓库或子模块中提交 / pull / checkout 后去抖 1.5s（`GIT_CHANGE_REFRESH_DEBOUNCE_MS`）自动重算侧边栏工作区状态；watcher 随 gitDir 变化幂等重建，非 git 工作区不创建，扩展停用时通过 register 的 Disposable 清理。

重算时 `syncTrackedSubmoduleVersions` 对 `method=submodule` 且 `versionKind=branch` 的条目读取子模块实际 HEAD（本地 git log，无需网络），与配置 `ref` 不一致时写回 `csm-modules.yaml`；版本缓存无论 HEAD 是否变化都会在缺失时填充（本地提交信息，不依赖在线补全）。`backfillAppliedModuleVersionInfos`（仅手动刷新在线目录时）对有界并发（5）地对 branch 条目比较远端分支 HEAD（`git ls-remote`）与本地状态：仅当本地与远端跟踪引用一致且落后于远端时（`isRemoteAheadOfLocal`）才提示「远端有新提交」，本地未推送提交不会被误报；检测结果绑定检测时的 workspace 与本地 `ref`，两者仍匹配时才透传到卡片，避免过期徽章。

### 4.6 配置 schema 版本与自动迁移（issue #94）

`csm-modules.yaml` 的 `version` 字段记录配置格式自身的 schema 版本（非负整数，当前 `CONFIG_VERSION = '3'`），与插件版本彻底解耦——插件升级不会改写配置文件（避免无意义的 git 变更）。设计新配置时尽量向前兼容；仅当配置格式发生变更时递增 schema 版本号，并在 `configService.DEFAULT_CONFIG_MIGRATIONS` 步骤列表尾部追加迁移步骤。

`configService.loadConfig` 每次加载时比较 schema 版本：旧版本（缺失 / 旧插件版本如 `"0.0.26"` / 无法解析为整数 / 低于当前版本）时按 `DEFAULT_CONFIG_MIGRATIONS` 步骤列表就地迁移（如 `normalize-module-entries` 补齐默认字段）并静默写回当前版本；若迁移步骤失败（旧配置无法兼容），自动备份旧文件（`<configPath>.bak-<版本>-<时间戳>`）并重建为新版本的空配置（保留 `root`），通过 `onMigration` 回调上报结果。同版本加载不改写文件。`ModuleManagerController.loadLocalModuleConfig` 统一处理迁移上报：向前兼容的迁移仅记录日志，不兼容重建记录警告并弹轻量提示（本地化文案）。

---

## 5. 构建与测试

| 命令                     | 说明                               |
|--------------------------|------------------------------------|
| `npm run check-types`    | TypeScript 类型检查                |
| `npm run lint`           | ESLint 代码规范                    |
| `npm run compile`        | esbuild 打包 → `dist/extension.js` |
| `npm run compile-tests`  | 编译测试 → `out/test/`             |
| `npx mocha --ui tdd ...` | 独立单元测试（无需 VS Code）         |
| `npm test`               | 完整扩展测试（需 VS Code 宿主）      |

### 测试统计

- **444** 个独立单元测试（Mocha TDD）
- **2** 个集成测试（需 VS Code 宿主）
- 纯函数覆盖 100%，核心算法有性能测试约束

---

## 6. 技术栈

- **语言**：TypeScript 5.9（strict mode）
- **VS Code API**：1.63+
- **构建**：esbuild → 单文件 `dist/extension.js`
- **测试**：Mocha + `@vscode/test-cli` + vscode-mock
- **YAML**：js-yaml
- **CI**：GitHub Actions（lint → 单元测试 → 集成测试 → VSIX 构建）
