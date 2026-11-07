# 独立 WhatsApp 号码筛选器的代码边界

- 本目录是独立 Windows 应用，不是皮卡丘翻译器的功能模块。运行时代码、UI、版本和打包配置在本目录维护；查询引擎属于 `.agents/skills/whatsapp-number-filter/scripts/page.cjs`，构建时复制到独立 staging。
- 为维护筛选器，不向翻译器的 `src/`、`electron/`、根 `package.json` 或主打包配置添加筛选入口、依赖或配置字段。翻译器原有修复与筛选器改动分别提交。
- 登录目录为 `%APPDATA%/WhatsappNumberFilter`，Session 分区为 `persist:whatsapp-number-filter`。不读取、复制或复用皮卡丘业务账号的 cookie、登录资料或代理配置。
- 用户已决定不内置筛选功能；Telegram 筛选尚未实现，并已要求暂停。不要自行实现或测试 Telegram 筛选，也不要导入 Telegram 联系人。
- 保持 TXT 导入、TXT 导出。固定风险提示原文在 `index.html`，黄色警示框和紧凑无滚动布局在 `compact.css`。不要只隐藏滚动条而裁掉提示或按钮。
- 登录兼容需要同时保留 WhatsApp 原点的 `persistent-storage` 权限、Session/页面一致的浏览器 UA。主界面使用白名单 `app://number-filter/` 资源协议，保持 Electron 安全设置。
- 构建输出仅在 `release/whatsapp-number-filter/` 子目录；不清空其他 release、不覆盖旧包。独立包不能包含翻译器依赖、账号资料、日志或号码明细。
- 修改后按影响运行本目录测试；涉及界面时验证常见窗口尺寸完整显示。只读边界验证入口为 `test-isolation.cjs`，实际安装包用 `verify-package.cjs` 核对。隔离测试不使用真实账号、不发消息。
