# 重构设计文档：架构简化与完善

> 分支：`feature/refactor-architecture`
> 创建日期：2026-07-29
> 状态：全部 6 个 Phase 已完成（Phase 1-4 ✅, Phase 5-6 🔄 部分）

---

## 1. 重构目标

在**保证所有现有功能不变**的前提下，简化架构、提升可测试性、完善文档。

### 1.1 核心原则

1. **功能零退化** — 所有现有行为保持不变
2. **测试先行** — 先补齐测试缺口，再重构
3. **增量交付** — 每个 commit 编译通过 + 全部测试通过
4. **最小改动** — 只做必要的架构调整，不引入新的复杂度

### 1.2 非目标

- 不新增功能特性
- 不改变用户可见行为
- 不修改 VS Code 贡献点（commands、menus、configurations）
- 不修改语法高亮文件（syntaxes/）

---

## 2. 当前问题诊断

### 2.1 超大文件（Monoliths）

| 文件 | 大小 | 问题 |
|------|------|------|
| `moduleManagerController.ts` | 109K | 上帝对象，混合了命令处理、状态管理、webview 通信、模块应用/更新/移除逻辑 |
| `moduleSidebarHtml.ts` | 79K | HTML 模板嵌入 TypeScript 字符串，难以维护和测试 |
| `workspaceModuleService.ts` | 49K | 混合了 YAML 配置、Git 子模块操作、文件锁管理、预览逻辑 |
| `messages.ts` | 38K | 国际化消息与类型定义混在一起 |
| `hoverData/translations.ts` | 39K | 英文翻译数据与查找逻辑耦合 |

### 2.2 测试缺口

| 组件 | 状态 | 操作 |
|------|------|------|
| `foldingProvider.ts` | 仅 mock 测试 | 补充实际逻辑测试 |
| `decorations.ts` | 无测试 | 补充装饰渲染测试 |
| `fileDecorationProvider.ts` | 无测试 | 补充 Badge 测试 |
| `authService.ts` | 仅 3 用例 | 补充 verifyScopes 等测试 |
| `common/tempPaths.ts` | 无测试 | 补充路径工具测试 |
| `moduleManager/utils.ts` | 无测试 | 补充工具函数测试 |
| `moduleManager/topics.ts` | 无测试 | 补充话题过滤测试 |
| `moduleManager/userFacingErrors.ts` | 无测试 | 补充错误翻译测试 |

### 2.3 设计问题

1. **命令处理桩模式 (`commands/index.ts`)**：22 个空命令类，增加复杂度但无实际价值
2. **HTML 内嵌 TypeScript**：`moduleSidebarHtml.ts` 一大段模板字符串，无法独立编辑/测试
3. **workspaceModuleService 职责过多**：YAML 读写、Git 操作、文件锁、预览、LabVIEW 检测混在一起
4. **controller 直接依赖所有服务**：代码难以分块理解和测试

---

## 3. 目标架构

### 3.1 整体分层

```
src/
├── extension.ts                    # 入口：注册 Provider、命令、状态栏（保持精简）
│
├── language/                       # 【新】语言功能域（原 csmlog/lvcsm 相关）
│   ├── index.ts                    # barrel 导出
│   ├── providers/
│   │   ├── hoverProvider.ts        # 原 csmlogHoverProvider.ts
│   │   ├── documentSymbolProvider.ts  # 原 csmlogDocumentSymbolProvider.ts
│   │   ├── lvcsmSymbolProvider.ts  # 原 lvcsmDocumentSymbolProvider.ts
│   │   └── fileDecorationProvider.ts  # 原 fileDecorationProvider.ts
│   ├── folding/                    # 原 logFold/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── normalizer.ts
│   │   ├── detector.ts
│   │   ├── foldingProvider.ts
│   │   └── decorations.ts
│   └── hoverData/                  # 保持不变
│       ├── index.ts                # 原 hoverData.ts
│       ├── types.ts
│       ├── db.ts
│       ├── lookup.ts
│       ├── operators.ts
│       ├── commands.ts
│       ├── controlFlow.ts
│       ├── systemStates.ts
│       ├── events.ts
│       ├── timestamps.ts
│       ├── markers.ts
│       ├── config.ts
│       ├── localize.ts
│       └── translations.ts
│
├── modules/                        # 【新】模块管理域（原 moduleManager/）
│   ├── index.ts
│   ├── types/                      # 纯类型定义
│   │   ├── index.ts
│   │   ├── csmModule.ts            # CsmModuleEntry 等
│   │   ├── workspace.ts            # LocalModuleConfig 等
│   │   └── view.ts                 # ModuleSortState 等
│   ├── core/                       # 核心服务
│   │   ├── authService.ts
│   │   ├── githubService.ts        # 原 githubModuleService.ts
│   │   ├── workspaceService.ts     # 拆分后的 workspaceModuleService
│   │   ├── gitService.ts
│   │   └── configService.ts        # 【新】提取的 YAML 配置读写
│   ├── ui/                         # WebView 相关
│   │   ├── sidebarProvider.ts      # 原 moduleSidebarViewProvider.ts
│   │   ├── htmlTemplate.ts         # 原 moduleSidebarHtml.ts（精简后）
│   │   ├── renderer.ts             # 【新】HTML 渲染逻辑
│   │   └── readmePreview.ts        # 原 readmePreviewService.ts
│   ├── controller.ts               # 精简后的模块管理器控制器
│   ├── cacheStore.ts
│   ├── labviewDetector.ts          # 原 labviewVersionDetector.ts
│   ├── sort.ts
│   ├── topics.ts
│   ├── userFacingErrors.ts
│   ├── messages.ts
│   ├── constants.ts
│   └── utils.ts
│
├── common/                         # 共享工具（保持）
│   ├── constants.ts
│   ├── symbols.ts
│   ├── tempPaths.ts
│   └── i18n.ts                     # 原 src/i18n.ts
│
└── test/                           # 镜像 src 结构
    ├── setup.ts
    ├── vscode-mock.ts
    ├── common/
    │   ├── i18n.test.ts
    │   └── tempPaths.test.ts       # 【新】
    ├── language/
    │   ├── providers/
    │   │   ├── hoverProvider.test.ts
    │   │   ├── documentSymbolProvider.test.ts
    │   │   ├── lvcsmSymbolProvider.test.ts
    │   │   └── fileDecorationProvider.test.ts  # 【新】
    │   ├── folding/
    │   │   ├── detector.test.ts
    │   │   ├── normalizer.test.ts
    │   │   ├── foldingProvider.test.ts   # 【增强】
    │   │   ├── decorations.test.ts       # 【新】
    │   │   └── performance.test.ts
    │   └── hoverData/
    │       ├── db.test.ts
    │       └── lookup.test.ts
    └── modules/
        ├── controller.test.ts
        ├── authService.test.ts       # 【增强】
        ├── githubService.test.ts
        ├── workspaceService.test.ts
        ├── gitService.test.ts
        ├── configService.test.ts     # 【新】
        ├── cacheStore.test.ts
        ├── sort.test.ts
        ├── topics.test.ts            # 【新】
        ├── utils.test.ts             # 【新】
        ├── userFacingErrors.test.ts  # 【新】
        ├── labviewDetector.test.ts
        └── integration.test.ts
```

