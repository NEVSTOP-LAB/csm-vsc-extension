# CSM VS Code 扩展使用说明

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 支持内容

- `.csmlog`：日志查看与辅助阅读
- `.lvcsm`：配置文件编辑支持
- `CSM Modules`：模块浏览与管理
- `CSM File Icons`：专用文件图标主题

## 模块管理入口

- 打开侧边栏 `CSM Modules` 即可浏览当前工作区模块、未管理文件夹和 GitHub 模块目录
- 需要更完整的模块管理说明时，请参阅 [`module-management.md`](module-management.md)

## 扩展设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `csmModules.defaultModuleRoot` | `csm` | 首次引入模块时预填的默认目录名 |

## 文件图标主题

扩展内置 **CSM File Icons** 文件图标主题，为 `.csmlog` 与 `.lvcsm` 提供专用图标。

启用方式：

1. 打开 `首选项 → 文件图标主题`
2. 选择 **CSM File Icons**

## 其他文档

- 模块管理详解：[`module-management.md`](module-management.md)
- 开发者快速上手：[`quickstart.md`](quickstart.md)
- 图标资源说明：[`images-guide.md`](images-guide.md)
