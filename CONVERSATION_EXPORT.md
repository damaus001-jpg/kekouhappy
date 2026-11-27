# 会话导出

“导出会话”菜单先选择“当天会话”或“全部会话”，再选择“中文”或“英文”。小智面板和面板收起时的独立入口共用同一菜单和范围参数。当天按导出开始时的电脑本地日期筛选，全部会话沿用平台可加载历史范围；加载不完整仍在界面状态中提示，不写进文本顶部。

文件名为 `当前联系人_20261026.txt`，后缀日期使用导出开始时的本地日期，全部会话也使用相同规则。文件名中的系统禁用字符会替换。

TXT 使用 UTF-8 BOM，直接以第一天日期开始，不再包含平台、联系人、记录数、范围等顶部说明。每个日期只出现一次，单独一行；后续日期前空五行，日期后空两行。每组内保留原消息顺序及“对方：”“我方：”，消息之间空一行，不逐条重复日期或时刻。

日期读取支持平台完整消息日期、时间戳及日期分隔线；带时区的时间戳转换为电脑本地日期，数字日期顺序根据页面语言读取。全部导出中缺少可识别日期的消息归到“日期未提供”，保留消息；当天导出遇到日期无法识别时停止并提示，避免把其他日期误当成当天。缺少中文译文仍以“[暂无译文]”保留消息，收款信息排除及媒体说明保持原处理方式。

验证：生产构建、`tools/test-conversation-export.mjs`、中文缓存回归、生产序列化脚本回归、OpenSMS 集成回归及包含两级菜单四种组合的隐藏界面回归。

## 导出兼容修正（Signal 8.36.0，2026-11-26）

Signal 8.36.0 把会话面板外层类名从 `ConversationView ConversationPanel` 改为仅 `ConversationPanel`（上游 `ConversationView.dom.tsx`）。旧 scope 选择器 `.module-conversation,.ConversationView` 落空后，脚本退化为 `.CompositionArea` 的父容器 `ConversationView__composition-area`，其中没有消息列表，Signal 导出在开始阶段报“没有可读取的聊天记录或历史滚动区域”，中文/英文与当天/全部四种组合全部失败。WhatsApp、Telegram、OpenSMS、苹果走各自选择器，不受影响。

修复：Signal scope 选择器加入 `.ConversationPanel`，退化路径改为从 `.CompositionArea` 向上 `closest` 到 `.ConversationView__pane,.ConversationView,.ConversationPanel,.module-conversation`；8.18 外层同时带 `ConversationView` 类，仍命中第一组选择器，旧内核保持可导出。导出运行时测试的 Signal 夹具改为 8.36 的 `ConversationPanel / ConversationView__header / ConversationView__pane / ConversationView__timeline--container / ConversationView__composition-area` 结构，并保留 8.18 旧结构回归。

验证：完整构建、运行时回归（8.36 新结构与 8.18 旧结构、媒体日期、GIF、引用排除、联系人切换中止）、生产序列化脚本回归（从生产 bundle 提取执行）、渲染层回归（中/英、当日/全部、收款排除、暂无译文、媒体标记、日期分组）、中文导出缓存回归及安全门全部通过。用户在开发版实测 Signal 四种组合导出并保存文件全部通过。本轮随 1.16.30 安装包交付。

## 导出兼容修正

Signal 省略单条时间的媒体消息，使用消息外的原生 `time[datetime="YYYY-MM-DD"]` 日期分隔归属当天；不把引用消息中的日期作为当前消息日期，不凭后续文字消息的日期推断前一条 GIF。Signal 原生组件的 `Time` 和 `TimelineDateHeader` 结构见本机 Signal 8.18.0 参考源码。该结构已在生产脚本测试中覆盖昨天 GIF、今天首条 GIF、引用旧消息及确实无日期时继续拒绝当天筛选的场景；用户现场根因尚未直接抓取 DOM 确认。

WhatsApp 联系人读取排除引用消息及内层消息编号，兼容设备编号、头部直接或序列化编号，并跳过无效的根节点编号。仍使用稳定编号识别，不以显示名称判断同一个人；没有可靠编号时继续停止导出。普通单聊的这些兼容场景已通过隔离测试，用户实际报错会话仍需复验。

导出菜单传送到主页面 body，并以固定位置和顶层层级显示，复制所在控件的主题变量。展开和关闭状态传回主工作区；小智未打开且 Signal 浮动菜单展开时，原生 Signal 窗口右侧预留菜单区域，关闭后恢复。浮动入口两级菜单覆盖高层遮挡元素的点击测试已通过。
