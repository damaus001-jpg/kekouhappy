param([int]$TargetProcessId,[switch]$Minimize)
# Inspect or minimize only the explicitly selected isolated test process.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FilterWindowProbe {
 public delegate bool EnumProc(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
}
'@
$taskWindows=[System.Collections.Generic.List[object]]::new()
$taskCallback=[FilterWindowProbe+EnumProc]{param($taskHandle,$taskParam)
 [uint32]$taskOwnerId=0
 [void][FilterWindowProbe]::GetWindowThreadProcessId($taskHandle,[ref]$taskOwnerId)
 if($taskOwnerId -eq $TargetProcessId -and [FilterWindowProbe]::IsWindowVisible($taskHandle)){
  if($Minimize){[void][FilterWindowProbe]::ShowWindow($taskHandle,6)}
  $taskWindows.Add([pscustomobject]@{handle=$taskHandle.ToInt64();visible=[FilterWindowProbe]::IsWindowVisible($taskHandle);enabled=[FilterWindowProbe]::IsWindowEnabled($taskHandle);minimized=[FilterWindowProbe]::IsIconic($taskHandle)})
 }
 return $true
}
[void][FilterWindowProbe]::EnumWindows($taskCallback,[IntPtr]::Zero)
ConvertTo-Json -InputObject @($taskWindows.ToArray()) -Compress
