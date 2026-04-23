# M1 设计文档：语言定义 + 语法高亮

> **里程碑：** M1
> **关联 Issue：** [M1 项目初始化 + 语言定义 + 语法高亮](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/)
> **完成日期：** 2026-03-20
> **状态：** ✅ 已完成
> **参考资料：** [CSM Wiki](https://nevstop-lab.github.io/CSM-Wiki/) · [CSM 消息语法](https://github.com/NEVSTOP-LAB/Communicable-State-Machine/blob/main/.doc/Syntax.md) · [CSM_User_Manual.md](../CSM_User_Manual.md)

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [CSM 语言特性](#2-csm-语言特性)
3. [文件结构](#3-文件结构)
4. [语言定义设计](#4-语言定义设计)
5. [语言配置设计](#5-语言配置设计)
6. [语法高亮设计](#6-语法高亮设计)
7. [测试用例设计](#7-测试用例设计)
8. [验证方式](#8-验证方式)

---

## 1. 目标与范围

### M1 目标

- 完成 CSM 语言注册（文件扩展名识别）
- 完成 `language-configuration.json`（注释、字符串引号等基础编辑行为）
- 完成 TextMate Grammar 语法高亮（针对 CSM 实际语法）
- 达到可本地安装并验证的状态

### 范围（本里程碑不包含）

- IntelliSense / 代码补全（M2）
- 悬停提示、诊断（M2/M3）
- 状态机可视化（M4+）

---

## 2. CSM 语言特性

CSM 是 [Communicable State Machine (CSM)](https://nevstop-lab.github.io/CSM-Wiki/) 框架的**文本化状态机脚本语言**，用于描述 LabVIEW 模块间的通讯行为。完整语言规范见 [CSM_User_Manual.md](../CSM_User_Manual.md)。

### 2.1 文件结构

一个 `.csm` 文件由两部分组成：

1. **预定义区（Pre-definition）**：INI 格式配置段，位于文件顶部。以 `[SECTION_NAME]` 开始，下方跟 `key = value` 键值对。
2. **脚本区（Script）**：逐行解析的消息指令序列。

```csm
[CommandAlias]
Connect = API: Connect >> ${host:localhost} -@ Database

// 脚本区
Macro: Initialize
Connect
```

### 2.2 核心语法

脚本区每行格式：

```
[状态/API名称] >> [参数] [通讯符号] [目标模块]  // 注释
```

### 2.3 通讯类型

| 类型 | 语法 | 说明 |
|------|------|------|
| 本地消息 | `State >> Args` | 无目标模块，本模块内处理 |
| 同步调用 | `API: DoSth >> Args -@ TargetModule` | 等待目标模块响应 |
| 异步调用（有返回） | `API: DoSth >> Args -> TargetModule` | 不等待，后续在 `Async Response` 处理 |
| 异步调用（无返回） | `API: DoSth >> Args ->| TargetModule` | 不等待，不期望返回 |
| 信号广播 | `Status >> Args -><status>` | 低优先级广播给所有订阅者 |
| 中断广播 | `Event >> Args -><interrupt>` | 高优先级广播给所有订阅者 |
| 注册订阅 | `Status@Src >> API@Tgt -><register>` | 订阅来源模块的状态变化 |
| 取消订阅 | `Status@Src >> API@Tgt -><unregister>` | 取消订阅 |
| 优先级订阅 | `Status@Src >> API@Tgt -><register as interrupt>` | 以中断优先级订阅 |

### 2.4 特殊目标 Token

| Token | 类型 | 说明 |
|-------|------|------|
| `<status>` / `<broadcast>` | 广播目标 | 普通信号广播 |
| `<interrupt>` | 广播目标 | 中断广播（高优先级） |
| `<all>` | 广播目标 | 所有订阅者 |
| `<register>` | 订阅操作 | 注册订阅 |
| `<unregister>` | 订阅操作 | 取消订阅 |
| `<register as interrupt>` | 订阅操作 | 以中断优先级注册 |
| `<register as status>` | 订阅操作 | 以信号优先级注册 |

### 2.5 控制流构造

| 标签 | 说明 |
|------|------|
| `<if expression>` … `<else>` … `<end_if>` | 条件分支 |
| `<while expression>` … `<end_while>` | 前检查循环 |
| `<do_while>` … `<end_do_while expression>` | 后检查循环 |
| `<foreach var in ${list}>` … `<end_foreach>` | 遍历列表 |
| `<include filepath.csm>` | 引入外部脚本 |
| `<anchor_name>` | 跳转锚点标签 |

### 2.6 变量引用

```csm
ECHO >> ${retValue}
API: Connect >> host=${DB_HOST:localhost}
```

### 2.7 返回值保存、范围检查与字符串比较

| 语法 | 说明 |
|------|------|
| `=> varName` | 将前一条指令返回值保存到变量 |
| `∈ [min, max]` | 返回值是否在范围内 |
| `!∈ [min, max]` | 返回值是否不在范围内 |
| `str equal(hello)` | 字符串比较（不区分大小写） |
| `str match(^HE[l]+O$)` | 字符串正则匹配 |
| `str belong(hello,hi)` | 字符串集合归属判断 |

### 2.8 条件跳转

| 语法 | 说明 |
|------|------|
| `?? goto >> <anchor>` | 当前有错误时跳转 |
| `?expression? goto >> <anchor>` | 条件为真时跳转 |

### 2.9 内置命令

| 类别 | 命令 |
|------|------|
| 跳转 | `GOTO`, `JUMP` |
| 等待/休眠 | `WAIT`, `WAIT(ms)`, `WAIT(s)`, `SLEEP`, `SLEEP(ms)`, `SLEEP(s)` |
| 循环控制 | `BREAK`, `CONTINUE` |
| 错误处理 | `AUTO_ERROR_HANDLE_ENABLE`, `AUTO_ERROR_HANDLE_ANCHOR` |
| 输出 | `ECHO`, `ECHO0`–`ECHO9` |
| 计算 | `EXPRESSION`, `RANDOM`, `RANDOM(DBL)`, `RANDOM(INT)` |
| 对话框 | `ONE_BUTTON_DIALOG`, `TWO_BUTTON_DIALOG`, `CONFIRM_DIALOG`, `INPUT_DIALOG` |
| INI 变量空间 | `INI_VAR_SPACE_ENABLE`, `INI_VAR_SPACE_PATH` |
| TagDB 操作 | `TAGDB_VAR_SPACE_ENABLE`, `TAGDB_VAR_SPACE_NAME`, `TAGDB_GET_VALUE`, `TAGDB_SET_VALUE`, `TAGDB_SWEEP`, `TAGDB_WAIT_FOR_EXPRESSION`, `TAGDB_START_MONITOR_EXPRESSION`, `TAGDB_STOP_MONITOR_EXPRESSION`, `TAGDB_WAIT_FOR_STABLE` |

### 2.10 状态名约定

| 前缀 | 含义 | 示例 |
|------|------|------|
| `API:` | 公开接口状态 | `API: StartAcquisition` |
| `Macro:` | 宏状态（多状态组合） | `Macro: Initialize` |
| 无前缀 | 内部状态 | `Idle`, `ProcessData` |

### 2.11 系统预置状态

| 状态名 | 触发时机 |
|--------|---------|
| `Macro: Initialize` | 模块启动时 |
| `Macro: Exit` | 模块退出时 |
| `Error Handler` | 发生错误时 |
| `Response` | 收到同步消息的返回值时 |
| `Async Response` | 收到异步消息的返回值时 |
| `Async Message Posted` | 发出异步消息后立即进入 |
| `Target Timeout Error` | 同步消息超时时 |
| `Target Error` | 目标模块不存在时 |
| `Critical Error` | 框架级严重错误时 |
| `No Target Error` | 目标为空字符串时 |

### 2.12 注释

只支持行注释，使用 `//`：

```csm
UI: Initialize  // 初始化 UI
// 这是一整行注释
```

### 2.13 @ 地址符

`@` 用于在状态名中指定来源/目标模块：

```csm
Status@SourceModule >> API@HandlerModule -><register>
```

---

## 3. 文件结构

M1 完成后新增/修改的文件：

```
CSMSript-vsc-Support/
├── language-configuration.json          # 语言编辑行为配置（已简化为行注释）
├── syntaxes/
│   └── csm.tmLanguage.json        # TextMate Grammar（基于实际 CSM 语法重新设计）
└── src/
    └── test/
        └── extension.test.ts            # 测试用例（已更新）
```

`package.json` 中的语言定义：

```jsonc
{
  "contributes": {
    "languages": [{
      "id": "csm",
      "aliases": ["CSM"],    // 只支持 CSM
      "extensions": [".csm"],      // 只注册 .csm 扩展名
      "configuration": "./language-configuration.json"
    }]
  }
}
```

---

## 4. 语言定义设计

### 4.1 语言标识符

| 字段 | 值 | 说明 |
|------|-----|------|
| `id` | `csm` | 语言唯一 ID，全局命名空间 |
| `aliases` | `["CSM"]` | 只支持 CSM |
| `extensions` | `[".csm"]` | CSM 文件扩展名 |
| `configuration` | `./language-configuration.json` | 语言配置文件路径 |

---

## 5. 语言配置设计

文件路径：`language-configuration.json`

CSM 是**逐行解析**的 DSL，**不支持**块结构（无 `{}`、`[]`、`()` 代码块），因此配置大幅简化：

### 5.1 注释符号

| 类型 | 符号 | 说明 |
|------|------|------|
| 行注释 | `//` | `Ctrl+/` 切换 |
| 块注释 | —— | CSM 不支持块注释 |

### 5.2 自动补全

支持以下字符的自动补全：

| 打开字符 | 自动插入 | 排除上下文 |
|---------|---------|----------|
| `"` | `"` | 注释内 |
| `'` | `'` | 注释内 |
| `<` | `>` | 注释内、字符串内 |
| `${` | `}` | 注释内 |

---

## 6. 语法高亮设计

文件路径：`syntaxes/csm.tmLanguage.json`

### 6.1 根作用域

- **scopeName：** `source.csm`

### 6.2 顶层规则（优先级从高到低）

| 顺序 | 规则 | 说明 |
|------|------|------|
| 1 | `#line-comment` | 行注释（最高优先级） |
| 2 | `#predef-section` | 预定义区 INI 段头和键值对 |
| 3 | `#control-flow` | 控制流标签 `<if>`, `<while>`, `<include>` 等 |
| 4 | `#anchor` | 跳转锚点 `<label>` |
| 5 | `#variable-reference` | 变量引用 `${var}` / `${var:default}` |
| 6 | `#return-value-save` | 返回值保存 `=>` |
| 7 | `#range-operator` | 范围运算符 `∈` / `!∈` |
| 8 | `#string-comparison-function` | 字符串比较函数（`equal`/`match`/`belong` 等） |
| 9 | `#conditional-jump` | 条件跳转 `??` / `?expr?` |
| 10 | `#builtin-command` | 内置命令关键字 |
| 11 | `#subscription-op` | 订阅/取消订阅操作（先于普通运算符） |
| 12 | `#broadcast-target-with-op` | 广播目标（含 `->` 运算符） |
| 14 | `#communication-operator` | 通讯运算符（`->|`、`-@`、`->`） |
| 15 | `#argument-separator` | 参数分隔符 `>>` |
| 16 | `#module-address` | `@` 模块地址符 |
| 17 | `#state-prefix` | 状态名前缀 `API:`、`Macro:` |
| 18 | `#system-state` | 系统预置状态名 |

### 6.3 Scope 命名规范

| Token 类型 | Scope 名称 |
|-----------|-----------|
| 行注释 | `comment.line.double-slash.csm` |
| 预定义段头 `[SECTION]` | `entity.name.section.predef.csm` |
| 预定义键 | `variable.other.predef-key.csm` |
| 预定义值 | `string.unquoted.predef-value.csm` |
| 控制流关键字 `if/while/…` | `keyword.control.flow.csm` |
| 控制流括号 `<` `>` | `punctuation.definition.tag.csm` |
| 包含指令 `include` | `keyword.control.include.csm` |
| 包含路径 | `string.unquoted.include-path.csm` |
| 锚点标签 `<label>` | `entity.name.label.anchor.csm` |
| 变量引用 `${…}` 界定符 | `punctuation.definition.variable.csm` |
| 变量名 | `variable.other.csm` |
| 变量默认值分隔符 `:` | `punctuation.separator.default.csm` |
| 变量默认值 | `string.unquoted.variable-default.csm` |
| 返回值保存 `=>` | `keyword.operator.return-save.csm` |
| 被赋值变量 | `variable.other.assignment.csm` |
| 范围运算符 `∈` | `keyword.operator.range-in.csm` |
| 范围运算符 `!∈` | `keyword.operator.range-not-in.csm` |
| 字符串比较函数 `equal/match/belong` 等 | `support.function.string-compare.csm` |
| 条件跳转 `?…?` | `keyword.operator.conditional-jump.csm` |
| 错误跳转 `??` | `keyword.operator.error-jump.csm` |
| 跳转表达式 | `meta.expression.conditional-jump.csm` |
| 跳转 GOTO/JUMP | `keyword.control.jump.csm` |
| 等待命令 | `keyword.control.wait.csm` |
| 循环控制 | `keyword.control.loop.csm` |
| 错误处理命令 | `keyword.other.auto-error.csm` |
| ECHO 命令 | `support.function.echo.csm` |
| EXPRESSION 命令 | `support.function.expression.csm` |
| RANDOM 命令 | `support.function.random.csm` |
| 对话框命令 | `support.function.dialog.csm` |
| INI 变量空间命令 | `keyword.other.ini-var.csm` |
| TagDB 配置命令 | `keyword.other.tagdb.csm` |
| TagDB 操作命令 | `support.function.tagdb.csm` |
| 同步调用 `-@` | `keyword.operator.sync-call.csm` |
| 异步调用 `->` | `keyword.operator.async-call.csm` |
| 异步无返回 `->|` | `keyword.operator.async-no-reply.csm` |
| 参数分隔符 `>>` | `keyword.operator.argument-separator.csm` |
| 订阅操作 `-><register>` 等 | `keyword.operator.subscription.csm` |
| 广播目标 `<status>` 等 | `constant.language.broadcast-target.csm` |
| 中断目标 `<interrupt>` | `constant.language.interrupt-target.csm` |
| `@` 地址符 | `punctuation.separator.module.csm` |
| `API:` 前缀 | `keyword.other.api-prefix.csm` |
| `Macro:` 前缀 | `keyword.other.macro-prefix.csm` |
| 系统预置状态 | `support.constant.system-state.csm` |

### 6.4 高亮示例

```csm
// ── 预定义区 ──────────────────────────────────────
[CommandAlias]
Connect = API: Connect >> ${host:localhost} -@ Database

[AUTO_ERROR_HANDLE]
enabled = true

// ── 脚本区 ────────────────────────────────────────
Macro: Initialize

Connect                                               // 使用别名

<if ${mode} = 1>
  API: DoSth >> arg1 -@ TargetModule                 // 同步调用
<else>
  API: GetData >> filter=all -> DataModule            // 异步调用
<end_if>

RANDOM(DBL) => retValue                              // 内置命令 + 返回值保存
?? goto >> <error_handler>                           // 错误跳转
?${retValue}>0.5? goto >> <high_branch>              // 条件跳转

retValue ∈ [0, 1]                                    // 范围检查

DataReady >> data -><status>                         // 广播
DataReady@Src >> OnData@UI -><register>              // 订阅

<high_branch>                                        // 锚点
ECHO >> High branch taken

<include SEQ-PCB-Init.csm>                     // 包含文件

<error_handler>
Error Handler
```


---

## 7. 测试用例设计

测试文件：`src/test/extension.test.ts`

### 7.1 测试套件：Language Definition Tests

| 测试用例 | 验证内容 |
|---------|---------|
| `language-configuration.json exists` | 配置文件存在 |
| `language-configuration.json is valid JSON` | 文件为合法 JSON |
| `language-configuration.json has line comment and no block comment` | 行注释为 `//`，无块注释（CSM 特性） |
| `csm.tmLanguage.json exists` | grammar 文件存在 |
| `csm.tmLanguage.json is valid JSON` | 文件为合法 JSON |
| `csm.tmLanguage.json has required fields` | `name=CSM`，`scopeName=source.csm` |
| `csm.tmLanguage.json contains CSM-specific patterns` | repository 包含 `line-comment`、`subscription-op`、`communication-operator`、`argument-separator`、`state-prefix`、`system-state` |
| `csm.tmLanguage.json argument-separator matches >>` | `>>` 分隔符规则有效 |
| `package.json registers CSM language with .csm only` | 只注册 `.csm` 扩展名，只有 `CSM` 别名 |
| `package.json registers CSM grammar` | grammar 的 scopeName 和路径正确 |

---

## 8. 验证方式

### 8.1 本地调试验证

1. 打开项目目录，按 `F5` 启动 Extension Development Host
2. 创建 `.csm` 文件，输入以下内容并观察高亮效果：

```csm
// CSM 语法高亮验证示例
Macro: Initialize

API: Connect >> host=localhost -@ DatabaseModule
API: GetData >> filter=all -> DataModule
API: Log >> message ->| LogModule

DataReady >> data -> <status>
UrgentStop >> reason -> <interrupt>
AllData >> data -> <all>

DataReady@DataModule >> OnDataReady@UIModule -><register>
DataReady@DataModule >> OnDataReady@UIModule -><register as interrupt>
DataReady@DataModule >> OnDataReady@UIModule -><unregister>

Response
Async Response
Async Message Posted
Error Handler
Target Timeout Error
Target Error

Macro: Exit
```

### 8.2 Scope Inspector 验证

1. 按 `Ctrl+Shift+P` → `Developer: Inspect Editor Tokens and Scopes`
2. 将光标移到不同 token 处，验证 scope 名称符合上表

---

*文档创建日期：2026-03-20*
*文档修订日期：2026-03-20（根据 CSM Wiki 重新设计）*
*作者：@copilot*
