# 翻译接口检查：2026-10-14（洛杉矶时间）

## 结论

检查时无法确认当前 DeepSeek 翻译服务可用。使用用户提供的同一密钥，Flash 的 8 条合成请求和 PRO 的 4 条合成请求全部在约 45 秒触发超时。当前不建议仅通过切换到 PRO 解决问题。

账号鉴权与余额查询正常，官方同时报告 Flash API 部分中断。现有证据更支持上游推理服务异常，但不能仅凭这些测试完全排除账号特定限制或本机网络到推理服务的异常。没有跨账号或另一台电脑对照结果。

## 实测

所有翻译样本均为合成的日常短文本，没有读取或发送真实聊天内容。密钥没有写入本报告或诊断脚本。

| 项目 | 结果 |
| --- | --- |
| 模型列表及鉴权 | HTTP 200，约 1.1 秒，包含 deepseek-flash |
| 余额是否足以调用 | HTTP 200，is_available=true，约 1.1 秒 |
| Flash 项目生产核心函数 | 0/8 成功；中英双向、换行文本及四路并发均超时 |
| Flash 最简翻译对照 | 约 1.1 秒收到 HTTP 200 响应头，等待响应正文时于 15 秒超时 |
| PRO 项目生产核心函数 | 0/4 成功；中英双向及两路并发均超时 |

Flash 完整批次 UTC 2026-10-15 00:56:35 至 01:00:20。原始报告分别位于 `.tmp/translation-interface-check.json` 和 `.tmp/translation-pro-interface-check.json`。

生产核心测试直接提取当前 `electron/main.ts` 中翻译代码执行，使用默认翻译提示词和已构建的文本保护模块；配置读取、授权凭据提供和日志写入使用诊断适配。测试未经过完整聊天 UI，也不能替代长期可用性监测。

未观察到 HTTP 401、402 或 429。HTTP 200 响应头本身不代表已经成功返回译文。

## 官方信息

- [DeepSeek 官方故障公告](https://status.deepseek.com/incidents/7116348214287)：检查时报告网页/API 部分中断，列出 Flash API 为受影响组件。公告不能单独证明本次 PRO 超时的原因。
- [官方错误码](https://api-docs.deepseek.com/quick_start/error_codes/)：401 为鉴权失败，402 为余额不足，429 为请求限流。
- [官方余额接口](https://api-docs.deepseek.com/api/get-user-balance/)：is_available 表示余额是否足以调用。
- [官方模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)：Flash、PRO 使用同一官方基础地址，PRO 费用更高。

## 项目侧检查与修改

13 项本地检查全部通过：模型迁移、取消请求、并发队列、网页翻译恢复、Signal 实时队列、敏感字段保护、诊断日志脱敏、共享接口异常处理、英文输出规则、回译约束、提示词签名、Signal 翻译恢复和网页缺失译文补取。

修复两个测试脚本依赖已移除智能回复类型作为代码提取边界的问题：`tools/diagnose-shared-translation.cjs` 和 `tools/test-translation-english-style.mjs`。共享诊断增加实际运行瞬时连接失败恢复和最多两次重试的验证。

当前翻译使用固定 DeepSeek 官方端点，默认 deepseek-flash；支持模型配置，但没有自动切换备用模型或独立供应商的实现。本次未改变默认模型、用户授权、聊天数据或安装包。

## 备用方案建议

Flash → PRO 可作为同平台模型级备用，但应先确认 PRO 实际返回译文。更完整的服务故障备用需要另一个官方供应商，并增加有限重试、连续失败暂停、恢复探测及费用边界。对 HTTP 401/402 等鉴权和余额问题不应进行无意义的反复重试。
