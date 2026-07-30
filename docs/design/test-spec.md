# 测试规范文档

> 关联：`docs/design/refactor-design.md`
> 创建日期：2026-07-29
> 状态：进行中

---

## 1. 测试策略

### 1.1 三层测试金字塔

```
        ┌─────────┐
        │ 集成测试 │  ← 真实 VS Code 宿主（npm test）
        │  ~5个    │
       ┌┴─────────┴┐
       │  单元测试  │  ← Mocha standalone（npx mocha --ui tdd）
       │  ~320个   │
      ┌┴───────────┴┐
      │  纯函数测试  │  ← 无依赖，最快
      │  ~100个     │
      └─────────────┘
```

### 1.2 测试运行命令

```bash
# 编译测试（必须先执行）
npm run compile-tests

# 全部 standalone 单元测试
npx mocha --ui tdd --timeout 10000 --require out/test/setup.js "out/test/**/*.test.js"

# 完整扩展测试（需要 VS Code 宿主）
npm test

# 窄测试（快速反馈）
npx mocha --ui tdd --timeout 10000 --require out/test/setup.js out/test/modules/controller.test.js
```

### 1.3 测试命名约定

- 文件名：`<module>.test.ts`
- Suite 名：`<模块名> — <功能描述>`（使用 TDD 风格 `suite`）
- 用例名：中文描述，简明扼要
- 文件位置：镜像源码结构，`src/test/` 对应 `src/`

---

## 2. 已有测试覆盖（基线）

### 2.1 高覆盖组件 ✅

| 组件 | 测试文件 | 用例数 | 质量 |
|------|----------|--------|------|
| `normalizer.ts` | `normalizer.test.ts` | 13 | ★★★★★ 覆盖所有归一化规则 |
| `detector.ts` | `detector.test.ts` | 12 | ★★★★★ 覆盖三级递进检测 |
| `sort.ts` | `sort.test.ts` | 16 | ★★★★★ 覆盖类型守卫+排序 |
| `i18n.ts` | `i18n.test.ts` | 13 | ★★★★★ 中英双语+参数替换 |
| `controller` | `controller.test.ts` | 59 | ★★★★★ 覆盖所有命令和状态转换 |
| `workspaceService` | `moduleManager.test.ts` | 34 | ★★★★★ 覆盖 apply/update/remove |
| `hoverProvider` | `hoverProvider.test.ts` | 35 | ★★★★☆ |
| `documentSymbolProvider` | `symbolProvider.test.ts` | 22 | ★★★★☆ |
| `hoverData` | `hoverData*.test.ts` | 21 | ★★★★☆ |
| `labviewDetector` | `detector.test.ts` | 21 | ★★★★☆ |
| `githubService` | `githubService.test.ts` | 11 | ★★★☆☆ |
| `performance` | `performance.test.ts` | 1 | ★★★★★ 100K行≤1000ms约束 |

### 2.2 需要增强的组件 ⚠️

| 组件 | 测试文件 | 现状 | 目标 |
|------|----------|------|------|
| `foldingProvider.ts` | `foldingProvider.test.ts` | 2用例（仅mock框架） | 补充实际 `provideFoldingRanges` 逻辑测试 |
| `authService.ts` | `authService.test.ts` | 3用例 | 补充 `verifyScopes`, 边界条件 |

### 2.3 需要新建测试的组件 ❌

| 组件 | 新测试文件 | 目标用例数 |
|------|-----------|-----------|
| `decorations.ts` | `decorations.test.ts` | 8+ |
| `fileDecorationProvider.ts` | `fileDecorationProvider.test.ts` | 6+ |
| `common/tempPaths.ts` | `tempPaths.test.ts` | 6+ |
| `modules/utils.ts` | `utils.test.ts` | 5+ |
| `modules/topics.ts` | `topics.test.ts` | 6+ |
| `modules/userFacingErrors.ts` | `userFacingErrors.test.ts` | 8+ |
| `modules/configService.ts`（新文件） | `configService.test.ts` | 10+ |

---

## 3. 新增测试详细规范

### 3.1 `decorations.test.ts` — 装饰渲染

