$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $pluginRoot 'start-floating-window.vbs'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Codex Usage Monitor.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $pluginRoot
$shortcut.Description = 'Open the Codex quota and token usage floating window'
$shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,76"
$shortcut.Save()
Write-Output $shortcutPath
