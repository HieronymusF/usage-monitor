# probe-daemon.ps1 — D-3 长驻 PowerShell 守护进程。
#
# 修复每次探针都 spawn powershell.exe + Add-Type 的性能问题（实测 368-528ms/次，
# 无法满足 80ms/300ms 轮询）。本脚本启动时编译一次 P/Invoke，然后循环读 stdin 命令、
# 写 stdout JSON 响应，单次探针降到 ~1-5ms。
#
# 线协议（每行一条 JSON）——**所有响应必须原样回传请求的数值 id**（P0 修复）：
#   请求：{"id":<n>,"cmd":"fg"}                    → 取前台窗口进程名
#         {"id":<n>,"cmd":"hover","hwnd":<decimal>} → 取光标+指定窗口几何
#         {"id":<n>,"cmd":"quit"}                   → 退出
#   响应（fg）：{"id":<n>,"processName":"code"} / {"id":<n>,"processName":null}
#              null = 成功检测但无可用前台窗口（按产品规则→orb）
#   响应（hover）：{"id":<n>,"cursorX":..,..,"dpi":..}
#   响应（错误）：{"id":<n>,"error":"..."}
#              fg 的 API/PInvoke/Get-Process 异常必须返回 error（P1 修复），不能伪装成 null。
#
# 主进程 (probe-daemon.ts) 按 requestId 匹配响应（超时/乱序不错配）。
#
# 红线：只输出进程名 / 光标坐标 / 窗口几何 / DPI。不输出 PID 路径/窗口标题/凭据。不联网。
# 退出：stdin 关闭（EOF）或收到 {"cmd":"quit"}。

param()
$ErrorActionPreference = 'Stop'

# 启动时编译一次 P/Invoke（Add-Type 只跑一次，后续探针零编译开销）。
if (-not ('CodexUsage.Probe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexUsage {
    public static class Probe {
        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X; public int Y; }
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
        [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    }
}
'@
}

<#
.SYNOPSIS
  取前台窗口进程名，返回可判别结果（P1 修复：区分"无前台窗口"和"检测异常"）。
.OUTPUTS
  @{ ok=$true; name=$null }  成功检测，但无可用前台窗口（不可见/PID=0/空名）
  @{ ok=$true; name="<str>" } 成功检测到进程名（已小写）
  @{ ok=$false }             API/PInvoke/Get-Process 异常（watcher 应保持当前 surface）
#>
function Get-ForegroundProcessName {
    try {
        $processId = [uint32]0
        $handle = [CodexUsage.Probe]::GetForegroundWindow()
        if ($handle -eq [IntPtr]::Zero -or -not [CodexUsage.Probe]::IsWindowVisible($handle)) {
            return @{ ok = $true; name = $null }
        }
        $rootHandle = [CodexUsage.Probe]::GetAncestor($handle, 2)
        if ($rootHandle -ne [IntPtr]::Zero) { $handle = $rootHandle }
        [void][CodexUsage.Probe]::GetWindowThreadProcessId($handle, [ref]$processId)
        if ($processId -eq 0) { return @{ ok = $true; name = $null } }
        $name = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
        if ([string]::IsNullOrEmpty($name)) { return @{ ok = $true; name = $null } }
        return @{ ok = $true; name = $name.ToLowerInvariant() }
    } catch {
        # 异常（API 失败/进程已退出/权限）→ ok=$false，主循环发 error 响应。
        return @{ ok = $false }
    }
}

<#
.SYNOPSIS
  取光标 + 指定窗口几何。返回 $null 表示不可用（主循环发 error）。
#>
function Get-HoverGeometry {
    param([long]$Hwnd)
    try {
        $handle = [IntPtr]$Hwnd
        if (-not [CodexUsage.Probe]::IsWindow($handle)) { return $null }

        $cursor = New-Object CodexUsage.Probe+POINT
        if (-not [CodexUsage.Probe]::GetCursorPos([ref]$cursor)) { return $null }

        $rect = New-Object CodexUsage.Probe+RECT
        $dwmResult = [CodexUsage.Probe]::DwmGetWindowAttribute($handle, 9, [ref]$rect, [Runtime.InteropServices.Marshal]::SizeOf($rect))
        if ($dwmResult -ne 0 -and -not [CodexUsage.Probe]::GetWindowRect($handle, [ref]$rect)) { return $null }

        $dpi = [CodexUsage.Probe]::GetDpiForWindow($handle)
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

# stdout 强制 UTF-8 + 不加 BOM（主进程按行读 JSON）。注意：本文件本身需 UTF-8 BOM
# 供 PS 5.1 正确解码中文注释（lesson L15）；输出流不含 BOM。
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# 主循环：读 stdin 一行 = 一个 JSON 命令，处理后写一行 JSON 响应。
# **所有响应原样回传请求的 id**（P0 修复）。id 缺失时回 id=null（防御，主进程会丢弃）。
while ($line = [Console]::In.ReadLine()) {
    $line = $line.Trim()
    if ($line.Length -eq 0) { continue }
    # 先解析 id + cmd，任何异常都带 id 回 error。
    $reqId = $null
    $req = $null
    try {
        $req = $line | ConvertFrom-Json
        if ($null -ne $req.id) { $reqId = [int64]$req.id }
    } catch {
        $msg = ($_.Exception.Message -replace '\s+', ' ').Trim()
        ConvertTo-Json -Compress -InputObject @{ id = $reqId; error = $msg }
        continue
    }
    try {
        if ($req.cmd -eq 'quit') { break }
        if ($req.cmd -eq 'fg') {
            $result = Get-ForegroundProcessName
            if (-not $result.ok) {
                # P1：API 异常 → error（不伪装成 null）
                ConvertTo-Json -Compress -InputObject @{ id = $reqId; error = 'foreground-unavailable' }
            } elseif ($null -eq $result.name) {
                # 成功检测但无前台窗口
                ConvertTo-Json -Compress -InputObject @{ id = $reqId; processName = $null }
            } else {
                ConvertTo-Json -Compress -InputObject @{ id = $reqId; processName = $result.name }
            }
            continue
        }
        if ($req.cmd -eq 'hover') {
            $hwnd = [long]$req.hwnd
            $geom = Get-HoverGeometry -Hwnd $hwnd
            if ($null -eq $geom) {
                ConvertTo-Json -Compress -InputObject @{ id = $reqId; error = 'hover-unavailable' }
            } else {
                # 把 id 注入几何对象（ConvertTo-Json 保留既有属性 + 新增 id）
                $geom | Add-Member -NotePropertyName id -NotePropertyValue $reqId -PassThru -Force | Out-Null
                ConvertTo-Json -Compress -InputObject $geom
            }
            continue
        }
        ConvertTo-Json -Compress -InputObject @{ id = $reqId; error = 'unknown-cmd' }
    } catch {
        $msg = ($_.Exception.Message -replace '\s+', ' ').Trim()
        ConvertTo-Json -Compress -InputObject @{ id = $reqId; error = $msg }
    }
}
