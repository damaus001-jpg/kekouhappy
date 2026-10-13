# DeepSeek API 接入记录

更新日期：2026-10-01

官方文档：https://api-docs.deepseek.com/

## 结论

- API 使用 OpenAI 兼容格式。
- 接口基础地址：`https://api.deepseek.com`
- Chat Completions 接口：`POST /chat/completions`
- 完整地址：`https://api.deepseek.com/chat/completions`
- 认证方式：HTTP Header `Authorization: Bearer <API Key>`
- 请求格式：JSON。
- 响应格式：JSON，主要读取 `choices[0].message.content`。

## 当前模型选择

官方文档列出的新模型：

- `deepseek-flash`：当前官方 Flash API 名称（V4.1 Flash），保留作诊断对照。
- `deepseek-v4-pro`：更强模型，适合更高质量但成本/延迟更高的场景。
- `deepseek-v4-flash`：旧名称仍临时兼容，请求由 V4.1 Flash 承接；已有客户端配置自动迁移为 `deepseek-flash`。

旧模型：

- `deepseek-chat`
- `deepseek-reasoner`

当前名称与兼容关系以官方更新日志为准：https://api-docs.deepseek.com/updates/ 。旧名称兼容不代表原模型版本仍在提供服务。

## 翻译请求标准

聊天翻译默认关闭 thinking：

```json
{
  "model": "deepseek-flash",
  "messages": [
    {
      "role": "user",
      "content": "Translate the following chat message to English..."
    }
  ],
  "thinking": {
    "type": "disabled"
  },
  "temperature": 0.2
}
```

关闭 thinking 的原因：

- 聊天翻译需要低延迟。
- 翻译不需要展示推理过程。
- DeepSeek 文档说明启用 thinking 时 `temperature` 会被忽略。

## 翻译提示词原则

系统应要求模型：

- 只返回翻译后的消息，不解释。
- 保留 emoji。
- 保留 URL、电话号码、产品名。
- 保留换行。
- 不额外添加引号、前缀或说明。

当前主进程函数：

- `translateWithDeepSeek`：位于 `electron/main.ts`。
- 默认模型：`deepseek-v4-pro`，本机诊断验证后采用 Pro。
- 响应读取：`choices?.[0]?.message?.content?.trim()`。

## API Key 保存规则

- API Key 不写入仓库文件。
- 诊断开发客户端通过面板输入，由 Windows DPAPI 加密保存到 `.tmp/translation-diagnostics-client/service-key.dpapi`。
- 正式客户端在主进程从授权载荷读取服务密钥，不向渲染页返回密钥。

## 后续聊天翻译接入

WhatsApp / Telegram：

- 通过 Electron `webview` 注入脚本。
- 中文输入框内容调用 `translateWithDeepSeek`。
- 翻译结果写入原生输入框。
- 监听消息气泡并对英文内容调用翻译。

Signal：

- 不复用微软商店 Signal。
- 使用独立 Signal Desktop 运行环境。
- 每个 Signal 多开使用独立 `SignalInstances/Signal-<id>` 数据目录。
- 聊天翻译需要 Signal 子进程通信通道，例如 IPC 或 WebSocket。
