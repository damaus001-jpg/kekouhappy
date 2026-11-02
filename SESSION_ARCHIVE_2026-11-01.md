# 会话存档 — 2026-11-01

## 下次继续：苹果页面气泡翻译与输入守卫

- 用户要求今天存档，明天（2026-11-02）给“苹果”页面接入气泡翻译和输入守卫，参照“安卓”（OpenSMS）的现有行为。这是后续任务，今天没有实施或打入安装包。
- 苹果页面地址为 `http://127.0.0.1:8070/`，本机访问返回 HTTP 200，标题为“皮卡丘手机群控 · 短信工作台”。安卓继续使用 `https://www.opensms.cc/#/index/chat`。
- 苹果必须沿用 OpenSMS 的指纹浏览器多开机制：独立 `ChatProfile`、`persist:chat-<id>` 会话分区和指纹配置，支持新增、重命名、移除、刷新及恢复上次选中的多开。不要改为普通 iframe。
- 开始接入前先读取苹果页面实际 DOM、会话身份和输入/发送事件，按实际结构编写平台适配，不能直接把 OpenSMS 的选择器套到苹果页面。
- 气泡翻译沿用现有翻译服务、缓存及排队机制，验证切换会话、滚动历史、刷新页面和多开隔离；避免重复插入译文、反复扫描或观察器自触发。
- 输入守卫参照安卓既有流程：中文回车先翻译，确认英文草稿后再发送；覆盖回车和发送按钮、输入法组合输入、会话切换和异步翻译竞态。守卫必须在页面具备发送能力时及时生效，不能未经验证就删除现有平台隔离。
- 验证使用隔离页面和临时配置；实际页面调试不要发送真实消息。自动构建或模拟回归不能代替真实界面的显示、会话和发送流程验收。

## 今天已完成

- 应用中心和左侧栏点击“打新增”后，先出现“安卓”“苹果”两个二级选项，分别使用安卓、苹果 SVG 图标。
- 安卓入口进入原 OpenSMS 页面。苹果作为独立 `apple` 平台，复用现有多开创建、持久化、标签、重命名、移除及刷新流程；默认命名“苹果”“苹果 2”等。
- 主进程增加苹果平台及精确来源 `http://127.0.0.1:8070` 的导航/权限判断；其他平台的原来源限制继续适用。
- 苹果目前只接入多开容器和指纹脚本。翻译器侧的气泡翻译、输入守卫、小智素材和会话导出尚未接入，不能宣称已支持。
- 修正 Signal 旧测试：窗口大小变化当前调用 `refreshSignalAfterLayoutChange()`，该函数继续调用位置同步并安排缓存译文重放。旧测试只匹配直接调用同步函数，现已改为验证当前事件绑定，并实际调用该函数检查两项行为。未因此修改 Signal 运行逻辑。

## 明天需要检查的接线位置

- `electron/shared.ts`：`Platform`、`WorkspaceApp` 及 `workspaceAppForPlatform()` 已包含 `apple`。
- `electron/main.ts`：`platformDefaults.apple`、`supportedPlatforms`、导航及权限来源判断已配置；`will-attach-webview` 对苹果目前移除聊天发送守卫 preload。接入输入守卫时要一起检查 `electron/webview-send-guard-preload.cjs`，避免首次加载存在发送保护空档。
- `src/App.vue`：`openAppEntry()`、`openAndroidWorkspace()`、`openAppleWorkspace()` 负责入口；`selectRuntimeApp()` 和 `openOpenSms(app)` 复用创建流程。
- `src/App.vue`：`handleWebviewDomReady()` 的苹果分支目前只执行 `buildFingerprintScript()` 后返回；`getRuntimeScriptExecutor()` 对苹果直接返回 `null`。这两处是翻译及输入守卫接入的关键阻断点，不能只去掉其中一处就认为接入完成。
- `src/App.vue`：小智素材、客户资料及导出有苹果排除分支；用户本次明确要求的后续范围是气泡翻译和输入守卫，其他功能若有依赖再按实际需要处理。
- 可参照 `src/opensms-runtime.ts`、现有输入翻译及发送保护流程、`electron/webview-send-guard-preload.cjs` 和 `tools/test-opensms-runtime.cjs`。

## 已交付安装包

- 应用版本仍为 **1.16.19**，沿用现有授权套装。
- 最新安装包：`release/1.16.19-android-apple/pikaqiufanyiqi-1.16.19-Setup.exe`。
- 大小：**283755795 字节**（约 270.61 MiB）。
- SHA256：`A57D3F9EAA365B67BE72F9F8F44F85433A73E87D3E74F044C303CF30E01C1D57`。
- 文件修改时间为本机 2026-11-01 22:51:08。安装包留在本机 `release`，不进入 Git；此前各版安装包保留。
- 当前安卓/苹果入口及 Signal 检查修正已包含在此包；苹果气泡翻译和输入守卫是下一次开发任务。

## 已通过的验证

- `npm.cmd run build`。
- `node tools/test-opensms-runtime.cjs`：原 OpenSMS 回归、安卓/苹果入口、四套主题、苹果独立分区和指纹记录、苹果来源限制。
- `node tools/test-opensms-area-codes.mjs`。
- `node tools/test-client-version.mjs`、`node tools/test-profile-tab-order.mjs`。
- `node tools/test-signal-window-visibility-policy.mjs`：旧检查已更新并通过。
- `node tools/security-gate.cjs`。
- `node tools/verify-packaged-output.cjs --client=release/1.16.19-android-apple`：实际产物安全检查及使用临时数据的客户端启动检查通过，未跳过启动检查。
- 包内前端 HTML/JS 和主进程与当前构建逐字节一致，包内主进程包含苹果页面地址。Windows 下读取 ASAR 多级路径时使用 `path.normalize()`，避免把路径分隔符导致的读取失败误判为文件缺失。
- `git diff --check`。

## 用户明确的操作偏好

- 用户要求打开文件夹时，必须显示可见的资源管理器窗口；不得用 `-WindowStyle Hidden` 打开后直接宣称成功。
- 本次用 `explorer.exe /select,"<安装包完整路径>"` 和可见窗口打开方式，并通过 Shell.Application 核对目标文件夹路径、窗口可见状态和已选中的安装包。Windows 拒绝置前时不能声称已切到前台；进程退出码为 0 也不代表窗口已显示。
- 用户希望沿用已有平台逻辑直接实现，减少无关改造和反复确认；状态描述必须与实际完成情况一致。

## 本地恢复

- 今天的源码、图标、测试和本档保存到本地 Git；恢复标签为 `archive-2026-11-01-android-apple`，提交号以 Git 记录为准。
- 不推送远程，不把安装包、授权密钥、账号数据或本机缓存加入 Git。
- 延续此前用户要求：Signal 聊天原文缺失问题仍暂不处理，根因尚未确认；不要将其误记为这次已修复或已证实的迁移故障。
