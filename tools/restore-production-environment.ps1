[CmdletBinding()]
param(
  [switch]$InstallMissingSystemTools,
  [switch]$SkipUiAcceptance
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ToolchainRoot = Join-Path $ProjectRoot '.toolchains'
$TemporaryRoot = Join-Path $ProjectRoot '.tmp'
$ReportPath = Join-Path $TemporaryRoot 'production-environment-restore-report.json'
$BaselinePath = Join-Path $ProjectRoot 'signal-source\baselines\v8.18.0.json'

$NodeVersion = '24.15.0'
$NodeArchiveName = "node-v$NodeVersion-win-x64.zip"
$NodeArchiveSha256 = 'CC5149EABD53779CE1E7BDC5401643622D0C7E6800ADE18928A767E940BB0E62'
$NodeDownloadUri = "https://nodejs.org/dist/v$NodeVersion/$NodeArchiveName"
$PnpmVersion = '11.5.2'
$SignalVersion = '8.18.0'
$SignalPatchSetSha256 = '38AF0DA1AEC1CEC40C44173F53DC68E6C835F0A94F974A8A8D2824B5FC3B43FE'

$Report = [ordered]@{
  schemaVersion = 1
  status = 'running'
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  completedAt = $null
  projectRoot = $ProjectRoot
  sourceMode = if (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git')) {
    'git-worktree'
  } else {
    'github-download-zip'
  }
  sourceRepository = 'https://github.com/baishihappy-ux/baishihappy-2'
  suiteIdConsumed = $false
  installerGenerated = $false
  uiAcceptanceSkipped = [bool]$SkipUiAcceptance
  versions = [ordered]@{}
  steps = @()
  error = $null
}

function Assert-ProjectChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $resolvedRoot = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/')
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  $rootPrefix = "$resolvedRoot$([IO.Path]::DirectorySeparatorChar)"
  if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label 必须位于项目目录内：$resolvedPath"
  }
  return $resolvedPath
}

function Save-Report {
  New-Item -ItemType Directory -Path $TemporaryRoot -Force | Out-Null
  $Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

function Add-CompletedStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Detail
  )

  $Report.steps += [ordered]@{
    name = $Name
    status = 'passed'
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    detail = $Detail
  }
  Save-Report
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) {
      $exitCode = 0
    }
    if ($exitCode -ne 0) {
      throw "$Name 失败，退出码：$exitCode"
    }
  } finally {
    Pop-Location
  }
  Add-CompletedStep -Name $Name -Detail "$FilePath $($ArgumentList -join ' ')"
}

function Find-Git {
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Git\cmd\git.exe')
  )
  return $candidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Select-Object -First 1
}

function Find-Python {
  $commands = @('python.exe', 'python3.exe')
  foreach ($name in $commands) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notmatch '\\WindowsApps\\') {
      return $command.Source
    }
  }
  $roots = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Python'),
    (Join-Path $env:ProgramFiles 'Python313'),
    (Join-Path $env:ProgramFiles 'Python312')
  )
  foreach ($root in $roots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) {
      continue
    }
    $candidate = Get-ChildItem -LiteralPath $root -Filter python.exe -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }
  return $null
}

function Test-PythonVersion {
  param([string]$PythonPath)
  if (-not $PythonPath) {
    return $false
  }
  $output = & $PythonPath --version 2>&1
  if ($LASTEXITCODE -ne 0 -or "$output" -notmatch 'Python\s+(\d+)\.(\d+)\.(\d+)') {
    return $false
  }
  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  return $major -gt 3 -or ($major -eq 3 -and $minor -ge 6)
}

