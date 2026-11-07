# 会话存档：2026-11-07

存档时间：2026-11-07T19:42:52.749Z。按用户要求保存本地 Git，不推送远端。

## 定稿状态

存档：[2026-11-07 会话存档](SESSION_ARCHIVE_2026-11-07.md)；前次：[2026-11-06 会话存档](SESSION_ARCHIVE_2026-11-06.md)。

## Git 与项目边界

- 分支：`checkpoint/pre-github-1.6.10.8`。用户要求存档和本地 Git；先前暂停已由本次明确要求恢复。未推送远端。
- 翻译器源码提交：`c0340bd`（37 文件）。独立筛选器与技能提交：`1bcebeb`（23 文件）。本次文档及忽略规则另一个提交，见 Git 最新记录。
- **号码筛选保持独立，不能内置皮卡丘或读取、复用其业务账号。** 筛选器仅在 `apps/whatsapp-number-filter/`，技能/查询引擎在 `.agents/skills/whatsapp-number-filter/`。翻译器 `src/`、`electron/`、根依赖及主打包入口无筛选器引用；隔离测试通过。
- 本地账号资料、导入导出号码、诊断日志、截图、安装包均未提交；保留原文件并由忽略规则排除。没有自动安装、重启电脑或关闭用户窗口。

## 翻译器当前源码与 UI

- 源码版本 **1.16.25**。包含逐平台 Enter/连续空格翻译的手动输入设置、Telegram 双空格重发修复、Signal 中文拦截后发送状态恢复及回车翻译兜底、安卓切联系人误锁修复。
- 主页应用列表名称固定为“打新增”。原先卡片沿用安卓平台标签，实际不是随最后页面动态改名。只改入口标签，点击仍恢复最后选中的安卓或苹果页面，新增多开仍可选择类型。
- 业务页左侧从主页到最底部打新增的整组按钮/图标/名称：先增加 30px，再按用户要求上移 15px；**最终相对原始位置下移 15px**，CSS 统一 `translate: 0 20px`（原来 5px）。按钮间距及原有独立 transform 保留，展开/折叠均生效。
- 最新完整构建、主页检查、侧栏折叠检查、真实四主题 Vue 安卓/苹果入口恢复回归通过。同步修正折叠检查中“三应用入口”和已移除底部自定义入口的过时断言。
- 已交付安装包：`release/1.16.25-send-recovery/pikaqiufanyiqi-1.16.25-Setup.exe`，283762890 字节，SHA256 `F12BBA83A1D467974E66D3E4A547ABDCA2F34F72BD91AD8AEBC3F7E1565BAC80`。**这是此前交付包，不含其后“打新增”固定名称及侧栏最终位置修改**；这些修改已在源码/开发构建中，未重新打包。

## 重启后优先排查：本机 Signal 中文回车不翻译

- 用户反馈本机最新安装版 Signal 输入中文回车无法翻译，其他电脑正常。用户更正表达为“**完成存档和本地 Git 后，再重启本机以排除问题**”，不是已排除或已解决；不能记成已经重启。
- 用户怀疑苹果 7080 短信工作台后台影响，目前无证据确认因果。重启会同时重置翻译器、Signal、控制通道及其他后台进程；即使恢复也不能直接归因于苹果后台。
- 建议重启后先只启动安装版皮卡丘，暂不开开发版和苹果工作台；确认 Signal 输入设置包含回车翻译，测试中文回车。若仍异常记录时间并保留新日志，继续查当前故障；不要删多开、清数据或重扫。
- 已修复的历史 Signal canSendRef 锁死有日志和回归依据，但不能直接认为本机这次现象一定同因或已修复。原 WhatsApp 偶发中文直接发出根因仍未复现定位；语音翻译入口验收、Signal 粘贴延迟现象仍未完成。

## 独立 Whatsapp号码筛选 0.0.1

