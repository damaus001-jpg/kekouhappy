# 2026-11-22 打包与 8070 后台菜单修复存档

用户要求将本次成果存档并保存到本地 Git，不推送远端。

## 皮卡丘源码与打包门禁

- 修复实际加载的 `electron/preload.cjs`，补上 `controlBackend8070(action)`，调用受信主进程 IPC `backend8070:control`。此前接口仅存在于 TypeScript preload，真实窗口加载的 CJS 缺失。
- 扩展 `tools/test-backend8070-menu.cjs`：以隔离 Electron 窗口加载真实 preload，并把 status/start/stop 引向模拟 IPC。修复前接口为 undefined；修复后桥接三种动作通过。两处菜单模板、四主题、忙状态等回归通过；`tools/test-backend8070-control.mjs` 通过。
- 扩展 `tools/verify-packaged-output.cjs`：要求最终 app.asar 含实际 preload，且与源码逐字节相同；检查关键 API；排除开发缓存、诊断日志、Signal 运行时绑定。
- 扩展 `tools/security-gate.cjs`，要求成品验证器保留新增规则。Security source/package gate 与 `git diff --check` 通过。
- 最初运行新增验证器时发现变量重名，已修正为 `clientPreloadEntry`，之后完整验证通过。

## 新安装包

- 输出目录：`release-1.16.29-preload-fix`，与 `release` 同级。避免默认 `package:win` 清空 `release` 的行为。
- 安装器：`release-1.16.29-preload-fix/pikaqiufanyiqi-1.16.29-Setup.exe`，398711296 字节。
- SHA256：`26DF9CC3D8510D27084FC9304EE6531B145A94C4EB3024E336008DB642DB67F0`。
- 旧安装器保留：`release/pikaqiufanyiqi-1.16.29-Setup.exe`，398711367 字节，SHA256 `194EDD0879743FF3C5067F8BF143D0C6D61C3925FE02FF4D1305282C4E9DB79C`。
- 新包使用当前 Signal 8.36.0 运行时。成品安全检查与隔离 EXE 启动检查通过，实际 preload 与源码一致。
- 用户确认 Signal 登录保留、覆盖升级和跨设备实测已验收。该验收来自用户确认；本次没有重复执行这些高风险运行验证。
- 新包没有安装到正式客户端。本次未操作 8070 后台或手机。

## 工具链限制和结果

- PowerShell 的 `npm.ps1` 受执行策略拒绝，因此按等效构建步骤直接执行本地 Node CLI，没有更改执行策略。
- 额外 `signal-source-experiment.cjs check` 因缺少旧版 Signal 8.17 源码归档失败；打包使用当前已准备的 Signal 8.36.0 运行时，打包后验证通过。
- 首次执行 Electron Builder 时 NSIS 仍在签名和生成 blockmap，稍后正常完成。成品目录内包含安装器、blockmap、latest.yml 和 builder-debug.yml。

## 8070 协作

- 8070 Codex 确认既有签名协议与宿主 status/start/stop 接口一致，无额外配套文件要求；后台仍需 `runtime/python.exe`、`iphone_batch/host_control.py`、`8070-host-policy.json`。
- 8070 的设备投屏与命令环境问题由对方跟进，本项目未改 8070 仓库或操作设备。对方报告其命令环境根因是仓库与 .git Owner 错误，恢复 Owner 后 Codex 自动重建 ACL 成功。

