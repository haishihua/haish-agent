param([string]$Executable = 'release/win-unpacked/Haish.exe')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PreviewWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hwnd);
}
'@
$profileDir = Join-Path $env:RUNNER_TEMP ('haish-preview-' + [Guid]::NewGuid())
$app = Start-Process -FilePath (Resolve-Path $Executable) -ArgumentList "--user-data-dir=`"$profileDir`"" -PassThru
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) { throw "Haish exited before capture: $($app.ExitCode)" }
    $hwnd = $app.MainWindowHandle
  } while ($hwnd -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline)
  if ($hwnd -eq [IntPtr]::Zero) { throw 'Haish did not open a window' }
  if ([PreviewWindow]::GetMenu($hwnd) -ne [IntPtr]::Zero) { throw 'Unexpected native menu' }
  Start-Sleep -Seconds 8
  $rect = New-Object PreviewWindow+Rect
  if (-not [PreviewWindow]::GetWindowRect($hwnd, [ref]$rect)) { throw 'Cannot measure Haish window' }
  $bitmap = [Drawing.Bitmap]::new(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
  try {
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
      $dc = $graphics.GetHdc()
      try {
        if (-not [PreviewWindow]::PrintWindow($hwnd, $dc, 2)) { throw 'Cannot capture Haish window' }
      } finally { $graphics.ReleaseHdc($dc) }
    } finally { $graphics.Dispose() }
    $bitmap.Save((Join-Path (Resolve-Path 'build/runtime') 'windows-preview.png'), [Drawing.Imaging.ImageFormat]::Png)
  } finally { $bitmap.Dispose() }
} finally {
  & taskkill.exe /PID $app.Id /T /F | Out-Null
}
