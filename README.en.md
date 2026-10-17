# KekouHappy Workspace

Project source, build tools, and recovery instructions for a desktop application.

## Restore the project

On a new computer, download the source from this GitHub repository using `Code` → `Download ZIP`. Extract it and double-click `恢复生产环境.cmd` at the project root. It installs the development tools and dependencies, builds the project, and launches the development environment. See [RECOVERY.md](RECOVERY.md) for details.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev
```

## Build and checks

```powershell
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```
