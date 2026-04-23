# 技术选型说明

> 本文档记录 CSMScript VSCode 插件项目的技术选型结果，对应里程碑 M0 中的调研结论。

---

## 开发语言

| 项目 | 决策 | 理由 |
|------|------|------|
| 开发语言 | **TypeScript** | VSCode 官方推荐，具备静态类型检查，与 VSCode Extension API 类型定义完美配合 |

**参考：**
- [TypeScript 官网](https://www.typescriptlang.org/)
- [VSCode Extension API 类型定义](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts)

---

## 打包工具

| 项目 | 决策 | 理由 |
|------|------|------|
| 打包工具 | **esbuild** | 构建速度极快，`yo code` 脚手架默认提供，适合插件项目的打包需求 |

**参考：**
- [esbuild 官网](https://esbuild.github.io/)

---

## 包管理器

| 项目 | 决策 | 理由 |
|------|------|------|
| 包管理器 | **npm** 或 **pnpm** | npm 为 Node.js 默认工具，pnpm 节省磁盘空间且速度更快；均与 VSCode 插件开发生态兼容 |

---

## 脚手架工具

| 项目 | 决策 | 理由 |
|------|------|------|
| 脚手架 | **yo code** | VSCode 官方推荐的插件项目生成器，可快速生成标准项目骨架 |

```bash
npm install -g yo generator-code
yo code
```

**参考：**
- [yo code 生成器](https://github.com/Microsoft/vscode-generator-code)

---

## 语言服务器（可选）

| 项目 | 决策 | 理由 |
|------|------|------|
| 语言服务器 | **M1–M3 阶段使用内联 Provider；满足触发条件后迁移至 LSP** | 当前功能均为单文件轻量逻辑（< 3000 行），内联 Provider 完全胜任；待需要跨文件分析或跨编辑器支持时再引入 LSP |

**判断依据与决策详情：** [docs/design/lsp-decision-criteria.md](../design/lsp-decision-criteria.md)

**参考：**
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 汇总

| 类别 | 选型结果 | 状态 |
|------|---------|------|
| 开发语言 | TypeScript | ✅ 已确认 |
| 打包工具 | esbuild | ✅ 已确认 |
| 包管理器 | npm / pnpm | ✅ 已确认 |
| 脚手架 | yo code | ✅ 已确认 |
| 语言服务器 | 内联 Provider（M1–M3）；满足触发条件后迁移至 LSP | ✅ 已决策，见 [lsp-decision-criteria.md](../design/lsp-decision-criteria.md) |

---

*文档创建日期：2026-03-06*  
*关联 Issue：[M0 调研与环境准备](https://github.com/NEVSTOP-LAB/CSMSript-vsc-Support/issues/2)*
