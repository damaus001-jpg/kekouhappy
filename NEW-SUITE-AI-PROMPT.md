# 给 Codex 或其他编程 AI 的全新套装提示词

把下面代码块完整复制给在新电脑上工作的 Codex 或其他编程 AI：

```text
你正在公开仓库 damaus001-jpg/kekouhappy 的全新 ZIP 恢复目录中工作。目标是验证或生成一个全新的 maoyi 套装，不恢复、不复用任何既有套装。

固定边界：
- 应用身份必须保持 com.maoyi.translator，产品名和数据目录必须保持 maoyi。
- 必须保留玫瑰粉、高端金、慕容紫、晴水蓝四套主题。
- 当前正式提示词来源只能是 config/translation-prompts.default.json 和 config/smart-reply-prompt.default.txt；先用 config/prompt-sources.manifest.json 验证精确内容哈希。
- GitHub 中没有 DeepSeek/API 密钥。不得寻找、猜测、生成、输出或提交真实密钥。
- 不读取、不恢复、不复用任何旧套装 ID、私钥、台账、授权文件或客户身份。
- 不读取或提交客户数据、机器码、登录状态、Cookie、聊天数据、Signal 实例、翻译缓存、日志、安装包或交付目录。
- .package-secrets、.package-staging、.runtime、release 和相邻 taozhuang 输出必须保持未跟踪。
- .toolchains、.pnpm-store-complete 和 .tmp 只允许作为本机恢复输入，必须保持未跟踪。
- 唯一官方恢复来源是打开 https://github.com/damaus001-jpg/kekouhappy 后选择 Code → Download ZIP；不得向用户提供其他项目获取方式。
- 不改写 Git 历史，不强推。

只做验证时：
1. 阅读 RECOVERY.md、NEW-SUITE-GUIDE.md、github.md 和 config/prompt-sources.manifest.json。
2. 在用户允许安装缺失系统工具和联网下载依赖后，运行 tools/restore-production-environment.ps1 -InstallMissingSystemTools；不要使用 -SkipUiAcceptance。
3. 检查 .tmp/production-environment-restore-report.json 的 status 必须为 ready、sourceMode 必须为 github-download-zip，suiteIdConsumed 和 installerGenerated 必须均为 false。
4. 报告固定工具链、Signal 构建与同步、提示词哈希、全新测试 ID、三组签名身份、客户端无私钥身份、maoyi 身份、四套主题和两个真实窗口验收是否全部通过。
5. 不运行 suite:create 或 suite:package，不消费正式 ID，不生成安装包。

只有用户随后明确要求正式打包，并明确提供一个未使用的三位套装序号时，才可以：
1. 按 NEW-SUITE-GUIDE.md 准备并验证 Signal 8.18.0 运行时。
2. 不要预先运行 suite:create。
3. 设置 MAOYI_SUITE_SEQUENCE 后运行 npm.cmd run suite:package。
4. 无论成功或失败，都把该次九位套装 ID 视为永久消耗，不得回收。
5. 运行规定测试并执行真实 UI 人工验收。
6. 不提交、不推送 .package-secrets、台账、私钥、安装包或 taozhuang 目录。

除非用户明确授权提交或推送，否则不要提交或推送任何修改。
```
