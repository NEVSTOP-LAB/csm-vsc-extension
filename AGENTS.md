# AGENTS.md

**详细开发规范**见 `.github/agents/` 下的 agent 文件。本项目通过 2 个 agent 覆盖开发与审查场景：`vscode-ext-dev`（全部开发工作）、`vscode-ext-review`（文档同步审查）。以下仅保留全局通用约定。

---

## 项目架构

| 模块         | 路径                                     | 职责                                              |
|--------------|------------------------------------------|---------------------------------------------------|
| 扩展入口     | `src/extension.ts`                       | 注册 Provider、命令、状态栏                         |
| 语言功能     | `src/language/`                          | CSMLog/LVCSM 语法高亮、Hover、Outline、折叠、文件装饰 |
| ┣ Hover 数据 | `src/language/hoverData/`                | Hover 知识库（操作符、命令、控制流等）                |
| ┣ 日志折叠   | `src/language/logFold/`                  | 归一化 → 检测 → FoldingRangeProvider → 装饰器     |
| 模块管理     | `src/modules/`                           | 侧边栏 Webview、GitHub/Git 操作、配置管理           |
| ┣ 类型定义   | `src/modules/types.ts`                   | 所有核心类型                                      |
| ┣ 配置服务   | `src/modules/configService.ts`           | YAML 配置读写                                     |
| ┣ 控制器     | `src/modules/moduleManagerController.ts` | 命令注册、状态管理、WebView 通信                    |
| 共享工具     | `src/common/`                            | 常量、国际化、临时路径、DocumentSymbol 构建          |
| 语法高亮     | `syntaxes/*.tmLanguage.json`             | csmlog / lvcsm TextMate 语法                      |

## 使用中文

所有注释、回复和总结均使用中文。

## 禁止 Reload Window

开发过程中**不要**执行 `Developer: Reload Window`（或等效的窗口重载操作）。Reload Window 会中断当前 LLM 会话的思考过程，导致上下文丢失。当需要验证修改效果时，应优先考虑以下替代方案：

- **自动化测试**：运行单元测试（如 `npm test`）或集成测试验证逻辑正确性。
- **终端命令**：通过 `run_in_terminal` 执行脚本或 Node 代码片段直接验证结果。
- **检查编译输出**：查看 watch 任务的 TypeScript/esbuild 编译/打包输出是否有错误。
- **利用 Pylance/Hover**：通过语言服务工具检查符号、诊断信息等。

## 代码修改注意事项
- 禁止直接在 main 分支上进行开发，需要根据需求，创建 branch，来承接修改任务
- **开始代码修改任务后，第一时间创建 feature branch 并切换过去**，不要在 main 上积累未提交的修改
- 在保证commit完整性的同时，尽可能多的提交
- 每个commit，都要保证能够编译通过，并且通过所有的测试

## 临时文件管理
- 所有临时文件/目录统一使用 `src/common/tempPaths.ts` 中的 `getTempRoot()` 获取临时根目录
- **禁止**直接使用 `os.tmpdir()`，违反此规则会导致临时文件散落在系统临时目录中，难以管理和清理
- 开发环境下 `getTempRoot()` 返回项目根目录下的 `tmp/`，生产环境回退到 `os.tmpdir()`
- `tmp/` 已加入 `.gitignore`，不会被 git 追踪

## Shell / gh / git 操作避坑

- **Bash on Windows 路径始终用正斜杠**：反斜杠被 bash 视为转义符，用 `/d/csm-vsc-extension`。
- **Git Bash 删除目录用 `rm -rf`**：`rmdir /s /q` 是 cmd 语法，bash 中会失败。
- **`gh api` 传整数用 `--input -` + JSON**：`-f` 将值当字符串发送，API 需整数时报 422。用 `echo '{"key":123}' | gh api ... --input -`。
- **`gh pr create` 正文含特殊字符用 `--body-file`**：反引号等 shell 字符会解析失败，先写入文件再引用。
- **`git add` 指定文件不用 `-A`**：`-A` 会误暂存 `nul`、`.codegraph/` 等未追踪文件。
- **`fs.mkdtemp` 前确保父目录存在**：`mkdtemp` 不自动创建父目录，用 `fs.mkdirSync(dir, { recursive: true })` 兜底。
- **Windows git vs Node.js 盘符大小写**：git 返回大写 `D:/...`，Node.js 用小写 `d:\...`，路径比较时先统一 `replace(/\\/g, '/').toLowerCase()`。
