# CSMScript VSCode 支持

> 为 **CSMScript** 语言提供 Visual Studio Code 编辑器支持的插件。

## 项目简介

**CSMScript**（Communicating State Machine Script）是一种面向状态机的领域特定脚本语言。本插件旨在让开发者在 VSCode 中获得完整的 CSMScript 编辑体验，包括语法高亮、代码片段、智能提示和语法检查等功能。

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 功能特性

### .csmscript 文件支持

本扩展为 `.csmscript` 文件提供以下语言支持功能：

- ✅ **语言定义**（文件扩展名 `.csmscript`）
- ✅ **语法高亮**（TextMate 语法规则，完整覆盖 CSMScript 所有语法）
- ✅ **代码片段**（Snippets）（覆盖控制流、通信操作符等常用代码模式）
- ✅ **代码补全**（IntelliSense）（触发字符：`<` `[` `>` `$` `?`）
- ✅ **悬停提示**（Hover）（关键字的 Markdown 文档说明）
- ✅ **语法检查**（Diagnostics）（诊断规则 CSMSCRIPT001–008）
- ✅ **代码格式化**（`Shift+Alt+F`，自动缩进控制流块、锚点对齐、清除尾部空白）
- ✅ **大纲视图**（Outline）（在资源管理器的大纲面板中显示当前 `.csmscript` 文件的预定义段头和锚点，支持快速跳转）
- ✅ **流程可视化预览**（使用 Mermaid 图表显示脚本执行流程，支持缩放/平移/导出；控制流结构以子图高亮展示；长判断条件自动换行；Yes/No 分支线分别使用绿色/红色；光标联动定位；支持流程图与通讯泳道图切换）
- ✅ **自动编码探测**（打开 `.csmscript` / `.csmlog` / `.lvcsm` 时启用 VS Code `files.autoGuessEncoding`，自动识别 GBK/GB2312 等非 UTF-8 编码，避免乱码）

### .csmlog 文件支持

本扩展为 `.csmlog` 文件提供语法高亮支持：

- ✅ **事件类型着色**（基于优先级的颜色方案：Error、File Logger、User Log、Module Created/Destroyed、Register/Unregister、Interrupt、Sync/Async/No-Rep Async Message、Status、State Change）
- ✅ **时间戳高亮**（日志处理时间 + 源时间；相对时间戳在部分行中为可选字段）
- ✅ **过滤标记优先匹配**（对 `YYYY/MM/DD HH:MM:SS.mmm <Filter>[State Change]Module | ...` 这类行先识别 `<Filter>` 特殊段，再应用专用 State Change 高亮逻辑）
- ✅ **File Logger 支持**（格式：`YYYY/MM/DD HH:MM:SS.mmm  信息内容`，优先级仅次于 Error）
- ✅ **来源标记高亮**（`<-` 运算符及后续来源模块/消息名均以浅蓝色非斜体显示，其中 `<-` 加粗，用颜色区分主消息体）
- ✅ **模块名加粗着色**（青绿色，加粗）
- ✅ **事件头部模块名同色下划线**（`[Error]`、`[User Log]`、`[Sync/Async Message]` 等日志行中 `|` 前模块名与对应事件类型同色并加下划线）
- ✅ **参数键名强调**（日志参数中的 `key:` 前缀，例如 `index:`、`timestamp:`，显示为粗体 + 斜体 + 下划线）
- ✅ **CSMScript 模式高亮**（对日志内容中的部分 API 名称、操作符和符号应用扩展自定义的 TextMate 语法着色规则，但不提供完整 CSMScript 语法规则）
- ✅ **默认字号较小**（12px，便于显示更多日志行；可在 VS Code 设置中通过 `editor.fontSize` 覆盖）
- ✅ **悬停提示（Hover）**：悬浮在事件类型、时间戳、配置键上时显示含义说明；日志内容中的部分 CSMScript 操作符也有对应提示

> `.csmlog` 是 CSM 系统自动生成的日志文件，仅提供语法高亮和悬停提示功能，不提供代码补全等编辑功能。

### .lvcsm 文件支持

本扩展将 `.lvcsm` 文件注册为独立的 `lvcsm` 语言，语法通过 `syntaxes/lvcsm.tmLanguage.json` 引用 `source.ini` 复用 INI 高亮，并默认开启 `files.autoGuessEncoding` 以减少 GBK/GB2312 中文文件的乱码风险。

> `.lvcsm` 是 CSM 系统使用的配置文件格式（INI 格式），安装本扩展后可获得与 `.ini` 文件相同的编辑体验，并自动探测文件编码。

## 使用方法

打开或新建后缀为 `.csmscript` 的文件，扩展将自动激活并提供以下功能：

### 语法高亮

扩展自动为 CSMScript 的控制流标签、状态锚点、变量引用、通信操作符等语法元素着色，便于阅读和编写脚本。

### 代码补全

在文件中输入触发字符（`<`、`[`、`>`、`$`、`?`）时，扩展会弹出补全列表，覆盖控制流、内置命令、变量引用等常用补全项。

### 悬停提示

将鼠标悬停在关键字上，可查看该关键字的 Markdown 格式文档说明，包含参数、用途和示例。

### 语法检查

保存文件时，扩展会自动检查语法错误，并在问题面板中显示诊断信息（CSMSCRIPT001–008）。

### 流程可视化预览

