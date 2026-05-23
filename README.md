# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 项目简介

当前版本主要提供三类能力：

- `.csmlog` 日志查看与辅助阅读
- `.lvcsm` 配置文件编辑支持
- `CSM Modules` 侧边栏模块管理

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 功能特性

- ✅ 本地化：支持根据 VS Code 显示语言在中文 / English 间切换

### `.csmlog` 文件支持

- ✅ 日志事件、时间戳、模块名和关键参数高亮
- ✅ Hover 悬停提示，便于快速查看常见字段含义
- ✅ Outline 大纲，便于定位关键配置和系统消息
- ✅ 默认开启 `files.autoGuessEncoding`，降低常见中文日志乱码风险

### `.lvcsm` 文件支持

- ✅ 配置文件语法高亮
- ✅ Outline 大纲，便于快速浏览配置节
- ✅ 默认开启 `files.autoGuessEncoding`，降低常见中文配置文件乱码风险

### CSM 模块管理

侧边栏 `CSM Modules` 视图，用于浏览、搜索和管理 CSM 模块仓库：

- ✅ 浏览可用的 CSM 模块仓库
- ✅ 支持 GitHub 登录后查看更多可访问模块
- ✅ 支持搜索、筛选、排序和批量选择
- ✅ 支持 README 预览与图片显示
- ✅ 支持仓库 `Star` / `Unstar`
- ✅ 支持将模块引入当前工作区，Git 仓库可选 `submodule` 或 `copy`，非 Git 工作区自动限制为 `copy`，且后续可直接移除或更新 `copy` 模式模块
- ✅ 支持按当前多选状态批量应用未安装模块，并批量移除已安装模块
- ✅ 支持更新模块；`copy` 模式会先比较远端最新提交，确认后备份当前目录为 zip 再整体替换

> 详细功能说明参见 [docs/module-management.md](docs/module-management.md)

### 扩展设置

- `csmModules.defaultModuleRoot`：用于首次引入模块时的默认目录名

## 文件图标主题

扩展内置文件图标主题 **CSM File Icons**，为 `.csmlog` 与 `.lvcsm` 提供专用图标。可在 VS Code 中通过 `首选项 → 文件图标主题`（或命令面板执行 `Preferences: File Icon Theme`）选择 **CSM File Icons** 启用。

## 开发贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 问题反馈

如遇到问题请到 [GitHub Issues](https://github.com/nevstop/csm-vsc-extension/issues) 反馈。

## 许可证

本项目遵循 GNU Affero General Public License v3 (AGPL-3.0) 许可证。详见 [LICENSE](LICENSE) 文件。
