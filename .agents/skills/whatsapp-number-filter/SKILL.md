---
name: whatsapp-number-filter
description: Whatsapp号码筛选：在本项目开发版 WhatsApp 的指定聊天气泡中展开全部“阅读更多”，快速核对号码是否显示 Chat with，统计总数、已注册数和占比，导出逐条 CSV/JSON。用于用户提供的会话号码批次筛选和统计。
---

# Whatsapp号码筛选

在用户指定的 WhatsApp 会话、指定气泡范围内统计号码。优先复用该页面点击号码时实际使用的查询方法，不逐个等待弹出菜单动画。只查询，不发送消息、添加联系人或打开新聊天。

用户已明确决定：**号码筛选保持独立程序，不内置皮卡丘，不读取或复用皮卡丘的业务账号登录资料。** 独立程序使用专用筛选账号，界面明确说明批量查询可能导致受限或封禁。不得把独立账号、限速或查询成功解释成无封号风险。下面的会话调试流程只在用户明确要求统计指定会话时使用，不自动连接业务账号执行。

独立程序的固定提示原文：“请勿使用正在用的业务Whatsapp，请单独注册一个专门用于筛选，防止封号导致客户丢失。” 使用醒目的黄色框、警示图标和加粗文字；右侧紧凑布局应在 1000×600 等常见尺寸完整显示提示与导出按钮，不需要上下滚动。维护时运行 `apps/whatsapp-number-filter/smoke-driver.cjs` 的离线 UI/IPC/TXT/布局验证；最终安装包再运行 `verify-package.cjs`。登录兼容需同时保留 WhatsApp 原点 persistent-storage 权限及 Session/页面一致的浏览器 UA，避免只修页面 UA 导致后台 Service Worker HTTP400。正式包使用受限 app:// UI 资源协议。

若用户要独立安装程序，使用本项目 `apps/whatsapp-number-filter/`：**独立程序只做 TXT 导入和 TXT 导出，不读取聊天气泡**。TXT 每行一个含国家区号的号码，归一化后去重，显示原始行数、重复/无效行数和有效号码总数；分别导出已注册、未注册、未确认及统计结果四份 TXT。共用本技能 `scripts/page.cjs` 查询引擎，安装程序使用独立登录目录。构建命令为 `node apps/whatsapp-number-filter/build.cjs`，输出独立 `release/whatsapp-number-filter/`，不改变翻译器版本或清空其他安装包。

## 连接与选定范围

从项目根目录运行，脚本需要支持全局 WebSocket 的 Node（本项目 Node 24 可用）：

```powershell
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs targets
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs inspect
```

默认连接 `http://127.0.0.1:9338`，只接受本机调试地址。有多个 WhatsApp 页面时用 `--target <target-id>` 明确选择。没有连接时阅读 [references/development-connection.md](references/development-connection.md)，保留现有登录资料，不创建测试账号代替用户当前页面。

`inspect` 仅返回气泡 ID、可见号码数、折叠状态和占位状态。根据用户指定的会话和气泡选择 ID；虚拟化会使较早的气泡成为空占位，不能当成空消息。需要时让用户把开发版切到目标会话。

```powershell
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs collect --bubbles "气泡ID1,气泡ID2"
```

`collect` 会将指定占位气泡滚入视区，多次点击各自的 Read more，直到全部展开。它只收集选定气泡；保留重复项并记录唯一号码数。核对输出的完整展开状态与每个气泡条数，不把折叠预览或聊天列表摘要当全量。气泡数量、号码及历史统计结果不可写死。

## 查询、进度与核验

```powershell
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs start
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs status
```

开始前脚本确认当前页面仍含选定气泡，检查 WhatsApp 当前组件中 `Chat with` 的实际判定确实是查询结果含 `wid`。默认最多 6 个在途查询，复用 `WAWebGetOrQueryUsyncInfoContactAction.usyncContactCached().getOrRun(canonicalPhone)`，与页面点击处理相同。先读已有组件缓存；缓存不全时，剩余部分会发起页面原有的查询，不能宣称全程只读缓存或零网络请求。

页面内部模块可能变动。若组件/方法/判定不兼容，停止该快速路径，检查当前页面实现后再适配，不套用过期模块、不把不存在的方法当成全部未注册。不要通过增加并发、重试风暴或更换账号绕过限制。超时、限流和异常计为“未确认”，不计为未注册；脚本在超时、限流或累计 12 次错误后停止派发。

每隔约 20～40 秒读取 `status`，向用户报告**实际完成数/总数**与当前结果。预计时间基于真实吞吐，不能把展开气泡、预检或排队数量说成已核对。

```powershell
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs verify
node .agents/skills/whatsapp-number-filter/scripts/filter.cjs export --out .tmp/whatsapp-number-filter/run-name
```

完成查询后 `verify` 分别抽查已注册和未注册样本（某类不存在时只核验存在的类别），真实点击原气泡中的号码，检查该组件的菜单是否含 `mi-message-on-whatsapp`。不要使用全页面第一个残留菜单作判断。不要用 Escape 关闭菜单：本项目实测会同时关闭会话；不点击 Chat with 或复制按钮。

`export` 输出 `.json` 和 UTF-8 BOM `.csv`，包含逐条结果、每气泡汇总、唯一号码数、未知数及界面抽查。默认不打印完整号码列表。报告放在已忽略的 `.tmp/`，不写入源码、技能或版本库。

若用户取消，执行 `stop`，等待在途查询结束。页面刷新会失去内存任务；重新连接后先核实状态，不能宣称任务仍继续。脚本不会自动重启或重新查询完成的批次。

## 交付口径

给出总条数、去重后号码数（有重复时）、已注册、未注册、未确认、已注册占比和明细链接；必要时加每气泡表格。默认条数口径的分母是完整输入条数，唯一号码另列，不在有重复时混用口径。存在未确认时明确结果尚不完整，不把已核对部分比例当最终比例。“已注册”指本次页面查询支持显示 Chat with，不推断号码所有人、活跃程度或可接收消息。
