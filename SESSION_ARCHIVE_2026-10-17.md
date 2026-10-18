# 项目存档 — 2026-10-17

## 本次交付

- 修复打新增（OpenSMS）无法中文回车翻译、英文回车发送的问题。前置发送守卫等待固定标记 `2026-10-16-opensms-v1`，而页面运行时在升级时错误地写入了自身的动态版本号，导致回车和发送按钮一直被前置守卫拦截。运行时现在分离动态版本与稳定握手标记，当前运行时为 `2026-10-17-opensms-v6`。
- 改进 OpenSMS 运行时结构探针，受控记录编辑框、焦点元素和发送按钮的 DOM 标签及类名，避免记录消息正文；添加启动标记回归断言。
- 打新增与 WhatsApp 使用同一应用缓存读取、校验和译文排队流程，按平台配置/联系人隔离缓存；页面注入由各自平台运行时负责。修正缓存状态未清除导致“正在查缓存”长期残留的问题，并补充缓存命中、注入失败及已处理计数。
- 小版本号定为 `1.6.10.8`。因 Electron 包元数据使用三段版本格式，保留内部 SemVer `1.6.10`；客户端界面、Windows 文件/产品版本和安装包名称均使用 `1.6.10.8`。
- 修复 Windows 打包时使用开发签名生成提示词、与客户端授权套件不匹配的问题。客户安装包提示词现由当前客户端授权套件签名。

## 验证与产物

- `npm.cmd run package:win` 完成；源码安全门及 `verify-packaged-output.cjs` 产物安全校验通过。
- `node tools/test-client-version.mjs` 通过。
- OpenSMS 集成测试因测试环境加载外网 OpenSMS 页面失败（`ERR_FAILED`），未完成；此后用户反馈修复已解决发送问题。
- 安装包：`release/pikaqiufanyiqi-1.6.10.8-Setup.exe`，约 227 MB。
- Windows 可执行文件 FileVersion 与 ProductVersion 均为 `1.6.10.8`。

## Git / GitHub

- 当前请求建立本地 Git 恢复点；提交后记录提交号和分支。
- 尚未创建 GitHub 仓库、配置远程或推送。
- 本地授权材料与运行时生成物由 `.gitignore` 排除。根目录接口消耗截图及重复 Logo 导出文件保留本机，不放入 Git。

## WhatsApp 开发版数据库错误（已恢复）

- 用户提供根目录截图，WhatsApp Web 显示“你的浏览器上发生了数据库错误。请重新连接你的设备。”错误仅见于开发诊断版，正式安装包无此问题。
- 确认开发启动器此前把 Chromium 用户资料（包含 WhatsApp IndexedDB）放在项目 `.tmp\translation-diagnostics-client\maoyi Developer Data`；正式包则使用 AppData 独立用户资料目录。开发版旧启动日志多次出现 Chromium 磁盘缓存索引无法创建/写入，指向开发资料路径的本机存储问题。
- 已将开发诊断版资料根目录改为 `%APPDATA%\maoyi Diagnostics Client Data`，与正式包 `%APPDATA%\maoyi` 及旧开发目录隔离。首次切换时复制原有约 331 MB 开发资料，原目录完整保留；没有改动正式版资料。
- 更新 Signal 数据根目录白名单以识别新的诊断版目录；增加迁移测试，覆盖资料复制、源资料保留、目录隔离及冲突目录拒绝合并。
- 构建、迁移测试、开发运行时同步检查和 `git diff --check` 通过。新进程启动探针通过，启动后未再出现旧目录中的 Chromium 缓存索引写入错误。用户随后确认 WhatsApp 已恢复正常。
- 对应实现：`tools/translation-diagnostic-paths.cjs`、`tools/start-translation-diagnostics.cjs`、`signal-guard/df-bootstrap.cjs`；测试：`tools/test-translation-diagnostic-paths.cjs`。

## 打新增多开与移除流程

- 用户要求 OpenSMS（打新增）不再限制为单个多开。现已开放新增按钮；新窗口自动命名为“打新增”“打新增 2”等，并允许像其他平台一样重命名和移除。后端保留并发创建合并，避免连续点击产生重复记录。
- 用户发现新建但未登录的打新增窗口移除时，确认弹窗长时间留在界面。原因是界面等待 Electron 清理浏览器会话完成后才关闭；现改为确认后先关闭弹窗、从工作区移除标签，再等待后台清理，清理失败时重新读取配置保持界面状态。
- 进一步确认原分区移除函数无论是否登录，都会先调用 `clearStorageData()`、`clearCache()`，再删除对应目录。这与“每个多开独立指纹浏览器资料，移除时直接删除其分区目录”的设计不符。当前已改为关闭该分区的 WebContents、等待销毁、关闭连接并刷新存储，然后直接递归删除该 profile 的持久化目录；不再调用上述逐项清理 API。
- 仓库可查的两个提交版本里，旧实现同样包含 `clearStorageData()` 和 `clearCache()`；没有足够 Git 历史证明更早版本曾采用直接删除目录。我曾过早声称恢复了上一个版本，后已向用户更正。最终以用户明确的分区删除设计实现。
- 验证：`node tools/test-profile-tab-order.mjs` 通过；`npm.cmd run build`（Vue/TypeScript 检查、Vite、Electron TypeScript）通过；`git diff --check` 通过。OpenSMS 端到端测试曾因测试环境无法加载 `https://www.opensms.cc`（`ERR_FAILED`）未能完整结束。
- 仅完成开发构建，未打包安装包。已运行的开发板不会被源码改动自动替换，需重新加载/重启后验证。实现位于 `src/App.vue`、`electron/main.ts`；相关验证在 `tools/test-profile-tab-order.mjs`、`tools/test-opensms-runtime.cjs`。
