# CSM VS Code 扩展使用说明

## 安装要求

- Visual Studio Code 1.63.0 或更高版本

## 支持内容

- `.csmlog`：日志查看与辅助阅读
- `.lvcsm`：配置文件编辑支持
- `CSM Modules`：模块浏览与管理
- 文件装饰 (File Decorations)：自动为 CSM 文件添加 Badge 标记

## 模块管理入口

- 打开侧边栏 `CSM Modules` 即可浏览当前工作区模块、未管理文件夹和 GitHub 模块目录
- 应用模块时可选择直接放入模块根目录，或放入已有/新的嵌套命名空间路径
- 已确认管理的模块目录不会参与后续递归扫描，避免其内部内容被误识别为候选
- 点击标题栏 `Refresh` 后，可选择刷新在线模块目录（从 GitHub 拉取并更新本地缓存）或重新搜索本地模块（重新扫描模块根目录）
- 以空格、连字符（`-`）、下划线（`_`）或点（`.`）开头的文件夹不会作为模块候选；目录内存在 `.vi`、`.vit`、`.lvlib` 等 LabVIEW 文件即视为模块，不会继续深入搜索
- 需要更完整的模块管理说明时，请参阅 [`module-management.md`](module-management.md)

## 扩展设置

| 设置项                                         | 默认值                                                                  | 说明                                                                              |
|------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| `csmModules.defaultModuleRoot`                 | `csm`                                                                   | 首次引入模块时预填的默认目录名                                                    |
| `csmModules.moduleScanMaxDepth`                | `3`                                                                     | 递归发现本地模块候选目录时允许的最大深度                                          |
| `csmModules.moduleScanIncludeReadmeWeakSignal` | `true`                                                                  | 启用 README 弱信号后，包含 README 且至少有一个非文档文件的目录也可被识别为模块候选 |
| `csmModules.moduleScanExcludedDirectories`     | `.git`, `node_modules`, `dist`, `build`, `out`, `tmp`, `docs`, `images` | 递归发现本地模块候选时跳过的目录名（大小写不敏感）                                  |

## 文件装饰与标记

扩展会自动为 `.csmlog` 与 `.lvcsm` 文件在资源管理器中添加 Badge 标记：

- `.csmlog` 文件 → 蓝色 **`C`** 标记，表示 CSM 日志文件
- `.lvcsm` 文件 → 绿色 **`L`** 标记，表示 LVCSM 脚本文件

该功能由扩展自动启用，可与用户安装的**任何**文件图标主题（如 Material Icon Theme、Seti 等）完美共存，无需手动切换。

## 其他文档

- 模块管理详解：[`module-management.md`](module-management.md)
- 开发者快速上手：[`quickstart.md`](quickstart.md)
