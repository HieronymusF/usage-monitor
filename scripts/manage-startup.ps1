param(
    [ValidateSet('Enable', 'Disable', 'Status')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $pluginRoot 'start-floating-window.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Codex Usage Monitor.lnk'

if ($Action -eq 'Enable') {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = $pluginRoot
    $shortcut.Description = 'Start Codex Usage Monitor with Windows'
    $shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,76"
    $shortcut.Save()
    Write-Output "开机启动已启用：$shortcutPath"
    exit 0
}

if ($Action -eq 'Disable') {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath
    }
    Write-Output '开机启动已关闭。'
    exit 0
}

if (Test-Path -LiteralPath $shortcutPath) {
    Write-Output "开机启动：已启用（$shortcutPath）"
} else {
    Write-Output '开机启动：未启用'
}
