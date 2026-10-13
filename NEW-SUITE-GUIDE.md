# 全新 maoyi 套装再生产指南

本指南用于本机丢失后，从公开 GitHub 仓库在新 Windows 电脑上创建一个全新的 `maoyi` 套装。它不恢复任何既有套装；新客户端要求客户重新授权并重新登录。

## 公开仓库能够恢复什么

- `com.maoyi.translator` 应用身份和 `maoyi` 数据目录。
- 玫瑰粉、高端金、慕容紫、晴水蓝四套主题。
- 授权端、客户端、提示词生成器及套装打包源码。
- 当前正式中译英、英译中和智能回复提示词的精确源文本。
- 新建 10,000 条九位 ID 池、消费一个新 ID，并生成授权、翻译提示词、智能回复三组新签名身份的能力。

仓库不恢复 DeepSeek 密钥、任何旧套装私钥或台账、客户授权、登录状态、运行缓存或安装包。

## 1. 一键恢复新电脑生产环境

使用 64 位 Windows，保持联网，并建议预留至少 30 GB 空间。脚本会使用经过固定 SHA-256 校验的便携 Node.js 24.15.0，不依赖电脑上碰巧安装的 Node.js 版本。

只使用这一种官方恢复方式：

1. 打开 <https://github.com/baishihappy-ux/baishihappy-2>。
2. 点击 `Code`，再点击 `Download ZIP`。
3. 把下载的 ZIP 解压到一个新的空文件夹；不得覆盖或混入以前下载的项目文件。
4. 双击解压目录根部的：

```text
恢复生产环境.cmd
```

也可以在 PowerShell 中运行：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\restore-production-environment.ps1 -InstallMissingSystemTools
```

脚本会依次：

- 检查 Git、Python 3.6+ 和 Visual Studio 2022 C++；缺失时通过 `winget` 安装。
- 下载并校验固定的便携 Node.js 24.15.0 和 pnpm 11.5.2。
- 安装 maoyi 项目依赖。
- 校验 Signal 8.18.0 源码归档与 21 个补丁。
- 联网建立 Git 忽略的完整 Signal 依赖仓库、Electron 归档和原生编译头文件。
- 离线复核依赖，编译改造版 Signal，并同步到 `.runtime/signal-desktop`。
- 运行新套装再生产检查、完整安全回归、Signal 缓存检查、maoyi/授权端界面冒烟验收和 Signal 窗口控制验收。

如果系统工具刚安装后尚未被当前进程识别，按提示重启 Windows，再双击同一入口即可；已经下载并通过校验的文件会被复用。代码更新、补丁变化或上次中断留下的不匹配 Signal 临时实验树，会在严格限定于 `.tmp/signal-source/v8.18.0` 的范围内自动重建。成功时最后一行明确显示：

```text
生产环境恢复完成，现在可以生成新套装。
```

恢复报告位于 `.tmp/production-environment-restore-report.json`。从 GitHub 下载 ZIP 的正式恢复报告还必须记录 `sourceMode: "github-download-zip"`。脚本不读取 DeepSeek 密钥、不创建正式套装、不消费正式九位套装 ID、不生成正式私钥或安装包。命令行参数 `-SkipUiAcceptance` 只用于无法打开窗口的受控环境；使用该参数后不能算完整验收通过。

## 2. 本地准备 DeepSeek 密钥

DeepSeek 密钥不在 GitHub 中。授权时通过授权程序把实际服务密钥写入客户的机器绑定授权文件；不得把密钥写进 `config/`、源码、日志、截图或提交。

开发环境如需本地测试，只能使用被 `.gitignore` 排除的 `.package-secrets/trial-config.json` 或进程环境变量 `MAOYI_SERVICE_SECRET`。

## 3. 正式生成一个新套装

先选择一个从未用于交付的三位套装序号。不要提前运行 `suite:create`；`suite:package` 会自行创建并永久消费一个新九位套装 ID。

```powershell
$env:MAOYI_SUITE_SEQUENCE = '012'
npm.cmd run suite:package
Remove-Item Env:MAOYI_SUITE_SEQUENCE
```

示例中的 `012` 只是格式演示，实际必须由操作者确认未使用。无论打包成功或失败，本次选中的九位套装 ID 都不得回收。

输出位于仓库相邻的 `taozhuang/taozhuang<序号>_<时间>/`，包含客户安装包、套装专属授权程序、套装专属提示词生成器和清单。该目录以及 `.package-secrets`、`.package-staging`、`.runtime`、`release` 均不得提交 Git。

## 4. 正式交付前验收

```powershell
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```

还必须人工打开本次生成的客户端，确认启动、授权、四套主题、WhatsApp/Telegram 登录、Signal 新实例、翻译和智能回复。构建或自动测试通过不能替代真实 UI 验收。

## 5. 重要后果

新套装与所有旧套装完全独立。安装新客户端后，客户需要重新授权、重新扫码或登录平台。公开 GitHub 不能恢复旧客户的授权或登录连续性。
