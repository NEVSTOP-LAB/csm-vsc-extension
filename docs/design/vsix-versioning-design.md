# VSIX 构建版本号设计

> 功能：CI 自动构建的 VSIX 扩展包版本号方案
> 关联文件：`.github/workflows/ci.yml`（`build-vsix` job）
> 更新日期：2026-04-23
> 状态：维护中

---

## 1. 版本号格式

```
YEAR.MONTH.RUN_NUMBER
```

示例：`2026.4.42`

| 字段         | 含义                                       | 示例   |
|--------------|--------------------------------------------|--------|
| `YEAR`       | UTC 构建年份（4 位）                       | `2026` |
| `MONTH`      | UTC 构建月份（无前导零）                   | `4`    |
| `RUN_NUMBER` | GitHub Actions `github.run_number`（仓库级自增流水号） | `42`   |

---

## 2. 版本号的生成方式

版本号在 CI 的 `build-vsix` job 中动态计算，**不写回 `package.json`**：

```yaml
- name: 计算带 build number 的版本号
  id: version
  run: |
    YEAR=$(date -u +%Y)
    MONTH=$(date -u +%-m)
    BUILD_VERSION="${YEAR}.${MONTH}.${{ github.run_number }}"
    echo "build_version=${BUILD_VERSION}" >> "$GITHUB_OUTPUT"

- name: 打包 VSIX
  run: npx @vscode/vsce@3.7.1 package ${{ steps.version.outputs.build_version }} \
         --no-dependencies --no-update-package-json
```

`--no-update-package-json` 确保版本号仅注入 VSIX 包内的 `extension/package.json`，不影响源码中的 `package.json`（其 `version` 字段始终维持正式发版号）。

---

## 3. 为什么这样命名

### 3.1 必须是合法的三段式 semver

VS Code Marketplace 在发布时**强制要求版本号符合三段式 semver**（`major.minor.patch`）。使用 semver 预发布后缀（形如 `2026.4.23-42`，即 `YEAR.MONTH.DAY-RUN_NUMBER`）会被 Marketplace 拒绝，导致发布失败：

```
Error: The VS Marketplace doesn't support prerelease versions: '2026.4.23-21'.
```

因此最终格式去掉了日（day）字段并去掉了连字符，使其严格符合 `major.minor.patch` 的三段式要求。

### 3.2 使用 `github.run_number` 作为第三段（patch）

`github.run_number` 是 GitHub Actions 在**整个仓库范围内**自动维护的单调递增计数器，每次触发新的工作流运行时加 1，永不重置。因此：

- **全局唯一**：同一仓库内不会出现两个相同的 `run_number`，即使跨越年份或月份，版本号也不会重复。
- **单调递增**：版本号随时间严格递增，符合 semver 的语义。
- **无需手动管理**：完全由 GitHub 平台维护，无需在代码库中维护额外的计数器文件。

### 3.3 `YEAR.MONTH` 作为前两段的意义

`YEAR.MONTH` 作为 `major.minor` 提供了人类可读的时间上下文：

- 一眼可以判断该构建属于哪个年月。
- 当多个版本出现在 Marketplace 或 GitHub Release 页面时，便于快速排序和定位。
- 不使用 `DAY` 是因为已有 `run_number` 保证唯一性，再加 `DAY` 只会使格式更长且引发 Marketplace 兼容问题（见 3.1）。

### 3.4 不使用纯自增整数（如 `0.0.42`）

纯自增整数版本（如 `0.0.42`）缺乏时间信息，难以从版本号本身判断构建时间。日历化版本（`YEAR.MONTH.RUN_NUMBER`）在维护和排查问题时更直观。

---

## 4. Artifact 与 VSIX 文件命名

| 产物           | 命名规则                                        | 示例                              |
|----------------|-------------------------------------------------|-----------------------------------|
| GitHub Actions Artifact | `csm-vsc-support-{build_version}-vsix` | `csm-vsc-support-2026.4.42-vsix` |
| VSIX 文件      | `csm-vsc-support-{build_version}.vsix`          | `csm-vsc-support-2026.4.42.vsix` |

Artifact 名称与 VSIX 文件名保持一致（扩展名不同），便于在 CI 各 job 之间传递和下载。

---

## 5. 约束与注意事项

- `package.json` 中的 `version` 字段**不受 CI 构建影响**，始终保持正式发版号（如 `0.0.4`），由人工在正式发版时手动更新。
- `github.run_number` 的最大值不受限制，无上溢风险。
- 版本号仅在 `build-vsix` job 内计算，后续 job（`validate-vsix`、`upload-to-release`、`publish-to-marketplace`）通过 job output 传递，无需重新计算。