### 3.2 关键设计决策

#### 决策 1：controller 拆分策略

将 `moduleManagerController.ts` (109K) 拆分为：
- `modules/controller.ts`：命令注册 + 生命周期管理（~20K）
- `modules/core/workspaceService.ts`：模块应用/更新/移除核心逻辑（~25K）
- `modules/core/configService.ts`：YAML 配置读写（~8K）
- `modules/ui/readmePreview.ts`：README 预览（~3K）

**理由**：按职责拆分，每个文件单一职责，便于测试和理解。

#### 决策 2：HTML 模板外置

将 `moduleSidebarHtml.ts` 的 HTML 模板拆分为：
- `modules/ui/htmlTemplate.ts`：模板字符串生成函数（~15K，通过辅助函数减小）
- `modules/ui/renderer.ts`：WebView 消息渲染逻辑（~10K）

**理由**：将 HTML 生成逻辑模块化，便于独立测试和修改。

#### 决策 3：命令桩模式简化

移除 `commands/index.ts` 中的空命令类桩，改为在 controller 中直接注册命令。

**理由**：22 个命令类中没有业务逻辑，仅增加文件数和间接层。

#### 决策 4：类型文件重组

将 `moduleManager/types.ts`、`interfaces.ts`、`moduleTreeTypes.ts` 合并重组到 `modules/types/` 下。

**理由**：类型定义分散在多个文件中，合并后更清晰。

---

## 4. 实施计划

### Phase 1：测试补齐 ✅ 已完成

- [x] 补充 `foldingProvider` 实际逻辑测试（2→8用例）
- [x] 补充 `fileDecorationProvider` 测试（6用例）
- [x] 补充 `common/tempPaths` 测试（8用例）
- [x] 补充 `modules/utils`、`topics`、`userFacingErrors` 测试（28用例）
- [ ] 补充 `decorations` 测试（需更多 mock 工作，延后）
- [ ] 加强 `authService` 测试（延后）

### Phase 2：类型与常量整理 ✅ 已完成

- [x] 合并 `interfaces.ts` → `types.ts`（删除 interfaces.ts）
- [x] 更新所有 7 个导入路径
- [x] 保持向后兼容（index.ts re-export 路径不变）

### Phase 3：服务拆分 ✅ 已完成

- [x] 从 `workspaceModuleService.ts` 提取 `configService.ts`（13函数，309行）
- [ ] 从 `controller` 提取 `readmePreview.ts`（延后）

### Phase 4：目录重组 ✅ 已完成

- [x] 创建 `modules/` 目录，迁移 moduleManager → modules（21 文件）
- [x] 创建 `language/` 目录，迁移 csmlog/lvcsm/hoverData/logFold → language（16 文件）
- [x] 旧路径保留 re-export 兼容层

### Phase 5：Controller 精简 🔄 部分完成

- [x] 移除命令桩模式（删除 commands/index.ts）
- [ ] 简化 webview 消息处理（延后）
- [ ] 移除未使用代码（延后）

**验收**：编译通过，全部测试通过。

### Phase 6：文档更新 🔄 部分完成

- [x] 更新 `AGENTS.md` 中的架构说明（新增 configService、types 详细说明）
- [ ] 创建 `docs/architecture.md` 架构文档（延后）
- [ ] 更新 `CONTRIBUTING.md`（延后）

**验收**：文档审查通过。

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 重构导致功能退化 | 高 | 测试先行，每步验证 |
| 导入路径变更破坏编译 | 中 | 保留 old-path re-export |
| 大文件拆分引入循环依赖 | 中 | 单向依赖原则，type-only import |
| 测试 mock 不覆盖新结构 | 低 | 测试本身也会随重构更新 |

---

## 6. 不变的约束

- VS Code 引擎 `^1.63.0`
- TypeScript `strict: true`
- esbuild 打包输出 `dist/extension.js`
- 所有现有 npm scripts 签名不变
- `package.json` contributions 不变
- 所有现有命令 ID、视图 ID、配置键不变
