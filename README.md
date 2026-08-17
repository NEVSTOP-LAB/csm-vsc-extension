# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 安装要求

- Visual Studio Code 1.63.0 或更高版本

## 功能概览

| 功能                        | 说明                                                                                                       |
|-----------------------------|------------------------------------------------------------------------------------------------------------|
| `.csmlog` 日志支持          | 语法高亮、Hover 悬停提示、Outline 大纲、**智能重复折叠**、自动编码识别                                         |
| `.lvcsm` 配置文件支持       | 语法高亮、Outline 大纲、自动编码识别                                                                         |
| `CSM Modules` 模块管理      | 侧边栏浏览、搜索、引入、更新、移除 CSM 模块，支持 GitHub 登录、批量操作，以及将模块放置到模块根目录或嵌套命名空间 |
| 文件装饰 (File Decorations) | 为 `.csmlog` (C) 与 `.lvcsm` (L) 添加 Badge 标记，可与任意图标主题共存                                      |
| 本地化                      | 中文 / 英文界面切换                                                                                        |

## 快速入口

- 打开任意 `.csmlog` 或 `.lvcsm` 文件即可自动激活扩展功能
- `.csmlog` 文件中的重复日志行会自动检测并折叠，可配置阈值与样式
- 打开侧边栏 **CSM Modules** 视图即可浏览和管理模块
- 本地与在线模块区域标题栏可点击折叠 / 展开，方便快速收起不关注的一侧
- 应用模块时可选择直接放到模块根目录，或放入已有/新的嵌套命名空间路径
- 更新模块时可选择更新到分支最新，或从提交记录 / 标签 / Release / 分支中选择指定版本（含回退到旧版本）
- 已确认管理的模块目录不会参与后续递归扫描，避免其内部内容被误识别为候选
- 扩展自动为 `.csmlog` / `.lvcsm` 文件添加 Badge 标记，无需手动设置
- 模块卡片上的版本徽章（tag / release / branch / commit）鼠标悬浮可查看提交信息（短 SHA · 提交信息 · 日期，来自本地缓存）
- 所有徽章（已管理 / 锁定 / 引入方式 / 私有 / 版本等）悬浮时均有含义解释；操作按钮使用 VS Code 标准图标，悬浮提示用途
- 插件启动或刷新时，若固定版本（commit / tag / release）子模块的实际 HEAD 与配置记录不一致，会询问是否恢复为配置版本（可能联网），确认后自动恢复

## 扩展设置

| 设置项                                         | 默认值                                                                  | 说明                                                                              |
|------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| `csmModules.defaultModuleRoot`                 | `csm`                                                                   | 首次引入模块时预填的默认目录名                                                    |
| `csmModules.moduleScanMaxDepth`                | `3`                                                                     | 递归发现本地模块候选目录时允许的最大深度                                          |
| `csmModules.moduleScanIncludeReadmeWeakSignal` | `true`                                                                  | 启用 README 弱信号后，包含 README 且至少有一个非文档文件的目录也可被识别为模块候选 |
| `csmModules.moduleScanExcludedDirectories`     | `.git`, `node_modules`, `dist`, `build`, `out`, `tmp`, `docs`, `images` | 递归发现本地模块候选时跳过的目录名（大小写不敏感）                                  |
| `csmModules.hiddenTopics`                      | `csm-modsets`, `lv-csm-app`, `labview-csm`, `labview`                   | 侧边栏中默认隐藏的 topic                                                          |
| `csmlog.folding.minRepeatCount`                | `3`                                                                     | 最少连续重复几次触发折叠                                                          |
| `csmlog.folding.maxBlockLines`                 | `20`                                                                    | 多行块匹配的最大行数                                                              |
| `csmlog.folding.smartParams`                   | `true`                                                                  | 启用参数归一化，消息模板相同仅参数不同的行也折叠                                   |
| `csmlog.folding.decorationStyle`               | `compact`                                                               | 折叠概要标签样式（compact: ×42 / detailed: 含时间）                                 |

## 更多文档

- 使用说明：[`docs/user-guide.md`](docs/user-guide.md)
- 模块管理详解：[`docs/module-management.md`](docs/module-management.md)
- 开发者快速上手：[`docs/quickstart.md`](docs/quickstart.md)
- 参与贡献：[`CONTRIBUTING.md`](CONTRIBUTING.md)
