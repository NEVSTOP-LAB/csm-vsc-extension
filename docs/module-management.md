# CSM 模块管理功能详解

## 功能概述

侧边栏 `CSM Modules` 容器现在只保留一个原生视图。当前工作区中的已管理模块、未管理文件夹与 GitHub 模块目录会在同一个 Webview 卡片列表中统一显示；本地项目条目固定排在前面，远端目录条目跟在后面。模块可通过 `submodule` 或 `copy` 方式引入本地仓库，并通过本地 YAML 配置文件记录已应用模块。

## 功能特性

### 模块发现与认证

- 视图默认展示 GitHub 全站满足 `topic:csm-modsets` 的 public 模块仓库；若已登录 GitHub，则会额外纳入当前账号可访问的 private 模块仓库
- 侧边栏启动时优先复用本地缓存，不会在后台自动拉取模块；登录成功后会自动触发一次网络刷新，此外也可随时手动点击 `Refresh` 重新同步 GitHub 目录
- 若本地缓存记录的刷新账号与上次已知 GitHub 账号一致，则启动时会直接显示该账号对应的 private 缓存，无需先在线确认
- 视图标题栏会根据认证状态显示 GitHub 登录或退出登录入口，并保留刷新 / 初始化入口
- 已登录 GitHub 时，原生视图标题会从 `Available Modules` 动态切换为 `Signed in as ...`
- 标题栏会显示上次刷新时间，便于判断缓存距离最近一次同步已经过去多久

### 卡片列表与搜索

- 模块视图为类扩展市场的 Webview 卡片列表，显示仓库名、发布者、摘要、默认分支、可见性与用户可见 topic 标签；内部发现用 topic（如 `csm-modsets`、`labview-csm`）会自动隐藏
- 侧边栏顶部搜索框采用类扩展市场的搜索栏样式，末尾集成 `Filter` 菜单，可按仓库名、owner、显示中的 topic、分支与摘要快速过滤模块
- `Filter` 菜单新增 `Scope` 分组，可在 `All / Workspace / Catalog` 三种范围间切换；顶部工具条也提供同步的快捷切换入口，便于在统一列表中快速切回“只看本地”或“只看目录”
- `Filter` 菜单内可按类型切换名称 / owner / 更新时间 / 已应用状态排序，并切换升序 / 降序，排序偏好会跨会话保留
- 顶部摘要会根据当前范围切换显示工作区项、目录项或二者混合计数；已登录 GitHub 且范围为 `Catalog` 时，会继续显示 `public / private` 拆分
- 卡片顶行将名称 / provider 与右上角紧凑操作组对齐；`README` 按钮保留在右上角，checkbox 仅在卡片 hover 或已选中时显示
- 点击模块卡片正文可在侧边栏内直接展开 README 预览；public 模块的 README 在未登录时也可匿名加载，右上角 `README` 按钮仍可打开完整 README 面板，预览同时支持 Markdown 图片语法和常见的原生 `<img>` 标签

### 模块操作

- 支持勾选多选模块；存在勾选模块时，可从视图标题栏执行 `Apply Selected` 批量应用
- 模块卡片支持 VS Code 原生右键菜单，可直接执行 `Apply` / `Update` / `Remove` / `Open README` / 选择操作，并按模块当前状态自动启用、禁用或切换对应项
- 首次应用时可初始化本地模块目录，默认生成 `csm/csm-modules.yaml`，也可指定仓库内自定义相对路径
- 支持 `submodule` / `copy` 两种引入方式
- 对已管理的本地模块，若当前工作区本身是 Git 仓库，可在侧边栏中把 `copy` 与 `submodule` 方式互相切换；非 Git 工作区会禁用该操作
- 刷新 / 应用 / 更新 / 删除模块时会把 GitHub HTTP 状态、Git 权限失败、Git 缺失、网络错误与 YAML 解析错误转换为更可操作的提示

### 工作区状态

- 统一视图会继续显示当前工作区、模块根目录与已应用计数；已写入当前仓库配置的模块会显示 `Applied` 状态徽标，并通过内联 `Workspace` / `Catalog` 分组标题帮助快速识别当前卡片来源
- 当范围切换为 `Workspace` 时，列表只显示当前模块根目录中的已管理模块与未管理文件夹；当范围切换为 `Catalog` 时，列表只显示 GitHub 模块目录；`All` 则同时显示两类内容
- 对未管理文件夹，已登录 GitHub 时可通过向导一键创建远端 GitHub 仓库，并立即执行本地 `git init`、首次提交与 `origin` 推送；若当前机器尚未配置 `user.name` / `user.email`，向导会在发布前补充询问。若当前工作区本身是 Git 仓库，发布完成后会继续把该目录切换为 `submodule` 并写回本地配置；非 Git 工作区则继续记录为 `copy`
- 若仓库检测到 `csm/` 目录与 `*.lvproj`，但尚未存在本地模块配置，打开侧边栏时会主动提醒初始化，并在标题栏显示 `Initialize Workspace Management` 工具按钮
- 若仓库内已存在 `csm/` 目录且包含已初始化的 submodule，但尚未存在配置文件，扩展会自动反向生成 `csm/csm-modules.yaml`

## 本地模块配置

- **默认初始化目录**：`csm/`（可通过 `csmModules.defaultModuleRoot` 修改新仓库首次初始化时的默认值）
- **默认配置文件**：`csm/csm-modules.yaml`
- **主动初始化提醒**：当仓库存在默认模块根目录（默认 `csm/`）和 `*.lvproj`、但尚未创建配置文件时，打开 `CSM Modules` 侧边栏会弹出初始化提示；若稍后处理，标题栏会保留初始化按钮入口
- **兼容旧配置**：若仓库中仍保留 `csm-modules.lvcsm`，扩展会读取旧文件并在后续写回时迁移到 YAML
- **配置格式**：当前以 YAML 为规范格式，配置文件始终写回 `csm-modules.yaml`
- **自定义目录**：通过 `Apply to Current Repository` 流程输入仓库根目录下的相对路径，或通过 `csmModules.defaultModuleRoot` 为首次初始化预设默认目录
- **配置内容**：记录每个模块的引入方式（`submodule` / `copy`）、锁定提交、默认分支、源仓库地址和本地相对路径

## 扩展设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| `csmModules.defaultModuleRoot` | `csm` | 用于新仓库首次初始化 / 首次应用模块时预填模块根目录 |

## 缓存策略

- 侧边栏启动时直接复用本地模块列表与 README 缓存，不会在后台自动刷新
- 手动点击 `Refresh` 后，扩展才会重新同步 GitHub 模块目录，并用最新结果覆盖缓存
- 若缓存记录的刷新账号与本地记忆的 GitHub 账号一致，则 private 模块缓存会在启动时直接展示；若账号不一致或缺少账号归属信息，则启动时只显示 public 缓存
- 标题栏会显示上次刷新时间，帮助判断缓存是否需要手动更新
