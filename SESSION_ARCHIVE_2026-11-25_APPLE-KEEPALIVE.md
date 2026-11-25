# 2026-11-25 苹果 8070 页面防断流存档

用户授权：对宿主（皮卡丘）内 8070 工作台 Apple webview 做防断流修复；先开发版实测、后打新安装包并本地 Git 存档，不推送远端。

## 需求与协作

- 8070 需求文档：`C:\xiangmu\qunkong\PIKACHU_PAGE_KEEPALIVE_2026-11-24.md`。
- 症状：8070 页面后台化 15–20 分钟后，10 台设备画面订阅（HTTP chunked 长连接）陆续断流，回到页面才恢复；8070 后台与投屏进程全程存活。
- 协作通道：`C:\xiangmu\qunkong\PIKACHU_CHAT.md`，双方按【谁 → 谁】+时间戳追加消息，不删对方消息。
- 关键现场补充（8070 转述用户回忆）：断流期间用户切到过 Signal 多开标签——8070 页面处于宿主 CSS 隐藏状态，与后台节流假设一致。

## 修复内容

- `electron/main.ts`：
  - `will-attach-webview` 仅对 apple/8070 分区设 `webPreferences.backgroundThrottling = false`；
  - 新增 `did-attach-webview`：`sessionPolicies.get(guestContents.session) === 'apple'` 时调用 `setBackgroundThrottling(false)` 运行时兜底。
- 其余平台（WhatsApp / Telegram / Signal / 打新增安卓）保持 Electron 默认节流；preload 校验、URL 白名单、安全/防克隆守卫零改动；未改 8070 仓库。
- 新增 `tools/test-apple-background-throttling.cjs` + npm 脚本 `test:apple-background-throttling`。测试从 `electron/main.ts` 抽取生产监听器，在真实 Electron 43 隐藏窗口回放真实 webview attach，六场景通过：
  1. 生产监听器 + apple 分区 → guest 节流 false；
  2. 仅 will-attach 偏好修改 → false（证明偏好修改在 Electron 43 生效）；
  3. 仅 did-attach setBackgroundThrottling → false（证明兜底独立生效）；
  4/5. 生产监听器 + 非 apple 分区（两个窗口顺序）→ 保持默认 true；
  6. 未注册 partition → will-attach preventDefault，零 attach（守卫未削弱）。

## 验证

- `npm run build`（vue-tsc + vite + electron tsc）通过；`node tools/security-gate.cjs` 通过；`git diff --check` 通过。
- 构建产物与包内 asar 主进程均确认含两处 apple 作用域节流代码（`verify-packaged-output --client=release` 通过，含隔离启动冒烟）。
- 开发版实测：
  - 场景①（Signal 标签 + 窗口最小化）：19:45:32 → 20:44，约 59 分钟；8070 每分钟采样 60 轮，**0 次断流**，10 台始终 1 条活跃订阅（8070 已确认通过）。
  - 场景②（页面可见、静止、无操作）：20:45 开始，至 11-25 06:57 结束标注，约 10 小时；8070 20:52 起 60 轮 visible-static 采样期间零断流上报；用户 11-25 早晨确认 10 台画面全部正常。
  - 两段验收标准均达成；8070 最终分段报告以对话文件后续消息为准。

## 新安装包

- `release/pikaqiufanyiqi-1.16.29-Setup.exe`，398711441 字节。
- SHA256：`f0bece3b98f07dec94ebc90a7af0796baa1336d1f3b368cbf61e643c572360d0`。
- 版本保持 1.16.29；套装 572987197 未重建。**未安装到正式客户端，未操作真实账号、8070 后台或手机。**

## 安装后补充（2026-11-25）

- 用户已在本机安装该新包（约 07:55）。只读核对：安装版 `maoyi.exe` 与 `resources\app.asar` 与 `release/win-unpacked` 成品逐字节一致，安装版 asar 主进程含 apple/8070 节流修复代码。
- 用户确认：覆盖安装后 Signal 登录与多开账号正常，聊天记录保留。
- 8070 侧最新安装包构建中；用户计划完成后安装最新 8070 程序，之后可做安装版联合只读验收。

## 打包事故与今后规则

- 本次首次打包链未给 electron-builder 传 `--config`，其自动读取 `package.json` 的 `build.directories.output=release`，把 11-21 的顶层旧安装器（398711367 字节，SHA256 `194EDD0879743FF3C5067F8BF143D0C6D61C3925FE02FF4D1305282C4E9DB79C`）覆盖了。用户已确认接受该文件丢失，并明确：今后旧安装包由用户自行删除，打包不得再覆盖。
- 其余历史包仍保留：`release-1.16.29-preload-fix/`（SHA `26DF9CC3…`）、`release/1.16.29-signal-mainline/`（SHA `613F8C02…`）、`.recovery/signal-8.18-before-1.16.29`（8.18 回退运行时与 1.16.26 旧包）。
- **今后规则：打包必须 `MAOYI_CLIENT_BUILD_OUTPUT=<独立新目录> node node_modules/electron-builder/out/cli/cli.js --config electron-builder.client-suite.cjs --win nsis`，再用 `node tools/verify-packaged-output.cjs --client=<同一目录>`；禁止裸 `package:win`。**

## 边界

- 只改本项目；未改 8070 项目源码与设备；未推送远端；密钥、账号数据、安装包未提交 Git。
- 防克隆守卫、设备绑定、授权、Signal 早期启动守卫未改动；本次不涉及 Signal 内核升级。
