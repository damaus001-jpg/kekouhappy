# Source recovery / 源码恢复

This public repository is the disaster-recovery source for the `maoyi` general release.

本公开仓库是 `maoyi` 通版的源码灾难恢复仓库。

## Included / 已包含

- Application, Electron main/preload, authorization, prompt-generator, translation, smart-reply, cache, lock-screen, remote-guard, multi-profile, and packaging source.
- WhatsApp, Telegram, and Signal integration source and automated contract tests.
- The exact Signal Desktop 8.18.0 upstream source archive.
- The complete ordered 21-patch `maoyi` Signal series, manifests, checksums, and replay/build tooling.
- Exact public source text for the current translation and smart-reply prompts, plus content hashes.
- Fresh-suite generators for a new 10,000-entry ID pool, one newly consumed nine-digit suite ID, and three newly generated signing identities.
- Four persisted themes: Rose Pink, Premium Gold, Murong Purple, and Clear Water Blue.
- 应用、Electron 主进程与预加载、授权、提示词生成器、翻译、智能回复、缓存、锁屏、御前侍卫、多开和打包源码。
- WhatsApp、Telegram 和 Signal 集成源码及自动化契约测试。
- 固定的 Signal Desktop 8.18.0 官方源码归档，以及完整的 21 个补丁、清单、校验值和重放构建工具。
- 当前正式翻译提示词和智能回复提示词的精确公开源文件及内容哈希。
- 从新的 10,000 条 ID 池创建全新九位套装 ID 和三组全新签名身份的工具。
- 可持久化的四套主题：玫瑰粉、高端金、慕容紫、晴水蓝。

## Intentionally excluded / 有意排除

DeepSeek/API keys, every real suite private key, real suite ledgers, customer authorization files, login profiles, translation caches, logs, dependency caches, generated installers, and customer delivery archives are intentionally excluded.

DeepSeek/API 密钥、所有真实套装私钥、真实套装台账、客户授权文件、登录状态、翻译缓存、日志、依赖缓存、生成的安装包和客户交付压缩包均明确排除。

The public prompt source contains instructions only. It contains no DeepSeek key. Prompt bundles and suite identities are regenerated locally and remain ignored.

公开提示词源文件只包含指令，不含 DeepSeek 密钥。提示词签名包和套装身份在本机重新生成，并继续由 Git 忽略。

The GitHub repository is public. Generated customer delivery archives must not be uploaded to Git history or GitHub Releases.

本 GitHub 仓库保持公开。生成的客户交付压缩包不得上传到 Git 历史或 GitHub Releases。

## Fresh-clone checks / 全新克隆检查

On a fresh 64-bit Windows computer, open <https://github.com/damaus001-jpg/kekouhappy>, choose `Code` → `Download ZIP`, extract it, and double-click `恢复生产环境.cmd`. This is the sole official recovery route. It installs missing system prerequisites, downloads the hash-pinned portable Node.js toolchain, installs project dependencies, rebuilds and synchronizes the modified Signal runtime, runs automated and real-window checks, and then launches the development app and its visible command window.

在全新的 64 位 Windows 电脑上，打开 <https://github.com/damaus001-jpg/kekouhappy>，点击 `Code` → `Download ZIP`，解压后双击 `恢复生产环境.cmd`。这是唯一官方恢复方式。它会安装缺少的系统工具，下载经过哈希固定的便携 Node.js，安装项目依赖，重新构建并同步改造版 Signal，执行自动检查和真实窗口验收，最后自动启动开发程序并打开命令窗口。

Equivalent command / 等效命令：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\restore-production-environment.ps1 -InstallMissingSystemTools
```

The success report is `.tmp/production-environment-restore-report.json`; full acceptance requires `status: "ready"`, `sourceMode: "github-download-zip"`, `suiteIdConsumed: false`, and `installerGenerated: false`. The restore action does not create a formal suite.

成功报告位于 `.tmp/production-environment-restore-report.json`；完整验收要求 `status: "ready"`、`sourceMode: "github-download-zip"`、`suiteIdConsumed: false` 且 `installerGenerated: false`。恢复动作不会创建正式套装。

The commands below remain useful for individual diagnosis:

以下命令仍可用于逐项诊断：

```powershell
Get-FileHash -Algorithm SHA256 .\reference-sources\Signal-Desktop-v8.18.0.zip
npm.cmd ci
npm.cmd run build
npm.cmd run test:public-reproduction
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
npm.cmd run signal-source:check:v8.18
```

The Signal archive hash must be:

```text
A1FE955608134DAA81FC4EDDBEA35F8BA57E4CA54B43391B845364965D6C1A66
```

Signal dependency caches and the pinned Node/pnpm toolchain are reproducible build inputs, not source. `恢复生产环境.cmd` provisions them online from the pinned versions and hashes, then the Signal build rechecks the completed inputs offline.

Signal 依赖缓存以及固定版本的 Node/pnpm 工具链属于可重新准备的构建输入，不属于源码。`恢复生产环境.cmd` 会按固定版本和哈希联网准备，随后 Signal 构建再离线复核完整输入。

## Generate a new suite / 生成全新套装

Read `NEW-SUITE-GUIDE.md` before creating a suite. Use `npm.cmd run test:public-reproduction` for a non-consuming dry check. Do not run `suite:create` before `suite:package`; the packaging workflow creates and permanently consumes its own new suite ID.

创建套装前阅读 `NEW-SUITE-GUIDE.md`。使用 `npm.cmd run test:public-reproduction` 做不消耗正式 ID 的隔离检查。不要在 `suite:package` 前另行运行 `suite:create`；正式打包流程会自行创建并永久消费一个全新套装 ID。

For another Codex or coding AI, copy `NEW-SUITE-AI-PROMPT.md`.

交给另一位 Codex 或编程 AI 时，复制 `NEW-SUITE-AI-PROMPT.md`。

## Source checkpoint / 业务源码基线

This snapshot was derived from business source checkpoint:

```text
3855a771d48c5040868f9054adbb7add674e6f5d
```

Repository scope and exclusions are defined in `github.md`. Existing suite identities are not recoverable from this repository; a newly generated suite requires customers to authorize and sign in again.

仓库范围与排除项以 `github.md` 为准。既有套装身份不能从本仓库恢复；换用新生成套装时，客户需要重新授权并重新登录。