- 正式包：`release/whatsapp-number-filter/0.0.1-release/Whatsapp-Number-Filter-0.0.1-Setup.exe`，99786131 字节，SHA256 `B023289C17D2568D5C6AAA9D93E6CEA37215914948318B9317E194DB307EED74`。只交付此目录；其他 0.0.1 / login-fixed / final 子目录是排查过程未通过最终验证的旧尝试。
- 功能：独立扫码登录、TXT 每行一个含国家区号的号码、归一化/去重/无效行统计、最多 6 个在途查询、限流/超时停止、进度与比例，分别导出已注册/未注册/未确认/统计四份 TXT。不会添加云端联系人或自动发消息；仍会将号码提交 WhatsApp 服务器查询，不承诺无封号风险。
- 独立账号数据 `%APPDATA%/WhatsappNumberFilter`，Session `persist:whatsapp-number-filter`，appId `com.pikachu.whatsappnumberfilter`；构建和安装无需启动皮卡丘。`apps/whatsapp-number-filter/AGENTS.md` 与 README 记录维护边界。
- 已修复真实登录卡住：仅为 WhatsApp HTTPS 原点放行 persistent-storage；Session 与页面 UA 一致，避免后台 Service Worker HTTP400。修复后实际观察 loggedIn=true、serviceWorker=true，用户确认“可以正常使用了”。主 UI 用白名单 `app://number-filter/`，解决硬化包 file:// 读取 ASAR 页失败，保持安全 fuses。
- 右侧紧凑无上下滚动，四统计同排；1000×600、1000×680、1280×850 界面验证提示与导出按钮完整可见。固定醒目黄色提示原文：**请勿使用正在用的业务Whatsapp，请单独注册一个专门用于筛选，防止封号导致客户丢失。**
- 当前独立窗口曾仅刷新本地功能区，保留 1000/1000 已完成结果及登录；不操作其账号。重启后历史 PID 和 exec session 均应视为失效，不按旧 PID 操作进程。
- 13 项隔离/引擎/TXT 本地测试通过；实际离线 Electron UI/IPC/存储/三尺寸回归通过；正式包 11 文件逐字节核对、无多余依赖或账号资料、安全设置及独立临时目录隐藏启动通过（同目录 verification.json）。未确认用户执行安装。

## 技能与 Telegram 状态

- 项目技能 `.agents/skills/whatsapp-number-filter/SKILL.md`，显示名称“Whatsapp号码筛选”，已可发现、格式校验通过。气泡调试能力仅在用户明确要求时使用，不能自动连接业务账号。
- 最初两个气泡 1000+505=1505 条无重复，1489 已注册、16 未注册、98.94%；原始 JSON/CSV 留在本机 `.tmp/`，不写进源码或安装包。后续独立程序实际完成过一批 1000 条；两次数据不要混用。
- **Telegram 号码筛选未实现，用户明确要求先停；继续保持停止。** 只讨论过官方逐号查询每 3 秒最多一次，以及更快批量导入联系人路线；批量方式会写云端通讯录，隐私设置可令已注册号码不返回，不能把未返回当未注册，也没有实测速度。不得自行开发、验证或导入联系人。

## 存档前接续记录（历史快照）

以下完整保留存档前的工作记录，其中“正在修复/正在打包/尚未提交”等为历史进度；当前结论以上方定稿状态及 SESSION_NOTES.md 为准。

# 当前接续记录

## 当前工作：独立 Whatsapp号码筛选（2026-11-07）

**最终交付已完成：** `release/whatsapp-number-filter/0.0.1-release/Whatsapp-Number-Filter-0.0.1-Setup.exe`，99786131 字节，SHA256 `B023289C17D2568D5C6AAA9D93E6CEA37215914948318B9317E194DB307EED74`。目录内 `verification.json` 记录 11 个包内文件与 staging 逐字节一致、无其他依赖/账号资料、Electron fuses、隐藏的独立用户目录启动、真实 preload 桥及 TXT 按钮检查均通过。仅使用这个 release 子目录交付；旧 `0.0.1`、`0.0.1-login-fixed`、`0.0.1-final` 均为未通过最终验证的历史尝试，不发给用户。未执行安装、未提交/推送。

打包检查查出 file:// 在当前硬化包中读取 ASAR 页面 ERR_FILE_NOT_FOUND，已改为受限 `app://number-filter/index.html` 资源协议，仅白名单 UI 文件可访问，默认会话与 WhatsApp 会话 UA 均为 ASCII Chrome UA；未放宽 fuses。离线真实 UI/IPC/TXT/三尺寸无滚动回归再次通过，最终包隔离启动通过。当前用户已登录的源程序仍用此前的 file UI 实例，不为打包检查重启它；其右侧已刷新到最新紧凑设计且结果保留。

