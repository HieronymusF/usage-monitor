; Inno Setup script for a portable (no-install) Windows build.
; Double-clicking the produced exe extracts the bundle to
; %LOCALAPPDATA%\usage-monitor\ and launches the floating window via the silent
; VBS launcher. No Add/Remove Programs entry, no admin rights, no system Node.
; Build with: ISCC.exe portable.iss

[Setup]
AppName=Usage Monitor
AppVersion=0.2.0
AppPublisher=Usage Monitor Contributors
DefaultDirName={localappdata}\usage-monitor
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
DisableWelcomePage=yes
; True portable: no uninstaller, no ARP entry, no registry bloat.
CreateUninstallRegKey=no
Uninstallable=no
PrivilegesRequired=lowest
OutputBaseFilename=usage-monitor-portable
OutputDir=.
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Files]
; The build script assembles bundle\ with node/, dist/, companion/, manifests.
Source: "bundle\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion overwritereadonly

[Run]
; Launch the floating window after extraction. wscript runs the VBS launcher
; (no console flash), which starts the PowerShell companion window.
Filename: "wscript.exe"; Parameters: """{app}\start-floating-window.vbs"""; Flags: nowait postinstall skipifsilent runhidden
