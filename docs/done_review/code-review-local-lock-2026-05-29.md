# Code Review: feature/issue-39-local-lock

> 审查范围：分支 `feature/issue-39-local-lock` 相对于基线的修改
> 日期：2026-05-29
> 涉及提交：
> - `5eae96a` — enhance error handling during workspace lock state refresh and add tests
> - `dc04cd5` — implement local module lock/unlock functionality

---

## 概要

该分支实现了本地 CSM 模块的锁定/解锁功能：
- 已管理模块默认进入 lock（只读）状态
- 侧边栏新增 lock/unlock 按钮
- 锁状态写回 `csm-modules.yaml`
- 文件系统权限通过 `fs.chmod` 递归设置

以下是对修改的逐项审查，按严重程度排列。

---

## 问题列表

### P1 — `refreshSidebarWorkspaceState` 中 `syncWorkspaceModuleLockStates` 无错误处理

**涉及文件**: `src/moduleManager/moduleManagerController.ts`

**描述**: 提交 `5eae96a` 移除了 `refreshSidebarWorkspaceState` 中 `syncWorkspaceModuleLockStates` 的 try-catch（`dc04cd5` 中原有）。现在 lock 同步失败会直接导致 `refreshSidebarWorkspaceState` reject。

问题在于 `refreshSidebarWorkspaceState` 被多处调用：

| 调用位置 | 行号 | 上下文 |
|---------|------|--------|
| `register()` | 210 | 已有 `.catch()` — 安全 |
| `applyToWorkspaceCommand()` | 385 | 无 try-catch — 错误会冒泡给 VS Code 命令框架 |
| `removeModuleCommand()` | 469 | 外层 try-catch 已结束，无保护 |
| `updateModuleCommand()` | 572 | 同上 |
| `switchLocalModuleMethodCommand()` | 651 | 同上 |
| `toggleLocalModuleLockCommand()` | 717 | 同上 |
| `refreshModulesCommand()` | 多处 | 可能在 finally 中调用 |

**后果**: 如果模块目录被手动删除、文件被占用或权限异常，lock 同步失败会导致上述所有命令静默失败或抛出未处理的 promise rejection，表现为 UI 上的 "apply/remove/update 操作失败" 但实际主操作已成功。

**建议**: 在 `refreshSidebarWorkspaceState` 内部恢复 try-catch，将错误降级为 `logger.warn`，不让它阻断侧边栏刷新。

---

### P2 — `setLocalModuleLockState` 中脆弱的类型体操

**涉及文件**: `src/moduleManager/moduleManagerController.ts` (line 1057-1070)

```typescript
private async setLocalModuleLockState(...): Promise<LocalModuleConfigEntry> {
    const maybeWorkspaceModuleService = this.workspaceModuleService as Partial<WorkspaceModuleService>;
    if (typeof maybeWorkspaceModuleService.setModuleLocked === 'function') {
        return maybeWorkspaceModuleService.setModuleLocked.call(...);
    }
    return { ...entry, locked };  // ← 仅修改内存，不修改文件系统
}
```

**描述**: 通过 `Partial<...>` 断言和 `typeof === 'function'` 检查来防御性地调用 `setModuleLocked`。如果方法被重命名，检查会静默失败，回退到只修改 entry 对象的 `locked` 字段而不实际修改文件系统权限。UI 会显示 locked/unlocked 状态，但实际文件权限保持不变。

同样的问题存在于 `syncWorkspaceModuleLockStates` (line 1072-1081) 中。

**后果**: 重构时容易引入 UI 状态与文件系统状态不一致的 bug，且没有编译时保护。

**建议**: 
- 直接调用 `this.workspaceModuleService.setModuleLocked(...)`（TypeScript 会保证方法存在）
- 如果担心运行时 mock（测试中），在测试 mock 中提供该方法即可

---

### P3 — `isEntryLocked` 将 `undefined` 视为 `locked`

