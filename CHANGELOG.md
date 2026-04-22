# 更新日志

本文件记录 "CSMScript Language Support" 扩展的所有重要变更。

遵循 [Keep a Changelog](http://keepachangelog.com/) 规范来组织此文件。

## [未发布]

## [0.0.4] - 2026-03-29

### 变更
- **CI 依赖缓存复用**：`.github/workflows/ci.yml` 新增 `prepare-deps` Job，基于 `package-lock.json` 哈希缓存并复用 `node_modules`，后续 Ubuntu Job 改为直接恢复缓存，不再各自重复执行 `npm ci`
- **VSIX 验证阶段瘦身**：`validate-vsix` Job 不再安装测试依赖，也不再依赖 `semver` 包；仅安装 Node.js 后直接校验 VSIX 结构、版本号与 manifest 字段
- **移除 CSMScript 颜色主题**：移除 `themes/csmscript.color-theme.json` 和 `contributes.themes`，高亮颜色不再依赖自定义主题
  - `.csmscript` 和 `.csmlog` 文件的 token 着色统一通过 `configurationDefaults.editor.tokenColorCustomizations.textMateRules` 实现
  - 颜色在任意用户主题下保持一致，无需切换到特定主题
- **流程可视化 include 节点**：`<include xxx.csmscript>` 现以专用形状与配色呈现，并显示引用路径，避免与普通指令节点混淆
- **流程可视化工具栏布局**：工具栏拆分为"地址栏行"+"控制行"，地址栏提供刷新与打开源文件按钮；重绘后图表自动水平居中，光标联动滚动加入平滑动画
- **流程图判断节点换行**：长条件表达式在 Mermaid 生成阶段按运算符插入换行，Webview 对菱形节点启用多行布局，避免预览中字符被截断
- **GOTO/JUMP 节点可见性修复**：`GOTO >> <anchor>`/`JUMP >> <anchor>` 现统一生成独立 `goto` 节点，并以虚线连接目标锚点，不再被折叠为仅边关系
- **条件跳转节点链路修复**：`?expr? goto` / `?? goto` 改为显式“判断节点 → goto 节点 → 虚线锚点”，支持行内前置语句独立成普通节点，并保留 No 分支顺序流
- **行内条件跳转子图横排**：`前置语句 ?? goto >> <anchor>` / `前置语句 ?expr? goto >> <anchor>` 生成的“语句→判断→goto”节点会自动归入专用子图并按 `LR` 方向横向排列
- **行内条件执行子图横排**：`前置语句 ?expr? 普通语句` 也会生成专用 `LR` 子图，将“语句→判断→动作”作为局部条件链横向呈现
- **条件执行链视觉语义增强**：行内条件链中“成立后执行”的边改为绿色虚线，条件后的执行节点使用独立底色；子图后的继续流显式保持实线
- **深色主题线条对比度增强**：Webview 渲染后会为默认线条、箭头和子图边框应用与背景高反差的颜色，提升深灰主题下的可见性
- **节点标签对比度自适应**：Webview 渲染后按节点填充色自动选择高对比文字色，判断节点标签增加对比背景，修复深色主题下标签难辨识问题
- **判断分支颜色与标签对比度修复**：Yes 分支连线固定为绿色、No 分支连线固定为红色；Yes/No 标签改为高对比底色与文字色，修复标签文字与背景同色导致的不可读问题
- **Yes/No 标签显示稳定性修复**：移除会覆盖分支标签动态样式的 `edgeLabel` 强制主题规则，并为 SVG 标签文本显式设置填充色，修复“有标签框但看不到字”的问题
- **Yes/No 分支标签隐藏**：流程图不再渲染 Yes/No 边标签文本，仅保留绿色/红色分支线，避免标签遮挡与可读性问题
- **工具栏缩放百分比显示**：流程图工具栏新增实时缩放比例显示，缩放、Fit 与窗口尺寸变化后均同步更新
- **光标联动滚动边界优化**：自动定位节点时由“固定居中”改为“顶部优先 + 上下边界钳制”，首行与尾部节点不再被强制拉到中心
- **判断节点尺寸优化**：条件标签更早换行并采用紧凑样式（更小字号/行高/内边距 + 最大宽度约束），在可见前提下尽量减小判断节点尺寸
- **.csmlog Filter 标记优先高亮**：`syntaxes/csmlog.tmLanguage.json` 新增 `log-entry-filtered-state` 规则，先匹配 `<Filter>` 等特殊标记再应用 State Change 专用高亮，修复 `YYYY/MM/DD HH:MM:SS.mmm <Filter>[State Change]Module | ...` 行的着色问题
- **.csmlog 参数键名高亮增强**：参数串中的 `key:` 前缀（如 `index:`、`Argument:`、`timestamp:`）新增专用 scope，并使用粗斜体样式，兼容 `key:value;key2:value2;...` 以及带 `{}` 包裹两种格式
- **.csmlog 事件头部模块名样式调整**：`[Error]`、`[User Log]`、`[Module Created/Destroyed]`、`[Register/Unregister]`、`[Interrupt]`、`[Sync/Async/No-Rep Async Message]`、`[Status]`、`[State Change]` 及 Other 行中 `|` 前模块名均支持按对应事件类型同色显示并保留下划线
- **.csmlog State Change 模块名配色修正**：`[State Change]` 行模块名 scope 调整为 `meta.log.event-type.state.module.csmlog`，避免被主题通用 `entity` 规则染色，确保与 State Change 事件颜色一致并保留下划线

### 新增
- **.csmlog 大纲视图（Outline）**（`src/csmlogDocumentSymbolProvider.ts`）：为 `.csmlog` 文件实现 `DocumentSymbolProvider`，在 VS Code 资源管理器的大纲面板中显示文档结构，支持快速跳转。
  - **配置参数**（`- PeriodicLog.Enable | 1` 等）以 Property 图标显示
  - **模块生命周期**（`[Module Created]`、`[Module Destroyed]`）以 Event 图标显示，格式为 `Module Created: ModuleName`
  - **Logger 系统消息**（`<Logger Thread Exit>` 等）以 Key 图标显示
  - 普通日志行（State Change、Sync Message 等）不在大纲中显示
  - 每个大纲条目的范围延伸至下一个符号前一行，支持大纲折叠
- **大纲视图（Outline）**（`src/documentSymbolProvider.ts`）：为 `.csmscript` 文件实现 `DocumentSymbolProvider`，在 VS Code 资源管理器的大纲面板中显示文档结构，支持快速跳转。
  - **预定义段头**（`[COMMAND_ALIAS]`、`[AUTO_ERROR_HANDLE]`、`[INI_VAR_SPACE]`、`[TAGDB_VAR_SPACE]`）以 Array 图标（`[]`）显示
  - **锚点定义**（`<entry>`、`<error_handler>`、`<cleanup>` 等）以 Function 图标显示
  - 控制流关键字（`<if>`、`<while>`、`<foreach>` 等）不在大纲中显示
  - 每个大纲条目的范围延伸至下一个符号前一行，支持大纲折叠
- **流程可视化预览**（`src/flowParser.ts`、`src/mermaidGenerator.ts`、`src/flowVisualizationPanel.ts`）：通过新增命令 `csmscript.showFlowVisualization`（编辑器标题栏按钮），可在侧边 WebView 面板中实时预览当前 `.csmscript` 文件的控制流图。
  - 自动解析锚点、GOTO/JUMP、条件跳转（`?expr? goto`）及控制流标签（`<if>`、`<while>`、`<foreach>` 等）
  - 使用 Mermaid 绘制有向流程图，支持缩放与 SVG 导出
  - 切换编辑器或编辑文档时自动更新预览
  - 支持含连字符的锚点名称（如 `<error-handler>`）
  - 可展开查看原始 Mermaid 代码用于调试
  - **控制流起始节点区分颜色**：`<if>`、`<while>`、`<foreach>`、`<do_while>` 各使用独立配色，与普通块节点视觉区分，便于快速识别控制流结构
  - **判断节点标签自动换行**：菱形条件节点（`<if>`、`<while>`、`<foreach>` 的条件表达式）支持长文本自动换行，普通节点行为不变
  - **工具栏文件名显示**：工具栏显示当前预览文件的相对路径，点击即可在编辑器中打开对应文件
- **通讯泳道图**（`src/swimlaneParser.ts`、`src/swimlaneGenerator.ts`）：在流程可视化面板新增 **⇄ Swimlane** 切换按钮，将脚本的模块间通讯转换为 Mermaid `sequenceDiagram`（序列图），以 Engine 为调度中心，清晰呈现脚本与各模块之间的通讯关系。
  - **Engine** 始终位于泳道最左侧，作为脚本执行引擎
  - 支持全部通讯操作符：`-@`（同步）、`->`（异步）、`->|`（fire-and-forget）
  - 支持订阅/取消订阅：`-><register>`、`-><register as interrupt>`、`-><register as status>`、`-><unregister>`
  - **颜色编码**区分不同通讯类型（`rect` 背景色）：蓝色=同步、绿色=异步、橙色=fire-and-forget、紫色=订阅/取消订阅
  - 自动分析并枚举脚本中涉及的所有模块（按首次出现顺序排列）
  - 点击工具栏的 **⇄ Swimlane** / **⇄ Flowchart** 按钮可在两种视图之间无缝切换
- **.csmlog 悬浮提示**（`src/csmlogHoverProvider.ts`）：为 `.csmlog` 文件添加 `CSMLogHoverProvider`，实现上下文敏感的悬浮说明
  - 事件类型字段（`[Error]`、`[State Change]`、`[Sync Message]` 等 12 种）悬浮时显示优先级、含义及格式示例
  - 完整时间戳（日志处理时间）和相对时间戳（事件源时间）字段的悬浮说明
  - 配置行键名（`PeriodicLog.Enable`、`PeriodicLog.Threshold(#/s)`、`PeriodicLog.CheckPeriod(s)`）悬浮说明
  - 日志来源标记 `<-` 的悬浮说明
  - 日志内容区（`|` 之后）自动委托 `CSMScriptHoverProvider`，复用所有 CSMScript 操作符、命令、变量引用悬浮
- **.lvcsm 文件支持**：将 `.lvcsm` 文件注册为独立的 `lvcsm` 语言，语法通过包含（include）`source.ini` 实现 INI 格式高亮，支持键值对识别等
- **自动编码探测**：为 `.csmscript`、`.csmlog`、`.lvcsm` 三种文件类型自动开启 `files.autoGuessEncoding`，支持 GBK/GB2312 等非 UTF-8 中文编码的自动识别
- **代码格式化**（`src/formattingProvider.ts`）：实现 `DocumentFormattingEditProvider`，支持 `Shift+Alt+F` 格式化整个文档：
  - 控制流块（`<if>`, `<while>`, `<do_while>`, `<foreach>`）内代码自动缩进
  - `<else>` 与对应 `<if>` 同级对齐
  - 锚点定义（`<anchorName>`）始终置于第 0 列
  - INI 配置节头（`[SECTION_NAME]`）始终置于第 0 列，并重置缩进计数
  - 每行尾部空白字符自动清除
  - 支持 Tab / Space 缩进及自定义缩进宽度（读取编辑器配置）
  - 保留原始换行风格（LF / CRLF）
- **.csmlog 文件支持**：为 CSM 系统自动生成的日志文件提供语法高亮
  - 独立语言定义（language id: `csmlog`）
  - 事件类型按优先级着色（Error > File Logger > User Log > Module Created/Destroyed > Register/Unregister > Interrupt > Sync/Async/No-Rep Async Message > Status > State Change）
  - State Change（最常见事件类型）使用默认前景色，不特殊着色
  - 双时间戳格式识别（日志处理时间 + 相对时间）
  - 模块名独立着色（加粗、青绿色）
  - File Logger 格式（`YYYY/MM/DD HH:MM:SS.mmm  消息内容`，双空格后接非 `[` 内容）独立高亮，深红色加粗
  - 来源信息（`<-` 及后续模块名）以灰色斜体淡化显示
  - `[Module Created/Destroyed]` 行支持省略相对时间戳和模块名/管道符
  - `[User Log]` 行相对时间戳可选
  - **主题无关颜色**：通过 `editor.tokenColorCustomizations.textMateRules` 写入 `configurationDefaults`，所有 csmscript 和 csmlog 专属 scope 的颜色优先于活跃主题，保持一致显示
  - 默认以 12px 字体打开 `.csmlog` 文件（可在 VS Code 设置中覆盖）
  - 复用 CSMScript 语法规则高亮日志内容中的代码

### 修复与改进（流程可视化，对应 [#84](https://github.com/nevstop/CSMScript-vsc-Support/pull/84)）

- **渲染时机修复**：构造函数中直接接收 `_sourceDocument`，解决初始渲染因文档未设置而失败的问题；预览面板焦点切换后不再报 "No CSMScript file is currently open"
- **Mermaid 渲染方式**：从 `startOnLoad: true` 改为编程式 `mermaid.render()` + `JSON.stringify()` 注入，彻底消除 HTML 实体（`&lt;`/`&gt;` 等）在渲染前被浏览器提前解码导致的语法错误
- **主题自适应背景**：移除图表容器的固定白色背景，SVG 背景改为半透明（`rgba(128,128,128,0.08)`），使流程图在浅色/深色 VS Code 主题下均可正常显示；所有节点 `classDef` 增加 `color:#000` 以保持节点文字可读性
- **深色主题边线适配**：通过 CSS 覆盖 `.flowchart-link`（stroke）、`.arrowheadPath`/`.arrowMarkerPath`（fill/stroke）以及 `.edgeLabel`（color/background），使用 VS Code 主题变量（`var(--vscode-foreground)`/`var(--vscode-editor-background)`），确保边线和边标签在浅色与深色主题下均清晰可见
- **节点标签样式**：标签改为左对齐、不换行，字体大小使用相对单位（`0.85em`，等宽字体），使图表布局更紧凑
- **空行分割语句块**：`.csmscript` 文档中的空行现在会将连续语句拆分为独立流程节点，与用户编写时的逻辑分组保持一致
- **控制流子图**：`if/else`、`while`、`foreach`、`do_while` 块使用 Mermaid `subgraph` 容器包裹（虚线边框），使控制流结构在视觉上更突出；支持通过递归 `FlowSubgraph` 数据模型嵌套控制流
- **循环/条件边界节点**：`while`/`foreach`/`do_while` 在子图内创建具名边界节点（`While`/`end_while`、`Foreach`/`end_foreach`、`Do_while`/`end_do_while`）；`if/else/end_if` 同样创建 `If`/`end_if` 边界节点，与循环保持一致。回边连接到起始边界节点，所有循环/条件相关边均在子图内闭合
- **子图方向锁定**：每个 subgraph 内插入 `direction TB`，确保起始边界节点位于顶部、结束边界节点位于底部
- **是/否分支线着色**：`if/else` 的条件出边使用绿色（Yes）和红色（No）区分，边上不再显示 Yes/No 文本
- **PREDEF 节点前置**：PREDEF 区域的 "Configuration" 节点现在放置在 Start 节点之前，反映配置先于脚本执行的实际流程
- **标签最小化转义**：将完整 HTML 实体转义（`&lt;`、`&gt;`、`&amp;` 等）替换为仅转义 `#`（→ `#35;`）和 `"`（→ `#quot;`），所有节点标签均以双引号 Mermaid 语法包裹，使特殊字符（`<`、`>`、`&&`、`()`、`[]`）按字面值渲染，原始 Mermaid 代码更易阅读
- **CSP 工具栏按钮修复**：所有工具栏按钮（缩放、重置、导出）改用 `addEventListener` 注册事件，替代被 Content Security Policy nonce 限制静默阻止的内联 `onclick`
- **鼠标滚轮缩放**：按住 Ctrl（Mac 为 Cmd）滚动可缩放图表（0.1x–5x），不按 Ctrl 时滚动为垂直平移；工具栏提示栏显示操作说明（"Ctrl+Scroll: Zoom | Drag: Pan | Scroll: Move"）
- **拖拽平移**：在图表区域左键按住拖动可平移视图，光标随状态切换为 grab/grabbing
- **Mermaid 代码区**：默认折叠，工具栏按钮可展开/收起；Mermaid 源码字体大小 11px；新增"复制"按钮，点击后将 Mermaid 源码复制至剪贴板并提供 "Copied!" 视觉反馈
- **跳过重复渲染**：新增 `_lastRenderedUri`/`_lastRenderedVersion` 追踪，对同一未更改文档的重复点击不触发不必要的重渲染
- **光标联动预览滚动**：新增 `onDidChangeTextEditorSelection` 监听，将编辑器光标行映射到最近流程节点，自动将预览图表平移到该节点处并短暂高亮（蓝色发光效果）
- **首次渲染自适应宽度**：`mermaid.render()` 完成后自动测量 SVG 宽度，计算合适缩放比（不超过 1x）使图表适应视口宽度（含 40px 边距）

### 计划中
- 状态机可视化预览

## [0.0.3] - 2026-03-20

### 新增（基于 CSMScript_User_Manual 完整重设计）

- **语法高亮**（`syntaxes/csmscript.tmLanguage.json`）大幅扩展，根据 CSMScript_User_Manual.md 补全全部语言特性：
  - **控制流**：`<if expr>`, `<else>`, `<end_if>`, `<while expr>`, `<end_while>`, `<do_while>`, `<end_do_while expr>`, `<foreach var in list>`, `<end_foreach>`
  - **引入文件**：`<include filepath.csmscript>`
  - **跳转锚点**：`<anchor_name>` 通用标签
  - **变量引用**：`${varname}` 和 `${varname:default}`
  - **返回值保存**：`=> varname`
  - **范围运算符**：`∈`（在范围内）、`!∈`（不在范围内）
  - **条件跳转**：`?? goto`（错误跳转）、`?expression? goto`（条件跳转）
  - **内置命令**：GOTO/JUMP、WAIT/SLEEP（含 `(ms)/(s)` 变体）、BREAK/CONTINUE、AUTO_ERROR_HANDLE_ENABLE/ANCHOR、ECHO/ECHO0–9、EXPRESSION、RANDOM 系列、对话框命令、INI_VAR_SPACE_*、TAGDB_* 命令全集
  - **预定义区**：INI 风格 `[SECTION_NAME]` 段头（CommandAlias/AUTO_ERROR_HANDLE/INI_VAR_SPACE/TAGDB_VAR_SPACE）和 `key = value` 键值对
- **语言配置**（`language-configuration.json`）：
  - 新增 `<` → `>` 自动补全（控制流标签 / 锚点）
  - 新增 `${` → `}` 自动补全（变量引用）
- **测试**：新增 `Grammar Pattern Tests`、`Variable Reference Tests`、`Return Value and Range Operator Tests`、`Conditional Jump Tests`、`Pre-definition Section Tests`、`Grammar Integration Smoke Tests` 六个测试套件，全面覆盖新增特性
- **设计文档**（`docs/design/m1-language-definition-design.md`）：完整更新语言特性描述（2.x 节）、顶层规则表（6.2）、Scope 命名表（6.3）、高亮示例（6.4）
- **代码片段**（`snippets/csmscript.code-snippets`）：覆盖控制流、通信操作符、变量引用等高频代码模式
- **代码补全**（`src/completionProvider.ts`）：IntelliSense 补全项，触发字符：`<`、`[`、`>`、`$`、`?`，支持 Tab 占位符（Snippet String）
- **悬停提示**（`src/hoverProvider.ts`）：关键字的 Markdown 文档说明，用户定义锚点另显示定义行号及行内注释
- **语法诊断**（`src/diagnosticProvider.ts`）：诊断规则（CSMSCRIPT001–008），覆盖未闭合标签、变量引用错误、EXPRESSION 使用限制等
- **CI/CD**（`.github/workflows/ci.yml`）：并行 Job（lint + 语法测试 + 集成测试），支持无头环境（xvfb）

## [0.0.2] - 2026-03-20

### 新增 (M1)
- **语言定义**：注册 `csmscript` 语言，关联文件扩展名 `.csmscript`
- **语言配置** (`language-configuration.json`)：
  - 行注释 `//`
- **语法高亮** (`syntaxes/csmscript.tmLanguage.json`)：
  - 行注释
  - 转移与调度运算符：`>>`、`->`、`-@`、`->|`
  - 广播目标标记：`<status>`、`<broadcast>`、`<interrupt>`、`<all>`
  - 订阅操作：`-><register>`、`-><unregister>`、`-><register as interrupt>`、`-><register as status>`
  - 模块地址符 `@`（如 `Status@SourceModule`）
  - 状态名前缀：`API:`、`Macro:`
  - 系统预置状态名（如 `Response`、`Async Response`、`Error Handler`、`Target Timeout Error` 等）
- **测试用例**：新增与语言定义和语法高亮配置相关的基础单元测试（grammar/config/package.json 验证）

## [0.0.1] - 2026-03-06

### 新增
- 项目初始化，使用 `yo code` 脚手架生成
- 基础项目结构搭建（TypeScript + ESBuild）
- 文档中文化（README、CHANGELOG、快速入门指南）
- 开发环境配置完成
- 项目文档备份机制
- **扩展占位符图标** (128x128 PNG/SVG)
  - 蓝色渐变背景，状态机图形元素
  - 包含替换指南文档

### 技术栈
- TypeScript 5.x
- ESBuild 打包
- ESLint 代码检查
- VS Code Extension API 1.60.0+