function Find-VisualStudioCpp {
  $vswhereCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe')
  )
  $vswhere = $vswhereCandidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Select-Object -First 1
  if ($vswhere) {
    $installationPath = & $vswhere -latest -products '*' `
      -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
      -property installationPath
    if ($LASTEXITCODE -eq 0 -and "$installationPath".Trim()) {
      return "$installationPath".Trim()
    }
  }
  return $null
}

function Invoke-WingetInstall {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "缺少 $Name，且没有找到 winget（Windows 软件管理器）。请先安装【应用安装程序】，然后重新双击恢复入口。"
  }
  Invoke-CheckedCommand -Name "安装 $Name" -FilePath $winget.Source -ArgumentList $ArgumentList -WorkingDirectory $ProjectRoot
}

function Ensure-SystemPrerequisites {
  $gitPath = Find-Git
  $pythonPath = Find-Python
  $pythonReady = Test-PythonVersion -PythonPath $pythonPath
  $visualStudioPath = Find-VisualStudioCpp

  if ((-not $gitPath -or -not $pythonReady -or -not $visualStudioPath) -and -not $InstallMissingSystemTools) {
    $missing = @()
    if (-not $gitPath) { $missing += 'Git' }
    if (-not $pythonReady) { $missing += 'Python 3.6+' }
    if (-not $visualStudioPath) { $missing += 'Visual Studio 2022 C++' }
    throw "缺少系统工具：$($missing -join '、')。请双击【恢复生产环境.cmd】，或加参数 -InstallMissingSystemTools 重新运行。"
  }

  if (-not $gitPath) {
    Invoke-WingetInstall -Name 'Git' -ArgumentList @(
      'install', '--exact', '--id', 'Git.Git', '--silent',
      '--accept-package-agreements', '--accept-source-agreements'
    )
  }
  if (-not $pythonReady) {
    Invoke-WingetInstall -Name 'Python' -ArgumentList @(
      'install', '--exact', '--id', 'Python.Python.3.13', '--scope', 'user', '--silent',
      '--accept-package-agreements', '--accept-source-agreements'
    )
  }
  if (-not $visualStudioPath) {
    Invoke-WingetInstall -Name 'Visual Studio 2022 C++ 编译工具' -ArgumentList @(
      'install', '--exact', '--id', 'Microsoft.VisualStudio.2022.BuildTools',
      '--accept-package-agreements', '--accept-source-agreements',
      '--override',
      '--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    )
  }

  $gitPath = Find-Git
  $pythonPath = Find-Python
  $visualStudioPath = Find-VisualStudioCpp
  if (-not $gitPath -or -not (Test-PythonVersion -PythonPath $pythonPath) -or -not $visualStudioPath) {
    throw '系统工具安装完成后尚未被当前进程识别。请重启 Windows，再次双击【恢复生产环境.cmd】；已经下载的内容会继续复用。'
  }

  $env:Path = "$(Split-Path -Parent $gitPath);$(Split-Path -Parent $pythonPath);$env:Path"
  $pythonVersion = (& $pythonPath --version 2>&1).ToString().Trim()
  $Report.versions.git = (& $gitPath --version).ToString().Trim()
  $Report.versions.python = $pythonVersion
  $Report.versions.visualStudio = $visualStudioPath
  Add-CompletedStep -Name '检查系统工具' -Detail "$($Report.versions.git); $pythonVersion; $visualStudioPath"
}

function Remove-OwnedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Recursive
  )
  $resolved = Assert-ProjectChildPath -Path $Path -Label '待清理路径'
  if (-not (Test-Path -LiteralPath $resolved)) {
    return
  }
  if ($Recursive) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  } else {
    Remove-Item -LiteralPath $resolved -Force
  }
}

function Get-VerifiedFile {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $resolvedDestination = Assert-ProjectChildPath -Path $Destination -Label $Label
  New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedDestination) -Force | Out-Null
  if (Test-Path -LiteralPath $resolvedDestination -PathType Leaf) {
    $existingHash = (Get-FileHash -LiteralPath $resolvedDestination -Algorithm SHA256).Hash
    if ($existingHash -eq $ExpectedSha256) {
      Add-CompletedStep -Name "校验 $Label" -Detail "$resolvedDestination SHA-256 $existingHash"
      return $resolvedDestination
    }
    Remove-OwnedPath -Path $resolvedDestination
  }

  $partialPath = "$resolvedDestination.partial-$PID"
  Assert-ProjectChildPath -Path $partialPath -Label "$Label 临时下载" | Out-Null
  Remove-OwnedPath -Path $partialPath
  try {
    Write-Host ""
    Write-Host "==> 下载 $Label" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Uri -OutFile $partialPath -UseBasicParsing
    $downloadedHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash
    if ($downloadedHash -ne $ExpectedSha256) {
      throw "$Label 校验失败。预期 $ExpectedSha256，实际 $downloadedHash"
    }
    Move-Item -LiteralPath $partialPath -Destination $resolvedDestination
  } catch {
    Remove-OwnedPath -Path $partialPath
    throw
  }
  Add-CompletedStep -Name "下载并校验 $Label" -Detail "$resolvedDestination SHA-256 $ExpectedSha256"
  return $resolvedDestination
}

function Ensure-PortableNode {
  New-Item -ItemType Directory -Path $ToolchainRoot -Force | Out-Null
  $archivePath = Join-Path $ToolchainRoot $NodeArchiveName
  $nodeDirectory = Join-Path $ToolchainRoot "node-v$NodeVersion-win-x64"
  $nodeExe = Join-Path $nodeDirectory 'node.exe'

  Get-VerifiedFile -Uri $NodeDownloadUri -Destination $archivePath `
    -ExpectedSha256 $NodeArchiveSha256 -Label "Node.js $NodeVersion" | Out-Null

  $nodeReady = $false
  if (Test-Path -LiteralPath $nodeExe -PathType Leaf) {
    $installedVersion = (& $nodeExe --version).ToString().Trim()
    $nodeReady = $installedVersion -eq "v$NodeVersion"
  }
  if (-not $nodeReady) {
    if (Test-Path -LiteralPath $nodeDirectory) {
      Remove-OwnedPath -Path $nodeDirectory -Recursive
    }
    $staging = Join-Path $ToolchainRoot ".node-expand-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    Assert-ProjectChildPath -Path $staging -Label 'Node.js 解压目录' | Out-Null
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
      Expand-Archive -LiteralPath $archivePath -DestinationPath $staging -Force
      $expanded = Join-Path $staging "node-v$NodeVersion-win-x64"
      if (-not (Test-Path -LiteralPath (Join-Path $expanded 'node.exe') -PathType Leaf)) {
        throw 'Node.js 官方压缩包没有预期目录结构。'
      }
      Move-Item -LiteralPath $expanded -Destination $nodeDirectory
    } finally {
      Remove-OwnedPath -Path $staging -Recursive
    }
  }

  $actualVersion = (& $nodeExe --version).ToString().Trim()
  if ($actualVersion -ne "v$NodeVersion") {
    throw "便携 Node.js 版本错误：$actualVersion"
  }
  $Report.versions.node = $actualVersion
  Add-CompletedStep -Name '准备便携 Node.js' -Detail "$nodeExe $actualVersion"
  return $nodeDirectory
}