最新进度：登录问题已修复并实测恢复，用户确认“可以正常使用了”。关键修复包括 WhatsApp 原点 `persistent-storage` 放行，以及 **waSession.setUserAgent 与页面 setUserAgent 一致**，防止后台 Service Worker 仍使用带程序名的默认 UA；修复后只读确认 loggedIn=true、serviceWorker=true。独立窗口 PID 记录 `.tmp/wnf-live.pid`（最近 8584），启动 exec session 1546；不要关闭用户正在用的窗口。

用户随后要求右侧紧凑、没有上下滚动条，提示必须使用原文且醒目：**请勿使用正在用的业务Whatsapp，请单独注册一个专门用于筛选，防止封号导致客户丢失。** 已新增 `compact.css`，黄色警示框/图标/加粗字，四项统计同排，底部导出按钮固定可见；1000×600、1000×680、1280×850 的实际 Electron UI 检查全部无滚动、无按钮/提示裁切。报告 `.tmp/whatsapp-number-filter-smoke-1794077063502/verification.json`。当前独立窗口仅刷新本地功能区，前后均保留 checked=1000/total=1000、running=false、WhatsApp 已登录；未重载 WhatsApp 或丢失进度。右侧截图 `.tmp/wnf-compact-panel.png`。旧 `0.0.1-login-fixed` 中发现打包器向上收集了翻译器根依赖，严格校验已拦截，未交付；添加 `!node_modules{,/**/*}`，正在生成并验证 `release/whatsapp-number-filter/0.0.1-final/`，只有该新包验证通过后才能交付。

Telegram：用户问能否快速筛选，强调最快速度，目前**仅讨论方案，未实现或实测 Telegram 筛选**。官方 contacts.resolvePhone 要求每 3 秒最多一次，这只针对单号接口；contacts.importContacts 可批量，但会写入账号的云端联系人，隐私设置可使已注册号码不返回，不能把未返回当未注册。已向用户说明优先小批验证批量路线/去重缓存/遵守限流，TXT 分类为确认已注册、无法确认、未完成；不能承诺具体吞吐或绕过限制。不得擅自使用皮卡丘业务 Telegram 账号做验证。

用户先要求将已验证的号码统计固化为项目 Codex 技能，已创建 `.agents/skills/whatsapp-number-filter/`，显示名称“Whatsapp号码筛选”，官方技能格式校验通过，已被技能目录发现。后要求独立 Windows 安装包，最终输入输出均为 TXT，不读气泡；项目源码 `apps/whatsapp-number-filter/`，版本 0.0.1，独立数据目录 `%APPDATA%/WhatsappNumberFilter`，不改变皮卡丘 1.16.25。用户特别确认皮卡丘里的都是业务账号，因此**不内置、不复用业务账号**，只用独立筛选账号；界面应明确封号风险，不承诺安全查询频率。不能擅自回到内置方案。

原开发版两个气泡完整展开，1000+505=1505 条且无重复；实测同页面 phone-link `usyncContactCached().getOrRun(canonicalPhone)` 查询 1489 已注册、16 未注册、98.94%，无未知，约 86 秒。页面正反样本菜单核对通过，明细 `.tmp/whatsapp-number-audit-2026-11-06.json/.csv`。这些历史数据不写入技能或安装包，不能冒充新独立程序实测结果。

独立程序已实现扫码窗口、TXT 导入/编码处理/归一化去重/无效行、最多 6 个在途查询、限流/超时停止、进度及占比、四份 TXT 导出。10 项本地测试及真实 Electron 离线 UI/IPC/TXT 测试通过；**真实扫码仍在修复，不能称已验收**。用户看到扫码后“消息正在下载”长期卡住；查实 persistent-storage 被一刀切权限策略拒绝，隔离 Chromium 复现 denied 时 bucket.persisted=false，放行后 true；已仅为 WhatsApp HTTPS 原点放行该权限，并补实际存储回归和同步阶段提示。接着发现 `sw.js` HTTP400、Socket UNLAUNCHED，页面 UA 已清理但 Session/后台 UA 未统一；最新正在补 waSession.setUserAgent 与页面相同 UA，以及后台 Service Worker 真正注册的离线回归，尚待运行。此前生成 `release/whatsapp-number-filter/0.0.1/` 包不含最新修复，未验收，不作为最终交付。新包需独立新目录避免覆盖，`WNF_BUILD_OUTPUT` 支持 release/whatsapp-number-filter 子目录，`verify-package.cjs` 尚待验证。未提交/推送 Git。

