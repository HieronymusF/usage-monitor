' Silent launcher: starts the floating window with no console window at all.
' wscript.exe has no window of its own, and the powershell child is forced hidden,
' so double-clicking this file (or the desktop shortcut that points to it) shows
' only the floating overlay - no cmd flash, no taskbar console.
Option Explicit
Dim fso, here, ps1
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = here & "\companion\CodexUsageMonitor.ps1"
CreateObject("WScript.Shell").Run "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
