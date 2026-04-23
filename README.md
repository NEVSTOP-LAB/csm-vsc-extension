# Communicable State Machine(CSM) VSCode 支持

> 为 CSM 相关文件提供 Visual Studio Code 编辑器支持的插件。

## 项目简介

当前版本扩展聚焦两类文件：

- `.csmlog`：CSM 日志文件（语法高亮 + 悬停提示 + 大纲）
- `.lvcsm`：CSM 配置文件（基于 INI 语法高亮）

## 安装要求

- Visual Studio Code 1.60.0 或更高版本

## 功能特性

### `.csmlog` 文件支持

- ✅ 事件类型高亮（Error、User Log、Sync/Async Message、State Change 等）
- ✅ 时间戳与模块名高亮
- ✅ 参数 `key:` 前缀高亮（粗体 + 斜体 + 下划线）
- ✅ Hover 悬停提示（事件类型、时间戳、配置键、部分操作符）
- ✅ Outline 大纲（配置项、Module Created/Destroyed、Logger 系统消息）
- ✅ 默认编辑器字号配置：`14px`（可通过 `editor.fontSize` 覆盖）

### `.lvcsm` 文件支持

- ✅ 注册独立语言 `lvcsm`
- ✅ 语法通过 `source.ini` 复用 INI 高亮规则
- ✅ 默认开启 `files.autoGuessEncoding`，降低 GBK/GB2312 文件乱码风险

## 使用方法

### 查看 `.csmlog` 大纲

打开 `.csmlog` 文件后，资源管理器侧边栏 **Outline** 会显示：

- 配置项（`- Key | Value`）
- 模块生命周期（`[Module Created]` / `[Module Destroyed]`）
- Logger 系统消息（`<Logger Thread Exit>` 等）

### 查看 Hover

将鼠标悬停在 `.csmlog` 的事件类型、时间戳、配置键上可查看说明。

## 开发命令

```bash
npm run lint
npm run compile
npm run compile-tests
npm test
```

## 已知限制

- 当前版本不注册 `.csm` 语言。

## 问题反馈

如遇到问题请到 [GitHub Issues](https://github.com/nevstop/csm-vsc-extension/issues) 反馈。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 贡献指南

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

本项目遵循 GNU Affero General Public License v3 (AGPL-3.0) 许可证。详见 [LICENSE](LICENSE) 文件。