```typescript
suite('LogFold — Decorations', () => {
    // 测试 createDecorationTypes 创建正确的 VS Code 装饰类型
    test('createDecorationTypes 返回所有装饰类型');
    
    // 测试不同模式的装饰应用
    test('精确重复模式使用对应装饰');
    test('参数化重复模式使用对应装饰');
    test('多行块重复模式使用对应装饰');
    test('交错重复模式使用对应装饰');
    
    // 测试边界条件
    test('空折叠区域不产生装饰');
    test('clearDecorations 清空所有装饰');
    
    // 测试概要标签
    test('compact 样式显示简短计数');
    test('detailed 样式显示时间范围');
});
```

### 3.2 `foldingProvider.test.ts` — 折叠提供者

```typescript
suite('LogFold — FoldingRangeProvider', () => {
    // 构造真实场景的文档并调用 provideFoldingRanges
    test('重复行产生折叠区域');
    test('不同行不产生折叠区域');
    test('折叠区域数量与重复区数量一致');
    test('多行块折叠正确计算范围');
    test('参数化折叠在 smartParams 开启时工作');
    test('折叠区域起止行号正确');
});
```

### 3.3 `fileDecorationProvider.test.ts` — 文件装饰

```typescript
suite('FileDecorationProvider', () => {
    test('.csmlog 文件显示 C 标记');
    test('.lvcsm 文件显示 L 标记');
    test('其他文件不显示标记');
    test('Badge 颜色正确');
    test('Tooltip 内容正确');
});
```

### 3.4 `tempPaths.test.ts` — 临时路径

```typescript
suite('Common — TempPaths', () => {
    test('getTempRoot 返回有效路径');
    test('getTempRoot 可创建目录');
    test('子路径创建正确');
    test('路径使用正斜杠');
    test('并发调用安全');
});
```

### 3.5 `utils.test.ts` — 模块工具

```typescript
suite('Modules — Utils', () => {
    test('generateModuleKey 格式正确');
    test('相同 owner+repo 产生相同 key');
    test('不同 owner+repo 产生不同 key');
});
```

### 3.6 `topics.test.ts` — 话题过滤

```typescript
suite('Modules — Topics', () => {
    test('检测 csm-modsets 话题');
    test('labview-csm 话题匹配');
    test('无话题返回 false');
    test('大小写不敏感匹配');
});
```

### 3.7 `userFacingErrors.test.ts` — 错误翻译

```typescript
suite('Modules — UserFacingErrors', () => {
    test('网络错误翻译为可读消息');
    test('Git 权限错误翻译');
    test('Git 缺失错误翻译');
    test('YAML 解析错误翻译');
    test('GitHub 503 错误翻译');
    test('未知错误保留原始消息');
});
```

---

## 4. 测试基础设施

### 4.1 VS Code Mock (`vscode-mock.ts`)

提供完整的 VS Code API 模拟：
- `vscode.window`：showInformationMessage、showWarningMessage、showErrorMessage、showQuickPick、withProgress
- `vscode.workspace`：getConfiguration、workspaceFolders、fs、onDidChangeConfiguration
- `vscode.commands`：registerCommand、executeCommand
- `vscode.authentication`：getSession
- `vscode.Uri`、`vscode.Range`、`vscode.Position`

### 4.2 测试辅助工具

- `FakeMemento`：模拟扩展存储
- `RecordingGitRunner`：记录 Git 调用序列
- `createController()`：工厂方法创建测试用控制器
- `makeDoc()`：构造模拟文档

### 4.3 CI 集成

所有测试在 CI 中通过 `.github/workflows/ci.yml` 运行：
- `grammar-tests`：standalone Mocha 测试
- `extension-tests`：完整 VS Code 扩展测试（Linux + xvfb）

---

## 5. 质量门禁

每个 commit 必须满足：

| 检查项 | 命令 | 要求 |
|--------|------|------|
| 类型检查 | `npm run check-types` | 0 错误 |
| 代码规范 | `npm run lint` | 0 警告 |
| 测试编译 | `npm run compile-tests` | 成功 |
| 单元测试 | `npx mocha --ui tdd ... "out/test/**/*.test.js"` | 全部通过 |
| 完整测试 | `npm test` | 全部通过（PR 前） |

---

## 6. 测试编写原则

1. **测试行为，不测试实现** — 验证函数的输入输出和副作用，不验证内部状态
2. **一个用例一个断言主题** — 每个 `test()` 聚焦一个行为
3. **用例名描述场景** — 能从名称理解测试内容，无需阅读代码
4. **mock 最少化** — 优先使用纯函数测试；需要 mock 时用依赖注入而非全局替换
5. **边界优先** — 空输入、极端值、错误输入优先覆盖
