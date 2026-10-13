# 小智加持：本地资料与辅助回复设计草案

日期：2026-10-10。状态：已实现首版开发功能，实际范围和验证见《小智加持开发版体验说明.md》。以下保留设计依据及后续待细化项。

## 用户需求

在翻译器增加“小智加持”悬浮入口，使用根目录同名图片去除外部黑底后的透明图。点击入口打开“人物资料、一周行程、案例金句”三个模块，配套现有玫瑰粉、高端金、慕容紫、晴水蓝四套主题。

人物资料来自本次整理的两个根目录文本。团队共用一个人物，各操作员分别导入本机。行程与案例包也在本机维护、由文件分发更新，不要求服务器或实时同步。照片视频主要供操作员选择发送，不提供给AI分析。辅助回复读取文字资料及素材说明，AI只生成建议，操作员决定使用。

## 页面与操作

- 悬浮入口默认位于工作区右侧中部，图标容器64×80 CSS像素，保持原图比例；支持拖动，拖动阈值6像素，距边16像素，停靠位置本机保存。提供键盘焦点和“小智加持”文字提示。
- 建议打开右侧资料抽屉，宽480像素；紧凑窗口下占可用宽度，上限640像素。打开时为聊天内容预留空间，关闭后恢复，减少遮挡发送区域。
- 顶部为标题、关闭和当前人物名称，中部三个标签页。切换主题实时更新面板颜色，人物图标保留原色。
- 未导入时显示说明、模板入口及导入按钮；导入后显示文件名、版本、时间和内容数量。
- 人物资料：基础信息、职业居住、兴趣、人生时间线、故事章节；待确认字段单列。支持搜索、复制、预览和本机编辑；AI启用需明确展示。
- 一周行程：选择周次，按日期/时区显示事件；每项包含标题、地点概况、时间、状态、说明和媒体。过期行程保留查看，不作为本周事件。
- 案例金句：按场景筛选、关键词搜索；详情包含上下文、推荐表达、语言、审核状态和媒体；支持收藏和复制。
- 媒体：图片缩略图、点击放大；视频按需本机播放，不自动播放。显示名称、备注、关联事件。第一版建议“打开所在文件夹”，操作员经聊天软件发送；一键插入附件另行适配，未视为已确认。

## 导入格式建议

- 人物：TXT、Markdown及版本化JSON；故事和信息合并为同一人物，但保留来源和待确认字段。人物带媒体时使用ZIP包。
- 行程及案例：ZIP，根部为manifest.json，媒体在media/；可附资料表模板，由导入器转换为内部结构。是否提供Excel直接导入待用户选择。
- 所有包记录schemaVersion、packageId、version、createdAt、kind。版本作为界面状态展示，不把每次导入时间插入模型公共前缀。
- 首次建议限额：人物文本256 KiB；包压缩文件不超过1 GiB、展开不超过2 GiB、2,000个条目；单张图片25 MiB，单视频250 MiB；数字待按实际素材调整。
- 导入使用校验→预览→确认→暂存→原子启用流程。取消或失败保留旧版本；ZIP必须拒绝路径穿越、符号链接、可执行文件和超限展开。仅导入模块明确允许的文本、图片及视频格式。
- 人物默认整体替换；行程按事件ID、案例按案例ID增量合并，内容哈希辅助去重；提供整包替换选项，解决删除的案例仍留在旧库中的问题。合并冲突由操作员选择。

## 数据模型建议

- Persona：id、version、name、facts、timeline、storySections、replyStyle、disclosureRules、unconfirmedFields、mediaRefs。
- ScheduleEvent：id、date、timezone、startTime、endTime、title、location、status（planned/completed/cancelled）、description、mediaRefs。时间段没有填写时不推断时刻。
- QuoteCase：id、scene、language、contextMessages、recommendedReply、tags、reviewStatus、reviewedAt、mediaRefs。质量确认与点击采用不等同。
- Media：id、relativePath、mimeType、size、sha256、caption、associatedItemId、sendAllowed；内容只在本机预览，AI可读取caption及ID。
- 每个操作员客户端一套共享人物与案例；账号、联系人记忆依平台及profile/conversation隔离，不混入其他联系人信息。

## 本机存储

正式数据建议放Electron app.getPath('userData')下的assistant-library/，包含persona、schedules、cases、media、index。正文和索引采用项目既有本机保护机制的兼容方案；大媒体保存在受控目录，启动加载摘要，按需读取内容。加密及账户隔离具体实现需评估现有许可证、本机登录和缓存接口后确定，不能在设计阶段声称已实现。

