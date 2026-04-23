# M2 设计文档：CSM 语法高亮配色方案

> **里程碑：** M2
> **关联文件：** `package.json`（`configurationDefaults.editor.tokenColorCustomizations.textMateRules`）· `syntaxes/csm.tmLanguage.json`
> **状态：** ✅ 已实现（颜色规则已从独立主题文件迁移至 `configurationDefaults`）
> **参考来源：** [CSM-Wiki `_plugins/csm_lexer.rb`](https://github.com/NEVSTOP-LAB/CSM-Wiki/blob/main/_plugins/csm_lexer.rb) · [CSM-Wiki CSS `.language-csm`](https://github.com/NEVSTOP-LAB/CSM-Wiki/blob/main/assets/css/just-the-docs-default.scss)

---

## 目录

1. [设计目标](#1-设计目标)
2. [基准参考：csm_lexer.rb 与 CSS](#2-基准参考csm_lexerrb-与-css)
3. [编辑器级别颜色设置](#3-编辑器级别颜色设置)
4. [Token 配色规则详表](#4-token-配色规则详表)
   - 4.1 [注释](#41-注释)
   - 4.2 [通信操作符](#42-通信操作符)
   - 4.3 [参数分隔符 `>>`](#43-参数分隔符-)
   - 4.4 [模块地址 `@ModuleName`](#44-模块地址-modulename)
   - 4.5 [目标模块名（发送操作符后）](#45-目标模块名发送操作符后)
   - 4.6 [变量引用 `${var}`](#46-变量引用-var)
   - 4.7 [控制流关键字](#47-控制流关键字)
   - 4.8 [锚点标签 `<label>`](#48-锚点标签-label)
   - 4.9 [内置函数/命令](#49-内置函数命令)
   - 4.10 [系统状态常量](#410-系统状态常量)
   - 4.11 [广播/中断目标常量](#411-广播中断目标常量)
   - 4.12 [其他操作符](#412-其他操作符)
   - 4.13 [状态名前缀 `API:` / `Macro:`](#413-状态名前缀-api--macro)
   - 4.14 [预定义节 `[SECTION]`](#414-预定义节-section)
   - 4.15 [标点符号类](#415-标点符号类)
5. [Grammar Scope 名称总表](#5-grammar-scope-名称总表)
6. [csm_lexer.rb → VS Code 映射关系](#6-csm_lexerrb--vs-code-映射关系)
7. [待讨论 / Review 注释点](#7-待讨论--review-注释点)

---

## 1. 设计目标

CSM-Wiki 已通过 `csm_lexer.rb`（Rouge Lexer）+ CSS 实现了 CSM 在网页文档中的语法高亮。VS Code 扩展的高亮方案应在视觉效果上与 Wiki 保持一致，让开发者在编辑器与文档之间切换时不产生色彩认知断层。

具体要求：
- 颜色与 Wiki CSS 中 `.language-csm` 的各 CSS 类保持一致（含颜色值、字体加粗/斜体/下划线）。
- 在 CSS 未覆盖的 token 类别（锚点、变量、预定义节等）上，采用与 GitHub Light 主题风格相近的补充配色。
- 颜色规则通过 `package.json` 的 `configurationDefaults.editor.tokenColorCustomizations.textMateRules` 定义，不依赖独立颜色主题文件，在任意用户主题下保持一致。

---

## 2. 基准参考：csm_lexer.rb 与 CSS

### 2.1 csm_lexer.rb 定义的 Token 类型

| Token 类型 | Rouge CSS 类 | 匹配内容 |
|-----------|------------|---------|
| `Comment::Single` | `.c1` | `//` 注释（到行尾） |
| `Operator` | `.o` | `>>` 参数分隔符 |
| `Keyword` | `.k` | 通信操作符 `-@` / `->` / `->`\| |
| `Name::Function` | `.nf` | 命令文本（state name，`>>` 之前） |
| `Name::Label` | `.nl` | 命令中嵌入的 `@Module`（如 `cmd@Module`） |
| `Name::Namespace` | `.nn` | 发送操作符之后的目标模块名 |
| `Literal::String::Doc` | `.sd` | 参数文本（`>>` 之后，发送操作符之前） |
| `Literal::String::Interpol` | `.si` | 参数中嵌入的 `@Module`（如 `arg@Module`） |
| `Text` | （默认） | 空白、换行 |

### 2.2 CSS 配色规则（来源：`just-the-docs-default.scss`）

```scss
$csm-comment-color:  #22863a;   // 绿色（C 风格注释颜色）
$csm-argument-color: #6a737d;   // 中灰（略浅于正文）
$csm-target-color:   #ca7601;   // 琥珀/暗黄

.language-csm .c1 { color: $csm-comment-color;  font-style: italic; }          // 注释
.language-csm .sd { color: $csm-argument-color; font-style: italic; text-decoration: underline; }  // 参数文本
.language-csm .k  { font-weight: bold; }                                        // 通信操作符
.language-csm .o  { font-weight: bold; }                                        // >> 操作符
.language-csm .nl { font-weight: bold; color: inherit; }                        // @Module in 命令
.language-csm .nn { color: $csm-target-color; }                                 // 目标模块名
.language-csm .si { color: $csm-argument-color; font-weight: bold; font-style: italic; text-decoration: underline; } // @Module in 参数
```

> **注**：`Name::Function`（`.nf`，命令文本）和 `Text`（普通文本）在 CSS 中无特殊样式，沿用主题默认前景色。

---

## 3. 编辑器级别颜色设置

> **注**：以下编辑器 `colors` 设置原属于已移除的 `themes/csm.color-theme.json`。当前方案不再提供自定义颜色主题，编辑器外观由用户所选主题决定。以下仅作为设计参考保留。

| 设置键 | 当前值 | 说明 |
|-------|-------|------|
| `editor.background` | `#ffffff` | 白色背景（与 Wiki 白底一致） |
| `editor.foreground` | `#24292e` | 默认文本色（GitHub 深灰） |
| `editorLineNumber.foreground` | `#1b1f234d` | 行号（半透明深灰） |
| `editorCursor.foreground` | `#044289` | 光标颜色（深蓝） |
| `editor.selectionBackground` | `#0366d625` | 选中背景（浅蓝，25% 透明） |
| `editor.inactiveSelectionBackground` | `#0366d610` | 非活跃选中背景 |
| `editor.lineHighlightBackground` | `#f1f8ff` | 当前行背景（极浅蓝） |
| `editorIndentGuide.background1` | `#eff2f6` | 缩进参考线颜色 |
| `editorWhitespace.foreground` | `#d1d5da` | 空白符可见颜色 |

---

## 4. Token 配色规则详表

### 4.1 注释

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `line-comment` |
| **Scope** | `comment.line.double-slash.csm` |
| **匹配内容** | `// 注释文字` （到行尾） |
| **颜色** | `#22863a` 🟢 绿色 |
| **字体** | *italic*（斜体） |
| **CSS 参考** | `.c1 { color: #22863a; font-style: italic; }` |
| **说明** | 直接映射 Wiki CSS `$csm-comment-color`，完全一致。 |

---

### 4.2 通信操作符

#### 4.2.1 发送操作符（`-@` / `->` / `->|`）

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `communication-operator`、`broadcast-target-with-op` |
| **Scope** | `keyword.operator.sync-call.csm` (`-@`) |
| | `keyword.operator.async-call.csm` (`->`) |
| | `keyword.operator.async-no-reply.csm` (`->|`) |
| **颜色** | `#d73a49` 🔴 红色 |
| **字体** | **bold**（加粗） |
| **CSS 参考** | `.k { font-weight: bold; }` （颜色 inherit 主题 keyword 色） |
| **说明** | CSS 只规定了 bold，颜色由主题决定。当前采用 GitHub Light 的 keyword 红色 `#d73a49`。 |

> **⚠ Review 注意**：CSS 中 `.k` 只有 `font-weight: bold`，颜色沿用主题默认的关键字色（不同主题颜色不同）。当前选择了 `#d73a49`（GitHub Light keyword 红），如需改颜色请在此处标注。

#### 4.2.2 订阅操作符（`-><register>` / `-><unregister>` / `-><register as …>`）

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `subscription-op` |
| **Scope（操作符部分）** | `keyword.operator.subscription.csm` |
| **Scope（类型关键字）** | `keyword.control.subscription-type.csm` |
| **Scope（register/unregister）** | `keyword.control.subscription.csm` |
| **操作符颜色** | `#d73a49` 🔴 红色 + **bold** |
| **类型关键字颜色** | `#d73a49` 🔴 红色 + **bold** |
| **CSS 参考** | `.k { font-weight: bold; }` |
| **说明** | 订阅操作属于 `Keyword` token，与发送操作符统一样式。 |

---

### 4.3 参数分隔符 `>>`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `argument-separator` |
| **Scope** | `keyword.operator.argument-separator.csm` |
| **颜色** | `#d73a49` 🔴 红色 |
| **字体** | **bold**（加粗） |
| **CSS 参考** | `.o { font-weight: bold; }` （颜色 inherit 主题 operator 色） |
| **说明** | CSS 只规定了 bold，颜色选用同操作符的红色 `#d73a49`。 |

#### 4.3.1 参数文本（`>>` 之后、发送/订阅操作符之前）

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `argument-text`（content between `>>` and `-@`/`->`/`->|`/`-><`/`=>`） |
| **Scope** | `string.unquoted.argument.csm` |
| **颜色** | `#6a737d` ⬜ 中灰 |
| **字体** | *italic* + <u>underline</u> |
| **CSS 参考** | `.sd { color: #6a737d; font-style: italic; text-decoration: underline; }` |
| **说明** | 对齐 Wiki `.sd` 样式，参数文本整体灰色斜体带下划线；内部的变量 `${var}` 和 `<anchor>` 仍按各自模式高亮。 |

---

### 4.4 模块地址 `@ModuleName`

*适用于命令文本或状态名中嵌入的 `@Module`，例如 `Status@SourceModule` 里的 `@SourceModule`。*

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `module-address`（capture 1: `@`，capture 2: module name） |
| **Scope（`@` 符号）** | `punctuation.separator.module.csm` |
| **Scope（模块名）** | `entity.name.label.module-address.csm` |
| **`@` 符号颜色** | `#6f42c1` 🟣 紫色 |
| **模块名颜色** | （无 `foreground` 设置，继承主题默认文本色） |
| **模块名字体** | **bold**（加粗） |
| **CSS 参考** | `.nl { font-weight: bold; color: inherit; }` |
| **说明** | 与 Wiki 完全一致：bold + inherit color。不设置 `foreground`，颜色由主题决定。`@` 符号本身额外加紫色以区分边界。 |

> **⚠ Review 注意**：当前 `@` 符号用了紫色，而模块名的颜色是继承的默认文本色。如果希望 `@` 也用 inherit，可将 `punctuation.separator.module.csm` 的颜色改为 `#24292e`。

---

### 4.5 目标模块名（发送操作符后）

*适用于 `-@ ModuleName`、`-> ModuleName`、`->| ModuleName` 中的 `ModuleName`。*

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `broadcast-target-with-op`（capture 2 of sync/async/no-reply patterns） |
| **Scope** | `entity.name.namespace.module.csm` |
| **颜色** | `#ca7601` 🟠 琥珀色 |
| **字体** | normal |
| **CSS 参考** | `.nn { color: #ca7601; }` |
| **说明** | 与 Wiki CSS `$csm-target-color` 完全一致。 |

---

### 4.6 变量引用 `${var}`

#### 4.6.1 简单变量 `${varname}`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `variable-reference`（simple） |
| **Scope（`${` 和 `}`）** | `punctuation.definition.variable.csm` |
| **Scope（变量名）** | `variable.other.csm` |
| **颜色** | `#e36209` 🟠 橙棕 |
| **字体** | *italic*（变量名斜体，标点 normal） |
| **CSS 参考** | （Wiki 将变量视为参数文本 `.sd`：灰色+斜体+下划线） |
| **说明** | Wiki 中变量会整体作为参数文本（`.sd`）显示为灰色斜体下划线。这里区分了变量名与普通参数文本，赋予橙棕色以提高可识别度。如需与 Wiki 对齐改为灰色 `#6a737d` 斜体下划线，请标注。 |

#### 4.6.2 带默认值变量 `${varname:default}`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `variable-reference`（with default） |
| **Scope（`${` 和 `}`）** | `punctuation.definition.variable.csm` |
| **Scope（变量名）** | `variable.other.csm` |
| **Scope（`:`）** | `punctuation.separator.default.csm` |
| **Scope（默认值文本）** | `string.unquoted.variable-default.csm` |
| **变量名颜色** | `#e36209` 🟠 橙棕，*italic* |
| **默认值颜色** | `#6a737d` ⬜ 中灰 |
| **默认值字体** | *italic* + <u>underline</u> |
| **CSS 参考** | `.sd { color: #6a737d; font-style: italic; text-decoration: underline; }` |
| **说明** | 默认值文本直接对应 CSS `.sd`（参数文本），颜色和字体风格与 Wiki 完全一致。 |

#### 4.6.3 返回值保存 `=> varname`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `return-value-save` |
| **Scope（`=>`）** | `keyword.operator.return-save.csm` |
| **Scope（变量名）** | `variable.other.assignment.csm` |
| **`=>` 颜色** | `#d73a49` 🔴 红色 |
| **变量名颜色** | `#e36209` 🟠 橙棕，*italic* |
| **CSS 参考** | （Wiki 未单独区分此语法） |

---

### 4.7 控制流关键字

#### 4.7.1 控制流标签（`<if>`、`<while>`、`<else>` 等）

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `control-flow` |
| **Scope（`<` 和 `>`）** | `punctuation.definition.tag.csm` |
| **Scope（关键字）** | `keyword.control.flow.csm` |
| **关键字颜色** | `#d73a49` 🔴 红色 + **bold** |
| **尖括号颜色** | `#d73a49` 🔴 红色（normal） |
| **CSS 参考** | （Wiki 将控制流标签解析为普通 `Name::Function`，无单独颜色） |
| **说明** | Wiki 中控制流标签未与普通命令区分，统一按默认文本色显示。VS Code 侧给予更醒目的红色以区分结构性语法。 |

> **⚠ Review 注意**：控制流关键字（`if`/`while`/`else`等）当前为红色 bold，与通信操作符使用相同颜色。如果希望区分，可以换成不同颜色（如蓝紫 `#6f42c1`）。

#### 4.7.2 跳转 / 等待 / 循环控制

| Token | Scope | 颜色 | 字体 |
|-------|-------|------|------|
| `GOTO` / `JUMP` | `keyword.control.jump.csm` | `#d73a49` 🔴 | **bold** |
| `WAIT` / `SLEEP` (含时间单位) | `keyword.control.wait.csm` | `#d73a49` 🔴 | **bold** |
| `BREAK` / `CONTINUE` | `keyword.control.loop.csm` | `#d73a49` 🔴 | **bold** |

#### 4.7.3 Include 指令

| 属性 | 值 |
|-----|----|
| **Scope（`<` 和 `>`）** | `punctuation.definition.tag.csm` |
| **Scope（`include`）** | `keyword.control.include.csm` |
| **Scope（文件路径）** | `string.unquoted.include-path.csm` |
| **`include` 颜色** | `#d73a49` 🔴 红色 + **bold** |
| **路径颜色** | `#032f62` 🔵 深蓝 |

---

### 4.8 锚点标签 `<label>`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `anchor` |
| **Scope** | `entity.name.label.anchor.csm` |
| **匹配** | `<[A-Za-z_][A-Za-z0-9_-]*>`（不含控制流关键字） |
| **颜色** | `#0366d6` 🔵 蓝色 |
| **字体** | **bold** |
| **CSS 参考** | （Wiki 将锚点标签视为普通 `Name::Function`，无单独颜色） |
| **说明** | Wiki 中锚点未单独区分。VS Code 侧赋予蓝色 bold 以区分跳转目标，方便阅读。 |

---

### 4.9 内置函数/命令

#### 4.9.1 输出函数 `ECHO` / `ECHO0`–`ECHO9`

| Scope | 颜色 | 字体 |
|-------|------|------|
| `support.function.echo.csm` | `#6f42c1` 🟣 紫色 | normal |

#### 4.9.2 `EXPRESSION` / `RANDOM` / 对话框

| Token | Scope | 颜色 | 字体 |
|-------|-------|------|------|
| `EXPRESSION` | `support.function.expression.csm` | `#6f42c1` 🟣 | normal |
| `RANDOM` / `RANDOMDBL` / `RANDOMINT` | `support.function.random.csm` | `#6f42c1` 🟣 | normal |
| `ONE_BUTTON_DIALOG` 等 | `support.function.dialog.csm` | `#6f42c1` 🟣 | normal |

#### 4.9.3 TagDB 操作函数

| Token | Scope | 颜色 | 字体 |
|-------|-------|------|------|
| `TAGDB_GET_VALUE` 等 | `support.function.tagdb.csm` | `#6f42c1` 🟣 | normal |

#### 4.9.4 字符串比较函数（`equal`、`match`、`belong` 等）

| Scope | 颜色 | 字体 |
|-------|------|------|
| `support.function.string-compare.csm` | `#6f42c1` 🟣 紫色 | normal |

> **说明**：以上内置函数在 Wiki CSS 中均无特殊样式（均为默认文本色）。VS Code 侧统一用紫色区分内置函数与普通状态名。

---

### 4.10 系统状态常量

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `system-state` |
| **Scope** | `support.constant.system-state.csm` |
| **匹配** | `Async Message Posted` / `Async Response` / `Target Timeout Error` / `Target Error` / `Critical Error` / `No Target Error` / `Error Handler` / `Response` |
| **颜色** | `#005cc5` 🔵 深蓝 |
| **字体** | *italic* |
| **CSS 参考** | （Wiki 无单独区分） |
| **说明** | 系统保留状态名，用深蓝斜体与用户自定义状态名区分。 |

---

### 4.11 广播/中断目标常量

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `broadcast-target-with-op`（capture 2 of broadcast/interrupt patterns） |
| **Scope（`<interrupt>`）** | `constant.language.interrupt-target.csm` |
| **Scope（`<status>` / `<broadcast>` / `<all>`）** | `constant.language.broadcast-target.csm` |
| **颜色** | `#005cc5` 🔵 深蓝 |
| **字体** | **bold** |
| **CSS 参考** | （Wiki 将此类 token 归为 `Name::Namespace`，即琥珀色） |
| **说明** | Wiki 中广播目标与普通目标模块名同为 `.nn` 琥珀色。VS Code 侧将内置常量目标（`<status>` 等）与普通模块名区分，改用深蓝 bold。 |

> **⚠ Review 注意**：如需与 Wiki 对齐，可将此处颜色改为 `#ca7601`（琥珀色，与目标模块名相同）。

---

### 4.12 其他操作符

#### 4.12.1 范围操作符（`∈` / `!∈`）

| Token | Scope | 颜色 | 字体 |
|-------|-------|------|------|
| `∈` | `keyword.operator.range-in.csm` | `#d73a49` 🔴 | normal |
| `!∈` | `keyword.operator.range-not-in.csm` | `#d73a49` 🔴 | normal |

#### 4.12.2 条件跳转（`??` / `?expr?`）

| Token | Scope | 颜色 | 字体 |
|-------|-------|------|------|
| `??` | `keyword.operator.error-jump.csm` | `#d73a49` 🔴 | normal |
| `?` … `?` | `keyword.operator.conditional-jump.csm` | `#d73a49` 🔴 | normal |
| 条件表达式文本 | `meta.expression.conditional-jump.csm` | `#6a737d` ⬜ | *italic* |

#### 4.12.3 赋值操作符（预定义节中的 `=`）

| Scope | 颜色 | 字体 |
|-------|------|------|
| `keyword.operator.assignment.csm` | `#d73a49` 🔴 | normal |

---

### 4.13 状态名前缀 `API:` / `Macro:`

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `state-prefix` |
| **Scope（`API`）** | `keyword.other.api-prefix.csm` |
| **Scope（`Macro`）** | `keyword.other.macro-prefix.csm` |
| **Scope（`:`）** | `punctuation.separator.prefix.csm` |
| **前缀关键字颜色** | `#005cc5` 🔵 深蓝 |
| **冒号颜色** | `#6a737d` ⬜ 中灰 |
| **字体** | normal |
| **CSS 参考** | （Wiki 中 `API:`/`Macro:` 均作为 `Name::Function` 默认色显示） |

#### 其他关键字（同深蓝）

| Token | Scope | 颜色 |
|-------|-------|------|
| `AUTO_ERROR_HANDLE_ENABLE` / `AUTO_ERROR_HANDLE_ANCHOR` | `keyword.other.auto-error.csm` | `#005cc5` |
| `INI_VAR_SPACE_ENABLE` / `INI_VAR_SPACE_PATH` | `keyword.other.ini-var.csm` | `#005cc5` |
| `TAGDB_VAR_SPACE_ENABLE` / `TAGDB_VAR_SPACE_NAME` | `keyword.other.tagdb.csm` | `#005cc5` |

---

### 4.14 预定义节 `[SECTION]`

#### 4.14.1 节名

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `predef-section`（section header） |
| **Scope（`[` 和 `]`）** | `punctuation.definition.section.csm` |
| **Scope（节名）** | `entity.name.section.predef.csm` |
| **节名颜色** | `#6f42c1` 🟣 紫色 |
| **节名字体** | **bold** |
| **`[`/`]` 颜色** | `#6f42c1` 🟣 紫色 |
| **支持的节名** | `CommandAlias` / `Command_Alias` / … / `AUTO_ERROR_HANDLE` / `INI_VAR_SPACE` / `TAGDB_VAR_SPACE` |

#### 4.14.2 键值对

| 属性 | 值 |
|-----|----|
| **Grammar Pattern** | `predef-section`（key-value pair） |
| **Scope（键名）** | `variable.other.predef-key.csm` |
| **Scope（`=`）** | `keyword.operator.assignment.csm` |
| **Scope（值）** | `string.unquoted.predef-value.csm` |
| **键名颜色** | `#24292e` （默认文本色） |
| **值颜色** | `#032f62` 🔵 深蓝字符串色 |

---

### 4.15 标点符号类

| Scope | 用途 | 颜色 | 字体 |
|-------|------|------|------|
| `punctuation.separator.module.csm` | `@` 模块分隔符 | `#6f42c1` 🟣 | normal |
| `punctuation.separator.prefix.csm` | `API:` / `Macro:` 后的 `:` | `#6a737d` ⬜ | normal |
| `punctuation.separator.default.csm` | `${var:default}` 中的 `:` | `#6a737d` ⬜ | normal |
| `punctuation.definition.variable.csm` | `${` / `}` | `#e36209` 🟠 | normal |
| `punctuation.definition.tag.csm` | 控制流/include 的 `<` `>` | `#d73a49` 🔴 | normal |
| `punctuation.definition.section.csm` | 预定义节的 `[` `]` | `#6f42c1` 🟣 | normal |

---

## 5. Grammar Scope 名称总表

下表列出 `syntaxes/csm.tmLanguage.json` 中定义的全部 scope 名称，以及它们在主题中的对应颜色和字体样式。

| Scope 名称 | 颜色（hex） | 字体样式 | 分类 |
|-----------|-----------|---------|------|
| `comment.line.double-slash.csm` | `#22863a` 🟢 | italic | 注释 |
| `keyword.operator.sync-call.csm` | `#d73a49` 🔴 | bold | 通信操作符 |
| `keyword.operator.async-call.csm` | `#d73a49` 🔴 | bold | 通信操作符 |
| `keyword.operator.async-no-reply.csm` | `#d73a49` 🔴 | bold | 通信操作符 |
| `keyword.operator.argument-separator.csm` | `#d73a49` 🔴 | bold | 参数分隔符 |
| `keyword.operator.subscription.csm` | `#d73a49` 🔴 | bold | 订阅操作符 |
| `keyword.operator.return-save.csm` | `#d73a49` 🔴 | normal | 返回值操作符 |
| `keyword.operator.conditional-jump.csm` | `#d73a49` 🔴 | normal | 条件跳转 |
| `keyword.operator.error-jump.csm` | `#d73a49` 🔴 | normal | 错误跳转 |
| `keyword.operator.range-in.csm` | `#d73a49` 🔴 | normal | 范围操作符 |
| `keyword.operator.range-not-in.csm` | `#d73a49` 🔴 | normal | 范围操作符 |
| `keyword.operator.assignment.csm` | `#d73a49` 🔴 | normal | 赋值操作符 |
| `keyword.control.flow.csm` | `#d73a49` 🔴 | bold | 控制流 |
| `keyword.control.include.csm` | `#d73a49` 🔴 | bold | Include 指令 |
| `keyword.control.jump.csm` | `#d73a49` 🔴 | bold | 跳转命令 |
| `keyword.control.wait.csm` | `#d73a49` 🔴 | bold | 等待命令 |
| `keyword.control.loop.csm` | `#d73a49` 🔴 | bold | 循环控制 |
| `keyword.control.subscription.csm` | `#d73a49` 🔴 | bold | 订阅关键字 |
| `keyword.control.subscription-type.csm` | `#d73a49` 🔴 | bold | 订阅类型 |
| `keyword.other.api-prefix.csm` | `#005cc5` 🔵 | normal | 状态前缀 |
| `keyword.other.macro-prefix.csm` | `#005cc5` 🔵 | normal | 状态前缀 |
| `keyword.other.auto-error.csm` | `#005cc5` 🔵 | normal | 错误处理配置 |
| `keyword.other.ini-var.csm` | `#005cc5` 🔵 | normal | INI 变量空间 |
| `keyword.other.tagdb.csm` | `#005cc5` 🔵 | normal | TagDB 配置 |
| `entity.name.label.anchor.csm` | `#0366d6` 🔵 | bold | 锚点标签 |
| `entity.name.label.module-address.csm` | （inherit） | bold | @Module（命令中） |
| `entity.name.namespace.module.csm` | `#ca7601` 🟠 | normal | 目标模块名 |
| `entity.name.section.predef.csm` | `#6f42c1` 🟣 | bold | 预定义节名 |
| `support.function.echo.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.function.expression.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.function.random.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.function.dialog.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.function.tagdb.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.function.string-compare.csm` | `#6f42c1` 🟣 | normal | 内置函数 |
| `support.constant.system-state.csm` | `#005cc5` 🔵 | italic | 系统状态常量 |
| `constant.language.broadcast-target.csm` | `#005cc5` 🔵 | bold | 广播目标常量 |
| `constant.language.interrupt-target.csm` | `#005cc5` 🔵 | bold | 中断目标常量 |
| `variable.other.csm` | `#e36209` 🟠 | italic | 变量名 |
| `variable.other.assignment.csm` | `#e36209` 🟠 | italic | 赋值变量名 |
| `variable.other.predef-key.csm` | `#24292e` ⚫ | normal | 预定义键名 |
| `string.unquoted.variable-default.csm` | `#6a737d` ⬜ | italic+underline | 变量默认值 |
| `string.unquoted.predef-value.csm` | `#032f62` 🔵 | normal | 预定义值 |
| `string.unquoted.include-path.csm` | `#032f62` 🔵 | normal | Include 路径 |
| `meta.expression.conditional-jump.csm` | `#6a737d` ⬜ | italic | 条件跳转表达式 |
| `punctuation.separator.module.csm` | `#6f42c1` 🟣 | normal | `@` 分隔符 |
| `punctuation.separator.prefix.csm` | `#6a737d` ⬜ | normal | 前缀 `:` |
| `punctuation.separator.default.csm` | `#6a737d` ⬜ | normal | 默认值 `:` |
| `punctuation.definition.variable.csm` | `#e36209` 🟠 | normal | `${` / `}` |
| `punctuation.definition.tag.csm` | `#d73a49` 🔴 | normal | `<` / `>` |
| `punctuation.definition.section.csm` | `#6f42c1` 🟣 | normal | `[` / `]` |

---

## 6. csm_lexer.rb → VS Code 映射关系

| csm_lexer.rb Token | Rouge CSS 类 | Wiki CSS 样式 | VS Code Scope | VS Code 颜色 | VS Code 字体 | 备注 |
|-------------------|-------------|--------------|--------------|-------------|-------------|------|
| `Comment::Single` | `.c1` | `#22863a` italic | `comment.line.double-slash.csm` | `#22863a` 🟢 | italic | ✅ 完全一致 |
| `Operator` (`>>`) | `.o` | bold（颜色inherit） | `keyword.operator.argument-separator.csm` | `#d73a49` 🔴 | bold | ⚠ 颜色补全为红色 |
| `Keyword` (send ops) | `.k` | bold（颜色inherit） | `keyword.operator.{sync/async/no-reply}.csm` | `#d73a49` 🔴 | bold | ⚠ 颜色补全为红色 |
| `Name::Function` | `.nf` | 无特殊样式 | （未匹配，使用默认色） | `#24292e` ⚫ | normal | ✅ 沿用默认 |
| `Name::Label` | `.nl` | bold + inherit | `entity.name.label.module-address.csm` | （inherit） | bold | ✅ 完全一致 |
| `Name::Namespace` | `.nn` | `#ca7601` | `entity.name.namespace.module.csm` | `#ca7601` 🟠 | normal | ✅ 完全一致 |
| `Literal::String::Doc` | `.sd` | `#6a737d` italic+underline | `string.unquoted.variable-default.csm` | `#6a737d` ⬜ | italic+underline | ✅ 颜色/字体一致；但仅映射到变量默认值，参数文本整体未标记 |
| `Literal::String::Interpol` | `.si` | `#6a737d` bold+italic+underline | （无对应 scope） | — | — | ❌ 未实现；参数中的 `@Module` 在 VS Code 侧归入 `entity.name.label.module-address.csm`（bold only） |

---

## 7. 待讨论 / Review 注释点

以下是实现过程中做出的选择，可能需要 Review 后调整。**请直接在本文件中对应条目下方添加注释或修改建议**，修改后告知 AI 按文档更新代码。

---

### Q1：通信操作符和控制流关键字的颜色

**当前方案**：所有通信操作符（`-@`、`->`、`->|`）、`>>`、控制流关键字（`if`/`while`/`else`/`GOTO`/`WAIT`等）统一使用红色 `#d73a49` + bold。

**备选**：
- 控制流关键字使用不同颜色，例如紫色 `#6f42c1`，与操作符区分。
- 或者通信操作符不用 bold，仅靠颜色区分。

> _在此处填写修改意见：_

---

### Q2：广播目标常量颜色

**当前方案**：`<status>`、`<broadcast>`、`<interrupt>`、`<all>` 使用深蓝 `#005cc5` + bold。

**问题**：Wiki CSS 中这类 token 归为 `Name::Namespace`（`.nn`），应为琥珀色 `#ca7601`。

**备选**：改为琥珀色 `#ca7601`，与 Wiki 对齐，但与目标模块名（也是 `#ca7601`）视觉上无差异。

> _在此处填写修改意见：_

---

### Q3：变量引用 `${var}` 的颜色

**当前方案**：变量名和 `${`/`}` 标点均为橙棕色 `#e36209` + italic。

**问题**：Wiki 中变量会作为参数文本（`.sd` 灰色斜体下划线）显示，因为 Rouge Lexer 不单独解析变量语法。

**备选**：改为 `#6a737d` 灰色 + italic + underline，更贴近 Wiki 显示效果。

> _在此处填写修改意见：_

---

### Q4：锚点标签 `<label>` 颜色

**当前方案**：蓝色 `#0366d6` + bold。

**问题**：Wiki 中锚点作为 `Name::Function`（默认色）显示，无特殊样式。

**备选**：改为默认文本色 `#24292e`（与 Wiki 对齐），或保留蓝色以在 VS Code 侧提升可识别度。

> _在此处填写修改意见：_

---

### Q5：`Literal::String::Interpol`（参数中的 `@Module`）未实现

**当前状态**：Wiki CSS 中 `.si`（参数中嵌入的 `@Module`，如 `arg@Module`）为灰色+bold+italic+underline。在 VS Code 侧，`@Module` 无论在命令位置还是参数位置，均由 `module-address` Pattern 统一匹配为 `entity.name.label.module-address.csm`（仅 bold，继承默认文本色）。

**要实现精确区分**，需要在语法Grammar（`csm.tmLanguage.json`）中根据 `>>` 前后位置给予不同 scope，这会显著增加语法规则复杂度。

**当前选择**：暂不实现，统一用 `entity.name.label.module-address.csm`（bold）处理所有 `@Module`。

> _在此处填写修改意见（是否需要实现精确区分？）：_

---

### Q6：内置函数颜色（紫色 vs 默认色）

**当前方案**：`ECHO`、`EXPRESSION`、`RANDOM`、对话框函数、`TAGDB_*` 函数均为紫色 `#6f42c1`。

**问题**：Wiki 中这些命令作为 `Name::Function`（默认色）显示，无特殊颜色。

**备选**：改为默认文本色 `#24292e`，与 Wiki 对齐。但这样内置函数与普通状态名的视觉区分将消失。

> _在此处填写修改意见：_

---

### Q7：主题是否需要同时提供 Dark 模式

**当前状态**：不再提供独立颜色主题。颜色通过 `configurationDefaults.editor.tokenColorCustomizations.textMateRules` 定义，在任意主题下生效。

**备选**：对于 Dark 主题下低对比度的颜色，可通过移除 `foreground` 设置使 token 继承用户主题默认色。

> _在此处填写修改意见：_

---

*文档版本：v1.0 · 生成时间：2026-03-22*
