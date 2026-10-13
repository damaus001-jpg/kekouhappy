# Telegram 翻译后回车发送修复

触发：中文输入第一次回车完成英文翻译，第二次回车后内容仍留在输入框。

隔离 Electron DOM 测试复现两条发送失败路径：Telegram 的纯图标 div.btn-send 不在原来的 button/[role=button] 识别范围；备用 KeyboardEvent 只有 key/code，没有 Telegram 使用的 keyCode/which=13。

已补齐当前输入区内的图标发送按钮识别，排除隐藏和禁用控件，并补齐备用回车的键码。素材使用事件独立处理，不阻塞原有发送事件队列。发送失败时保留草稿并显示重试提示。

验证：`node tools/run-telegram-translated-send-runtime.cjs --baseline` 两条发送路径失败；修复后 `node tools/run-telegram-translated-send-runtime.cjs` 五项通过，包括不一致草稿继续阻止、单次回车单个发送请求、素材编辑窗回车不提交聊天。构建及现有 Enter、Telegram、不回译、发送完整性和安全源检查通过。

测试使用隔离 DOM 和测试文字，不连接真实联系人；真实 Telegram 版本的第二次回车发送仍需操作员体验确认。未自动发送测试消息，未打包或推送。

## 新一轮实测：发送凭证被拒绝

2026-10-11 21:15 的实测日志记录：中文翻译成功、英文写入成功，随后三次回车均在发送授权阶段被拒绝，没有进入原生发送动作。旧中文拒绝原因被诊断字符过滤清空，新增 reasonCode/errorCode 用英文常量记录具体拒绝分支。

检查发现旧会话签名包含标题和可见聊天消息，且预加载与页面层读取签名的时机不同。现改为双方共用 Telegram peer ID；预加载触发翻译时由宿主读取当前稳定 ID，发送时页面使用同一规则。翻译完成后再次检查 peer，切换联系人则不写入结果。

授权不匹配时保留未过期凭证，只有校验通过才消耗；跨联系人、账号、平台和修改后的内容仍被拒绝。`node tools/test-telegram-conversation-approval.mjs` 验证改名不改变 ID、拒绝不消耗、通过消耗一次和过期失效。主进程修改需重启开发版，旧英文稿的旧凭证需重新翻译。
