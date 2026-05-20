# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 项目简介

当前版本扩展聚焦两类文件：

- `.csmlog`：CSM 日志文件（语法高亮 + 悬停提示 + 大纲）
- `.lvcsm`：CSM 配置文件（基于 INI 语法高亮 + 大纲）

## 安装要求

- Visual Studio Code 1.60.0 或更高版本
- 当前开发版本：0.0.25

## 功能特性

### `.csmlog` 文件支持

- ✅ 事件类型高亮（Error、User Log、Sync/Async Message、State Change 等）
- ✅ 时间戳与模块名高亮
- ✅ 参数 `key:` 前缀高亮（粗体 + 斜体 + 下划线）
- ✅ Hover 悬停提示（事件类型、时间戳、配置键、部分操作符）
- ✅ Outline 大纲（配置项、Module Created/Destroyed、Logger 系统消息）
- ✅ 默认开启 `files.autoGuessEncoding`，降低 GBK/GB2312 文件乱码风险

### `.lvcsm` 文件支持

- ✅ 注册独立语言 `lvcsm`
- ✅ 语法通过 `source.ini` 复用 INI 高亮规则
- ✅ Outline 大纲（INI 节 `[section]` 作为大纲条目）
- ✅ 默认开启 `files.autoGuessEncoding`，降低 GBK/GB2312 文件乱码风险

### CSM 模块管理（阶段一）

- ✅ 侧边栏 `CSM Modules` 视图展示可访问模块仓库（topic: `csm-modsets`）
- ✅ 优先复用 VS Code 已登录 GitHub 会话（静默读取），必要时交互授权
- ✅ 视图加载时自动尝试静默拉取模块（已登录用户无需先手动点击 refresh）
- ✅ 通过视图标题栏手动刷新模块列表与 README 缓存，避免列表内重复操作入口
- ✅ 模块列表采用三行卡片式展示，主条目高亮仓库名，并显示来源与可见性标签
- ✅ 点击模块条目可查看 README（若不可用则显示降级提示）

## 本地结束 Hook

- 命令：`npm run hook:finish`
- 执行动作：自动 patch 递增版本、同步 `README.md` / `CHANGELOG.md`、执行编译，并默认始终打包+安装+校验 VSIX，最后继续测试流程
- 可选跳过：`npm run hook:finish -- --skip-vsix`（仅在确实不需要本地加载时显式跳过 VSIX 打包与安装）
- 安装校验：`npm run vsix:verify-local`（检查本地扩展目录是否存在目标版本）
- 说明：脚本会优先解析本机 VS Code CLI 与 Node/NPM 可执行路径，规避 Windows 下空格路径与 shell 引号导致的安装失败；如仍无法定位 CLI，可通过环境变量 `VSCODE_CLI` 显式指定

## 文件图标主题

- 扩展内置文件图标主题 **CSM File Icons**，为 `.csmlog` 与 `.lvcsm` 提供专用图标。
- 可在 VS Code 中通过 `首选项 → 文件图标主题`（或命令面板执行 `Preferences: File Icon Theme`）选择 **CSM File Icons** 启用。

## 问题反馈

如遇到问题请到 [GitHub Issues](https://github.com/nevstop/csm-vsc-extension/issues) 反馈。

## 许可证

本项目遵循 GNU Affero General Public License v3 (AGPL-3.0) 许可证。详见 [LICENSE](LICENSE) 文件。
