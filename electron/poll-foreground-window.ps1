# poll-foreground-window.ps1 — D-3 切片 1：输出当前前台窗口进程名（JSON 单行）。
#
# 被 electron/windows/foreground-powershell.ts 通过 execFile(powershell.exe -File ...) 调用。
# 每次调用输出一行 JSON 到 stdout 后立即退出：
#   {"processName":"code"}        正常：前台窗口所属进程名（已小写）
#   {"processName":null}          无前台窗口 / 不可见 / 进程名无法获取
#
# 算法对齐 WPF companion/CodexUsageMonitor.ps1 Get-ForegroundWindowInfo（最小子集）：
#   GetForegroundWindow → IsWindowVisible 过滤 → GetAncestor(GA_ROOT=2) 取根属主窗口 →
#   GetWindowThreadProcessId 取 PID → Get-Process 取 ProcessName 并小写化。
#
# 红线：只输出进程名。不输出 PID、路径、窗口标题、句柄、矩形、DPI。不读凭据。
# 不向第三方联网。任何异常都 catch 成 {"processName":null}，绝不让脚本抛错阻塞主进程轮询。

param()

$ErrorActionPreference = 'Stop'

# 最小 P/Invoke：只拉前台检测需要的四个 user32 函数（WPF 原版还有 DwmGetWindowAttribute /
# GetDpiForWindow / MonitorFromWindow 等，切片 1 不需要，留后续切片）。
# Add-Type -TypeDefinition + 单引号 here-string（@'...'@）—— 不做变量插值，与 WPF 原版一致。
if (-not ('CodexUsage.CodexForegroundProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexUsage {
    public static class CodexForegroundProbe {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    }
}
'@
}

function Get-ForegroundProcessName {
    try {
        $processId = [uint32]0
        $handle = [CodexUsage.CodexForegroundProbe]::GetForegroundWindow()
        if ($handle -eq [IntPtr]::Zero -or -not [CodexUsage.CodexForegroundProbe]::IsWindowVisible($handle)) {
            return $null
        }
        # GA_ROOT = 2：跳过 OLE 嵌入式子窗口，取根属主窗口（与 WPF 一致）。
        $rootHandle = [CodexUsage.CodexForegroundProbe]::GetAncestor($handle, 2)
        if ($rootHandle -ne [IntPtr]::Zero) { $handle = $rootHandle }
        [void][CodexUsage.CodexForegroundProbe]::GetWindowThreadProcessId($handle, [ref]$processId)
        if ($processId -eq 0) { return $null }
        $name = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
        if ([string]::IsNullOrEmpty($name)) { return $null }
        return $name.ToLowerInvariant()
    } catch {
        return $null
    }
}

$name = Get-ForegroundProcessName
# 单行 JSON。ConvertTo-Json -Compress 保证无换行，主进程 readline 取首行即可。
if ($null -eq $name) {
    ConvertTo-Json -Compress -InputObject @{ processName = $null }
} else {
    ConvertTo-Json -Compress -InputObject @{ processName = $name }
}
