# hover-probe.ps1 — D-3 切片 2：输出光标坐标 + 指定窗口的 DWM bounds + DPI（raw JSON）。
#
# 被 electron/windows/hover-probe.ts 通过 execFile 调用。每次输出一行 JSON 后退出：
#   {"cursorX":..,"cursorY":..,"windowLeft":..,"windowTop":..,"windowWidth":..,"windowHeight":..,"dpi":..}
#   主进程 ts 侧调 isPointerOverSurface（纯函数）判断是否命中——几何逻辑 100% CI 可测。
#
# 参数：-Hwnd <decimal int> —— 目标窗口句柄（Electron getNativeWindowHandle 读成 BigInt 传十进制）。
#
# 算法对齐 WPF Test-OrbPointerInVisibleShape 的取值部分（判断逻辑留 ts）：
#   GetCursorPos 取光标屏幕坐标 + DwmGetWindowAttribute(9) 取窗口 DWM 扩展边框 +
#   GetDpiForWindow 取 DPI。
#
# 红线：只输出坐标/bounds/DPI。不输出进程名/凭据/内容。不联网。任何异常 catch 成 null 字段，
# 主进程见 null 即降级（保守不展开）。

param(
    [Parameter(Mandatory = $true)]
    [long]$Hwnd
)

$ErrorActionPreference = 'Stop'

if (-not ('CodexUsage.HoverProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexUsage {
    public static class HoverProbe {
        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X; public int Y; }
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);
        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll")]
        public static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")]
        public static extern bool IsWindow(IntPtr hWnd);
    }
}
'@
}

function Get-HoverProbeGeometry {
    try {
        $handle = [IntPtr]$Hwnd
        if (-not [CodexUsage.HoverProbe]::IsWindow($handle)) { return $null }

        $cursor = New-Object CodexUsage.HoverProbe+POINT
        if (-not [CodexUsage.HoverProbe]::GetCursorPos([ref]$cursor)) { return $null }

        $rect = New-Object CodexUsage.HoverProbe+RECT
        # DWMWA_EXTENDED_FRAME_BOUNDS = 9：比 GetWindowRect 准（含 invisible 边框外的真实可视区）
        $dwmResult = [CodexUsage.HoverProbe]::DwmGetWindowAttribute($handle, 9, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect))
        if ($dwmResult -ne 0 -and -not [CodexUsage.HoverProbe]::GetWindowRect($handle, [ref]$rect)) { return $null }

        $dpi = [CodexUsage.HoverProbe]::GetDpiForWindow($handle)
        if ($dpi -le 0) { $dpi = 96 }

        return [pscustomobject]@{
            cursorX      = [long]$cursor.X
            cursorY      = [long]$cursor.Y
            windowLeft   = [long]$rect.Left
            windowTop    = [long]$rect.Top
            windowWidth  = [long]($rect.Right - $rect.Left)
            windowHeight = [long]($rect.Bottom - $rect.Top)
            dpi          = [int]$dpi
        }
    } catch {
        return $null
    }
}

$geom = Get-HoverProbeGeometry
if ($null -eq $geom) {
    ConvertTo-Json -Compress -InputObject @{ cursorX = $null; cursorY = $null; windowLeft = $null; windowTop = $null; windowWidth = $null; windowHeight = $null; dpi = $null }
} else {
    ConvertTo-Json -Compress -InputObject $geom
}
