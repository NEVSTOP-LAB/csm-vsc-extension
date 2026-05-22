# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 项目简介

当前版本扩展聚焦两类文件：

- `.csmlog`：CSM 日志文件（语法高亮 + 悬停提示 + 大纲）
- `.lvcsm`：CSM 配置文件（基于 INI 语法高亮 + 大纲）

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 功能特性

- ✅ 本地化：支持根据 VS Code 显示语言在中文 / English 间切换

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

### CSM 模块管理

侧边栏 `CSM Modules` 视图，用于浏览、搜索和管理 CSM 模块仓库：

- ✅ 浏览 GitHub 上满足 `topic:csm-modsets` 的公开模块及当前账号可访问的私有模块
- ✅ 卡片式列表，支持内联 README 预览
- ✅ 已登录 GitHub 时，卡片右上角会在 `README` 旁显示 `Star` 按钮，并展示当前仓库是否已 Star
- ✅ 支持直接在侧边栏内 `Star` / `Unstar` 仓库；取消 Star 前会要求二次确认
- ✅ 支持按名称、owner、topic、分支等关键字搜索过滤，以及多维度排序
- ✅ 支持 `submodule` / `copy` 两种方式将模块引入本地仓库
- ✅ 已登录 GitHub 时，通过模块工具引入社区仓库后会自动为该仓库补 Star
- ✅ 支持批量选择与批量应用
- ✅ 本地 YAML 配置文件（`csm/csm-modules.yaml`）记录已应用模块，支持自定义目录
- ✅ 模块列表与 README 会缓存到本地；侧边栏启动时优先显示缓存，仅在用户手动点击刷新时重新同步 GitHub，并在标题栏显示上次刷新时间

> 详细功能说明参见 [docs/module-management.md](docs/module-management.md)

### 扩展设置

- `csmModules.defaultModuleRoot`：默认值 `csm`，用于新仓库首次初始化时的默认模块根目录

## 文件图标主题

扩展内置文件图标主题 **CSM File Icons**，为 `.csmlog` 与 `.lvcsm` 提供专用图标。可在 VS Code 中通过 `首选项 → 文件图标主题`（或命令面板执行 `Preferences: File Icon Theme`）选择 **CSM File Icons** 启用。

## 开发贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 问题反馈

如遇到问题请到 [GitHub Issues](https://github.com/nevstop/csm-vsc-extension/issues) 反馈。

## 许可证

本项目遵循 GNU Affero General Public License v3 (AGPL-3.0) 许可证。详见 [LICENSE](LICENSE) 文件。
