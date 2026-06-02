# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 功能概览

| 功能 | 说明 |
|---|---|
| `.csmlog` 日志支持 | 语法高亮、Hover 悬停提示、Outline 大纲、自动编码识别 |
| `.lvcsm` 配置文件支持 | 语法高亮、Outline 大纲、自动编码识别 |
| `CSM Modules` 模块管理 | 侧边栏浏览、搜索、引入、更新、移除 CSM 模块，支持 GitHub 登录与批量操作 |
| `CSM File Icons` 图标主题 | 为 `.csmlog` 与 `.lvcsm` 提供专用文件图标 |
| 本地化 | 中文 / 英文界面切换 |

## 快速入口

- 打开任意 `.csmlog` 或 `.lvcsm` 文件即可自动激活扩展功能
- 打开侧边栏 **CSM Modules** 视图即可浏览和管理模块
- 在 `首选项 → 文件图标主题` 中选择 **CSM File Icons** 启用专用图标

## 扩展设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `csmModules.defaultModuleRoot` | `csm` | 首次引入模块时预填的默认目录名 |
| `csmModules.hiddenTopics` | `csm-modsets`, `lv-csm-app`, `labview-csm`, `labview` | 侧边栏中默认隐藏的 topic |

## 更多文档

- 使用说明：[`docs/user-guide.md`](docs/user-guide.md)
- 模块管理详解：[`docs/module-management.md`](docs/module-management.md)
- 开发者快速上手：[`docs/quickstart.md`](docs/quickstart.md)
- 参与贡献：[`CONTRIBUTING.md`](CONTRIBUTING.md)
