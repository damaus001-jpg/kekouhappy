param([switch]$DirectLaunch)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$normalizedRoot = $projectRoot.TrimEnd('\').ToLowerInvariant()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $rootHash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedRoot))).Replace('-', '').Substring(0, 16)
} finally {
  $sha.Dispose()
}

$mutex = New-Object System.Threading.Mutex($false, "Local\MaoyiDiagnostics-$rootHash")
$ownsMutex = $false
$exitCode = 0
try {
  try {
    $ownsMutex = $mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    # Windows released the mutex after an abnormal exit; this launch now owns it.
    $ownsMutex = $true
  }

  if (-not $ownsMutex) {
    Write-Output "Developer instance is already running."
    $exitCode = 20
  } else {
    Push-Location $projectRoot
    try {
      if (-not $DirectLaunch) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
          $exitCode = $LASTEXITCODE
        }
      }

      if ($exitCode -eq 0) {
        $env:MAOYI_DIAGNOSTICS_LAUNCH_MUTEX_HELD = '1'
        & node tools/start-translation-diagnostics.cjs
        $exitCode = $LASTEXITCODE
      }
    } finally {
      Pop-Location
    }
  }
} finally {
  if ($ownsMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}

exit $exitCode
