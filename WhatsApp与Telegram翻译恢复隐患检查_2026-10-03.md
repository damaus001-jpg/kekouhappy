# WhatsApp 与 Telegram 翻译恢复隐患检查（2026-10-03）

用户要求：延续 Signal 检查，排查 WhatsApp、Telegram 是否存在类似的历史翻译和手动刷新同时失效、重启后恢复的潜在情况。

结论：未发现 Signal 专用控制通道的会话上报失配机制被 WhatsApp、Telegram 共用；两者通过 webview 脚本扫描和前端翻译队列工作。但两者共用的网页流程存在缺少超时、重载复位和拒绝反馈的隐患，可在隔离故障注入中复现等待状态不释放。不能把这些结果表述为用户现场已发生或已定位的 WhatsApp、Telegram 故障。

## 风险一：扫描等待状态不能自行恢复

- `src/App.vue:9055` 的 `getRuntimeScriptExecutor` 直接返回 `webview.executeJavaScript(script, true)`，没有执行超时。
- `src/App.vue:8862` 的 `translationScansInFlight` 为每个账号保留扫描 Promise。已有任务时，新扫描直接返回旧 Promise；仅在旧任务完成或拒绝后删除。
- 如果网页执行或扫描中其他异步调用一直不完成，该账号后续扫描一直复用旧等待任务。
- `src/App.vue:8631` 的 `handleWebviewDomReady` 重装注入脚本、启动扫描和缓存刷新，但没有清除旧扫描 Promise；`startTranslationBridge` 对已有轮询也直接返回。
- 隔离测试注入一直 pending 的扫描任务，多次重新扫描仍只有一次实际执行。这证明恢复兜底缺失，不证明真实 Electron 正常情况下必定留下 pending Promise。

## 风险二：手动刷新事件轮询可以停止且拒绝重启

- `src/App.vue:3933` 的 `pollInjectedComposerEvents` 等待网页脚本取出 `__dfTranslatorQueue`，其中包括气泡刷新事件。
- `src/App.vue:3991` 的 `scheduleComposerEventPoll` 等待本次轮询完成后，才在 finally 中安排下一次轮询。
- 若当前轮询一直 pending，则不会安排下一次；但账号仍留在 `composerEventPollIntervals`，再次调用启动函数会被视为已经启动而退出。
- 隔离测试中注入不结束的轮询，下一次定时器数量为零，再次启动也无法恢复。WhatsApp 和 Telegram 均复现。

## 风险三：单条消息的等待状态阻止自动和手动重试

- `src/App.vue:2832` 的 `enqueueMessageTranslationTask` 将消息键和原文哈希加入 `translatingMessages`。
- 成功和最终失败时会清除标记，但任务执行等待网页处理状态写入、译文注入或 idle 状态写入时，没有总时限。
- 若其中一次脚本执行一直不完成，任务不成功也不失败，标记和运行队列槽位都不释放。同一消息的自动和手动请求都会被拒绝。
- 即便翻译 API 请求已有 45 秒截止时间，也无法保护 API 前后等待的网页脚本执行。
- 隔离测试将手动任务的网页状态写入设为一直 pending，随后自动翻译和手动刷新同一消息均被拒绝。两平台均复现。

## 风险四：被拒绝的刷新未统一清除按钮 pending 状态

- `buildMessageScanScript` 创建的无译文按钮在点击时立即设置 `__dfBubbleRefreshPendingKeys[key] = true`，并禁用按钮，再把事件送入队列。
- `src/App.vue:3488` 的 `bubble-refresh` 分支对事件文本长度（6000）、JSON 解析、键格式、原文长度（4000）和语言进行检查。不通过时直接 return，未统一执行 idle 复位。
- 扫描允许不超过 4000 字符的英文原文，但含大量引号或反斜杠的内容，JSON 转义后可能超过 6000 字符。例如 `Hello ` 加 3200 个反斜杠，原文 3206 字符，符合扫描原文长度上限，刷新事件却超过 6000。
- 隔离测试执行真实源函数，确认上述事件没有入队、也没有调用按钮复位。对先禁用的无译文按钮，此路径可留下永久等待状态；缓存/已有译文按钮的点击行为不同，不能概括为所有刷新按钮都受此边界影响。

## 打包和验证

- 检查 1.6.8 `release/win-unpacked/resources/app.asar` 内全部 `dist/assets/*.js`，与本地 `dist` 逐文件字节一致。主要网页资源为 `dist/assets/index-BUG8b3yq.js`，含现有气泡刷新状态逻辑。未发现前端资源漏打或成品与当前 dist 不一致。
- 新增检查脚本：`tools/audit-web-translation-recovery.cjs`。使用当前源码中的实际函数和隔离模拟对象，不运行用户聊天页面、不调用真实翻译 API；两平台的四项异常分支均通过复现断言。源函数隔离测试与成品资源一致性核对是不同层次的证据，不能替代已安装客户端端到端验收。
- 输出：`.tmp/signal-history-audit/web-result.json`。
- 现有 `test-translation-scan-coalescing.cjs`、`test-translation-queue-concurrency.mjs`、`test-web-bubble-refresh-layout.mjs`、`test-whatsapp-long-message.mjs` 全部通过。
- 现有扫描测试验证了 Promise 成功和拒绝后的释放，未验证一直 pending、重载后的旧任务失效和轮询重启。

## 修复建议与验收范围

为网页脚本执行和翻译任务设置明确时限；为每次网页重载增加运行代次，使旧任务失效并释放扫描、轮询和处理中标记，同时阻止超时后晚到的旧结果写入新页面。超时只使用 Promise.race 而不处理旧任务和晚到结果，仍不足以完成恢复。

在 dom-ready、页面加载失败和渲染进程退出时复位相关状态、重启必要轮询；拒绝刷新事件时统一清理按钮等待状态，并按解析后的原文限制判断合法性，合理兼容 JSON 转义膨胀。保持账号、会话和消息对应关系校验，避免把旧会话译文注入新会话。

回归应覆盖：隐藏恢复、账号切换、页面重载、脚本 pending/拒绝、渲染进程退出、网络恢复、正在翻译时切换会话、缓存译文按钮与无译文按钮、长文本转义。确认自动与手动翻译可以恢复，旧结果不能串消息。

本次仅完成检查和复现脚本，未修改业务代码，未重新打包，未标记为已修复。
> 本文记录修复前诊断。后续实现、验证与原生构建见 [翻译恢复修复记录](翻译恢复修复记录_2026-10-03.md)。修复后验证使用 `npm run test:translation-recovery`；原审计脚本保留修复前故障断言。现有客户安装包尚未更新。
