# 会话存档 — 2026-10-30

## 1.16.19 迁移进度窗口修正版

- 用户反馈点击“开始迁移”后没有显示任何进度。隔离复现确认：迁移进程已启动，进度页面已加载，但 Windows 窗口不可见，流程可能停在复制之前。
- 原因是迁移进程以 `windowsHide: true` 启动，Windows 会抑制该进程首次显示窗口。此前的隐藏窗口测试只验证页面内容，未验证实际窗口可见性。
- `electron/main.ts` 将迁移进程改为允许窗口显示；`electron/storage-migration-window.ts` 同步修复迁移结束后重新打开客户端的启动参数，并先显示窗口再等待页面脚本设置路径。没有改动 Signal 退出、数据库写入或消息保存逻辑。
- `tools/test-storage-migration-ui.cjs` 增加真实窗口生命周期回归：父进程退出前显示窗口、等待期间不复制、最小化后唤起、复制完成及 100% 进度。新增 `tools/test-packaged-storage-migration.cjs` 对实际打包客户端验证 Windows 原生窗口句柄、复制与指针切换、备份保留及正常退出，避免第二次启动或额外唤起请求掩盖首次显示失败。

## 交付产物

- 版本保持 **1.16.19**；本次未升级应用版本，也未生成新套装身份。
- 安装包：`release/1.16.19-fixed/pikaqiufanyiqi-1.16.19-Setup.exe`。
- 文件大小：**283754359 字节**。
- SHA256：`1F6F58A48F64BF5136491D73932CD150AAE22F71E118FF1433CCD9E1D0B60759`。
- 安装包生成时间为本机 2026-10-29 22:34:47，存档日期为 2026-10-30。原 `release/1.16.19` 安装包保留，但不包含此次首次显示修复；后续交付应使用 `1.16.19-fixed`。
- 安装包继续保存在本地 release 目录，不进入 Git。

## 已通过的验证及边界

- `npm.cmd run build`：生产构建通过。
- `node tools/test-storage-migration.mjs`：校验复制、原目录保留、进度、跨进程保护、重复操作拒绝、失败回滚与释放通过。
- `node tools/test-storage-migration-ui.cjs`：实际窗口显示、等待退出、最小化恢复、进度、失败反馈、preload 及管道唤起通过。
- `node tools/test-packaged-storage-migration.cjs`：真实打包客户端显示原生窗口并完成隔离测试迁移，通过。
- `node tools/security-gate.cjs`：通过。
- `MAOYI_PACKAGE_SKIP_STARTUP=1 node tools/verify-packaged-output.cjs --client=release/1.16.19-fixed`：产物安全检查通过，通用启动检查显式跳过；实际迁移进程启动由上述打包测试单独验证。
- 自动迁移测试仅使用临时数据；未安装到用户的其他电脑，未通过测试移动真实账号数据，不能以模拟测试代替全部现场验收。

## 保留事项

- 用户曾反馈 Signal 聊天原文在翻译器关闭后重新打开时缺失，并询问是否与当天数据目录迁移有关。尚未确认根因，不能把强制退出、目录迁移或数据库损坏记录为已证实原因。
- 用户明确要求暂不处理聊天原文缺失问题；本次没有实施数据恢复或修改相关保存逻辑。
- 本次依用户授权保存源码、测试与交付说明到本地 Git，并建立本地恢复标签；不推送远端。提交号和恢复标签以 Git 记录为准。
