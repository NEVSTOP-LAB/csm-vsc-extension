# HoverProvider 关键字追踪文档

> 本文档用于追踪 `src/hoverProvider.ts` 中已收录的关键字/操作符文档，
> 以及与 `docs/CSMScript_User_Manual.md`（当前版本：**0.3.2**）之间的同步状态。
>
> 每次用户手册更新后，请对照本文档核查是否需要更新 `hoverProvider.ts`。

---

## 已收录关键字清单

### 通信操作符

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `-@` | §3.2 基础功能 | ✅ |
| `->` | §3.2 基础功能 | ✅ |
| `->|` | §3.2 基础功能 | ✅ |
| `>>` | §3.2 基础功能 | ✅ |
| `@` | §3.2 基础功能 | ✅ |
| `=>` | §3.3 返回值保存传递 | ✅ |

### 订阅操作符

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `-><register>` | §3.2 基础功能 | ✅ |
| `-><unregister>` | §3.2 基础功能 | ✅ |
| `-><register as interrupt>` | §3.2 基础功能 | ✅ |
| `-><register as status>` | §3.2 基础功能 | ✅ |

### 广播目标

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `-> <status>` | §3.2 基础功能 | ✅ |
| `-> <interrupt>` | §3.2 基础功能 | ✅ |
| `-> <broadcast>` | §3.2 基础功能 | ✅ |
| `-> <all>` | §3.2 基础功能 | ✅ |

### 变量引用

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `${varname}` / `${varname:default}` | §3.4 变量空间支持 | ✅ |

### 预定义区域配置节

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `[COMMAND_ALIAS]` | §3.1 脚本结构 / §3.5 拓展指令集方案 | ✅ |
| `[AUTO_ERROR_HANDLE]` | §3.1 脚本结构 / §3.5 自动错误处理 | ✅ |
| `[INI_VAR_SPACE]` | §3.1 脚本结构 / §3.4 配置变量空间 | ✅ |
| `[TAGDB_VAR_SPACE]` | §3.1 脚本结构 / §3.4 TagDB 变量空间 | ✅ |

### 内置指令集

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `GOTO` | §3.5 跳转指令 | ✅ |
| `JUMP` | §3.5 跳转指令 | ✅ |
| `WAIT` / `WAIT(s)` / `WAIT(ms)` | §3.5 等待指令 | ✅ |
| `SLEEP` / `SLEEP(s)` / `SLEEP(ms)` | §3.5 等待指令 | ✅ |
| `BREAK` | §3.5 循环相关指令 | ✅ |
| `CONTINUE` | §3.5 循环相关指令 | ✅ |
| `ECHO` / `ECHO0`–`ECHO9` | §3.5 ECHO 指令 | ✅ |
| `EXPRESSION` | §3.5 EXPRESSION 指令 | ✅ |
| `RANDOM` / `RANDOMDBL` / `RANDOM(DBL)` | §3.5 随机数指令 | ✅ |
| `RANDOMINT` / `RANDOM(INT)` | §3.5 随机数指令 | ✅ |
| `AUTO_ERROR_HANDLE_ENABLE` | §3.5 自动错误处理相关指令 | ✅ |
| `AUTO_ERROR_HANDLE_ANCHOR` | §3.5 自动错误处理相关指令 | ✅ |
| `INI_VAR_SPACE_ENABLE` | §3.5 配置变量空间相关指令 | ✅ |
| `INI_VAR_SPACE_PATH` | §3.5 配置变量空间相关指令 | ✅ |
| `TAGDB_VAR_SPACE_ENABLE` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_VAR_SPACE_NAME` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_GET_VALUE` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_SET_VALUE` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_SWEEP` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_WAIT_FOR_EXPRESSION` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_START_MONITOR_EXPRESSION` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_STOP_MONITOR_EXPRESSION` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `TAGDB_WAIT_FOR_STABLE` | §3.5 TagDB 变量空间相关指令 | ✅ |
| `ONE_BUTTON_DIALOG` | §3.5 对话框指令 | ✅ |
| `TWO_BUTTON_DIALOG` | §3.5 对话框指令 | ✅ |
| `CONFIRM_DIALOG` | §3.5 对话框指令 | ✅ |
| `INPUT_DIALOG` | §3.5 对话框指令 | ✅ |

### 状态前缀

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `API:` | §3.2 基础功能 | ✅ |
| `Macro:` | §3.2 基础功能 | ✅ |

### 控制流关键字

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `<if condition>` | §3.9 分支逻辑支持 | ✅ |
| `<else>` | §3.9 分支逻辑支持 | ✅ |
| `<end_if>` | §3.9 分支逻辑支持 | ✅ |
| `<while condition>` | §3.10 循环支持 | ✅ |
| `<end_while>` | §3.10 循环支持 | ✅ |
| `<do_while>` | §3.10 循环支持 | ✅ |
| `<end_do_while condition>` | §3.10 循环支持 | ✅ |
| `<foreach var in list>` | §3.10 循环支持 | ✅ |
| `<end_foreach>` | §3.10 循环支持 | ✅ |
| `<include filepath>` | §3.11 脚本引用功能 | ✅ |

### 范围运算符

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `∈` | §3.6 表达式支持 / §3.8 返回值范围判断 | ✅ |
| `!∈` | §3.6 表达式支持 / §3.8 返回值范围判断 | ✅ |

### 字符串比较函数

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `equal()` / `equal_s()` | §3.6 字符串比较 | ✅ |
| `match()` / `match_s()` | §3.6 字符串比较 | ✅ |
| `start_with()` / `start_with_s()` | §3.6 字符串比较 | ✅ |
| `end_with()` / `end_with_s()` | §3.6 字符串比较 | ✅ |
| `contain()` / `contain_s()` | §3.6 字符串比较 | ✅ |
| `belong()` / `belong_s()` | §3.6 字符串比较 | ✅ |

### 条件跳转

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `?? goto` | §3.7 锚点跳转（错误跳转） | ✅ |
| `?expression? goto` | §3.7 锚点跳转（条件跳转） | ✅ |

### 系统状态常量

| 关键字 / 操作符 | 对应手册章节 | 状态 |
|---|---|---|
| `Async Message Posted` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Async Response` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Target Timeout Error` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Target Error` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Critical Error` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `No Target Error` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Error Handler` | §3.2 基础功能（CSM 系统状态） | ✅ |
| `Response` | §3.2 基础功能（CSM 系统状态） | ✅ |

---

## 用户手册变更追踪

| 手册版本 | 变更日期 | 变更内容 | hoverProvider.ts 是否已更新 |
|---|---|---|---|
| 0.3.2 | (初始) | 初始同步，完整收录上述所有关键字 | ✅ |

---

## 待补充 / 已知未收录

| 关键字 | 备注 |
|---|---|
| `ECHO0`–`ECHO9` 各自独立文档 | 目前 ECHO0-9 统一指向 `ECHO` 条目，可后续细化 |
| 自定义别名触发的悬停 | 别名在预定义区域定义后无法静态推断，暂不支持 |

---

## 更新流程

当用户手册（`docs/CSMScript_User_Manual.md`）发生更新时：

1. 检查新增/修改的语法或指令，与本文档的"已收录清单"对比。
2. 在 `src/hoverProvider.ts` 的 `HOVER_DB` 对象中新增或修改对应条目。
3. 更新本文档"用户手册变更追踪"表格，记录版本、日期和变更内容。
4. 运行 `npm run compile` 确保编译通过。
