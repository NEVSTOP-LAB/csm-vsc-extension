# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 安装要求

- Visual Studio Code 1.63.0 或更高版本

## 功能概览

| 功能                        | 说明                                             |
| --------------------------- | ------------------------------------------------ |
| `.csmlog` 日志支持          | 语法高亮、悬停提示、大纲视图、重复折叠和编码识别 |
| `.lvcsm` 配置文件支持       | 语法高亮、大纲视图和编码识别                     |
| `CSM Modules` 模块管理      | 浏览、搜索、创建、引入、更新和移除 CSM 模块      |
| 文件装饰 (File Decorations) | 为 `.csmlog` 和 `.lvcsm` 文件添加 Badge 标记     |
| 本地化                      | 中文和英文界面                                   |

## 快速入口

- 打开任意 `.csmlog` 或 `.lvcsm` 文件即可自动激活文件支持
- 重复日志行会自动折叠，可调整阈值和样式
- 在侧边栏 **CSM Modules** 中浏览和管理模块
- 引入模块时可选择根目录或嵌套命名空间
- 更新模块时可选择最新或指定版本
- 引导发布模块流程

- 文件自动显示 C 或 L Badge 标记

## 扩展设置

| 设置项                                         | 默认值                                                                  | 说明                       |
| ---------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| `csmModules.defaultModuleRoot`                 | `csm`                                                                   | 默认模块目录名             |
| `csmModules.moduleScanMaxDepth`                | `3`                                                                     | 本地模块扫描深度           |
| `csmModules.moduleScanIncludeReadmeWeakSignal` | `true`                                                                  | 将 README 作为模块识别线索 |
| `csmModules.moduleScanExcludedDirectories`     | `.git`, `node_modules`, `dist`, `build`, `out`, `tmp`, `docs`, `images` | 扫描时跳过的目录           |
| `csmModules.hiddenTopics`                      | `csm-modsets`, `lv-csm-app`, `labview-csm`, `labview`                   | 默认隐藏的主题             |
| `csmlog.folding.minRepeatCount`                | `3`                                                                     | 触发折叠的最少重复次数     |
| `csmlog.folding.maxBlockLines`                 | `20`                                                                    | 多行块的最大匹配行数       |
| `csmlog.folding.smartParams`                   | `true`                                                                  | 忽略参数差异以匹配相似日志 |
| `csmlog.folding.decorationStyle`               | `compact`                                                               | 折叠标签样式               |

## 更多文档

- 使用说明：[`docs/user-guide.md`](docs/user-guide.md)
- 模块管理详解：[`docs/module-management.md`](docs/module-management.md)
- 开发者快速上手：[`docs/quickstart.md`](docs/quickstart.md)
- 参与贡献：[`CONTRIBUTING.md`](CONTRIBUTING.md)