function Assert-FixedBaseline {
  if (-not (Test-Path -LiteralPath $BaselinePath -PathType Leaf)) {
    throw "缺少 Signal 基线清单：$BaselinePath"
  }
  $baseline = Get-Content -LiteralPath $BaselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    $baseline.version -ne $SignalVersion -or
    $baseline.package.node -ne $NodeVersion -or
    $baseline.package.packageManager -ne "pnpm@$PnpmVersion" -or
    $baseline.package.electron -ne '42.3.0'
  ) {
    throw 'Signal 基线版本与恢复脚本固定工具链不一致；停止恢复，禁止静默使用其他版本。'
  }
  return $baseline
}

function Ensure-PnpmShim {
  $shimDirectory = Join-Path $ToolchainRoot 'bin'
  $shimPath = Join-Path $shimDirectory 'pnpm.cmd'
  Assert-ProjectChildPath -Path $shimPath -Label 'pnpm 命令转发文件' | Out-Null
  New-Item -ItemType Directory -Path $shimDirectory -Force | Out-Null
  $content = "@echo off`r`nsetlocal`r`nset `"COREPACK_HOME=%~dp0..\corepack`"`r`nset `"COREPACK_DEFAULT_TO_LATEST=0`"`r`n`"%~dp0..\node-v$NodeVersion-win-x64\corepack.cmd`" pnpm@$PnpmVersion %*`r`n"
  [IO.File]::WriteAllText($shimPath, $content, [Text.Encoding]::ASCII)
  $env:Path = "$shimDirectory;$env:Path"
  Add-CompletedStep -Name '准备固定 pnpm 命令入口' -Detail "$shimPath -> pnpm $PnpmVersion"
}

function Reset-StaleSignalExperiment {
  param([Parameter(Mandatory = $true)]$Baseline)

  $experimentRoot = Join-Path $ProjectRoot ".tmp\signal-source\v$SignalVersion"
  if (-not (Test-Path -LiteralPath $experimentRoot -PathType Container)) {
    return
  }
  Assert-ProjectChildPath -Path $experimentRoot -Label 'Signal 实验目录' | Out-Null
  $markerPath = Join-Path $experimentRoot '.df-source-experiment.json'
  $markerMatches = $false
  if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    try {
      $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $markerMatches =
        $marker.version -eq $SignalVersion -and
        $marker.archiveSha256 -eq $Baseline.archive.sha256 -and
        $marker.patchSetSha256 -eq $SignalPatchSetSha256 -and
        $marker.node -eq $NodeVersion -and
        $marker.packageManager -eq "pnpm@$PnpmVersion"
    } catch {
      $markerMatches = $false
    }
  }
  if ($markerMatches) {
    Add-CompletedStep -Name '复用已校验的 Signal 实验树' -Detail $experimentRoot
    return
  }

  Write-Host ""
  Write-Host '==> 清理版本不匹配或中断残留的 Signal 临时实验树' -ForegroundColor Cyan
  Remove-OwnedPath -Path $experimentRoot -Recursive
  Add-CompletedStep -Name '清理失效的 Signal 临时实验树' -Detail $experimentRoot
}