本次人设整理文件存放.runtime/assistant-design/，该路径已被.gitignore排除。真实档案、会话与资料包不得放进公共提示词、源码、Git、诊断正文或安装包。原始根目录资料保留，不移动或删除。本轮不提交、不推送、不打包。

## 辅助回复接入

固定回复规则→已确认人物摘要→有效行程文字→少量相关案例→当前聊天上下文。使用稳定序列化保持公共前缀；行程/案例内容更新会影响后续前缀命中，这是可接受的。照片视频、base64、绝对路径不进入API请求。

第一版建议本地关键词和场景检索，不增加向量API。候选案例最多3个、每个上下文最多6条；人物摘要预算约2,000 token、行程约800 token、案例约1,500 token；精确token计量方案待实现验证。没有相关案例时不强行插入。

现有智能回复最多8条英文消息、8,000字节。资料文本作为主进程侧独立上下文注入，不能塞进现有消息数组冒充聊天。当前消息采集范围不因资料导入自动扩大，完整会话采集继续单独设计。

## 层级与主题实现

现有src/App.vue及src/styles.css管理四种主题，electron/shared.ts和electron/preload.ts管理客户端接口。WhatsApp/Telegram为webview，Signal使用独立原生工作区，不能只增加z-index就假定覆盖有效。

建议沿宿主工具区放置悬浮入口，打开抽屉后调整聊天可用区域并同步Signal工作区边界；保留当前已有弹窗的原生遮挡处理路径。具体布局须在三个平台、缩放、窗口变更及锁屏状态下验证。锁屏时隐藏资料和媒体预览。

拟新增：src/components/AssistantLibraryPanel.vue、electron/assistant-library.ts、electron/assistant-library-types.ts、electron/assistant-library-import.ts、electron/assistant-library-context.ts、tools/test-assistant-library.mjs。拟修改：src/App.vue、src/styles.css、electron/main.ts、electron/preload.ts、electron/shared.ts；图片作为src/assets/xiaozhi-assistant-transparent.png接入前需确认输出质量。

## 验证计划

- 格式校验、坏包/超限包拒绝、路径安全、取消/失败保留旧版本、去重及整包替换。
- 日期/时区、过期行程、状态区分，资料冲突不进入确定事实。
- 请求只含文字，不含媒体或本机路径；资料不会串到其他联系人；敏感占位符机制保持有效。
- 类型检查及构建；四主题的空态、导入、搜索、媒体预览、紧凑窗口和拖动入口。
- WhatsApp、Telegram、Signal真实窗口下的层级、边界、焦点及锁屏手测；未手测不得声称UI已验证。

## 待确认问题

1. 身高及绿卡获批时间等人设冲突如何处理；建议确认前保持待确认。
2. 悬浮入口与右侧抽屉是否符合期望，是否偏好独立浮窗。
3. 媒体先通过文件夹发送，还是本轮需要适配一键附件插入。
4. 人物资料是否导入即参与智能回复，还是先开放本机查阅，再通过开关启用；建议显式启用已确认摘要。
5. 一周行程是否统一使用洛杉矶时区；出差事件可逐项指定时区。

首版已实现悬浮按钮、三模块导入编辑和导出、本机媒体预览及文字资料AI接入。正式团队部署、完整会话采集和一键附件插入另行处理。

## 图标处理结果

已查看根目录“小智加持.jpg”。使用内置image_gen工具执行背景提取，两次均被工具输出安全检查拒绝，错误类型moderation_blocked，未生成透明图片，也未修改原图。

最终使用的编辑指令：Remove the exterior black background of the provided image and make it transparent. Keep the foreground illustration unchanged, including its internal dark colors and outlines. Preserve the original crop. Output transparent PNG.

用户随后授权改用本地传统抠图，已通过System.Drawing进行边缘连通背景分离，生成src/assets/xiaozhi-assistant-transparent.png（896×1195，含真实Alpha透明通道）。原图保持完整，保留人物内部黑色细节和白色外边框；保持原始右侧尾巴与底部裁切。已查看棋盘背景预览，悬浮按钮尚未接入。

可重现脚本：.tmp/cutout-xiaozhi.ps1；本机预览：.tmp/xiaozhi-cutout-preview.png。