**涉及文件**: 
- `src/moduleManager/workspaceModuleService.ts` (line 809-811)
- `src/moduleManager/moduleManagerController.ts` (line 1053-1055)

```typescript
private isEntryLocked(entry: Pick<LocalModuleConfigEntry, 'locked'>): boolean {
    return entry.locked !== false;  // undefined → true
}
```

**描述**: 当 YAML 配置中没有 `locked` 字段时（例如旧配置文件迁移、手动编辑），模块默认为 locked。设计意图可能是"默认安全"，但这会导致以下副作用：

1. 对旧配置文件执行 `refreshSidebarWorkspaceState` → `syncWorkspaceModuleLockStates` 时，会尝试递归锁定所有模块的所有文件
2. 如果某些模块目录不存在（stale entry），`applyEntryLockState` → `updatePathLockState` → `fs.lstat` 会抛出 `ENOENT`，进而触发 P1 的问题

**后果**: 旧配置文件升级时可能触发意外的文件锁定操作或错误。

**建议**: 
- 在 `normalizeConfigEntry` 中显式写入 `locked: entry.locked !== false`，确保写入 YAML 的值始终是布尔值
- 考虑在 `loadConfig` 时对缺失 `locked` 字段做迁移处理，输出 warning 日志

---

### P4 — `updatePathLockState` 无单文件级别容错

**涉及文件**: `src/moduleManager/workspaceModuleService.ts` (line 829-841)

```typescript
private async updatePathLockState(targetPath: string, locked: boolean): Promise<void> {
    // ...
    for (const childName of childNames) {
        await this.updatePathLockState(path.join(targetPath, childName), locked);
    }
    await fs.chmod(targetPath, this.getLockMode(stat.mode, stat.isDirectory(), locked));
    // ↑ 任何失败直接抛出，前面已处理的文件不回滚
}
```

**描述**: 递归遍历过程中，如果某个文件 `fs.chmod` 失败（被其他进程独占、杀毒软件锁定等），整个操作会中断，且已处理的文件保持新权限状态。没有整体回滚机制，也没有部分失败的报告。

**后果**: 模块目录下部分文件锁定、部分未锁定，状态不一致且难以排查。

**建议**: 
- 对单个 `fs.chmod` 失败做 try-catch，收集失败路径，全部处理完后报告失败列表
- 或者至少对 `ENOENT` 和 `EPERM` 做降级处理

---

### P5 — Windows 文件权限语义不匹配

**涉及文件**: `src/moduleManager/workspaceModuleService.ts` (line 843-849)

```typescript
private getLockMode(currentMode: number, isDirectory: boolean, locked: boolean): number {
    const executeBits = isDirectory ? 0o111 : (currentMode & 0o111);
    if (locked) {
        return (isDirectory ? 0o555 : 0o444) | executeBits;
    }
    return (isDirectory ? 0o755 : 0o644) | executeBits;
}
```

**描述**: Node.js 的 `fs.chmod` 在 Windows 上只能操作 write 位（`0o200`），不能真正实现 Unix 风格的 `0o444` / `0o555` 权限。测试中使用的断言 `(stat.mode & 0o222) === 0` 验证 write 位被清除，这在 Windows 上可以工作。但：

- `executeBits` 的计算（`currentMode & 0o111`）在 Windows 上返回值取决于 NTFS 权限映射，不可靠
- 目录的 `0o555` 和 `0o755` 在 Windows 上行为不可预测

**后果**: 在 Windows 上，锁定/解锁的实际效果仅限于 write 位的设置/清除，与 Unix 平台的行为不完全一致。如果未来有 macOS/Linux 用户（通过 Remote SSH 或 WSL），行为会不同。

**建议**: 
- 在 `fs.chmod` 前显式处理跨平台差异，或使用 `fs.constants` 
- 考虑使用 `fs.chmod(path, locked ? 0o444 : 0o644)` 简化逻辑（Windows 忽略 execute 位）

---

### P6 — `syncWorkspaceModuleLockStates` 可能触发大量不必要的 `fs.chmod`

