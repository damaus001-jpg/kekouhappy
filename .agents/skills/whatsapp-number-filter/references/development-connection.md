# 本项目页面调试连接

默认开发版不开放 CDP；`filter.cjs targets` 连接失败不代表账号退出。已验证的入口是 `tools/start-translation-diagnostics.cjs --inspect`，打开本机 9338 端口。保留用户当前开发版数据根和登录，不连接安装版或其他账号代替目标。

1. 查看 `tools/start-translation-diagnostics.cjs` 及 `tools/start-translation-diagnostics.ps1` 当前实现。通过启动日志和进程完整路径确定本项目开发版 PID，不能只按 electron.exe 名称结束所有进程。
2. 如需重启，告知用户，为开启页面调试正常关闭明确的开发版主窗口，等待该 PID 退出；安装版、Signal 独立窗口和其他 Electron 应用不操作。GUI/进程读取按工具权限请求执行，不反复增加聊天确认。
3. 当前 `.ps1` 启动器不转发 `--inspect`。在本项目路径创建并持有它采用的相同 `Local\MaoyiDiagnostics-<根目录SHA256前16位>` 互斥锁，持锁期间设置 `MAOYI_DIAGNOSTICS_LAUNCH_MUTEX_HELD=1`，运行 `node tools/start-translation-diagnostics.cjs --inspect`。不要绕过已有实例锁另起重复数据目录实例。交互式 Electron 窗口需要可见；后台辅助 PowerShell 使用 `Start-Process -WindowStyle Hidden`。
4. 在 `http://127.0.0.1:9338/json` 中选 `type=webview`、`https://web.whatsapp.com/` 的目标；排除同域 service_worker。多个目标必须确认目标 ID。主窗口为 `app://bundle/index.html`，不要误选主窗口进行号码查询。
5. 若重启后聊天未自动恢复，用户可切回目标会话；自动操作时只点击已确认的会话行。在此构建中 `.click()` 对会话行可能无效，需要真实 CDP 鼠标事件或 pointerdown/mousedown/up/click。不要通过发送消息定位会话。

号码气泡采用虚拟化：`#main [data-id]` 可能只有空占位，滚入视区后才填充文本。Read more 使用 `[data-testid="caption-read-more-button"]`，单次只增加一段，需循环至按钮消失。不要把最初看到的 64/320 条当整个气泡。

本次实测浏览器内部模块可通过 `window.require('__debug').modulesMap` 查找；`WAWebPhoneNumberWrapperMutatorComponent.react` 的 `defaultExport` 表明 `usyncContactCached().getOrRun(canonicalPhone)` 返回的结果有 `wid` 时才生成 Chat with。源代码和菜单抽查要与当前构建一致。
