# 贡献指南

欢迎提交 Issue 和 Pull Request！本文档说明如何在本地搭建开发环境、运行测试以及提交贡献。

## 本地开发

```bash
# 克隆仓库
git clone https://github.com/NEVSTOP-LAB/CSMScript-vsc-Support.git
cd CSMScript-vsc-Support

# 安装依赖
npm install

# 编译扩展
npm run compile
```

## 运行测试

### 自动化单元测试（不需要 VS Code）

语法高亮语法规则的单元测试（`grammar.test.ts`）可在命令行直接运行，无需启动 VS Code：

```bash
# 编译测试
npm run compile-tests

# 运行语法规则单元测试（334 个测试，涵盖所有 18 个语法模式）
npx mocha --ui tdd out/test/grammar.test.js
```

预期输出示例：

```
  Grammar – line-comment
    ✔ entry has correct scope name
    ✔ matches a full-line comment
    ...

  334 passing (xxx ms)
```

### 在 VS Code 中运行完整测试套件

```bash
# 运行全部测试（运行 out/test 下所有 *.test.js，由 .vscode-test.mjs 配置）
npm test
```

> **注意**：`npm test` 会启动一个 VS Code 进程，需要图形界面环境。在 CI 或无头环境中，可以配合 `xvfb` 或 `vscode-test --headless` 等方式运行，例如：
>
> ```bash
> xvfb-run npm test
> ```

### 代码检查与类型检查

```bash
npm run lint          # ESLint 代码风格检查
npm run check-types   # TypeScript 类型检查
```

## 手动测试语法高亮

### 方法一：在 Extension Development Host 中调试（推荐）

1. 用 VS Code 打开本仓库根目录
2. 按 **F5**（或选择菜单 *运行 → 启动调试*）
3. VS Code 会自动打开一个新的 **Extension Development Host** 窗口，并加载本扩展
4. 在新窗口中打开以下手动测试样例文件：

   - `samples/manual-full-coverage.csmscript`（主样例：覆盖全部 18 个语法模式）
   - `samples/include-sequence.csmscript`（被 include 的子样例）

5. 验证各语法元素已正确高亮（注释、预定义区、变量引用、控制流标签、通信操作符、内建命令、订阅广播、系统状态常量等）
6. 使用 **Scope Inspector** 检查任意 token 的作用域：
   - 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
   - 搜索并运行 **"Developer: Inspect Editor Tokens and Scopes"**
   - 点击任意 token 查看 TextMate 作用域

### 方法二：打包为 `.vsix` 后手动安装

```bash
# 安装 vsce 打包工具（如未安装）
npm install -g @vscode/vsce

# 打包扩展
vsce package

# 在 VS Code 中安装生成的 .vsix 文件
# 方式 1：命令行
code --install-extension csmscript-language-support-*.vsix

# 方式 2：在 VS Code 扩展面板中选择 "从 VSIX 安装..."
```

### 扩展图标

当前使用的是占位符图标（[images/icon.png](images/icon.png)），可根据需要替换为正式图标。详见 [docs/images-guide.md](docs/images-guide.md) 了解图标规格和替换指南。

## 提交 PR 前的检查清单

在提交 PR 之前，请确保：

- 代码风格符合 ESLint 规范：`npm run lint`
- 类型检查通过：`npm run check-types`
- 所有测试通过：`npm test`
