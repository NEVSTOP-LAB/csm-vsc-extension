# CSM VS Code 扩展快速上手（开发者）

## 项目现状

- 本扩展已发布到 VS Code Marketplace。
- 当前支持语言：
  - `.csmlog`（语法高亮 + Hover + Outline）
  - `.lvcsm`（基于 INI 语法高亮）
- 扩展不提供命令面板命令，主要通过文件类型自动激活。

## 本地开发

```bash
npm install
npm run compile
```

## 调试扩展

1. 在 VS Code 打开仓库根目录
2. 按 `F5` 启动 Extension Development Host
3. 在新窗口中打开 `*.csmlog` 或 `*.lvcsm` 文件验证效果

## 测试与检查

```bash
# 代码检查与构建
npm run check-types
npm run lint
npm run compile

# 编译测试
npm run compile-tests

# 运行无需 VS Code UI 的单元测试
npx mocha --ui tdd --timeout 10000 --require out/test/setup.js "out/test/csmlog*Provider.test.js"
```

如需运行完整 VS Code 集成测试：

```bash
npm test
```
