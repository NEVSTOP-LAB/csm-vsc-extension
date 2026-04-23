# GitHub Copilot 自定义指令（Repository Custom Instructions）

本文件按照 GitHub Copilot 官方推荐，放置于 `.github/copilot-instructions.md`。
Copilot 在进行代码补全、代码审查、Chat 问答时，会自动将本文件内容纳入上下文。

---

## 1. 文档与代码保持同步（Documentation ↔ Code Sync）

**【强制规则】** 每当修改以下任意文件时，必须同步更新所有引用了相关信息的文档文件：

| 修改的源文件 | 必须同步检查/更新的文档 |
|---|---|
| `package.json` — `engines.vscode` | `README.md`（安装要求）、`CHANGELOG.md`（技术栈）、`docs/ARCHITECTURE.md`（依赖表） |
| `package.json` — `version` | `CHANGELOG.md`（版本号章节）、`README.md`（如有版本引用） |
| `package.json` — `devDependencies` | `docs/ARCHITECTURE.md`（依赖版本表） |
| `language-configuration.json` / `syntaxes/` | `README.md`、`docs/` 下的相关说明文档 |
| `src/` 源码（新增/修改功能） | `README.md`（功能列表）、`CHANGELOG.md`（变更记录）、`docs/ARCHITECTURE.md`（架构说明） |

### 1.1 VS Code 最低版本（重点）

- **`package.json` 中 `engines.vscode` 字段**是插件运行时所需的 VS Code 最低版本，是**唯一权威来源**。
- **`devDependencies` 中的 `@types/vscode`** 是 TypeScript 类型声明包的版本，**不代表运行时要求**，两者可能不同。
- 在所有文档（README、CHANGELOG、ARCHITECTURE 等）中引用 VS Code 版本时，**必须与 `engines.vscode` 保持一致**，禁止引用 `@types/vscode` 的版本号。

**错误示例（当前 `engines.vscode` 为 `^1.60.0` 时）：**
```
❌ Visual Studio Code 1.109.0 或更高版本   ← @types/vscode 的版本，不是运行要求
❌ VS Code Extension API 1.109.0+
```

**正确示例：**
```
✅ Visual Studio Code 1.60.0 或更高版本
✅ VS Code Extension API 1.60.0+
```

### 1.2 代码 Review 检查清单

每次 PR review 时，请检查以下内容：

- [ ] `package.json` 是否修改了 `engines.vscode`？若是，README/CHANGELOG/ARCHITECTURE 是否同步？
- [ ] `package.json` 是否修改了 `version`？若是，CHANGELOG 是否新增了对应版本条目？
- [ ] `devDependencies` 版本是否被误用于文档中的"运行要求"描述？
- [ ] 新增/修改的功能是否在 README 和 CHANGELOG 中有对应更新？
- [ ] `language-configuration.json` 或语法文件的改动是否影响文档中描述的语言特性？

---

## 2. 项目核心约定（Project Conventions）

### 2.1 文件扩展名

当前扩展支持以下文件扩展名：

- 日志文件：**`.csmlog`**
- 配置文件：**`.lvcsm`**

在代码、文档、测试中引用文件扩展名时，请与以上定义保持一致。

### 2.2 代码风格

- 所有源码位于 `src/`，使用 TypeScript，开启严格模式（`strict: true`）。
- ESLint 配置见 `eslint.config.mjs`，运行 `npm run lint` 检查（仅扫描 `src/`）。
- 构建命令：`npm run compile`（类型检查 + lint + esbuild 打包）。
- 单元测试：`npm run compile-tests`，然后使用 Mocha TDD 风格运行 `out/test/` 下的测试文件。

### 2.3 Snippet 插入文本

`CompletionDef.insertText` 始终通过 `vscode.SnippetString` 包装，支持 `${1:placeholder}` Tab 占位符。

---

## 3. 参考资料

- [GitHub Copilot 自定义指令官方文档](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- [VSCode 插件 `engines` 字段说明](https://code.visualstudio.com/api/references/extension-manifest#fields)
