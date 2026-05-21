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

- ✅ 本地化：扩展中的用户可见字符串已支持根据 VS Code 显示语言在中文 / English 间切换，覆盖命令标题、活动栏/设置页文案、模块管理提示与 Hover 说明

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

- ✅ 阶段一：侧边栏 `CSM Modules` 视图展示可访问模块仓库（topic: `csm-modsets`）
- ✅ 阶段一：优先复用 VS Code 已登录 GitHub 会话（静默读取），必要时交互授权
- ✅ 阶段一：视图加载时自动尝试静默拉取模块（已登录用户无需先手动点击 refresh）
- ✅ 阶段一：模块视图改为类扩展市场的 Webview 卡片列表，显示仓库名、发布者、摘要、默认分支、可见性与 topic 标签
- ✅ 阶段一：视图标题栏保留 GitHub 登录 / 刷新 / 初始化入口；Webview 头部不再重复放置刷新按钮，`Apply Selected` 仅在存在勾选模块时显示
- ✅ 阶段一：卡片顶行将名称 / provider 与右上角紧凑操作组对齐；单卡 `Apply` 按钮已移除，`README` 按钮保留在右上角，checkbox 仅在卡片 hover 或已选中时显示
- ✅ 阶段一：侧边栏顶部改为置顶搜索框，下方再显示提示与工作区摘要，并内置类似扩展面板的搜索框，可按仓库名、owner、topic、分支与摘要快速过滤模块
- ✅ 阶段二：侧边栏顶部搜索框改为更接近扩展市场的搜索栏样式，末尾集成 `Filter` 菜单；菜单内可按类型切换名称 / owner / 更新时间 / 已应用状态排序，并切换升序 / 降序，排序偏好会跨会话保留
- ✅ 阶段一：侧边栏会显示当前工作区、模块根目录与已应用计数；已写入当前仓库配置的模块会显示 `Applied` 状态徽标
- ✅ 阶段四：点击模块卡片正文可在侧边栏内直接展开 README 预览；右上角 `README` 按钮仍可打开完整 README 面板
- ✅ 阶段二：侧边栏支持勾选多选模块，并在视图顶部提供 `Apply Selected` 批量入口
- ✅ 阶段二：模块卡片支持 VS Code 原生右键菜单，可直接执行 `Apply` / `Update` / `Remove` / `Open README` / 选择操作，并按模块当前状态自动启用、禁用或切换对应项
- ✅ 阶段二：首次应用时可初始化本地模块目录，默认生成 `csm/csm-modules.yaml`，也可指定仓库内自定义相对目录
- ✅ 阶段四：新增设置项 `csmModules.defaultModuleRoot`，可为首次初始化 / 首次应用预设默认模块根目录；一旦仓库内已存在 `csm-modules.yaml`，仍以配置文件中的 `root` 为准
- ✅ 阶段二：支持 `submodule` / `copy` 两种引入方式，并在本地 YAML 配置文件中记录模块名、来源仓库、锁定版本、默认分支和本地路径
- ✅ 阶段二：若仓库内已存在 `csm/` 目录且包含已初始化的 submodule，但尚未存在配置文件，扩展会自动反向生成 `csm/csm-modules.yaml`
- ✅ 阶段二：若仓库检测到 `csm/` 目录与 `*.lvproj`，但尚未存在本地模块配置，打开侧边栏时会主动提醒初始化，并在标题栏显示 `Initialize Workspace Management` 工具按钮
- ✅ 阶段四：刷新 / 应用 / 更新 / 删除模块时会把 GitHub HTTP 状态、Git 权限失败、Git 缺失、网络错误与 YAML 解析错误转换为更可操作的提示
- ✅ 缓存：模块列表与 README 缓存默认优先复用，并按 `csmModules.cache.ttlMinutes` 在后台自动失效刷新；升级扩展后无需手动刷新即可继续使用旧缓存

### 本地模块配置

- 默认初始化目录：`csm/`（可通过 `csmModules.defaultModuleRoot` 修改“新仓库首次初始化”时的默认值）
- 默认配置文件：`csm/csm-modules.yaml`
- 主动初始化提醒：当仓库存在默认模块根目录（默认 `csm/`）和 `*.lvproj`、但尚未创建配置文件时，打开 `CSM Modules` 侧边栏会弹出初始化提示；若稍后处理，标题栏会保留初始化按钮入口
- 兼容旧配置：若仓库中仍保留 `csm-modules.lvcsm`，扩展会读取旧文件并在后续写回时迁移到 YAML
- 配置格式：当前以 YAML 为规范格式，配置文件始终写回 `csm-modules.yaml`
- 自定义目录：通过 `Apply to Current Repository` 流程输入仓库根目录下的相对路径，或通过 `csmModules.defaultModuleRoot` 为首次初始化预设默认目录；配置文件会写入该目录
- 配置内容：记录每个模块的引入方式（`submodule` / `copy`）、锁定提交、默认分支、源仓库地址和本地相对路径

### 模块管理设置

- `csmModules.defaultModuleRoot`：默认值 `csm`。用于新仓库首次初始化 / 首次应用模块时预填模块根目录。
- `csmModules.cache.ttlMinutes`：默认值 `60`。控制模块列表与 README 缓存在后台自动失效刷新的时间窗口。

### 缓存策略

- 设置项：`csmModules.cache.ttlMinutes`
- 默认值：`60`
- 行为：缓存未过期时，侧边栏直接复用本地模块列表与 README 缓存；缓存过期后若存在 GitHub 会话，则在后台自动刷新，不会先清空当前列表
- 升级兼容：现有缓存会在升级后继续复用，只有在缓存结构不兼容或超过 TTL 时才会进入自动失效流程

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
