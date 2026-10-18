# 项目存档 — 2026-10-16

## Telegram 未读数

- 用户确认当前只开了一个 Telegram 多开实例，因此“70 条未读”不是多个实例汇总。
- 检查代码发现 Telegram 未读扫描会读取聊天列表徽标，并在列表暂时未挂载时保留上次已确认的计数；当前证据不足以确定 70 来自误读徽标还是旧计数。
- 本次未修改 Telegram 未读逻辑，也未打包。

## GitHub 灾难恢复

- 本地当前分支为 `checkpoint/pre-github-1.6.10.8`，追踪 `origin/checkpoint/pre-github-1.6.10.8`；本地与已记录的远端提交同步，仓库包含 347 个 Git 跟踪文件。
- 当前本地有 Signal 启动完整性修复等未提交变更，未推送到 GitHub。
- 已检查 `RECOVERY.md`、`github.md`、`恢复生产环境.cmd` 和 `tools/restore-production-environment.ps1`。仓库配置了通过 GitHub 下载 ZIP 后，在解压目录内准备工具链与依赖、构建并启动开发环境的恢复流程。
- 恢复流程会把工具链、依赖缓存、Signal 构建输出和报告写到 ZIP 解压项目目录中的 `.toolchains`、`.pnpm-store-complete`、`.tmp`、`.runtime` 等路径。不得从当前工作区运行恢复脚本，否则会写入当前工作区。
- 计划下一步从 GitHub 下载 ZIP，在工作区之外的固定隔离目录进行演练；不得污染 `C:\xiangmu\baishihappy-2-main`。当前尚未执行 ZIP 下载或演练，也没有声称异机恢复已实测通过。
- GitHub 版本不包含登录状态、聊天数据、API 密钥、真实授权材料、真实套装私钥及客户授权连续性数据；这些需要独立加密备份或在新环境重新生成。