独立实时测试窗口最近 PID 写于 `.tmp/wnf-live.pid`（上次 13052），本机 CDP 9340，保留用户刚扫码的原独立资料，不清空/换目录/重扫。启动应使用 Node 等待 Electron 子进程并保留 exec session；一次 detached 启动退出，不能误认窗口仍运行。`.tmp/wnf-login-diagnostics.cjs` 和 `wnf-watch-login.cjs` 是当前只读诊断；后者会误 require 不存在的 WAWebAppState 生成额外日志，需区分。不要操作皮卡丘业务窗口。用户在意 UI，已展示真实窗口截图 `.tmp/wnf-current-ui.png`，先前离线测试截图不含原生子视图且是假数据，已明确更正。

## 最新交付：1.16.25（2026-11-06）

用户要求打包 1.16.25，已完成，路径 `release/1.16.25-send-recovery/pikaqiufanyiqi-1.16.25-Setup.exe`，283762890 字节，SHA256 `F12BBA83A1D467974E66D3E4A547ABDCA2F34F72BD91AD8AEBC3F7E1565BAC80`。源码/package/lock/UI/安装器版本均为 1.16.25。包含下文 Signal 中文拒绝后恢复发送及原生回车翻译兜底、安卓切联系人完整性校验误锁修复，并保留输入设置与手动保存。下文“尚未打包”是历史状态，现已完成打包。

版本合同、Signal 原生发送恢复及安卓八场景回归通过；生产类型检查/构建/源码安全门通过。包内七项 UI/主进程/preload 文件与当前构建逐字节一致；确认原生 Signal 新守卫与后置中文拦截仍在，原生 app.asar 与 staging 一致（SHA256 `61D91A7BA0F92AA117C1BE6C7A56BE1758AE7978E809A018231787CD0247C81E`）。完整包安全门及临时独立用户目录启动通过，记录于目录内 `current-build-verification.json`。未发送真实消息、未执行安装、未提交或推送 Git；旧 0.0.1/1.16.24 包保留。真实账号故障是否完全消除仍需用户验收，最初中文回车漏接的具体诱因仍未定位。

本次存档：[2026-11-06 会话存档](SESSION_ARCHIVE_2026-11-06.md)。前次：[2026-11-04 会话存档](SESSION_ARCHIVE_2026-11-04.md)。

## 存档后追加：Signal 中文拦截后无法再发送

用户提供根目录 `debuglog.txt` 和 `debuglog1`；覆盖安装 1.16.23、删除多开重新扫码、再回退 1.16.18 后仍发生“中文回车不翻译 / 翻成英文或粘贴英文再回车也无法发送”。新日志 2026-11-07T00:42:14Z 先记录中文提交被拒（长度 5），随后连续多次 `Not submitting message - cannot send right now`。实际 `CompositionInput.submit` 回归复现：先关闭 canSendRef，CompositionArea 异步发送入口返回已接受，但后续中文守卫直接拒绝，不执行正常 reset，导致 canSendRef 一直 false。最初“DOM 英文、Quill 草稿仍中文”的怀疑未在真实 Quill 隔离测试复现，不能继续将其当确定根因。

已只读比对本机 1.16.18、1.16.18-fixed、1.16.23、1.16.24 包内 Signal app.asar，均为 8.18.0、SHA256 `3AF1C51A1A891FE247782FF89B248AAFFC220A1FC825DF2B147FB776F65D9C9E`，字节完全相同；中文拦截及发送标记逻辑也相同。因此这条故障路径不是 1.16.24 新增空格功能或这几次打包改变 Signal 核心而引入。别的机器可能未触发中文穿过前置翻译监听的路径，第一回车漏接的具体输入法/焦点/时序诱因仍未逐次定位；不要直接归咎老旧电脑或账号。无需为此再删多开/重扫，升级 GitHub 最新官方 Signal 也不能代替本修复。

