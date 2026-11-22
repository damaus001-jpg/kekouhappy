# 2026-11-21 重启前交接：8070 主题联动与后台控制排查

用户要求“存档，存git”，仅本地保存，不推送。当前分支 checkpoint/pre-github-1.6.10.8，之前 HEAD b524cf5。重启后先读本文及 SESSION_NOTES.md。

## 本次已实现与交付

- 皮卡丘通过 window.pikachuWorkspaceTheme.apply({version:1,theme}) 同步苹果工作台主题。四个 ID：pink / blackGold / murongPurple / clearWaterBlue。
- App.vue 监视 activeTheme 和 profiles，向全部已挂载 apple webview 广播；dom-ready 和 did-finish-load 补发。独立模块 src/workspace-theme-runtime.ts 限制 127.0.0.1:8070 顶层页面，直接调用页面桥，不依赖手机或翻译运行时。
- 工作台方负责配色和 localStorage/storage 同步：pink #FF70B6；blackGold 撤除覆盖、精确恢复原金色；紫 #B48EAD；蓝 #4AADE8。黑底和状态语义色保留；安装器固定黑底粉色，不联动。
- 本会话曾通过 tools/test-workspace-theme.cjs、vue-tsc --noEmit、未读回归。8070 Codex 报告其隔离 Electron 联合验证通过四主题、金色还原、黑底/警告色、双窗口 storage 和重加载；这是对方报告，未连接真实后台或手机。
- 用户先尝试制作多种通知音，随后明确取消；声音及生成脚本均已清理，没有接入通知。
- 本次执行 npm.cmd run package:win 成功，成品安全检查通过。最新安装器 release/pikaqiufanyiqi-1.16.29-Setup.exe，398711367 字节。
- 本次存档重新实读 SHA256：194EDD0879743FF3C5067F8BF143D0C6D61C3925FE02FF4D1305282C4E9DB79C。此前聊天回答中给出的 140950... 哈希不正确，以本次实读为准。
- 安装器含压缩负载，未另交付 ZIP；.blockmap 是安装器附带产物。旧安装包 release/1.16.29-signal-mainline 保留，勿覆盖旧恢复标签。
- 8070 方报告其安装包 C:\xiangmu\qunkong\releases\皮卡丘手机工作台-0.1.19-安装.exe，204240426 字节，SHA256 2abbb1c29e111b15bf9425cc8931396dac609360fac3934ad32d3caa702f2766，中英文隔离安装/卸载已通过。

## 当前未解决：实际安装版菜单启动后台没有 Python 进程

用户现阶段明确要求只读排查：不要运行后台状态/start/stop 控制命令，不重启皮卡丘，不启停后台、不操作手机。恢复后继续遵守，除非用户更新授权。

- 用户转述 8070 Codex 的实机只读确认：皮卡丘 PID 19016，所有者 DESKTOP-SVG07DC\666，程序 D:\fanyiqi\maoyi\maoyi.exe，主窗口响应正常；当时没有 python.exe/pythonw.exe、8070 未监听。PID 仅为当时记录，重启后不可盲用。
- 后台目录是 D:\PikachuPhoneWorkbench，不是皮卡丘程序目录。三个文件 runtime/python.exe、iphone_batch/host_control.py、8070-host-policy.json 都存在，本会话也直接只读证实存在；policy 为 {"protocol":1,"mode":"pikachu-only"}。
- 8070 Codex 在实际账户 666 用相同 .NET API 读取 HKCU\Software\PhoneWorkbench8070 的 32/64 位视图，均有 InstallDir=D:\PikachuPhoneWorkbench、Version=0.1.19、ControlProtocol=1。
- 本会话默认 shell 身份实际是 DESKTOP-SVG07DC\CodexSandboxOffline，读不到该账户登记，且 CIM 查询进程所有者被拒。此前“后台文件缺失”和“实际运行账户注册表缺失”的结论均已撤回，不能据此继续诊断。
- 已只读审查源码调用链：showBackend8070Menu 打开菜单后调用 status；启动按钮调用 controlBackend8070('start')；preload IPC backend8070:control；main trustedHandle（授权 + assertAssistantUnlocked）进入 Backend8070Control。
- Backend8070Control 从 HKCU Registry64 发现路径，realpath 校验，检查三个文件和 policy；再读取 workspace key、签 HMAC，spawn 后台目录 runtime/python.exe，参数 iphone_batch/host_control.py start；认证通过才会进入业务控制。
- 页面菜单显示 backend8070StateText 和 backend8070Result.message，busy/MISSING_FILES/running 等会禁用启动按钮。IPC reject 会被前端统一改成“后台控制不可用，请重启客户端后重试”，原始异常信息会丢失。
- 后台 stdout JSON 受协议/动作/state/ok 校验；stderr 只统计大小未保存展示；发现/校验异常统一变 MISSING_FILES，其余异常部分被统一化。现有代码没有提供此次实际点击的诊断证据。
- 目前仅证明静态代码有绑定，不能宣称运行实例真的触发过 status/start，也不能以没有持久 Python 进程证明没有短暂启动过 Python。失败根因仍未确定，尚未取得菜单实际错误文本、实际 IPC 返回或对应日志。
- 本轮没有运行真实后台控制命令、没有修复此故障、没有改安全/授权校验。后续先只读核对安装包前端与 preload（不能仅凭主进程包含通道名称判断链路完整），以及实际点击的状态/错误证据。

## 接续与边界

- 此前曾收到来源会话 01a1ffb3-f4ae-7052-8ef1-cfe7f8b2e08d 的跨会话消息，项目 C:\xiangmu\qunkong；用户现在因沟通问题准备重启，不假设重启后工具仍可跨会话通信。
- 只修改本项目，不修改 8070 项目。不推送远端。密钥、账号数据、安装器和临时资料不提交 Git。
- 工作区根目录未跟踪 main.js 与 dist-electron/main.js 完全相同（287698 字节，SHA256 77a7808c84039554cd4869e5a81dbcc8dab979c23a75dada6cce62462f87bebe），作为本机构建证据移至 .tmp/session-20261121-workspace-handoff/main.js，不列入源码。
- 涉及 Signal 构建/集成仍先遵守 SIGNAL_UPGRADE_ACCEPTANCE.md 和 SIGNAL_CLONE_PROTECTION.md。设备绑定、早期守卫和凭据不可绕过；本机在线登录保留、长期稳定性、第二台实体设备验收仍未通过本轮验证。
