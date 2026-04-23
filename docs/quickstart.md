# 欢迎使用 VS Code 扩展开发

## 文件夹结构说明

* 此文件夹包含扩展所需的全部文件
* `package.json` - 这是清单文件，用于声明扩展和命令
  * 示例插件注册了一个命令，并定义了其标题和命令名称。有了这些信息，VS Code 就可以在命令面板中显示该命令，而无需加载插件
* `src/extension.ts` - 这是主文件，你将在此提供命令的实现
  * 该文件导出一个 `activate` 函数，在扩展首次激活时调用（本例中通过执行命令激活）。在 `activate` 函数中我们调用 `registerCommand`
  * 我们将包含命令实现的函数作为第二个参数传递给 `registerCommand`

## 安装设置

* 安装推荐的扩展（amodio.tsl-problem-matcher、ms-vscode.extension-test-runner 和 dbaeumer.vscode-eslint）


## 快速运行

* 按 `F5` 键打开一个加载了你的扩展的新窗口
* 通过按 (`Ctrl+Shift+P` 或 Mac 上的 `Cmd+Shift+P`) 打开命令面板，输入 `Hello World` 来运行命令
* 在 `src/extension.ts` 中设置断点来调试你的扩展
* 在调试控制台中查看扩展的输出

## 修改代码

* 修改 `src/extension.ts` 中的代码后，可以从调试工具栏重新启动扩展
* 也可以重新加载 (`Ctrl+R` 或 Mac 上的 `Cmd+R`) VS Code 窗口以加载更改


## 探索 API

* 打开文件 `node_modules/@types/vscode/index.d.ts` 可以查看完整的 API 集

## 运行测试

* 安装 [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* 通过 **Tasks: Run Task** 命令运行 "watch" 任务。确保此任务正在运行，否则可能无法发现测试
* 从活动栏打开测试视图，点击 "Run Test" 按钮，或使用快捷键 `Ctrl/Cmd + ; A`
* 在测试结果视图中查看测试结果输出
* 修改 `src/test/extension.test.ts` 或在 `test` 文件夹中创建新的测试文件
  * 提供的测试运行器只会考虑匹配命名模式 `**.test.ts` 的文件
  * 你可以在 `test` 文件夹内创建子文件夹，以任何你想要的方式组织测试

## 进阶内容

* 通过[打包扩展](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)来减小扩展大小并提高启动时间
* 在 VS Code 扩展市场上[发布你的扩展](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
* 通过设置[持续集成](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)来自动化构建
