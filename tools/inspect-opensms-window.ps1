$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OpenSmsWindowCapture {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
'@
$inspectionRoot = Join-Path $PSScriptRoot '..\.tmp\opensms-inspection'
New-Item -ItemType Directory -Path $inspectionRoot -Force | Out-Null
$windows = Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 }
foreach ($chromeWindow in $windows) {
  $element = [System.Windows.Automation.AutomationElement]::FromHandle($chromeWindow.MainWindowHandle)
  $all = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $matched = $false
  foreach ($item in $all) {
    if ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit) {
      $valuePattern = $null
      if ($item.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
        if ($valuePattern.Current.Value -match '^(https?://)?(www\.)?opensms\.cc(?:/|$)') { $matched = $true; break }
      }
    }
  }
  if (-not $matched) { continue }
  $bounds = $element.Current.BoundingRectangle
  $records = foreach ($item in $all) {
    try {
      $rect = $item.Current.BoundingRectangle
      if ($rect.Width -le 0 -or $rect.Height -le 0 -or $item.Current.IsOffscreen) { continue }
      $control = $item.Current.ControlType.ProgrammaticName
      $name = $item.Current.Name
      [pscustomobject]@{ type=$control; class=$item.Current.ClassName; automationId=$item.Current.AutomationId; textLength=$name.Length; name=$(if ($control -match 'Button|TabItem|MenuItem') { $name.Substring(0,[Math]::Min(60,$name.Length)) } else { '' }); x=[Math]::Round($rect.X-$bounds.X); y=[Math]::Round($rect.Y-$bounds.Y); width=[Math]::Round($rect.Width); height=[Math]::Round($rect.Height) }
    } catch { }
  }
  $records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $inspectionRoot 'accessibility-layout.json') -Encoding UTF8
  $bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width,[int]$bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try { $captured = [OpenSmsWindowCapture]::PrintWindow($chromeWindow.MainWindowHandle,$hdc,2) }
  finally { $graphics.ReleaseHdc($hdc); $graphics.Dispose() }
  try { if ($captured) { $bitmap.Save((Join-Path $inspectionRoot 'chrome-window.png'),[System.Drawing.Imaging.ImageFormat]::Png) } }
  finally { $bitmap.Dispose() }
  [pscustomobject]@{ found=$true; title=$chromeWindow.MainWindowTitle; width=$bounds.Width; height=$bounds.Height; controls=$records.Count; screenshot=$captured; directory=[System.IO.Path]::GetFullPath($inspectionRoot) } | ConvertTo-Json
  exit 0
}
throw 'The currently visible Chrome tabs do not expose an opensms.cc address. No window was captured.'
