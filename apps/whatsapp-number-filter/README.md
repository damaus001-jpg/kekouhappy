# Whatsapp号码筛选（独立程序）

当前版本 `0.0.1`。本应用与皮卡丘翻译器同仓库保存，但运行、登录数据、版本和打包产物分别管理。皮卡丘翻译器仍为 `1.16.25`，不提供筛选入口。

| 内容 | 位置 |
| --- | --- |
| 独立应用源码、UI、测试与构建 | `apps/whatsapp-number-filter/` |
| Codex 技能及独立查询引擎 | `.agents/skills/whatsapp-number-filter/` |
| 独立暂存目录 | `.package-staging/whatsapp-number-filter/app/` |
| 独立安装包 | `release/whatsapp-number-filter/` |
| 独立登录数据 | `%APPDATA%/WhatsappNumberFilter` |

构建只借用仓库已安装的 Node/Electron/electron-builder 工具链；发布包不依赖皮卡丘程序，也不包含翻译器运行代码或依赖。不要把筛选器代码放进翻译器的 `src/`、`electron/` 或主程序打包入口。详细维护边界见 [AGENTS.md](AGENTS.md)。

## 验证与打包

从仓库根目录运行：

```powershell
node --test apps/whatsapp-number-filter/test.cjs apps/whatsapp-number-filter/test-isolation.cjs .agents/skills/whatsapp-number-filter/scripts/test.cjs
node apps/whatsapp-number-filter/build.cjs --stage-only
```

界面离线测试由 Electron 执行 `smoke-driver.cjs`，应清除 `ELECTRON_RUN_AS_NODE`。测试使用临时用户目录和模拟页面，覆盖真实 preload/IPC、持久化存储、TXT 分类导出和三种窗口尺寸，不使用真实账号。

输出目录必须新建，不覆盖已有包：

```powershell
$env:WNF_BUILD_OUTPUT = 'C:/xiangmu/baishihappy-2-main/release/whatsapp-number-filter/next-build'
node apps/whatsapp-number-filter/build.cjs --verify
```

`--verify` 核对包内白名单文件、独立版本、安全设置及临时资料目录中的隐藏启动。正式交付为 `release/whatsapp-number-filter/0.0.1-release/Whatsapp-Number-Filter-0.0.1-Setup.exe`，验证记录在同目录 `verification.json`。其他旧目录属于排查期间产物，不作为最终交付。

## 使用范围

TXT 每行一个含国家区号的号码；归一化后去重。分别导出已注册、未注册、未确认号码和统计结果四份 TXT。查询会提交号码给 WhatsApp 服务器，但不添加云端联系人、不自动发消息。使用专用筛选账号，不能承诺无账号限制或封禁风险。Telegram 筛选保持暂停、未实现。

账号资料、日志、导入导出号码、截图与安装包只留在本机，不提交 Git。