function Main {
  if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
    throw '生产环境恢复脚本只支持 64 位 Windows。'
  }
  foreach ($requiredFile in @('package.json', 'package-lock.json', 'tools\signal-source-experiment.cjs')) {
    $candidate = Join-Path $ProjectRoot $requiredFile
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      throw "当前文件夹不是完整的 maoyi 仓库，缺少：$requiredFile"
    }
  }

  Save-Report
  $baseline = Assert-FixedBaseline
  Ensure-SystemPrerequisites
  $nodeDirectory = Ensure-PortableNode
  $nodeExe = Join-Path $nodeDirectory 'node.exe'
  $npmCmd = Join-Path $nodeDirectory 'npm.cmd'
  $corepackCmd = Join-Path $nodeDirectory 'corepack.cmd'
  $nodeGypScript = Join-Path $nodeDirectory 'node_modules\npm\node_modules\node-gyp\bin\node-gyp.js'

  $env:Path = "$nodeDirectory;$env:Path"
  $env:COREPACK_HOME = Join-Path $ToolchainRoot 'corepack'
  $env:npm_config_cache = Join-Path $ToolchainRoot 'npm-cache'
  $env:PNPM_CONFIG_STORE_DIR = Join-Path $ProjectRoot '.pnpm-store-complete'
  $env:ELECTRON_CACHE = Join-Path $ToolchainRoot 'electron-cache'
  $env:electron_config_cache = $env:ELECTRON_CACHE
  $env:COREPACK_ENABLE_NETWORK = '1'
  New-Item -ItemType Directory -Path $env:COREPACK_HOME -Force | Out-Null
  New-Item -ItemType Directory -Path $env:ELECTRON_CACHE -Force | Out-Null

  Invoke-CheckedCommand -Name '安装 maoyi 项目依赖' -FilePath $npmCmd `
    -ArgumentList @('ci') -WorkingDirectory $ProjectRoot
  Invoke-CheckedCommand -Name "准备 pnpm $PnpmVersion" -FilePath $corepackCmd `
    -ArgumentList @('prepare', "pnpm@$PnpmVersion", '--activate') -WorkingDirectory $ProjectRoot
  $actualPnpmVersion = (& $corepackCmd pnpm --version).ToString().Trim()
  if ($actualPnpmVersion -ne $PnpmVersion) {
    throw "pnpm 版本错误。预期 $PnpmVersion，实际 $actualPnpmVersion"
  }
  $Report.versions.pnpm = $actualPnpmVersion
  Add-CompletedStep -Name '校验 pnpm' -Detail $actualPnpmVersion
  Ensure-PnpmShim

  Invoke-CheckedCommand -Name '校验 Signal 源码归档和补丁' -FilePath $npmCmd `
    -ArgumentList @('run', 'signal-source:check:v8.18') -WorkingDirectory $ProjectRoot
  Reset-StaleSignalExperiment -Baseline $baseline
  Invoke-CheckedCommand -Name '解压并应用 Signal 改造补丁' -FilePath $npmCmd `
    -ArgumentList @('run', 'signal-source:prepare:v8.18') -WorkingDirectory $ProjectRoot

  $electronArchiveName = "electron-v$($baseline.package.electron)-win32-x64.zip"
  $electronArchiveUri = "https://github.com/electron/electron/releases/download/v$($baseline.package.electron)/$electronArchiveName"
  $electronArchivePath = Join-Path $env:ELECTRON_CACHE $electronArchiveName
  Get-VerifiedFile -Uri $electronArchiveUri -Destination $electronArchivePath `
    -ExpectedSha256 $baseline.build.electronArchiveSha256 -Label "Electron $($baseline.package.electron)" | Out-Null

  $nativeHeadersRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.electron-gyp'
  Invoke-CheckedCommand -Name '准备 Electron 原生编译头文件' -FilePath $nodeExe `
    -ArgumentList @(
      $nodeGypScript,
      'install',
      "--target=$($baseline.package.electron)",
      '--dist-url=https://electronjs.org/headers',
      "--devdir=$nativeHeadersRoot",
      '--ensure'
    ) -WorkingDirectory $ProjectRoot

  $signalSource = Join-Path $ProjectRoot ".tmp\signal-source\v$SignalVersion\Signal-Desktop-$SignalVersion"
  if (-not (Test-Path -LiteralPath (Join-Path $signalSource 'pnpm-lock.yaml') -PathType Leaf)) {
    throw "Signal 准备目录不完整：$signalSource"
  }
  Invoke-CheckedCommand -Name '联网建立 Signal 完整依赖仓库' -FilePath $corepackCmd `
    -ArgumentList @('pnpm', 'install', '--frozen-lockfile') -WorkingDirectory $signalSource

  $env:COREPACK_ENABLE_NETWORK = '0'
  Invoke-CheckedCommand -Name '离线复核 Signal 构建输入' -FilePath $npmCmd `
    -ArgumentList @('run', 'signal-source:preflight:v8.18') -WorkingDirectory $ProjectRoot
  Invoke-CheckedCommand -Name '编译改造后的 Signal' -FilePath $npmCmd `
    -ArgumentList @('run', 'signal-source:build:v8.18') -WorkingDirectory $ProjectRoot
  $signalSourceExe = Join-Path $signalSource 'release\win-unpacked\Signal.exe'
  if (-not (Test-Path -LiteralPath $signalSourceExe -PathType Leaf)) {
    throw "Signal 源码构建产物缺少可执行文件：$signalSourceExe"
  }
  $env:MAOYI_SIGNAL_SOURCE_EXE = [IO.Path]::GetFullPath($signalSourceExe)
  $env:MAOYI_SIGNAL_SOURCE_SHA256 =
    (Get-FileHash -LiteralPath $env:MAOYI_SIGNAL_SOURCE_EXE -Algorithm SHA256).Hash
  Add-CompletedStep -Name '绑定 Signal 窗口验收产物' `
    -Detail "$($env:MAOYI_SIGNAL_SOURCE_EXE) SHA-256 $($env:MAOYI_SIGNAL_SOURCE_SHA256)"
  Invoke-CheckedCommand -Name '同步 Signal 到 maoyi 运行目录' -FilePath $nodeExe `
    -ArgumentList @('tools\sync-signal-source-runtime.cjs') -WorkingDirectory $ProjectRoot

  Invoke-CheckedCommand -Name '检查新套装再生产能力' -FilePath $npmCmd `
    -ArgumentList @('run', 'test:public-reproduction') -WorkingDirectory $ProjectRoot
  Invoke-CheckedCommand -Name '运行完整安全回归' -FilePath $npmCmd `
    -ArgumentList @('run', 'test:security') -WorkingDirectory $ProjectRoot
  Invoke-CheckedCommand -Name '检查 Signal 运行时和翻译缓存' -FilePath $npmCmd `
    -ArgumentList @('run', 'test:signal-render-cache') -WorkingDirectory $ProjectRoot
  if (-not $SkipUiAcceptance) {
    Invoke-CheckedCommand -Name '打开 maoyi 和授权程序进行界面冒烟验收' -FilePath $npmCmd `
      -ArgumentList @('run', 'test:electron-smoke') -WorkingDirectory $ProjectRoot
    Invoke-CheckedCommand -Name '打开改造版 Signal 进行窗口控制验收' -FilePath $npmCmd `
      -ArgumentList @('run', 'test:signal-source-window-ui:v8.18') -WorkingDirectory $ProjectRoot
  }

  $runtimeAsar = Join-Path $ProjectRoot '.runtime\signal-desktop\resources\app.asar'
  if (-not (Test-Path -LiteralPath $runtimeAsar -PathType Leaf)) {
    throw "生产运行时缺少 Signal app.asar：$runtimeAsar"
  }
  $Report.versions.signal = $SignalVersion
  $Report.signalRuntimeSha256 = (Get-FileHash -LiteralPath $runtimeAsar -Algorithm SHA256).Hash
  $Report.status = if ($SkipUiAcceptance) { 'ready-ui-not-tested' } else { 'ready' }
  $Report.completedAt = (Get-Date).ToUniversalTime().ToString('o')
  Save-Report

  Write-Host ""
  if ($SkipUiAcceptance) {
    Write-Host '生产环境构建完成，但按参数跳过了真实窗口验收；不能记为完整验收通过。' -ForegroundColor Yellow
  } else {
    Write-Host '生产环境恢复完成，现在可以生成新套装。' -ForegroundColor Green
  }
  Write-Host "恢复报告：$ReportPath"
  Write-Host '本流程没有生成套装、没有消耗正式套装 ID、没有生成正式私钥。'
}

try {
  Main
} catch {
  $Report.status = 'failed'
  $Report.completedAt = (Get-Date).ToUniversalTime().ToString('o')
  $Report.error = $_.Exception.Message
  Save-Report
  Write-Host ""
  Write-Host "生产环境恢复失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "失败报告：$ReportPath"
  exit 1
}
