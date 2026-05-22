# 操作逻辑与用户易用性审查报告

> 审查者：DeepSeek Agent
> 日期：2026-05-22
> 范围：全仓库 — 侧边栏模块管理交互流程、用户操作链路、状态反馈

---

## 目录

1. [审查范围与方法](#1-审查范围与方法)
2. [发现的问题](#2-发现的问题)
3. [优先级汇总](#3-优先级汇总)
4. [总结](#4-总结)
5. [问题处理汇总](#5-问题处理汇总)

---

## 1. 审查范围与方法

本次审查聚焦于终端用户与 `CSM Modules` 侧边栏及模块管理命令的交互链路，包括：

- 首次使用体验（打开侧边栏 → 浏览模块 → 初次应用）
- 日常操作（刷新、搜索、排序、Apply / Update / Remove）
- 状态反馈（加载、空态、错误、成功、取消）
- 工作区感知（多仓库切换、配置状态同步）

审查通过逐条追踪 Controller → View Provider → Webview 的完整调用链完成。

---

## 2. 发现的问题

### 2.1 Refresh 操作的模态确认是多余的

- **文件：** `src/moduleManager/moduleManagerController.ts:634`
- **当前行为：** 点击 Refresh 按钮或命令时弹出模态确认框 `"Refresh CSM modules from GitHub?"`，必须点 `Refresh` 才能继续
- **问题：** Refresh 是**非破坏性操作**——只拉取最新模块列表，不修改任何本地文件。Apply / Remove 需要确认是合理的（涉及 Git 操作），但 Refresh 的意图在用户主动点击按钮时已经明确。模态弹窗增加了不必要的打断
- **建议：** 移除 Refresh 的模态确认，直接执行刷新。成功/失败通过 toast 通知结果
- **修复记录（2026-05-22）：** 已修复。`refreshCommand()` 现已直接调用 `loadModules(...)` 执行刷新，不再弹出二次确认；刷新结果仍通过成功 / 失败 toast 反馈。

---

### 2.2 登录状态与模块可见范围反馈不透明

- **文件：** `src/moduleManager/moduleManagerController.ts:176`（`setAuthenticationState`），`617-631`（`refreshModulesForSignedInUsers`）
- **当前行为：**
  - 侧边栏打开时自动静默尝试获取 GitHub session
  - 成功则自动补充 private 模块，失败则无提示
  - 用户不知道"当前看到了多少模块"以及"是否还有未加载的 private 模块"
- **问题：** 用户无法区分"42 个公开模块（完整列表）"和"42 个公开模块（还可能有 private 未加载）"
- **建议：** 在侧边栏状态栏中显示可见范围说明：
  - 未登录：`"已加载 42 个公开模块 — 登录后可查看私有模块"`
  - 已登录：`"已登录 {account}，已加载 58 个模块（含私有）"`
- **修复记录（2026-05-22）：** 已修复。侧边栏 Webview 已增加可见范围摘要：未登录时显示 public 范围提示，已登录时显示当前账号与是否包含 private 模块的说明。

---

### 2.3 无登出功能

- **位置：** `package.json:155`（Login 按钮 when 条件 `!csmModules.signedIn`），Controller 无对应登出命令
- **当前行为：** 侧边栏提供 Login 按钮，登录后该按钮隐藏。没有 Logout 入口
- **问题：** 用户希望切换 GitHub 账号时必须到 VS Code 设置中手动操作 `Accounts`，扩展未提供便利入口
- **建议：** 在已登录状态下，将 Login 按钮位置改为显示当前用户名 + 登出选项（可调用 VS Code 内置的 `Sign out of GitHub` 或复用 `vscode.authentication` API）
- **修复记录（2026-05-22）：** 已修复。新增 `csmModules.logout` 命令与标题栏按钮；`AuthService.signOut()` 复用 VS Code 内部 `_signOutOfAccount` 命令，Controller 在登出后会重新检查 session 并刷新模块列表。

---

### 2.4 工作区切换时不自动刷新 Applied 状态

- **文件：** `src/moduleManager/moduleManagerController.ts:886-922`（`refreshSidebarWorkspaceState`）
- **当前行为：**
  - `refreshSidebarWorkspaceState()` 读取当前工作区的 `csm-modules.yaml` 来显示 applied 徽章和 stale 状态
  - 该方法仅在 register 阶段、apply/remove/update 成功后、initialize 成功后被调用
  - **未监听** `vscode.workspace.onDidChangeWorkspaceFolders` 事件
- **问题：** 用户在仓库 A 中 apply 了模块 X，然后切换到仓库 B → 侧边栏可能仍显示模块 X 的 applied 徽章
- **建议：** 在 register 中监听 `vscode.workspace.onDidChangeWorkspaceFolders`，工作区变化时自动调用 `refreshSidebarWorkspaceState()`
- **修复记录（2026-05-22）：** 暂未修复。当前 `register()` 里仍未监听 `vscode.workspace.onDidChangeWorkspaceFolders`，Applied / stale 状态仍主要依赖初始化、apply、remove、update、initialize 等路径主动刷新。

---

### 2.5 网络错误时完全丢弃已缓存的模块列表

- **文件：** `src/moduleManager/moduleManagerController.ts:696-703`
- **当前行为：**
  ```typescript
  } catch (error) {
      const message = getUserFacingErrorMessage(error, 'refresh');
      this.treeDataProvider.setError(message);  // 替换整个视图为错误状态
  }
  ```
  当缓存过期且网络刷新失败时，`setError` 会**替换当前显示的模块列表**为单一错误消息
- **问题：** 用户完全无法浏览之前缓存的内容。离线场景下侧边栏变为不可用状态
- **建议：** 网络错误时保留当前缓存列表的显示，同时在顶部显示 warning banner（如 `"刷新失败，显示的是缓存数据"`），并提供手动重试入口
- **修复记录（2026-05-22）：** 暂未修复。`loadModules()` 的失败分支仍会调用 `setError(...)` 覆盖当前视图；虽然 Webview 已有 `offlineMode` banner 渲染能力，但当前失败回退路径尚未切换到“保留缓存 + 顶部提示”的模式。

---

### 2.6 搜索仅对前端已渲染的模块生效

- **文件：** `src/moduleManager/moduleSidebarViewProvider.ts:48-49`
- **当前行为：**
  ```typescript
  private static readonly INITIAL_RENDER_LIMIT = 100;
  private renderLimit = ModuleSidebarViewProvider.INITIAL_RENDER_LIMIT;
  ```
  侧边栏初始仅渲染前 100 个模块，"Show More" 按钮逐步加载更多。搜索过滤在前端 JS 中对已渲染的卡片进行，不涉及后端
- **问题：** 如果用户搜索一个排在第 150 位的模块，不会出现在搜索结果中——除非先多次点击 "Show More" 扩大渲染范围
- **建议：**
  - 在搜索框中输入时，如果当前渲染范围内的匹配数不足预期，自动扩大渲染范围
  - 或考虑将过滤查询回传后端进行全量搜索
- **修复记录（2026-05-22）：** 暂未修复。前端 `applyFilter()` 仍只在已渲染卡片集合上做过滤，未自动提升 `renderLimit`，也未把查询回传后端做全量匹配。

---

### 2.7 Apply 流程多步取消均无反馈

- **文件：** `src/moduleManager/moduleManagerController.ts:198-361`
- **当前行为：** Apply 流程中的每个可取消步骤在取消时直接 `return` 退出，不显示任何提示
  - `resolveWorkspaceFolder()` — QuickPick 取消 → 无反馈
  - `ensureToken()` — 登录取消 → 无反馈
  - `resolveLocalModuleConfig()` — 初始化取消 → 无反馈
  - `promptApplyMethod()` — 方法选择取消 → 无反馈
  - `showWarningMessage(modal)` — 确认取消 → 无反馈
- **问题：** 用户不确定是自己取消了还是出了错误
- **建议：** 在取消路径上返回前调用 `vscode.window.showInformationMessage('已取消应用')`，或至少在第一个可取消步骤的取消时给出反馈
- **修复记录（2026-05-22）：** 暂未修复。Apply 流程中的多个取消分支目前仍是直接 `return`，尚未统一追加“已取消应用”类的提示。

---

### 2.8 Update 操作缺少版本变更对比

- **文件：** `src/moduleManager/moduleManagerController.ts:460-462`
- **当前行为：**
  ```typescript
  t('updateSuccess', { module: targetLabel, ref: updated?.ref ?? t('latestRef') })
  // 显示："已将 xxx/yyy 更新到 abc1234。"
  ```
- **问题：** 仅显示新 commit ref，不显示旧的 ref。用户无法直观判断"更新了什么"
- **建议：** 在确认对话框中或更新成功消息中显示版本对比，例如 `"从 {oldRef} 更新到 {newRef}"`
- **修复记录（2026-05-22）：** 暂未修复。`updateSuccess` 文案仍只展示新 `ref`，未补充旧版本到新版本的差异信息。

---

### 2.9 Remove 确认文案未区分 submodule 和 copy

- **文件：** `src/moduleManager/messages.ts:89`
- **当前行为：**
  ```
  en: 'Remove module {module} from {repository}? This deletes {targetPath}.'
  ```
- **问题：** submodule remove 会执行 `git submodule deinit` + 清理 `.git/modules/<path>`，copy remove 仅删除普通目录。两者的影响范围不同，"deletes {targetPath}" 描述不够精确
- **建议：** 根据 `ModuleApplyMethod` 类型区分确认文案：
  - submodule: `"将移除 submodule 并删除 {targetPath}，git submodule 记录也会被清理"`
  - copy: `"将删除复制目录 {targetPath}"`
- **修复记录（2026-05-22）：** 暂未修复。`removeConfirmation` 仍是统一模板，尚未按 `submodule` / `copy` 区分删除影响范围。

---

### 2.10 右键菜单 Apply 的前置条件检查不充分

- **文件：** `package.json:173-176`
- **当前行为：**
  ```json
  "enablement": "!moduleApplied"
  ```
  右键菜单的 `contextApplyModule` 仅在模块未应用时启用
- **问题：** 该检查不包含 Git 仓库存在性。在非 Git 工作区中对模块右键 → Apply → 才会收到 `"当前工作区文件夹不是 Git 仓库"` 错误。用户会困惑为什么这个选项出现在菜单中
- **建议：** 评估是否可以通过 VS Code `when` clause 加入仓库类型检查。如果 when clause 能力不足，至少在执行时给出更前置的提示（如 hover tooltip）
- **修复记录（2026-05-22）：** 暂未修复。`contextApplyModule` 在清单中的 `enablement` 仍只有 `!moduleApplied`，Git 仓库存在性仍要到命令执行时才校验。

---

### 2.11 排序 "Applied" 状态与工作区紧耦合，切换时不更新

这是 2.4（工作区切换不刷新）的延伸影响。当排序设置为 `applied` 时，模块排序依赖当前工作区的 applied 集合。如果工作区切换后未触发 `refreshSidebarWorkspaceState()`，排序结果将基于过期数据。

**建议：** 与 2.4 一并修复。

**修复记录（2026-05-22）：** 暂未修复。由于 2.4 对工作区切换的监听尚未补齐，`applied` 排序字段仍可能在工作区切换后基于旧状态排序。

---

### 2.12 手动刷新失败时的回退策略不足

- **当前行为：**
  - `register()` 中自动刷新使用 `preserveVisibleModules: true`，失败时保留缓存 ✓
  - `refreshCommand()` 中手动刷新**未传入** `preserveVisibleModules`，默认 false
- **问题：** 用户手动点击 Refresh 失败时，会直接看到错误页面，而不是保留缓存列表
- **建议：** `refreshCommand` → `loadModules` 也传入 `preserveVisibleModules: true`
- **修复记录（2026-05-22）：** 暂未修复。`refreshCommand()` 目前仍未传入 `preserveVisibleModules: true`，手动刷新失败时依旧可能落入错误页而不是保留当前列表。

---

## 3. 优先级汇总

| 优先级 | 问题 | 影响范围 | 预计工作量 |
|--------|------|----------|-----------|
| 🔴 高 | Refresh 多余模态确认 | 每次刷新操作 | 删除 5 行 |
| 🔴 高 | 网络错误丢弃缓存列表 | 离线场景完全不可用 | ~15 行 |
| 🔴 高 | 工作区切换不刷新状态 | 多仓库用户 applied 徽章错误 | 监听器 + ~5 行 |
| 🟡 中 | 搜索仅限前 100 个模块 | 大列表搜索不全 | 前端联动 ~20 行 |
| 🟡 中 | Apply 取消无反馈 | 用户操作信心 | 添加 toast ~10 行 |
| 🟡 中 | 缺少登出功能 | 账号切换 | 新增按钮 + 命令 ~20 行 |
| 🟡 中 | 登录状态不透明 | 用户不知模块是否完整 | 文案改动 ~10 行 |
| 🟢 低 | Remove 文案未区分类型 | 用户理解偏差 | 文案改动 ~5 行 |
| 🟢 低 | Update 缺少版本对比 | 用户不知变更范围 | 文案改动 ~10 行 |
| 🟢 低 | 右键菜单前置检查不充分 | 低概率误触 | when 条件 ~3 行 |
| 🟢 低 | 手动刷新回退策略不足 | 手动刷新失败后体验差 | ~3 行 |

---

> 注：以上建议均可独立实施。2.4 和 2.11 为同一根源问题，合并处理。

## 4. 总结

截至 2026-05-22，本轮 UX 审查中已有 3 项问题完成修复：去除了 Refresh 的多余确认、补充了登录态下的模块可见范围反馈、并新增了 GitHub 登出能力；其余问题仍主要集中在工作区状态同步、离线/失败回退、搜索覆盖范围以及取消/确认文案细化等方面。整体来看，当前模块管理器已经补齐了最直接的高频交互短板，但在多工作区一致性、弱网容错和大列表可用性上仍有明显改进空间；后续如果继续推进，建议优先处理 2.4 / 2.11、2.5 / 2.12，再处理 2.6 与 2.7，这样可以先稳定状态正确性，再改善失败场景与搜索体验。

---

## 5. 问题处理汇总

| 优先级 | 问题 | 是否已解决 | 简要处理说明 |
|--------|------|------------|--------------|
| 🔴 高 | Refresh 多余模态确认 | 是 | 已移除刷新确认弹窗，`refreshCommand()` 直接执行刷新，并保留成功/失败 toast 反馈。 |
| 🔴 高 | 网络错误丢弃缓存列表 | 否 | 当前失败分支仍会进入错误态，尚未改成“保留缓存列表 + 顶部离线提示”的回退方式。 |
| 🔴 高 | 工作区切换不刷新状态 | 否 | 当前仍未监听工作区切换事件，尚未在切换仓库时自动刷新 applied / stale 状态。 |
| 🟡 中 | 搜索仅限前 100 个模块 | 否 | 当前搜索仍只作用于前端已渲染项，尚未自动扩展渲染范围或改为全量搜索。 |
| 🟡 中 | Apply 取消无反馈 | 否 | Apply 各取消分支仍直接返回，尚未统一补充“已取消应用”提示。 |
| 🟡 中 | 缺少登出功能 | 是 | 已新增 `csmModules.logout` 命令和标题栏入口，并调用 VS Code 的 GitHub 退出登录流程。 |
| 🟡 中 | 登录状态不透明 | 是 | 已在侧边栏增加登录账号和模块可见范围摘要，区分未登录、仅公开模块、含私有模块等状态。 |
| 🟢 低 | Remove 文案未区分类型 | 否 | 删除确认文案仍是统一模板，尚未按 `submodule` 和 `copy` 区分影响范围。 |
| 🟢 低 | Update 缺少版本对比 | 否 | 更新成功提示仍只显示新 ref，尚未展示旧版本到新版本的对比。 |
| 🟢 低 | 右键菜单前置检查不充分 | 否 | 右键 Apply 仍只基于 `!moduleApplied` 启用，Git 仓库条件仍在执行时校验。 |
| 🟢 低 | 手动刷新回退策略不足 | 否 | `refreshCommand()` 仍未传入 `preserveVisibleModules: true`，失败时可能直接落入错误页。 |
