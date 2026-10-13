# Flash 请求排查结果（2026-10-01）

使用本机已保存的同一密钥、相同无隐私短句进行独立测试；没有修改当前 Pro 配置。诊断脚本直接请求接口，不经过项目的消息扫描、提示词、JSON 消息包装、缓存或翻译队列。

| 请求变体 | 结果 |
| --- | --- |
| Flash：仅 model、messages、关闭思考 | HTTP 200 后等待完整响应，20 秒超时 |
| Flash：增加 user_id、temperature | 同上 |
| Flash：max_tokens=128 | 同上 |
| Flash：stream=true、max_tokens=128 | 收到流数据，但 20 秒内未完成；首次数据不代表译文 |
| Flash：Chromium net.fetch 替代 Node fetch | HTTP 200 后 20 秒超时 |
| Flash：/v1/chat/completions | 同上 |
| Flash：旧名称 deepseek-v4-flash | 同上 |
| Pro：相同最简请求 | 中文结果成功，约 1.9 秒 |
| Pro：max_tokens=128 | 中文结果成功，约 4.3 秒 |

结论：在测试时段，故障在最简、符合官方规范的独立请求中仍可复现。现有结果不支持项目请求格式、原有提示词或模型名称变更是必要触发条件。还无法区分 Flash 服务端调度、账号相关路由与本机网络路径问题；不能据此声称 Flash 服务全球故障。

项目已增加单次翻译 HTTP 请求 45 秒超时，覆盖响应头和响应体读取。调用者取消信号仍有效，消息去重逻辑保留。超时不会被内部传输重试立即重复；外层队列仍保留既有有限重试。该保护释放卡住的请求，不等于修复 Flash 服务返回问题。

原始脱敏报告：`.tmp/translation-diagnostics-client/logs/format-comparison.json` 与 `format-comparison-extended.json`。测试脚本：`tools/diagnose-deepseek-format.cjs`。密钥仅解密到进程内存，不写入报告。

官方请求规范：https://api-docs.deepseek.com/api/create-chat-completion/