**涉及文件**: `src/moduleManager/moduleManagerController.ts` (line 1072-1081, 1839)

**描述**: `refreshSidebarWorkspaceState` 每次调用都会无条件执行 `syncWorkspaceModuleLockStates`，该操作遍历 YAML 中所有模块的所有文件并调用 `fs.chmod`。即使锁状态没有变化，也会重复设置相同的权限。

**后果**: 
- 侧边栏每次刷新都有 O(n×m) 的文件系统操作（n=模块数，m=每个模块的文件数）
- 在有大量模块或大模块的工作区中可能造成明显的性能退化

**建议**: 
- 在 `fs.chmod` 之前先读取当前权限，仅在需要变更时才写入
- 或者增加缓存/防抖机制

---

### P7 — 切换 `copy↔submodule` 模式时的 lock 状态传递存在细微问题

**涉及文件**: `src/moduleManager/workspaceModuleService.ts` (line 218-250)

**描述**: `switchModuleMethod` 在转换后检查原始 entry 的 locked 状态，但如果转换过程中调用了 `removeModule`（在 `convertSubmoduleToCopy` 中），`removeModule` 会先解锁（`updatePathLockState(targetAbsolute, false)`）再删除。之后在新路径上重新应用 lock。如果 `removeModule` 的解锁成功但新路径不存在，lock 应用会静默跳过（`pathExists` 返回 false）。

**后果**: 小概率的边界情况 — 通常不会引起问题。

**建议**: 在 `convertSubmoduleToCopy` 的 finally 中确保新目录存在后再应用 lock，或至少记录 warning。

---

### P8 — 测试的 `assert.rejects` 验证了有问题的行为

**涉及文件**: `src/test/moduleManagerController.test.ts` (line 1773-1808)

```typescript
test('refreshSidebarWorkspaceState fails when local module lock sync fails', async () => {
    // ...
    await assert.rejects(() => controller.refreshSidebarWorkspaceState(), /chmod denied/);
});
```

**描述**: 该测试验证了 `refreshSidebarWorkspaceState` 在 lock 同步失败时会 reject。这与 P1 描述的问题是一致的 — 它确认了当前的（有问题的）行为。如果 P1 被修复（恢复 try-catch），这个测试需要同步更新。

**建议**: 修复 P1 后，将此测试改为验证错误被降级处理（通过 spy 检查 `logger.warn` 调用或 `showErrorMessage`）。

---

## 非阻塞建议

### N1 — locked badge 在 UI 中的默认显示

**涉及文件**: `src/moduleManager/moduleSidebarHtml.ts` (line 394)

```typescript
const locked = entry.locked !== false;
```

与 P3 一致 — `undefined` → locked badge 显示。这个行为可能是期望的（默认显示锁定状态），但与 `locked` badge 的文字（"Locked"/"Unlocked"）的语义需要统一确认。

### N2 — `unlockedBadge` / `lockedBadge` 消息可能需要注册

确认 `messages.ts` 中 `lockedBadge`、`unlockedBadge` 两条消息已在 i18n 字典中定义。从 diff 中看到新增了 `lockLocalFiles`、`unlockLocalFiles`、`unlockAction`、`unlockConfirmation`、`progressChangingLock`、`lockSuccess`、`unlockSuccess`、`toggleLockFailed`、`openWorkspaceBeforeToggleLock`，但未确认 `lockedBadge` 和 `unlockedBadge`。

---

## 总结

| 级别 | 数量 | 关键问题 |
|------|------|---------|
| P1 - 高危 | 2 | lock 同步错误冒泡导致多个命令失败；类型体操静默回退 |
| P2 - 中危 | 3 | undefined→locked 语义、单文件无容错、Windows 兼容性 |
| P3 - 低危 | 3 | 重复 chmod 性能、模式切换边界、测试耦合 |

**最优先修复**: P1（在 `refreshSidebarWorkspaceState` 内部恢复 try-catch）— 这是一行改动，但影响面最大。
