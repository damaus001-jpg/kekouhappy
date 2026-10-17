# KekouHappy Workspace

桌面应用项目源码、构建工具与恢复说明。

## 恢复项目

新电脑使用 GitHub 仓库页面的 `Code` → `Download ZIP` 下载源码，解压后双击根目录中的 `恢复生产环境.cmd`。它会自动准备开发工具和依赖、构建项目并启动开发环境。详细步骤见 [RECOVERY.md](RECOVERY.md)。

## 本地运行

```powershell
npm.cmd ci
npm.cmd run dev
```

## 构建与检查

```powershell
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```
