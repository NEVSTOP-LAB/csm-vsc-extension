# 扩展图标说明

## 当前图标

当前使用的扩展图标文件为 [`images/icon.png`](../images/icon.png)，并已用于 Marketplace 发布版本。

### 图标文件

- **PNG 格式**: [`images/icon.png`](../images/icon.png) - 128x128 像素（推荐使用）
- **SVG 格式**: [`images/icon.svg`](../images/icon.svg) - 矢量格式（可选）

### 当前设计

当前图标包含：
- 蓝色渐变背景（#2196F3 → #1976D2）
- 简化的状态机图形（3 个节点和连接线）
- "CSM" 文字标识

## 替换图标指南

### 推荐规格

根据 [VSCode 扩展图标指南](https://code.visualstudio.com/api/references/extension-manifest#extension-icon)：

- **尺寸**: 128x128 像素（必须）
- **格式**: PNG 或 SVG
- **边距**: 建议在图标周围留 8-16 像素边距
- **圆角**: 建议使用 16 像素圆角（可选）
- **风格**: 简洁、识别度高、在浅色和深色主题下都清晰可见

### 替换步骤

1. **准备图标文件**
   - 创建 128x128 像素的 PNG 图标
   - 确保背景透明或使用纯色
   - 图标在缩小到不同尺寸时依然清晰

2. **替换文件**
    ```bash
   # 备份当前图标（可选）
   mv images/icon.png images/icon-backup.png
   
   # 复制新图标
   cp /your/icon/path.png images/icon.png
   ```

3. **验证图标**
   - 在 package.json 中确认路径配置正确：
     ```json
     "icon": "images/icon.png"
     ```
   - 按 F5 调试扩展，查看新图标效果
   - 使用 `vsce package` 打包，检查 .vsix 文件中的图标

### 设计建议

#### 主题元素参考
- **状态机图形**: 节点、箭头、状态转换
- **脚本符号**: `{}`、`<>`、代码符号
- **颜色方案**: 
  - 主色：蓝色系（科技感）
  - 辅色：绿色系（运行状态）
  - 强调：橙色/黄色（状态变化）

#### 避免的元素
- ❌ 过于复杂的细节（在小尺寸下不清晰）
- ❌ 过细的线条（< 2 像素）
- ❌ 过多的文字（除非是简单的缩写）
- ❌ 低对比度（在深色/浅色主题下都需清晰）

## 在线设计工具推荐

- [Figma](https://www.figma.com/) - 专业 UI 设计工具
- [Canva](https://www.canva.com/) - 简单易用的设计平台
- [GIMP](https://www.gimp.org/) - 免费开源图像编辑器
- [Inkscape](https://inkscape.org/) - 矢量图形编辑器（SVG）

## 参考资源

- [VS Code Extension Icon Guidelines](https://code.visualstudio.com/api/references/extension-manifest#extension-icon)
- [VS Code Icon Theme](https://code.visualstudio.com/api/extension-guides/icon-theme)
- [Marketplace Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

---

**最后更新**: 2026-04-23