已新增原生补丁 `0025-maoyi-chinese-submit-retry-recovery.patch`：在占用发送标记前拒绝中文，保留重试状态，避免触发后置通用错误/Debug Log toast；发出绑定 conversationId/text 的本地 DOM 事件 `df-signal-chinese-submit-blocked`。翻译器监听版本升级 `2026-11-06-signal-native-submit-recovery-v25`，校验当前会话和实时草稿后接回原翻译队列；仅空格设置不被原生回车兜底绕过，不自动发送。后置中文守卫、已接受发送的防重复、联系人/草稿校验继续保留。`tools/test-signal-submit-recovery.cjs` 直接执行原生回调，旧代码先中文后英文失败，修复后中文/混合/扩展汉字拒绝后均可重试英文，重复提交仍受控；Signal 隔离测试覆盖原生事件三模式/过期会话与草稿/实际 Quill 英文回填，通过。

重新原生构建时查到历史 0008/0016 “去GPT”文案补丁的文件哈希未同步，以及已在准备源码中的刷新错误提示绑定未入系列。已审阅历史 Git 差异，校正两项哈希，新增 `0026-maoyi-preserve-existing-refresh-error-wiring.patch` 保留已有绑定；全部 26 补丁在官方参考源的 58 个受影响文件干净重放，结果与准备源码完全一致。新的严格补丁集合 SHA256：`66FD642BEDA089526EBCBA83AAD4B602A36236A983F6FD7C57D18084A2CD4692`，主进程/共享合同/构建恢复工具及测试批准值同步更新，没有跳过校验。使用本机固定 Node 24.15.0 / pnpm 11.5.2 / 已验哈希 Electron 42.3.0 离线资源完成 Signal 8.18.0 全量构建。新 app.asar SHA256 `A1ED8BFDE19883BBEE3024A7EAE9857E8E28BAB17FDB628CEFCB8922B9BD5186`，Signal.exe SHA256 `012A90791C5F52574130C03D93111C333C0B0C8292CB26E9FBF8B228E7CD99F7`；源码产物/兼容性/恢复合同/过渡状态检查、翻译器构建与安全门通过。开发运行时已同步到 `.runtime/signal-desktop`，旧运行时备份 `.tmp/runtime-backups/signal-desktop-before-dev-sync-2026-11-07T01-17-41-335Z`，同步检查通过。**尚未重新打包完整翻译器，已交付 1.16.24/0.0.1 包仍是旧核心；不能称用户安装版已修复。** 没有操作真实账号、发送消息、重扫登录、提交或推送 Git。日志和版本比较报告仅用于排查，不混入交付包。

## 存档后追加：安卓发送后切联系人误锁

用户在“打新增”的安卓页面看到“发送内容完整性校验失败，请立即设置锁屏密码”，并确认发完短信有时会切换联系人。查实原 `verifySentMessageIntegrity()` 只比较发送前后的页面消息 key，没有绑定原账号/联系人；隔离复现“切换后将新会话历史己方消息当新发送消息而误锁”。已给普通及敏感发送传入发送时会话签名，新增 OpenSMS `sent-integrity-scan` 在同一页面执行内校验原账号/联系人并取快照，最终锁定前再核对一次；切会话或上下文不可用就停止旧检查，原会话真实不一致仍触发保护。OpenSMS 运行时升级 `2026-11-06-opensms-sent-integrity-v13`。新增 `tools/test-opensms-sent-integrity.cjs`，旧代码在首轮切联系人用例误锁，修复后八场景通过；真实模拟安卓页面快照隔离及原有 OpenSMS 完整回归通过，生产构建、`test-send-integrity-rendering` 与源码安全门通过。同步了旧 OpenSMS 测试对“打新增”默认多开名称的过时断言为现有“安卓”，不改产品命名。**目前仅源码完成，已发布的 1.16.24/0.0.1 包都不含此修复；尚未重新打包，未提交或推送。** 没有操作真实手机或发送消息；用户遇到的每次提示是否同因仍未逐次确认。