在编辑器标题栏单击 **"Show CSMScript Flow"** 按钮（或在命令面板执行 `CSMScript: Show Flow Visualization`），可在侧边面板实时预览 `.csmscript` 文件的可视化图表。面板支持两种视图，可随时切换：

| 视图 | 按钮 | 内容 |
|------|------|------|
| **流程图**（Flowchart） | ⇄ Swimlane | Mermaid 有向流程图，展示控制流（if/while/foreach/do_while）、GOTO 跳转和锚点 |
| **通讯泳道图**（Swimlane） | ⇄ Flowchart | Mermaid 序列图，以 Engine 为调度中心，展示脚本与各模块之间的同步/异步/fire-forget 通讯、订阅/取消订阅和广播消息 |

**泳道图消息类型对照：**

| CSMScript 语法 | 含义 |
|---------------|------|
| `API: Cmd -@ Module => r` | 同步调用（含返回值） |
| `API: Cmd -> Module => r` | 异步调用（含返回值） |
| `API: Cmd ->\| Module` | 无应答异步（fire-and-forget） |
| `Event@Module >> Handler -><register[...]>` | 订阅事件 |
| `Event@Module >> Handler -><unregister>` | 取消订阅 |

**流程图功能：**

- **自动解析**：锚点、GOTO/JUMP 跳转、条件跳转（`?expr? goto`）、`<if>`/`<while>`/`<foreach>`/`<do_while>` 等控制流结构均会被识别并可视化
- **跳转节点独立显示**：`GOTO/JUMP` 语句始终渲染为独立 `goto` 节点，并以虚线连接目标锚点，不与普通语句块合并
- **条件跳转链路可视化**：`?expr? goto` / `?? goto` 会拆分为“前置语句节点（若有）→ 判断节点 → `goto` 节点 → 虚线到目标锚点”，同时保留 No 分支顺序流
- **行内条件链分组**：`前置语句 ?? goto >> <anchor>`、`前置语句 ?expr? goto >> <anchor>` 以及 `前置语句 ?expr? 普通语句` 这类链路都会被放入独立子图并横向（LR）排列，便于在图中一眼看出局部条件链关系
- **条件执行链样式**：行内条件链中“条件成立后执行”的边使用绿色虚线；条件后的执行节点使用单独底色，和普通块节点区分
- **深色主题高反差线条**：流程图默认线条、箭头和子图边框会根据编辑器背景自动选用高反差颜色，避免在深灰主题下看不清
- **标签自适应可读性**：节点文字颜色会根据节点填充色与主题背景自动调整；判断节点额外增强标签背景，深色主题下也保持清晰
- **Yes/No 分支着色**：判断节点的 Yes 出边固定为绿色、No 出边固定为红色；为避免遮挡与显示异常，分支线上不再渲染 Yes/No 文字标签
- **子脚本引用可视化**：`<include xxx.csmscript>` 渲染为带有路径文本的专用节点
- **控制流子图**：if/while/foreach/do_while 块以虚线边框子图包裹，直观展示结构层次
- **Yes/No 分支标签隐藏**：if 条件的两个出边不再显示 Yes/No 文本，仅用绿/红线区分
- **长条件自动换行**：判断节点中的长表达式会按运算符优先分行，避免菱形节点内文字被截断
- **判断节点紧凑化**：在保证可读的前提下，判断标签采用更紧凑字号、行高与内边距，并限制标签最大宽度，减少大菱形占用
- **浏览器式地址栏**：文件路径占据工具栏首行，旁边提供刷新与"打开源文件"按钮，其他控制按钮集中在次行
- **缩放与平移**：工具栏按钮或 Ctrl+鼠标滚轮缩放，左键拖拽平移
- **实时缩放比例显示**：工具栏顶部实时显示当前缩放百分比（如 `Zoom: 125%`）
- **光标联动**：编辑器光标移动时，预览图自动滚动并高亮对应节点；自动滚动优先将目标节点贴近视口顶部，并在首尾位置按边界贴齐显示
- **自动居中与平滑动画**：每次重绘后图表自动水平居中，光标驱动的自动滚动带平滑动画
- **查看 Mermaid 源码**：工具栏展开原始 Mermaid 代码，方便调试

### 代码格式化

按 `Shift+Alt+F` 或在命令面板执行"格式化文档"，扩展会自动对文档进行格式化：控制流块自动缩进、锚点定义对齐到第 0 列、INI 段头对齐到第 0 列、清除尾部空白。

### 大纲视图（Outline）

打开 `.csmscript` 文件后，VS Code 资源管理器侧边栏的 **大纲（Outline）** 面板将自动列出文件中所有的：

- **预定义段头**（`[COMMAND_ALIAS]`、`[AUTO_ERROR_HANDLE]`、`[INI_VAR_SPACE]`、`[TAGDB_VAR_SPACE]`）— 以 Array 图标（`[]`）显示
- **锚点定义**（`<entry>`、`<error_handler>`、`<cleanup>` 等自定义锚点）— 以 Function 图标显示

点击大纲中的条目可直接跳转到对应位置。控制流关键字（`<if>`、`<while>`、`<foreach>` 等）不会出现在大纲中。

## 已知问题

如遇到问题请到 [GitHub Issues](https://github.com/NEVSTOP-LAB/CSMScript-vsc-Support/issues) 反馈。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本项目遵循 GNU Affero General Public License v3 (AGPL-3.0) 许可证。详见 [LICENSE](LICENSE) 文件。