## 当前交付与源码

- 最新正常版本与源码均为 **1.16.24**。安装包：`release/1.16.24-input-settings/pikaqiufanyiqi-1.16.24-Setup.exe`，283762447 字节，SHA256 `8152CE2BB867BC528DCB3E1A7711933333C2C5AB59EFB7427C4AFBC6C11B49B2`。
- 用户先要求打包 0.0.1，后要求继续正常打包。0.0.1 测试包保留在 `release/0.0.1-input-settings/`，正式 1.16.24 包已独立生成，不是只恢复源码版本。
- 两包均通过源码安全门、包内文件逐项核对和临时目录隔离启动；各目录 `current-build-verification.json` 含 SHA256、匹配列表和启动核验。沿用原授权套件，未清空旧 release。
- 已打开 1.16.24 安装界面并核实窗口；**未确认用户完成安装，不要说已安装。**

## 输入设置最终行为

- 顶部护眼模式左侧“输入设置”键盘/齿轮图标，点击打开四主题弹窗。WA/TG/Signal 各选回车翻译、连续两次及以上空格翻译、或两者（默认）。保留原回车翻译，尤其 Signal。
- 仅空格模式：中文 Enter 只拦截，英文译文填回后 Enter 走原发送流程；敏感确认、回译和发送授权保留。
- **显式保存**：右下角保存在关闭左边；未保存选择不应用。`AppConfig.inputTriggerSettings` 持久化，保存失败保留旧设置。不要恢复自动保存。
- 选项白底黑字，44px 高度及零上下 padding；提示黄色、15px 加粗、深色底框。最终文案：“提示：电脑配置较旧、经常卡顿时，建议选择空格翻译，先确认英文译文再按回车发送，更保险。”
- 真实 Vue + preload IPC 已复现并修复响应式 Proxy 克隆错误：完整 JSON 配置快照后传 IPC，沿用写入队列。
- TG K 普通 input 重发会清空旧双空格计数，已隔离复现并修复；仅在非空格文本不变时保留计数，真实编辑/粘贴/删除/输入法等仍重置。WA 用户反馈双空格可用；TG 修复后的真实账号效果尚未确认。
- 当前守卫：preload `2026-11-05-web-telegram-space-input-v6`，TG 页面 `2026-11-05-telegram-input-settings-v61`，Signal `2026-11-05-signal-input-settings-v24`。preload 更新需刷新聊天页或重启；主进程配置支持需重启。

## 验证与未解决项

- 已通过输入设置真实 IPC/手动保存/失败回退/四主题/小窗口、WA/TG 物理按键三模式及 TG 重发事件、Signal 原回车和双空格/三模式、Telegram 页面发送流程、相关 Enter/草稿/换行/媒体说明守卫、版本检查、生产构建和源码/包安全门。没有发送真实消息。
- **WA 原始偶发中文直接发出仍未复现、未定位根因**；高负载、窗口频繁缩放只是待查诱因，不能把双空格功能说成根因修复。
- WA 语音翻译入口未实际验收；Signal 粘贴延迟到切换联系人后才显示的完整现象仍未复现；苹果图片素材不支持工作台附件。
- 苹果工作台 HMAC 凭据位于 `%LOCALAPPDATA%/PikachuSmsBridge/workspace-access.key`，更新不覆盖；不操作真实手机服务或发送消息。已有签名访问/安卓显示名/苹果文字素材导出能力继续保留。
- 用户偏好复用既有逻辑，减少无关改造；不擅自调整轮询/守卫安装频率、缓存查询或翻译并发。打开文件夹必须使用可见窗口并核实路径。

## 工作区与 Git

本次存档仅写会话文档，未提交或推送。最新已提交为 `7f9be06`（1.16.23）；当前分支 `checkpoint/pre-github-1.6.10.8`。1.16.24 源码/测试/版本变更仍在工作区。新文件 `src/input-settings.ts`、`tools/test-input-settings.cjs` 属于本轮实现；已有 `exports/`、`tmp-android-contacts.png` 保留，不当成待清理产物。包、签名和账号数据留在本机。
