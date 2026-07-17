Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
# Prefer a node.exe bundled alongside the plugin (portable build: <root>\node\node.exe),
# falling back to system PATH node. This lets the portable exe run on machines
# that have never installed Node.js.
$bundledNode = Join-Path $pluginRoot 'node\node.exe'
if (Test-Path -LiteralPath $bundledNode) {
    $node = $bundledNode
} else {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { throw '未找到 node。请安装 Node.js 20+，或使用捆绑了 node 的便携版。' }
}
$bridgeScript = Join-Path $pluginRoot 'dist\companionBridge.js'
$settingsDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexUsageMonitor'
$settingsPath = Join-Path $settingsDirectory 'settings.json'
$launcherPath = Join-Path $pluginRoot 'start-floating-window.vbs'
$startupShortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Usage Monitor.lnk'
$script:PreviewState = [string]$env:CODEX_USAGE_MONITOR_PREVIEW
$script:PreviewTheme = [string]$env:CODEX_USAGE_MONITOR_PREVIEW_THEME

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CodexUsageNativeMethods {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT value, int size);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongPtr")] public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern int GetWindowLong32(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLong")] public static extern int SetWindowLong32(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO { public int Size; public RECT Monitor; public RECT Work; public uint Flags; }
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    public static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) {
        return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : new IntPtr(GetWindowLong32(hWnd, index));
    }
    public static void SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value) {
        if (IntPtr.Size == 8) SetWindowLongPtr64(hWnd, index, value);
        else SetWindowLong32(hWnd, index, value.ToInt32());
    }
}
'@

function Start-UsageBridge {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $node
    $info.Arguments = '"' + $bridgeScript + '" --port 0'
    $info.WorkingDirectory = $pluginRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw '无法启动用量数据 bridge。' }
    $lineTask = $process.StandardOutput.ReadLineAsync()
    if (-not $lineTask.Wait(10000)) {
        & taskkill.exe /pid $process.Id /t /f | Out-Null
        throw '用量数据 bridge 启动超时。'
    }
    $connection = $lineTask.Result | ConvertFrom-Json
    return @{ Process = $process; Port = [int]$connection.port; BridgeKey = [string]$connection.bridgeKey }
}

function Invoke-BridgeRequest([string]$Path, [string]$Method = 'GET') {
    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$($script:bridge.Port)$Path")
    $request.Method = $Method
    $request.Timeout = 10000
    $request.ReadWriteTimeout = 10000
    $request.Headers['Authorization'] = "Bearer $($script:bridge.BridgeKey)"
    if ($Method -eq 'POST') { $request.ContentLength = 0 }
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) }
        finally { $reader.Dispose() }
    }
    finally { $response.Dispose() }
}

function Stop-UsageBridge {
    if ($null -eq $script:bridge) { return }
    try { Invoke-BridgeRequest '/shutdown' 'POST' | Out-Null } catch {}
    if (-not $script:bridge.Process.WaitForExit(1500)) { & taskkill.exe /pid $script:bridge.Process.Id /t /f | Out-Null }
    $script:bridge = $null
}

function Read-Settings {
    if (-not (Test-Path -LiteralPath $settingsPath)) { return @{ displayMode = 'auto'; themeMode = 'auto'; activeClient = 'codex' } }
    try {
        $value = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $mode = [string]$value.displayMode
        if ($mode -notin @('auto', 'card', 'bar', 'orb')) { $mode = 'auto' }
        $theme = [string]$value.themeMode
        if ($theme -notin @('auto', 'dark', 'light')) { $theme = 'auto' }
        $client = [string]$value.activeClient
        if ($client -notin @('codex', 'zcode')) { $client = 'codex' }
        return @{ displayMode = $mode; themeMode = $theme; activeClient = $client }
    } catch {
        return @{ displayMode = 'auto'; themeMode = 'auto'; activeClient = 'codex' }
    }
}

function Save-Settings {
    if (-not (Test-Path -LiteralPath $settingsDirectory)) {
        New-Item -ItemType Directory -Path $settingsDirectory | Out-Null
    }
    @{
        displayMode = $script:DisplayMode
        themeMode = $script:ThemeMode
        activeClient = $script:ActiveClient
    } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding UTF8
}

function Test-StartupEnabled {
    return Test-Path -LiteralPath $startupShortcutPath
}

function Set-StartupEnabled([bool]$Enabled) {
    if ($Enabled) {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($startupShortcutPath)
        $shortcut.TargetPath = $launcherPath
        $shortcut.WorkingDirectory = $pluginRoot
        $shortcut.Description = 'Start Codex Usage Monitor with Windows'
        $shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,76"
        $shortcut.Save()
    } elseif (Test-Path -LiteralPath $startupShortcutPath) {
        Remove-Item -LiteralPath $startupShortcutPath
    }
}

function Get-ForegroundWindowInfo {
    try {
        $processId = [uint32]0
        $handle = [CodexUsageNativeMethods]::GetForegroundWindow()
        if ($handle -eq [IntPtr]::Zero -or -not [CodexUsageNativeMethods]::IsWindowVisible($handle)) { return $null }
        $rootHandle = [CodexUsageNativeMethods]::GetAncestor($handle, 2)
        if ($rootHandle -ne [IntPtr]::Zero) { $handle = $rootHandle }
        [void][CodexUsageNativeMethods]::GetWindowThreadProcessId($handle, [ref]$processId)
        $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName.ToLowerInvariant()
        $rect = New-Object CodexUsageNativeMethods+RECT
        $dwmResult = [CodexUsageNativeMethods]::DwmGetWindowAttribute($handle, 9, [ref]$rect, [Runtime.InteropServices.Marshal]::SizeOf($rect))
        if ($dwmResult -ne 0 -and -not [CodexUsageNativeMethods]::GetWindowRect($handle, [ref]$rect)) { return $null }
        $dpi = [CodexUsageNativeMethods]::GetDpiForWindow($handle)
        if ($dpi -le 0) { $dpi = 96 }
        $work = $rect
        $monitor = [CodexUsageNativeMethods]::MonitorFromWindow($handle, 2)
        if ($monitor -ne [IntPtr]::Zero) {
            $monitorInfo = New-Object CodexUsageNativeMethods+MONITORINFO
            $monitorInfo.Size = [Runtime.InteropServices.Marshal]::SizeOf($monitorInfo)
            if ([CodexUsageNativeMethods]::GetMonitorInfo($monitor, [ref]$monitorInfo)) { $work = $monitorInfo.Work }
        }
        return [pscustomobject]@{
            Handle = $handle
            ProcessName = $processName
            IsMinimized = [CodexUsageNativeMethods]::IsIconic($handle)
            Left = $rect.Left
            Top = $rect.Top
            Width = $rect.Right - $rect.Left
            Height = $rect.Bottom - $rect.Top
            Dpi = [int]$dpi
            WorkLeft = $work.Left
            WorkTop = $work.Top
            WorkRight = $work.Right
            WorkBottom = $work.Bottom
        }
    } catch {
        return $null
    }
}

function Get-OverlayMonitorWorkArea {
    $fallback = [System.Windows.SystemParameters]::WorkArea
    try {
        $monitor = [CodexUsageNativeMethods]::MonitorFromWindow($script:OverlayHandle, 2)
        if ($monitor -eq [IntPtr]::Zero) { return $fallback }
        $info = New-Object CodexUsageNativeMethods+MONITORINFO
        $info.Size = [Runtime.InteropServices.Marshal]::SizeOf($info)
        if (-not [CodexUsageNativeMethods]::GetMonitorInfo($monitor, [ref]$info)) { return $fallback }
        return [pscustomobject]@{
            Left = [double]$info.Work.Left
            Top = [double]$info.Work.Top
            Right = [double]$info.Work.Right
            Bottom = [double]$info.Work.Bottom
            Width = [double]($info.Work.Right - $info.Work.Left)
            Height = [double]($info.Work.Bottom - $info.Work.Top)
        }
    } catch {
        return $fallback
    }
}

function Get-SystemTheme {
    try {
        $value = Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -ErrorAction Stop
        if ([int]$value -eq 0) { return 'dark' }
    } catch {}
    return 'light'
}

function New-StatusIcon([string]$Color) {
    $bitmap = New-Object System.Drawing.Bitmap 32, 32
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Color))
        $ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 2)
        try {
            $graphics.FillEllipse($fill, 5, 5, 22, 22)
            $graphics.DrawEllipse($ring, 5, 5, 22, 22)
        } finally {
            $fill.Dispose()
            $ring.Dispose()
        }
        $handle = $bitmap.GetHicon()
        try { return ([System.Drawing.Icon]::FromHandle($handle).Clone()) }
        finally { [void][CodexUsageNativeMethods]::DestroyIcon($handle) }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Codex Usage Monitor" Width="404" Height="326"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" Topmost="True" ShowInTaskbar="False"
        FontFamily="Segoe UI Variable Text, Microsoft YaHei UI, Segoe UI">
  <Window.Resources>
    <SolidColorBrush x:Key="CanvasBrush" Color="#15181E"/>
    <SolidColorBrush x:Key="SurfaceBrush" Color="#20242C"/>
    <SolidColorBrush x:Key="SurfaceElevatedBrush" Color="#292E38"/>
    <SolidColorBrush x:Key="SurfaceHoverBrush" Color="#313744"/>
    <SolidColorBrush x:Key="BorderBrush" Color="#3A4352"/>
    <SolidColorBrush x:Key="TextPrimaryBrush" Color="#F4F7FB"/>
    <SolidColorBrush x:Key="TextSecondaryBrush" Color="#C4CCD8"/>
    <SolidColorBrush x:Key="TextTertiaryBrush" Color="#97A3B4"/>
    <SolidColorBrush x:Key="AccentBrush" Color="#6EA8FE"/>
    <SolidColorBrush x:Key="SuccessBrush" Color="#4FD19B"/>
    <SolidColorBrush x:Key="WarningBrush" Color="#F5B942"/>
    <SolidColorBrush x:Key="DangerBrush" Color="#FF6B7A"/>
    <SolidColorBrush x:Key="UnavailableBrush" Color="#97A3B4"/>
    <SolidColorBrush x:Key="FocusRingBrush" Color="#8AB4FF"/>
    <Style x:Key="LabelText" TargetType="TextBlock">
      <Setter Property="Foreground" Value="{DynamicResource TextSecondaryBrush}"/>
      <Setter Property="FontSize" Value="13"/>
      <Setter Property="FontWeight" Value="Medium"/>
    </Style>
    <Style x:Key="CaptionText" TargetType="TextBlock">
      <Setter Property="Foreground" Value="{DynamicResource TextTertiaryBrush}"/>
      <Setter Property="FontSize" Value="12"/>
    </Style>
    <Style x:Key="MetricText" TargetType="TextBlock">
      <Setter Property="Foreground" Value="{DynamicResource TextPrimaryBrush}"/>
      <Setter Property="FontFamily" Value="Segoe UI Variable Display, Segoe UI"/>
      <Setter Property="FontSize" Value="17"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
    </Style>
    <Style x:Key="IconButton" TargetType="Button">
      <Setter Property="Foreground" Value="{DynamicResource TextSecondaryBrush}"/>
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="BorderBrush" Value="Transparent"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="MinWidth" Value="32"/>
      <Setter Property="Height" Value="32"/>
      <Setter Property="Padding" Value="8,0"/>
      <Setter Property="FontSize" Value="12"/>
      <Setter Property="Cursor" Value="Hand"/>
    </Style>
  </Window.Resources>
  <Grid>
    <Border x:Name="CardRoot" CornerRadius="16" Background="{DynamicResource CanvasBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="18">
      <Border.Effect><DropShadowEffect BlurRadius="22" ShadowDepth="4" Opacity="0.28" Color="#000000"/></Border.Effect>
      <Grid>
        <Grid.RowDefinitions>
          <RowDefinition Height="40"/><RowDefinition Height="12"/><RowDefinition Height="Auto"/>
          <RowDefinition Height="12"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <Grid x:Name="CardDragArea" Grid.Row="0" Background="Transparent">
          <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
            <Ellipse x:Name="HeaderDot" Width="8" Height="8" Fill="{DynamicResource UnavailableBrush}" Margin="1,0,10,0"/>
            <Button x:Name="HeaderClientButton" Content="Codex 用量 ▾" Foreground="{DynamicResource TextPrimaryBrush}" FontSize="16" FontWeight="SemiBold" Background="Transparent" BorderThickness="0" Padding="0" Cursor="Hand" VerticalAlignment="Center" ToolTip="切换数据来源"/>
            <TextBlock x:Name="PlanText" Text="" Style="{StaticResource CaptionText}" Margin="10,1,0,0" VerticalAlignment="Center"/>
          </StackPanel>
          <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center">
            <Button x:Name="CardModeButton" Content="自动" Style="{StaticResource IconButton}" MinWidth="44" ToolTip="切换显示模式"/>
            <Button x:Name="ThemeButton" Content="主题" Style="{StaticResource IconButton}" MinWidth="44" Margin="2,0,0,0" ToolTip="切换深色、浅色或自动主题"/>
            <Button x:Name="RefreshButton" Content="刷新" Style="{StaticResource IconButton}" MinWidth="44" Margin="2,0,0,0" ToolTip="立即刷新"/>
            <Button x:Name="CloseButton" Content="×" Style="{StaticResource IconButton}" Width="32" FontSize="17" Margin="2,0,0,0" ToolTip="退出"/>
          </StackPanel>
        </Grid>
        <Grid x:Name="CodexQuotaPanel" Grid.Row="2">
          <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="1"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
          <Grid Grid.Column="0" Margin="0,0,16,0">
            <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="10"/><RowDefinition Height="6"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
            <TextBlock Text="5 小时" Style="{StaticResource LabelText}"/>
            <TextBlock Grid.Row="1" x:Name="FiveRemaining" Text="—" Foreground="{DynamicResource TextPrimaryBrush}" FontFamily="Segoe UI Variable Display, Segoe UI" FontSize="32" FontWeight="SemiBold" Margin="0,3,0,0"/>
            <ProgressBar Grid.Row="3" x:Name="FiveProgress" Height="6" Minimum="0" Maximum="100" Value="0" Background="{DynamicResource SurfaceElevatedBrush}" Foreground="{DynamicResource UnavailableBrush}" BorderThickness="0"/>
            <TextBlock Grid.Row="4" x:Name="FiveStatus" Text="— 服务未提供" Style="{StaticResource LabelText}" Margin="0,9,0,0"/>
            <TextBlock Grid.Row="5" x:Name="FiveReset" Text="" Style="{StaticResource CaptionText}" Margin="0,3,0,0"/>
          </Grid>
          <Border Grid.Column="1" Width="1" Background="{DynamicResource BorderBrush}"/>
          <Grid Grid.Column="2" Margin="16,0,0,0">
            <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="10"/><RowDefinition Height="6"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
            <TextBlock Text="每周" Style="{StaticResource LabelText}"/>
            <TextBlock Grid.Row="1" x:Name="WeekRemaining" Text="—" Foreground="{DynamicResource TextPrimaryBrush}" FontFamily="Segoe UI Variable Display, Segoe UI" FontSize="32" FontWeight="SemiBold" Margin="0,3,0,0"/>
            <ProgressBar Grid.Row="3" x:Name="WeekProgress" Height="6" Minimum="0" Maximum="100" Value="0" Background="{DynamicResource SurfaceElevatedBrush}" Foreground="{DynamicResource UnavailableBrush}" BorderThickness="0"/>
            <TextBlock Grid.Row="4" x:Name="WeekStatus" Text="— 服务未提供" Style="{StaticResource LabelText}" Margin="0,9,0,0"/>
            <TextBlock Grid.Row="5" x:Name="WeekReset" Text="" Style="{StaticResource CaptionText}" Margin="0,3,0,0"/>
          </Grid>
        </Grid>
        <Border x:Name="ZcodeSummaryPanel" Grid.Row="2" Visibility="Collapsed" CornerRadius="12" Background="{DynamicResource SurfaceBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="14">
          <Grid>
            <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="12"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
            <TextBlock x:Name="ZcodeNotice" Text="仅显示本机 Token 统计" Style="{StaticResource CaptionText}"/>
            <Grid Grid.Row="2">
              <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition/><ColumnDefinition/></Grid.ColumnDefinitions>
              <StackPanel Grid.Column="0"><TextBlock Text="今日" Style="{StaticResource LabelText}"/><TextBlock x:Name="ZcodeTodayValue" Text="—" Style="{StaticResource MetricText}" Margin="0,4,0,0"/></StackPanel>
              <StackPanel Grid.Column="1"><TextBlock Text="累计" Style="{StaticResource LabelText}"/><TextBlock x:Name="ZcodeTotalValue" Text="—" Style="{StaticResource MetricText}" Margin="0,4,0,0"/></StackPanel>
              <StackPanel Grid.Column="2"><TextBlock Text="主要模型" Style="{StaticResource LabelText}"/><TextBlock x:Name="ZcodeModelValue" Text="—" Style="{StaticResource MetricText}" FontSize="14" TextTrimming="CharacterEllipsis" Margin="0,4,0,0"/></StackPanel>
            </Grid>
          </Grid>
        </Border>
        <Border x:Name="TokenSummaryPanel" Grid.Row="4" CornerRadius="12" Background="{DynamicResource SurfaceBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="14,11">
          <Grid>
            <Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition/><ColumnDefinition/></Grid.ColumnDefinitions>
            <StackPanel Grid.Column="0"><TextBlock Text="当前任务" Style="{StaticResource LabelText}"/><TextBlock x:Name="CurrentTokens" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
            <StackPanel Grid.Column="1"><TextBlock Text="今日" Style="{StaticResource LabelText}"/><TextBlock x:Name="TodayTokens" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
            <StackPanel Grid.Column="2"><TextBlock Text="本机累计" Style="{StaticResource LabelText}"/><TextBlock x:Name="LifetimeTokens" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
          </Grid>
        </Border>
        <TextBlock Grid.Row="5" x:Name="UpdateText" Text="正在连接…" Style="{StaticResource CaptionText}" Margin="1,10,0,0"/>
      </Grid>
    </Border>

    <Grid x:Name="BarRoot" Visibility="Collapsed" Background="Transparent">
      <Grid.ColumnDefinitions><ColumnDefinition Width="72"/><ColumnDefinition Width="*"/><ColumnDefinition Width="168"/></Grid.ColumnDefinitions>
      <Border x:Name="BarSurface" Grid.Column="1" Height="40" CornerRadius="10" Background="{DynamicResource SurfaceBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="16,0">
        <Border.Effect><DropShadowEffect BlurRadius="16" ShadowDepth="3" Opacity="0.24" Color="#000000"/></Border.Effect>
        <Grid>
          <StackPanel x:Name="BarCodexContent" Orientation="Horizontal" HorizontalAlignment="Center" VerticalAlignment="Center">
            <TextBlock x:Name="BarClient" Text="Codex" Style="{StaticResource LabelText}" Foreground="{DynamicResource TextPrimaryBrush}"/>
            <TextBlock Text="  |  5 小时 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarFiveRemaining" Text="—" Style="{StaticResource MetricText}" FontSize="16"/>
            <TextBlock Text="  |  每周 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarWeekRemaining" Text="—" Style="{StaticResource MetricText}" FontSize="16"/>
            <TextBlock Text="  |  今日 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarTodayTokens" Text="—" Style="{StaticResource MetricText}" FontSize="16"/>
            <TextBlock Text="  |  " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarReset" Text="服务未提供" Style="{StaticResource LabelText}" TextTrimming="CharacterEllipsis"/>
          </StackPanel>
          <StackPanel x:Name="BarZcodeContent" Visibility="Collapsed" Orientation="Horizontal" HorizontalAlignment="Center" VerticalAlignment="Center">
            <TextBlock Text="ZCode" Style="{StaticResource LabelText}" Foreground="{DynamicResource TextPrimaryBrush}"/>
            <TextBlock Text="  |  今日 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarZcodeToday" Text="—" Style="{StaticResource MetricText}" FontSize="16"/>
            <TextBlock Text="  |  累计 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarZcodeTotal" Text="—" Style="{StaticResource MetricText}" FontSize="16"/>
            <TextBlock Text="  |  模型 " Style="{StaticResource LabelText}"/>
            <TextBlock x:Name="BarZcodeModel" Text="—" Style="{StaticResource LabelText}" TextTrimming="CharacterEllipsis" MaxWidth="220"/>
            <TextBlock Text="  |  本机估算" Style="{StaticResource CaptionText}"/>
          </StackPanel>
        </Grid>
      </Border>
    </Grid>

    <Grid x:Name="OrbRoot" Visibility="Collapsed">
      <Border x:Name="OrbCollapsed" Visibility="Visible" CornerRadius="36" Width="72" Height="72" Background="{DynamicResource CanvasBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Cursor="Hand" ToolTip="点击展开 · 拖动移动">
        <Border.Effect><DropShadowEffect BlurRadius="18" ShadowDepth="4" Opacity="0.30" Color="#000000"/></Border.Effect>
        <Grid x:Name="OrbDragArea" Background="Transparent">
          <Ellipse x:Name="OrbRing" Width="68" Height="68" Stroke="{DynamicResource AccentBrush}" StrokeThickness="3" Fill="Transparent"/>
          <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
            <TextBlock x:Name="OrbTokens" Text="—" Foreground="{DynamicResource TextPrimaryBrush}" FontFamily="Segoe UI Variable Display, Segoe UI" FontSize="20" FontWeight="SemiBold" HorizontalAlignment="Center"/>
            <TextBlock x:Name="OrbLabel" Text="今日" Foreground="{DynamicResource TextSecondaryBrush}" FontSize="12" FontWeight="Medium" HorizontalAlignment="Center" Margin="0,1,0,0"/>
          </StackPanel>
        </Grid>
      </Border>

      <Border x:Name="OrbExpanded" Visibility="Collapsed" CornerRadius="16" Background="{DynamicResource CanvasBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="16">
        <Border.Effect><DropShadowEffect BlurRadius="22" ShadowDepth="4" Opacity="0.28" Color="#000000"/></Border.Effect>
        <Grid>
          <Grid.RowDefinitions>
            <RowDefinition Height="36"/><RowDefinition Height="12"/><RowDefinition Height="Auto"/>
            <RowDefinition Height="12"/><RowDefinition Height="Auto"/><RowDefinition Height="12"/><RowDefinition Height="Auto"/>
          </Grid.RowDefinitions>
          <Grid Grid.Row="0" x:Name="OrbExpDragArea" Background="Transparent">
            <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
              <Ellipse x:Name="OrbExpDot" Width="8" Height="8" Fill="{DynamicResource AccentBrush}" Margin="1,0,9,0"/>
              <TextBlock x:Name="OrbExpTitle" Text="用量" Foreground="{DynamicResource TextPrimaryBrush}" FontSize="16" FontWeight="SemiBold" VerticalAlignment="Center"/>
            </StackPanel>
            <StackPanel Grid.Column="1" Orientation="Horizontal">
              <Button x:Name="OrbModeButton" Content="自动" Style="{StaticResource IconButton}" MinWidth="44" ToolTip="切换显示模式"/>
              <Button x:Name="OrbCollapseButton" Content="‹" Style="{StaticResource IconButton}" Width="32" FontSize="18" ToolTip="收起"/>
              <Button x:Name="OrbCloseButton" Content="×" Style="{StaticResource IconButton}" Width="32" FontSize="17" ToolTip="退出"/>
            </StackPanel>
          </Grid>
          <StackPanel Grid.Row="2" x:Name="OrbCodexPanel">
            <TextBlock Text="Codex" Style="{StaticResource LabelText}" Margin="0,0,0,6"/>
            <Grid>
              <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="10"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
              <StackPanel Grid.Column="0"><TextBlock Text="5 小时" Style="{StaticResource CaptionText}"/><TextBlock x:Name="OrbCodexFive" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
              <StackPanel Grid.Column="2"><TextBlock Text="每周" Style="{StaticResource CaptionText}"/><TextBlock x:Name="OrbCodexWeek" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
            </Grid>
          </StackPanel>
          <StackPanel Grid.Row="4" x:Name="OrbZcodePanel">
            <TextBlock Text="ZCode · 本机估算" Style="{StaticResource LabelText}" Margin="0,0,0,6"/>
            <Grid>
              <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="10"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
              <StackPanel Grid.Column="0"><TextBlock Text="今日" Style="{StaticResource CaptionText}"/><TextBlock x:Name="OrbZcodeToday" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
              <StackPanel Grid.Column="2"><TextBlock Text="累计" Style="{StaticResource CaptionText}"/><TextBlock x:Name="OrbZcodeTotal" Text="—" Style="{StaticResource MetricText}" Margin="0,3,0,0"/></StackPanel>
            </Grid>
          </StackPanel>
          <TextBlock Grid.Row="6" x:Name="OrbUpdateText" Text="正在连接…" Style="{StaticResource CaptionText}"/>
        </Grid>
      </Border>
    </Grid>

    <Popup x:Name="DropdownPopup" AllowsTransparency="True" PopupAnimation="Fade" StaysOpen="False" Placement="Mouse">
      <Border x:Name="DropdownSurface" CornerRadius="10" Background="{DynamicResource SurfaceElevatedBrush}" BorderBrush="{DynamicResource BorderBrush}" BorderThickness="1" Padding="6" MinWidth="190">
        <Border.Effect><DropShadowEffect BlurRadius="18" ShadowDepth="4" Opacity="0.28" Color="#000000"/></Border.Effect>
        <StackPanel x:Name="DropdownPanel"/>
      </Border>
    </Popup>
  </Grid>
</Window>
'@
$xaml = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'UsageMonitor.xaml') -Raw -Encoding UTF8

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
$names = @(
    'CardRoot','BarRoot','BarSurface','OrbRoot','OrbCollapsed','OrbExpanded','CardDragArea','OrbDragArea','OrbExpDragArea','MainContentRow',
    'BrandText','PlanText','PlanPill','CardModeButton','BarModeButton','ThemeButton','HeaderClientButton',
    'RefreshButton','CloseButton','BarCloseButton','OrbCardButton','OrbBarButton','OrbThemeButton','OrbCollapseButton','OrbExpTitle',
    'CodexQuotaPanel','ZcodeSummaryPanel','TokenSummaryPanel','HeroLeftSurface','HeroSideSurface','ZcodeHeroSurface','ZcodeSideSurface','ZcodeHeroLabel','ZcodeSideMetricLabel','ZcodeNotice','ZcodeSideNotice','ZcodeTodayValue','ZcodeTotalValue','ZcodeModelValue',
    'HeroFivePanel','HeroFiveLabel','HeroFiveValue','HeroFiveUnit','HeroFiveStatus','HeroFiveRail','HeroFiveReset',
    'HeroWeekPanel','HeroWeekArc','HeroWeekValue','HeroWeekUnit','HeroWeekStatus','HeroWeekReset','HeroUnavailablePanel',
    'SideWeekPanel','SideWeekArc','SideWeekValue','SideWeekUnit','SideWeekStatus','SideWeekReset','SideTodayPanel','SideTodayValue',
    'TokenSummaryThree','TokenSummaryTwo','ZcodeTokenBreakdown','CurrentTokens','TodayTokens','LifetimeTokens','CurrentTokensCompact','LifetimeTokensCompact',
    'ZcodeInputValue','ZcodeCachedValue','ZcodeOutputValue',
    'UpdateText','BarCodexContent','BarZcodeContent','BarClient','BarFiveRemaining','BarWeekRemaining','BarWeekDot','BarReset','BarTodayTokens',
    'BarZcodeToday','BarZcodeTotal','BarZcodeModel',
    'OrbArc','OrbTokens','OrbLabel','OrbStatusDot','OrbPrimaryLabel','OrbPrimaryValue','OrbPrimaryMiniArc','OrbResetValue','OrbTodayLabel','OrbTodayValue','OrbUpdateText',
    'OrbSurfacePath','OrbGlowPath','OrbHandleSurface','OrbHandleArc','OrbHandleValue','OrbHandleDot',
    'DropdownPopup','DropdownSurface','DropdownPanel'
)
foreach ($name in $names) { Set-Variable -Scope Script -Name $name -Value $window.FindName($name) }
$script:OverlayHandle = (New-Object Windows.Interop.WindowInteropHelper($window)).EnsureHandle()

function Get-Brush([string]$Color) {
    return (New-Object Windows.Media.BrushConverter).ConvertFromString($Color)
}

$script:ThemePalettes = @{
    dark = @{
        CanvasBrush = '#0B0E14'; SurfaceBrush = '#121A26'; SurfaceElevatedBrush = '#182333'; SurfaceHoverBrush = '#23334A'
        BorderBrush = '#40516A'; TextPrimaryBrush = '#F7FAFF'; TextSecondaryBrush = '#C9D5E6'; TextTertiaryBrush = '#91A2B9'
        AccentBrush = '#6F91FF'; SuccessBrush = '#54E1B0'; WarningBrush = '#FFCA62'; DangerBrush = '#FF7185'
        UnavailableBrush = '#91A2B9'; FocusRingBrush = '#8EAAFF'; RailBrush = '#33445E'
        ChromeButtonBrush = '#241F2B3A'; ChromeButtonBorderBrush = '#304E6075'
    }
    light = @{
        CanvasBrush = '#EDF4FF'; SurfaceBrush = '#F8FBFF'; SurfaceElevatedBrush = '#FFFFFF'; SurfaceHoverBrush = '#DDEBFF'
        BorderBrush = '#AEBFD9'; TextPrimaryBrush = '#101827'; TextSecondaryBrush = '#33445E'; TextTertiaryBrush = '#5B6B82'
        AccentBrush = '#376DFF'; SuccessBrush = '#087C61'; WarningBrush = '#986000'; DangerBrush = '#C23745'
        UnavailableBrush = '#64748B'; FocusRingBrush = '#376DFF'; RailBrush = '#B9C9DE'
        ChromeButtonBrush = '#0A000000'; ChromeButtonBorderBrush = '#17000000'
    }
}

function New-GradientBrush([string[]]$Colors) {
    $brush = New-Object Windows.Media.LinearGradientBrush
    $brush.StartPoint = New-Object Windows.Point(0, 0)
    $brush.EndPoint = New-Object Windows.Point(1, 1)
    for ($index = 0; $index -lt $Colors.Count; $index++) {
        $offset = if ($Colors.Count -le 1) { 0 } else { $index / ($Colors.Count - 1) }
        $stop = New-Object Windows.Media.GradientStop
        $stop.Color = [Windows.Media.ColorConverter]::ConvertFromString($Colors[$index])
        $stop.Offset = $offset
        [void]$brush.GradientStops.Add($stop)
    }
    return $brush
}

function New-LightAtmosphereBrush {
    $base = New-Object Windows.Media.LinearGradientBrush
    $base.StartPoint = New-Object Windows.Point(0, 0)
    $base.EndPoint = New-Object Windows.Point(1, 1)
    foreach ($item in @(
        @('#FFFFFF', 0.0),
        @('#F0F8FF', 0.55),
        @('#F6F2FF', 1.0)
    )) {
        [void]$base.GradientStops.Add((New-Object Windows.Media.GradientStop([Windows.Media.ColorConverter]::ConvertFromString($item[0]), [double]$item[1])))
    }
    return $base
}

function New-GradientBrushWithStops([object[]]$Stops, [double]$EndX = 1.0, [double]$EndY = 1.0, [bool]$Absolute = $false) {
    $brush = New-Object Windows.Media.LinearGradientBrush
    if ($Absolute) { $brush.MappingMode = [Windows.Media.BrushMappingMode]::Absolute }
    $brush.StartPoint = New-Object Windows.Point(0, 0)
    $brush.EndPoint = New-Object Windows.Point($EndX, $EndY)
    foreach ($item in $Stops) {
        [void]$brush.GradientStops.Add((New-Object Windows.Media.GradientStop([Windows.Media.ColorConverter]::ConvertFromString([string]$item[0]), [double]$item[1])))
    }
    return $brush
}

function New-RadialGradientBrushWithStops([object[]]$Stops, [double]$CenterX, [double]$CenterY, [double]$RadiusX, [double]$RadiusY, [bool]$Absolute = $false) {
    $brush = New-Object Windows.Media.RadialGradientBrush
    if ($Absolute) { $brush.MappingMode = [Windows.Media.BrushMappingMode]::Absolute }
    $brush.Center = New-Object Windows.Point($CenterX, $CenterY)
    $brush.GradientOrigin = New-Object Windows.Point($CenterX, $CenterY)
    $brush.RadiusX = $RadiusX
    $brush.RadiusY = $RadiusY
    foreach ($item in $Stops) {
        [void]$brush.GradientStops.Add((New-Object Windows.Media.GradientStop([Windows.Media.ColorConverter]::ConvertFromString([string]$item[0]), [double]$item[1])))
    }
    return $brush
}

function Set-CardMaterial([string]$State = 'unavailable') {
    $theme = if ($script:ResolvedTheme) { $script:ResolvedTheme } else { Get-ResolvedTheme }
    if ($theme -eq 'dark') {
        $card = @('#0A1322', '#10233A', '#1B1B3B')
        $hero = @('#541B3851', '#3D1D4855')
        $token = Get-Brush '#541A2A3D'
        $side = Get-Brush '#32182435'
        $edgeBrush = New-GradientBrushWithStops @(@('#EB080E22', 0.0), @('#DB0A142C', 0.55), @('#E6080C1E', 1.0)) 79.8907 276.955 $true
        $edgeGlowBrush = New-RadialGradientBrushWithStops @(@('#14376DFF', 0.0), @('#00376DFF', 1.0)) 52 75 286 82.5 $true
        $handleBrush = New-GradientBrushWithStops @(@('#2E2E478C', 0.0), @('#5C5A46AA', 1.0)) 100.912 39.0195 $true
        $window.Resources['OrbOuterBorderBrush'] = Get-Brush '#8040516A'
        $window.Resources['OrbTopHighlightBrush'] = Get-Brush '#24FFFFFF'
        $window.Resources['OrbHandleBorderBrush'] = Get-Brush '#38FFFFFF'
        $window.Resources['OrbOperationBrush'] = Get-Brush '#12FFFFFF'
        $window.Resources['OrbOperationBorderBrush'] = Get-Brush '#21FFFFFF'
        $window.Resources['OrbActionBrush'] = Get-Brush '#0FFFFFFF'
        $window.Resources['OrbActionBorderBrush'] = Get-Brush '#1CFFFFFF'
    } else {
        $card = switch ($State) {
            'good' { @('#D9EBFF', '#DDF8EF', '#E7DEFF') }
            'warning' { @('#DCEBFF', '#E5F7EE', '#E8DEFF') }
            'danger' { @('#DFE9FF', '#F0E5EE', '#E8DEFF') }
            default { @('#DDEBFF', '#E2F5F1', '#E8E0FA') }
        }
        $hero = switch ($State) {
            'good' { @('#70FFFFFF', '#38DDEEFF') }
            'warning' { @('#70FFFFFF', '#38F6E7C8') }
            'danger' { @('#70FFFFFF', '#38F2DDE3') }
            default { @('#70FFFFFF', '#38E3EBF5') }
        }
        $token = Get-Brush '#E8F3FF'
        $side = Get-Brush '#42FFFFFF'
        $edgeBrush = New-GradientBrushWithStops @(@('#DBFFFFFF', 0.0), @('#CCF0F8FF', 0.55), @('#D1F6F2FF', 1.0)) 79.8907 276.955 $true
        $edgeGlowBrush = New-RadialGradientBrushWithStops @(@('#0F376DFF', 0.0), @('#00376DFF', 1.0)) 52 75 286 82.5 $true
        $handleBrush = New-GradientBrushWithStops @(@('#1F376DFF', 0.0), @('#4D9B69FF', 1.0)) 100.912 39.0195 $true
        $window.Resources['OrbOuterBorderBrush'] = Get-Brush '#E6AEBFD9'
        $window.Resources['OrbTopHighlightBrush'] = Get-Brush '#F0FFFFFF'
        $window.Resources['OrbHandleBorderBrush'] = Get-Brush '#99FFFFFF'
        $window.Resources['OrbOperationBrush'] = Get-Brush '#12376DFF'
        $window.Resources['OrbOperationBorderBrush'] = Get-Brush '#2E376DFF'
        $window.Resources['OrbActionBrush'] = Get-Brush '#0A000000'
        $window.Resources['OrbActionBorderBrush'] = Get-Brush '#17000000'
    }
    $cardBrush = if ($theme -eq 'dark') { New-GradientBrush $card } else { New-LightAtmosphereBrush }
    $heroBrush = New-GradientBrush $hero
    $script:CardRoot.Background = $cardBrush
    $script:BarSurface.Background = $cardBrush.Clone()
    $script:OrbCollapsed.Background = $cardBrush.Clone()
    $script:OrbSurfacePath.Fill = $edgeBrush
    $script:OrbGlowPath.Fill = $edgeGlowBrush
    $script:OrbExpanded.Background = [Windows.Media.Brushes]::Transparent
    $script:OrbHandleSurface.Fill = $handleBrush
    $script:HeroLeftSurface.Background = [Windows.Media.Brushes]::Transparent
    $script:ZcodeHeroSurface.Background = $heroBrush.Clone()
    $script:HeroSideSurface.Background = [Windows.Media.Brushes]::Transparent
    $script:ZcodeSideSurface.Background = $side.Clone()
    $script:TokenSummaryPanel.Background = $token
    $window.Resources['RailBrush'] = (Get-Brush (Get-ThemeColor 'RailBrush'))
}

function Get-ResolvedTheme {
    if ($script:ThemeMode -eq 'auto') { return Get-SystemTheme }
    return $script:ThemeMode
}

function Get-ThemeColor([string]$ResourceName) {
    $resolved = if ($script:ResolvedTheme) { $script:ResolvedTheme } else { Get-ResolvedTheme }
    return [string]$script:ThemePalettes[$resolved][$ResourceName]
}

function Apply-Theme {
    $resolved = Get-ResolvedTheme
    if ($resolved -notin @('dark', 'light')) { $resolved = 'dark' }
    if ($script:ResolvedTheme -eq $resolved) { return }
    $script:ResolvedTheme = $resolved
    foreach ($entry in $script:ThemePalettes[$resolved].GetEnumerator()) {
        $window.Resources[$entry.Key] = Get-Brush ([string]$entry.Value)
    }
    Set-CardMaterial $(if ($script:VisualState) { $script:VisualState } else { 'unavailable' })
    if ($script:LastSnapshot) { Update-Window $script:LastSnapshot }
    Update-TrayMenu
}

function Set-ThemePreference([string]$Theme) {
    if ($Theme -notin @('auto', 'dark', 'light')) { return }
    $script:ThemeMode = $Theme
    $script:ResolvedTheme = ''
    Save-Settings
    Apply-Theme
}

function Set-UiError([string]$Message) {
    if ($null -ne $script:UpdateText) { $script:UpdateText.Text = $Message }
    if ($null -ne $script:OrbUpdateText) { $script:OrbUpdateText.Text = $Message }
}

function Invoke-UiAction([scriptblock]$Action, [string]$FailureMessage) {
    try { & $Action }
    catch {
        [Console]::Error.WriteLine(('ui_action_failed {0}: {1}' -f $_.Exception.GetType().Name, $_.Exception.Message))
        Set-UiError $FailureMessage
    }
}

function Format-Tokens($Value) {
    if ($null -eq $Value) { return '—' }
    $number = [double]$Value
    if ($number -ge 1000000) { return ('{0:0.0}M' -f ($number / 1000000)) }
    if ($number -ge 1000) { return ('{0:0.0}K' -f ($number / 1000)) }
    return ('{0:N0}' -f $number)
}

function Get-PreviewSnapshot {
    $now = [DateTimeOffset]::Now
    $today = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
    $weekly = [pscustomobject]@{
        id = 'secondary'; label = '每周'; windowMinutes = 10080; usedPercent = 58; remainingPercent = 42
        resetsAt = $now.AddDays(6).AddHours(11).ToString('o'); source = 'app_server'; quality = 'derived'
    }
    $limits = @($weekly)
    if ($script:PreviewState -eq 'dual') {
        $five = [pscustomobject]@{
            id = 'primary'; label = '5 小时'; windowMinutes = 300; usedPercent = 26; remainingPercent = 74
            resetsAt = $now.AddHours(1).AddMinutes(18).ToString('o'); source = 'app_server'; quality = 'derived'
        }
        $limits = @($five, $weekly)
    }
    $codexTokens = [pscustomobject]@{
        input = 12600000; cachedInput = 5100000; output = 1900000; reasoningOutput = 200000; total = 19800000
        lifetimeTotal = 392800000; daily = @([pscustomobject]@{ date = $today; tokens = 30300000 })
        source = 'thread_event'; quality = 'official'
    }
    $zcodeDaily = if ($script:PreviewState -eq 'zcode-empty') { @() } else { @([pscustomobject]@{ date = $today; tokens = 920000 }) }
    $zcodeTokens = [pscustomobject]@{
        input = 139200; cachedInput = 4100000; output = 31600; reasoningOutput = $null; total = 4270800
        lifetimeTotal = 4300000; daily = $zcodeDaily; source = 'local_session'; quality = 'local_estimate'
    }
    $codex = [pscustomobject]@{
        clientId = 'codex'; displayName = 'Codex'; available = $true; planType = 'plus'; billingMode = 'subscription'
        limits = $limits; tokenUsage = $codexTokens; models = $null; warnings = @()
    }
    $zcode = [pscustomobject]@{
        clientId = 'zcode'; displayName = 'ZCode'; available = $true; planType = $null; billingMode = 'local'
        limits = @(); tokenUsage = $zcodeTokens; models = [pscustomobject]@{ SyncRoot = [pscustomobject]@{ input = 139200; output = 31600 } }; warnings = @()
    }
    return [pscustomobject]@{
        schemaVersion = 2; fetchedAt = $now.ToString('o'); staleAfter = $now.AddMinutes(2).ToString('o')
        clients = [pscustomobject]@{ codex = $codex; zcode = $zcode }; warnings = @()
    }
}

function Get-QuotaColor($Remaining) {
    if ($null -eq $Remaining) { return Get-ThemeColor 'UnavailableBrush' }
    if ([double]$Remaining -ge 50) { return Get-ThemeColor 'SuccessBrush' }
    if ([double]$Remaining -ge 20) { return Get-ThemeColor 'WarningBrush' }
    return Get-ThemeColor 'DangerBrush'
}

function Get-QuotaState($Remaining) {
    if ($null -eq $Remaining) { return 'unavailable' }
    if ([double]$Remaining -ge 50) { return 'good' }
    if ([double]$Remaining -ge 20) { return 'warning' }
    return 'danger'
}

function Get-QuotaStatusText($Remaining) {
    if ($null -eq $Remaining) { return '— 服务未提供' }
    if ([double]$Remaining -ge 50) { return '● 充足' }
    if ([double]$Remaining -ge 20) { return '▲ 偏低' }
    return '! 紧张'
}

function Get-QuotaPercentText($Limit) {
    if ($null -eq $Limit -or $null -eq $Limit.remainingPercent) { return '—' }
    return ('{0:0.#}%' -f [math]::Max(0, [math]::Min(100, [double]$Limit.remainingPercent)))
}

function Set-QuotaReset($Limit, [string]$ResetSlot) {
    $value = $null
    if ($Limit -and $Limit.resetsAt) {
        try { $value = [DateTimeOffset]::Parse([string]$Limit.resetsAt) } catch { $value = $null }
    }
    Set-Variable -Scope Script -Name $ResetSlot -Value $value
}

function Set-RingArc($Path, $Remaining, [double]$Size, [double]$StrokeWidth) {
    if ($null -eq $Path) { return }
    if ($null -eq $Remaining) { $Path.Data = $null; return }
    $percent = [math]::Max(0, [math]::Min(100, [double]$Remaining))
    $radius = ($Size - $StrokeWidth) / 2
    $pathWidth = if ([double]::IsNaN([double]$Path.Width)) { $Size } else { [double]$Path.Width }
    $offset = [math]::Max(0, ($pathWidth - $Size) / 2)
    $center = ($Size / 2) + $offset
    if ($percent -ge 99.95) {
        $Path.Data = New-Object Windows.Media.EllipseGeometry((New-Object Windows.Point($center, $center)), $radius, $radius)
        return
    }
    if ($percent -le 0) { $Path.Data = $null; return }
    $startAngle = -90.0
    $endAngle = $startAngle + (359.9 * $percent / 100.0)
    $startRadians = $startAngle * [math]::PI / 180
    $endRadians = $endAngle * [math]::PI / 180
    $start = New-Object Windows.Point(($center + $radius * [math]::Cos($startRadians)), ($center + $radius * [math]::Sin($startRadians)))
    $finish = New-Object Windows.Point(($center + $radius * [math]::Cos($endRadians)), ($center + $radius * [math]::Sin($endRadians)))
    $segment = New-Object Windows.Media.ArcSegment
    $segment.Point = $finish
    $segment.Size = New-Object Windows.Size($radius, $radius)
    $segment.SweepDirection = [Windows.Media.SweepDirection]::Clockwise
    $segment.IsLargeArc = $percent -gt 50
    $figure = New-Object Windows.Media.PathFigure
    $figure.StartPoint = $start
    $figure.IsClosed = $false
    [void]$figure.Segments.Add($segment)
    $geometry = New-Object Windows.Media.PathGeometry
    [void]$geometry.Figures.Add($figure)
    $Path.Data = $geometry
}

function Set-QuotaForeground($Limit, [object[]]$Controls) {
    $remaining = if ($Limit) { $Limit.remainingPercent } else { $null }
    $brush = Get-Brush (Get-QuotaColor $remaining)
    foreach ($control in $Controls) { if ($null -ne $control) { $control.Foreground = $brush } }
}

function Format-Countdown($ResetAt) {
    if ($null -eq $ResetAt) { return $null }
    $span = $ResetAt - [DateTimeOffset]::Now
    if ($span.TotalSeconds -le 0) { return '等待刷新' }
    if ($span.TotalDays -ge 1) { return ('{0}天{1}小时后' -f [math]::Floor($span.TotalDays), $span.Hours) }
    if ($span.TotalHours -ge 1) { return ('{0}小时{1}分后' -f [math]::Floor($span.TotalHours), $span.Minutes) }
    return ('{0}分{1}秒后' -f [math]::Max(0, $span.Minutes), [math]::Max(0, $span.Seconds))
}

function Format-CompactCountdown($ResetAt) {
    if ($null -eq $ResetAt) { return $null }
    $span = $ResetAt - [DateTimeOffset]::Now
    if ($span.TotalSeconds -le 0) { return '等待刷新' }
    if ($span.TotalDays -ge 1) { return ('{0}天后' -f [math]::Floor($span.TotalDays)) }
    if ($span.TotalHours -ge 1) { return ('{0}小时后' -f [math]::Floor($span.TotalHours)) }
    return ('{0}分后' -f [math]::Max(0, $span.Minutes))
}

function Update-Countdowns {
    $five = Format-Countdown $script:FiveResetAt
    $week = Format-Countdown $script:WeekResetAt
    $weekCompact = Format-CompactCountdown $script:WeekResetAt
    if ($null -ne $five) { $script:HeroFiveReset.Text = $five + '重置' }
    elseif ($script:FiveLimitPresent) { $script:HeroFiveReset.Text = '重置时间未提供' }
    else { $script:HeroFiveReset.Text = '' }
    if ($null -ne $week) {
        $script:HeroWeekReset.Text = $weekCompact + '重置'
        $script:SideWeekReset.Text = $week + '重置'
    } elseif ($script:WeekLimitPresent) {
        $script:HeroWeekReset.Text = '重置时间未提供'
        $script:SideWeekReset.Text = '重置时间未提供'
    } else {
        $script:HeroWeekReset.Text = ''
        $script:SideWeekReset.Text = ''
    }
    if ($null -ne $five) { $script:BarReset.Text = '5小时 ' + $five }
    elseif ($null -ne $week) { $script:BarReset.Text = '每周 ' + $week }
    else { $script:BarReset.Text = '服务未提供' }
    if ($script:ActiveClient -eq 'zcode') {
        $script:OrbResetValue.Text = '本机统计'
    } elseif ($null -ne $five) {
        $script:OrbResetValue.Text = (Format-CompactCountdown $script:FiveResetAt)
    } elseif ($null -ne $week) {
        $script:OrbResetValue.Text = (Format-CompactCountdown $script:WeekResetAt)
    } elseif ($script:FiveLimitPresent -or $script:WeekLimitPresent) {
        $script:OrbResetValue.Text = '时间未提供'
    } else {
        $script:OrbResetValue.Text = '服务未提供'
    }
}

function Set-TrayStatus($Five, $Week) {
    $values = @($Five, $Week) | Where-Object { $null -ne $_ }
    $minimum = if ($values.Count) { ($values | Measure-Object -Minimum).Minimum } else { $null }
    $color = Get-QuotaColor $minimum
    $oldIcon = $script:TrayIcon.Icon
    $script:TrayIcon.Icon = New-StatusIcon $color
    if ($null -ne $oldIcon) { $oldIcon.Dispose() }
    $fiveText = if ($null -eq $Five) { '—' } else { "$Five%" }
    $weekText = if ($null -eq $Week) { '—' } else { "$Week%" }
    $script:TrayIcon.Text = "Codex 用量：5小时 $fiveText / 每周 $weekText"
}

function Update-Window($Snapshot) {
    $script:LastSnapshot = $Snapshot
    $codex = $Snapshot.clients.codex
    $zcode = $Snapshot.clients.zcode

    # Auto-pick the active client on first refresh: prefer the current selection
    # if it has data, otherwise the first client that does.
    $activeId = $script:ActiveClient
    $active = $Snapshot.clients.$activeId
    if (-not $active -or -not $active.available) {
        if ($codex -and $codex.available) { $activeId = 'codex'; $active = $codex }
        elseif ($zcode -and $zcode.available) { $activeId = 'zcode'; $active = $zcode }
        $script:ActiveClient = $activeId
    }
    if (-not $active) {
        Set-UiError '当前没有可显示的用量数据'
        return
    }

    # Source-specific hierarchy: Codex puts the 5h quota first when available;
    # weekly moves into the hero only when 5h is absent. ZCode is token-first.
    $brandLabel = if ($activeId -eq 'zcode') { 'ZCODE' } else { 'CODEX' }
    $planLabel = if ($active.planType) { ([string]$active.planType).ToUpperInvariant() } elseif ($activeId -eq 'zcode') { 'LOCAL' } else { 'USAGE' }
    $script:BrandText.Text = $brandLabel
    $script:PlanText.Text = $planLabel
    $limits = @($active.limits)
    $five = $limits | Where-Object { $_.windowMinutes -eq 300 } | Select-Object -First 1
    $week = $limits | Where-Object { $_.windowMinutes -eq 10080 } | Select-Object -First 1
    $script:FiveLimitPresent = $null -ne $five
    $script:WeekLimitPresent = $null -ne $week
    Set-QuotaReset $five 'FiveResetAt'
    Set-QuotaReset $week 'WeekResetAt'

    $fiveText = Get-QuotaPercentText $five
    $weekText = Get-QuotaPercentText $week
    $script:HeroFiveValue.Text = $fiveText.TrimEnd('%')
    $script:HeroFiveUnit.Visibility = if ($fiveText.EndsWith('%')) { 'Visible' } else { 'Collapsed' }
    $script:HeroFiveStatus.Text = Get-QuotaStatusText $(if ($five) { $five.remainingPercent } else { $null })
    $script:HeroFiveRail.Width = if ($five -and $null -ne $five.remainingPercent) { 352 * [math]::Max(0, [math]::Min(100, [double]$five.remainingPercent)) / 100 } else { 0 }
    $script:BarFiveRemaining.Text = $fiveText
    $script:HeroFiveValue.Foreground = Get-Brush (Get-ThemeColor 'TextPrimaryBrush')
    Set-QuotaForeground $five @($script:HeroFiveStatus, $script:BarFiveRemaining)
    $accentGradient = New-GradientBrush @('#376DFF', '#35B5FF')
    $script:HeroFiveRail.Background = $accentGradient

    $script:HeroWeekValue.Text = $weekText.TrimEnd('%')
    $script:SideWeekValue.Text = $weekText.TrimEnd('%')
    $script:HeroWeekUnit.Visibility = if ($weekText.EndsWith('%')) { 'Visible' } else { 'Collapsed' }
    $script:SideWeekUnit.Visibility = if ($weekText.EndsWith('%')) { 'Visible' } else { 'Collapsed' }
    $weekStatus = if ($week -and $null -ne $week.remainingPercent) {
        if ([double]$week.remainingPercent -ge 50) { '● 充足' } elseif ([double]$week.remainingPercent -ge 20) { '▲ 偏低' } else { '! 紧张' }
    } else { '服务未提供' }
    $script:HeroWeekStatus.Text = $weekStatus
    $script:SideWeekStatus.Text = $weekStatus
    $script:BarWeekRemaining.Text = $weekText
    $script:BarWeekDot.Text = if ($week -and $null -ne $week.remainingPercent) { ' ●' } else { '' }
    $script:HeroWeekValue.Foreground = Get-Brush (Get-ThemeColor 'TextPrimaryBrush')
    $script:SideWeekValue.Foreground = Get-Brush (Get-ThemeColor 'TextPrimaryBrush')
    Set-QuotaForeground $week @($script:HeroWeekStatus, $script:SideWeekStatus, $script:BarWeekRemaining)
    $weekColor = Get-Brush (Get-QuotaColor $(if ($week) { $week.remainingPercent } else { $null }))
    $accentColor = New-GradientBrush @('#376DFF', '#35B5FF')
    $script:BarWeekDot.Foreground = $weekColor
    $script:HeroWeekArc.Stroke = $accentColor
    $script:SideWeekArc.Stroke = $accentColor
    Set-RingArc $script:HeroWeekArc $(if ($week) { $week.remainingPercent } else { $null }) 190 8
    Set-RingArc $script:SideWeekArc $(if ($week) { $week.remainingPercent } else { $null }) 118 7

    $todayKey = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
    $tokenUsage = $active.tokenUsage
    $activeToday = @($tokenUsage.daily) | Where-Object { $_.date -eq $todayKey } | Select-Object -First 1
    $todayValue = Format-Tokens $(if ($activeToday) { $activeToday.tokens } else { $null })
    $currentValue = if ($tokenUsage -and $tokenUsage.source -eq 'thread_event') { Format-Tokens $tokenUsage.total } else { '—' }
    $lifetimeValue = Format-Tokens $(if ($tokenUsage) { $tokenUsage.lifetimeTotal } else { $null })
    $script:CurrentTokens.Text = $currentValue
    $script:TodayTokens.Text = $todayValue
    $script:LifetimeTokens.Text = $lifetimeValue
    $script:CurrentTokensCompact.Text = $currentValue
    $script:LifetimeTokensCompact.Text = $lifetimeValue
    $script:SideTodayValue.Text = $todayValue
    $script:BarTodayTokens.Text = $todayValue
    $modelProperties = if ($active.models) { @($active.models.PSObject.Properties) } else { @() }
    $modelEntry = $modelProperties | Sort-Object { [double]$_.Value.input + [double]$_.Value.output } -Descending | Select-Object -First 1
    $modelName = if ($modelEntry) { [string]$modelEntry.Name } else { '—' }
    $hasToday = $null -ne $activeToday -and $null -ne $activeToday.tokens
    if ($activeId -eq 'zcode' -and -not $hasToday) {
        $script:ZcodeHeroLabel.Text = '本机累计'
        $script:ZcodeTodayValue.Text = $lifetimeValue
        $script:ZcodeNotice.Text = '本机日志累计 · 本地估算'
        $script:ZcodeSideMetricLabel.Text = '今日 Token'
        $script:ZcodeTotalValue.Text = '—'
        $script:ZcodeSideNotice.Text = '今日暂无记录'
    } else {
        $script:ZcodeHeroLabel.Text = '今日 Token'
        $script:ZcodeTodayValue.Text = $todayValue
        $script:ZcodeNotice.Text = '本机统计 · 无官方配额'
        $script:ZcodeSideMetricLabel.Text = '本机累计'
        $script:ZcodeTotalValue.Text = $lifetimeValue
        $script:ZcodeSideNotice.Text = ''
    }
    $script:PlanPill.ToolTip = if ($activeId -eq 'zcode') { 'ZCode 暂无官方配额，仅显示本机日志统计' } else { 'Codex 账户套餐' }
    $script:ZcodeModelValue.Text = $modelName
    $script:ZcodeInputValue.Text = $todayValue
    $script:ZcodeCachedValue.Text = $lifetimeValue
    $script:ZcodeOutputValue.Text = Format-Tokens $(if ($tokenUsage) { $tokenUsage.output } else { $null })
    $script:BarZcodeToday.Text = $todayValue
    $script:BarZcodeTotal.Text = $lifetimeValue
    $script:BarZcodeModel.Text = $modelName
    $script:CodexQuotaPanel.Visibility = if ($activeId -eq 'codex') { 'Visible' } else { 'Collapsed' }
    $script:ZcodeSummaryPanel.Visibility = if ($activeId -eq 'zcode') { 'Visible' } else { 'Collapsed' }
    $script:BarCodexContent.Visibility = if ($activeId -eq 'codex') { 'Visible' } else { 'Collapsed' }
    $script:BarZcodeContent.Visibility = if ($activeId -eq 'zcode') { 'Visible' } else { 'Collapsed' }
    $script:BarClient.Text = [string]$active.displayName

    if ($activeId -eq 'codex') {
        $script:ZcodeTokenBreakdown.Visibility = 'Collapsed'
        if ($five) {
            $script:HeroFivePanel.Visibility = 'Visible'
            $script:HeroWeekPanel.Visibility = 'Collapsed'
            $script:HeroUnavailablePanel.Visibility = 'Collapsed'
        } elseif ($week) {
            $script:HeroFivePanel.Visibility = 'Collapsed'
            $script:HeroWeekPanel.Visibility = 'Visible'
            $script:HeroUnavailablePanel.Visibility = 'Collapsed'
        } else {
            $script:HeroFivePanel.Visibility = 'Collapsed'
            $script:HeroWeekPanel.Visibility = 'Collapsed'
            $script:HeroUnavailablePanel.Visibility = 'Visible'
        }
        $showWeeklySide = $null -ne $five -and $null -ne $week
        $script:SideWeekPanel.Visibility = if ($showWeeklySide) { 'Visible' } else { 'Collapsed' }
        $script:SideTodayPanel.Visibility = if ($showWeeklySide) { 'Collapsed' } else { 'Visible' }
        $script:TokenSummaryThree.Visibility = if ($showWeeklySide) { 'Visible' } else { 'Collapsed' }
        $script:TokenSummaryTwo.Visibility = if ($showWeeklySide) { 'Collapsed' } else { 'Visible' }
        $heroRemaining = if ($five) { $five.remainingPercent } elseif ($week) { $week.remainingPercent } else { $null }
        $script:VisualState = Get-QuotaState $heroRemaining
    } else {
        $script:TokenSummaryThree.Visibility = 'Collapsed'
        $script:TokenSummaryTwo.Visibility = 'Collapsed'
        $script:ZcodeTokenBreakdown.Visibility = 'Visible'
        $script:VisualState = 'unavailable'
    }
    Set-CardMaterial $script:VisualState
    if ($script:CurrentVisualMode -eq 'card') {
        $script:MainContentRow.Height = New-Object Windows.GridLength($(if ($activeId -eq 'zcode') { 143 } else { 214 }))
        $window.Height = if ($activeId -eq 'zcode') { 333 } else { 404 }
    }
    $stale = [DateTimeOffset]::Now -gt [DateTimeOffset]::Parse([string]$Snapshot.staleAfter)
    $timeLabel = $(if ($stale) { '数据可能已过期 · ' } else { '' }) + '更新于 ' + ([DateTimeOffset]::Parse([string]$Snapshot.fetchedAt).ToLocalTime().ToString('HH:mm'))
    $script:UpdateText.Text = $timeLabel
    $codexFive = if ($codex) { $codex.limits | Where-Object { $_.windowMinutes -eq 300 } | Select-Object -First 1 } else { $null }
    $codexWeek = if ($codex) { $codex.limits | Where-Object { $_.windowMinutes -eq 10080 } | Select-Object -First 1 } else { $null }
    Set-TrayStatus $(if ($codexFive) { $codexFive.remainingPercent } else { $null }) $(if ($codexWeek) { $codexWeek.remainingPercent } else { $null })
    Update-Countdowns

    # Edge Capsule: collapsed shows the active client's primary signal. The
    # expanded capsule remains anchored at the same screen edge and reveals
    # only primary quota, reset, today's tokens, and direct mode actions.
    $zcodeToday = if ($zcode) { $zcode.tokenUsage.daily | Where-Object { $_.date -eq $todayKey } | Select-Object -First 1 } else { $null }
    # Pick the orb signal for the selected source: Codex quota, or ZCode today's tokens.
    $orbPercent = $null
    $orbPercentLabel = ''
    if ($codexFive -and $null -ne $codexFive.remainingPercent) { $orbPercent = $codexFive.remainingPercent; $orbPercentLabel = '5h' }
    elseif ($codexWeek -and $null -ne $codexWeek.remainingPercent) { $orbPercent = $codexWeek.remainingPercent; $orbPercentLabel = '周' }
    if ($activeId -eq 'zcode') {
        $script:OrbTokens.Text = Format-Tokens $(if ($zcodeToday) { $zcodeToday.tokens } else { $null })
        $script:OrbLabel.Text = '今日'
    } else {
        $script:OrbTokens.Text = if ($null -ne $orbPercent) { ('{0:F0}%' -f [double]$orbPercent) } else { '—' }
        $script:OrbLabel.Text = if ($orbPercentLabel) { $orbPercentLabel } else { '无配额' }
    }
    $primaryQuota = if ($codexFive) { $codexFive } elseif ($codexWeek) { $codexWeek } else { $null }
    $primaryQuotaText = if ($primaryQuota -and $null -ne $primaryQuota.remainingPercent) { ('{0:F0}%' -f [double]$primaryQuota.remainingPercent) } else { '—' }
    $script:OrbExpTitle.Text = if ($activeId -eq 'zcode') { 'ZCODE · LOCAL' } else { 'CODEX · ' + $planLabel }
    if ($activeId -eq 'zcode') {
        $script:OrbPrimaryLabel.Text = '今日 Token'
        $script:OrbPrimaryValue.Text = Format-Tokens $(if ($zcodeToday) { $zcodeToday.tokens } else { $null })
        $script:OrbTodayLabel.Text = '本机累计'
        $script:OrbTodayValue.Text = Format-Tokens $(if ($zcode) { $zcode.tokenUsage.lifetimeTotal } else { $null })
    } else {
        $script:OrbPrimaryLabel.Text = if ($codexFive) { '5 小时额度' } elseif ($codexWeek) { '每周额度' } else { '配额' }
        $script:OrbPrimaryValue.Text = $primaryQuotaText
        $script:OrbTodayLabel.Text = '今日 Token'
        $script:OrbTodayValue.Text = $todayValue
    }
    $script:OrbUpdateText.Text = $timeLabel
    $accentBrush = New-GradientBrushWithStops @(@('#376DFF', 0.0), @('#35B5FF', 1.0)) 1.0 0.0
    $statusBrush = Get-Brush $(if ($activeId -eq 'zcode') { Get-ThemeColor 'AccentBrush' } else { Get-QuotaColor $orbPercent })
    $script:OrbArc.Stroke = $accentBrush
    $script:OrbPrimaryMiniArc.Stroke = $accentBrush
    $script:OrbHandleArc.Stroke = $accentBrush
    $script:OrbStatusDot.Fill = Get-Brush (Get-ThemeColor 'SuccessBrush')
    $script:OrbHandleDot.Fill = Get-Brush (Get-ThemeColor 'SuccessBrush')
    $script:OrbHandleValue.Text = $script:OrbTokens.Text
    $script:OrbHandleValue.FontSize = if ($activeId -eq 'zcode') { 12 } else { 14 }
    $script:OrbTokens.FontSize = if ($activeId -eq 'zcode') { 13 } else { 18 }
    Set-RingArc $script:OrbArc $(if ($activeId -eq 'zcode') { $null } else { $orbPercent }) 54 5
    Set-RingArc $script:OrbPrimaryMiniArc $(if ($activeId -eq 'zcode') { $null } else { $orbPercent }) 34 4
    Set-RingArc $script:OrbHandleArc $(if ($activeId -eq 'zcode') { $null } else { $orbPercent }) 42 4
}

function Set-ActiveClient([string]$ClientId) {
    if (-not $script:LastSnapshot -or -not $script:LastSnapshot.clients.$ClientId) { return }
    $script:ActiveClient = $ClientId
    Save-Settings
    Update-Window $script:LastSnapshot
}

function New-DropdownItem([string]$Label, [bool]$Selected, [string]$Action, [string]$Value) {
    $border = New-Object Windows.Controls.Border
    $border.CornerRadius = New-Object Windows.CornerRadius(6)
    $border.MinHeight = 36
    $border.Padding = New-Object Windows.Thickness(12,7,12,7)
    $border.Margin = New-Object Windows.Thickness(0,1,0,1)
    $border.Cursor = [Windows.Input.Cursors]::Hand
    $text = New-Object Windows.Controls.TextBlock
    $text.Text = $Label
    $text.FontSize = 14
    $text.VerticalAlignment = [Windows.VerticalAlignment]::Center
    $text.Foreground = if ($Selected) { Get-Brush (Get-ThemeColor 'AccentBrush') } else { Get-Brush (Get-ThemeColor 'TextSecondaryBrush') }
    if ($Selected) { $text.FontWeight = [Windows.FontWeights]::SemiBold }
    $border.Child = $text
    $border.Tag = [pscustomobject]@{ Action = $Action; Value = $Value; Popup = $script:DropdownPopup }
    $border.Add_MouseEnter({ param($sender) $sender.Background = Get-Brush (Get-ThemeColor 'SurfaceHoverBrush') })
    $border.Add_MouseLeave({ param($sender) $sender.Background = [Windows.Media.Brushes]::Transparent })
    $border.Add_MouseLeftButtonUp({
        param($sender, $eventArgs)
        try {
            if ($sender.Tag.Action -eq 'client') { Set-ActiveClient ([string]$sender.Tag.Value) }
            elseif ($sender.Tag.Action -eq 'mode') { Set-ModePreference ([string]$sender.Tag.Value) }
            elseif ($sender.Tag.Action -eq 'theme') { Set-ThemePreference ([string]$sender.Tag.Value) }
            $eventArgs.Handled = $true
        } catch {
            Set-UiError '切换失败，已保留当前显示'
        } finally {
            $sender.Tag.Popup.IsOpen = $false
        }
    })
    return $border
}

function Show-ClientDropdown {
    $script:DropdownPopup.StaysOpen = $false
    $script:DropdownPanel.Children.Clear()
    $snapshot = $script:LastSnapshot
    if (-not $snapshot) { return }
    foreach ($id in @('codex', 'zcode')) {
        $client = $snapshot.clients.$id
        if (-not $client) { continue }
        $label = $client.displayName
        if ($client.billingMode) { $label = $label + ' · ' + $(if ($client.billingMode -eq 'subscription') { '订阅' } else { 'API Key' }) }
        if (-not $client.available) { $label = $label + '（无数据）' }
        $selected = ($id -eq $script:ActiveClient)
        $item = New-DropdownItem $label $selected 'client' $id
        [void]$script:DropdownPanel.Children.Add($item)
    }
    $script:DropdownPopup.IsOpen = $true
}

function Show-ModeDropdown {
    if ($script:DropdownPopup.IsOpen) { $script:DropdownPopup.IsOpen = $false; return }
    # A non-activating bar owner would immediately close a default WPF Popup.
    # Keep this menu open until the user chooses a mode or taps the mode button
    # again; card/orb menus retain normal click-away dismissal.
    $script:DropdownPopup.StaysOpen = $script:CurrentVisualMode -eq 'bar'
    $script:DropdownPanel.Children.Clear()
    $modes = @(
        @{ Id = 'auto'; Label = '自动：Codex 卡片 / IDE 指示条 / 其他悬浮球' },
        @{ Id = 'card'; Label = '卡片' },
        @{ Id = 'orb'; Label = '悬浮球' },
        @{ Id = 'bar'; Label = '指示条' }
    )
    foreach ($m in $modes) {
        $selected = ($m.Id -eq $script:DisplayMode)
        $item = New-DropdownItem $m.Label $selected 'mode' $m.Id
        [void]$script:DropdownPanel.Children.Add($item)
    }
    $script:DropdownPopup.IsOpen = $true
}

function Show-ThemeDropdown {
    $script:DropdownPopup.StaysOpen = $false
    $script:DropdownPanel.Children.Clear()
    $themes = @(
        @{ Id = 'auto'; Label = '自动（跟随 Windows）' },
        @{ Id = 'dark'; Label = '深色' },
        @{ Id = 'light'; Label = '浅色' }
    )
    foreach ($theme in $themes) {
        $item = New-DropdownItem $theme.Label ($theme.Id -eq $script:ThemeMode) 'theme' $theme.Id
        [void]$script:DropdownPanel.Children.Add($item)
    }
    $script:DropdownPopup.IsOpen = $true
}

function Refresh-Usage([bool]$Force) {
    try {
        $script:RefreshButton.IsEnabled = $false
        if ($Force) { $script:UpdateText.Text = '正在刷新…' }
        $snapshot = if ($script:PreviewState -in @('dual', 'weekly', 'zcode', 'zcode-empty', 'bar', 'orb', 'orb-expanded')) { Get-PreviewSnapshot } else { Invoke-BridgeRequest '/refresh' 'POST' }
        Update-Window $snapshot
    } catch {
        [Console]::Error.WriteLine(('refresh_usage_failed {0}: {1}' -f $_.Exception.GetType().Name, $_.Exception.Message))
        $script:UpdateText.Text = '暂时无法刷新，保留上次数据'
    } finally {
        $script:RefreshButton.IsEnabled = $true
    }
}

function Get-ModeLabel([string]$Mode) {
    switch ($Mode) {
        'card' { return '卡片' }
        'bar' { return '指示条' }
        'orb' { return '悬浮球' }
        default { return '自动' }
    }
}

function Get-ThemeLabel([string]$Theme) {
    switch ($Theme) {
        'dark' { return '深色' }
        'light' { return '浅色' }
        default { return '自动' }
    }
}

function Update-TrayMenu {
    if ($null -eq $script:AutoMenuItem) { return }
    $script:AutoMenuItem.Checked = $script:DisplayMode -eq 'auto'
    $script:CardMenuItem.Checked = $script:DisplayMode -eq 'card'
    $script:BarMenuItem.Checked = $script:DisplayMode -eq 'bar'
    $script:OrbMenuItem.Checked = $script:DisplayMode -eq 'orb'
    $script:ThemeAutoMenuItem.Checked = $script:ThemeMode -eq 'auto'
    $script:ThemeDarkMenuItem.Checked = $script:ThemeMode -eq 'dark'
    $script:ThemeLightMenuItem.Checked = $script:ThemeMode -eq 'light'
    $script:ThemeAutoMenuItem.Text = '自动跟随系统（当前' + $(if ($script:ResolvedTheme -eq 'light') { '浅色' } else { '深色' }) + '）'
    $script:StartupMenuItem.Checked = Test-StartupEnabled
    $label = Get-ModeLabel $script:DisplayMode
    $script:CardModeButton.ToolTip = '显示模式：' + $label
    $script:BarModeButton.ToolTip = '切换到卡片（当前：' + $label + '）'
    $script:OrbCardButton.ToolTip = '切换到卡片（当前：' + $label + '）'
    $script:OrbBarButton.ToolTip = '切换到指示条（当前：' + $label + '）'
    $script:ThemeButton.ToolTip = '主题：' + (Get-ThemeLabel $script:ThemeMode) + $(if ($script:ThemeMode -eq 'auto') { '（当前' + $(if ($script:ResolvedTheme -eq 'light') { '浅色' } else { '深色' }) + '）' } else { '' })
}

function Apply-VisualMode([string]$VisualMode) {
    if ($script:CurrentVisualMode -eq $VisualMode) {
        if ($VisualMode -eq 'bar') { Update-BarPlacement }
        return
    }
    $script:CurrentVisualMode = $VisualMode
    $workArea = [System.Windows.SystemParameters]::WorkArea
    if ($VisualMode -eq 'card') {
        Set-OverlayClickThrough $false
        $window.Opacity = 1
        $script:CardRoot.Visibility = 'Visible'
        $script:BarRoot.Visibility = 'Collapsed'
        $script:OrbRoot.Visibility = 'Collapsed'
        $window.Width = 576
        $window.Height = if ($script:ActiveClient -eq 'zcode') { 333 } else { 404 }
        $window.Left = $workArea.Right - $window.Width - 18
        $window.Top = $workArea.Bottom - $window.Height - 18
    } elseif ($VisualMode -eq 'orb') {
        Set-OverlayClickThrough $false
        $window.Opacity = 1
        $script:CardRoot.Visibility = 'Collapsed'
        $script:BarRoot.Visibility = 'Collapsed'
        $script:OrbRoot.Visibility = 'Visible'
        Set-OrbExpanded $false
        $window.Width = 84
        $window.Height = 120
        $window.Left = $workArea.Right - $window.Width - 6
        $window.Top = $workArea.Bottom - $window.Height - 18
    } else {
        # The compact bar contains real mode controls, so keep it interactive.
        # Its 600-DIP bounded window avoids IDE menus without relying on a
        # full-width click-through overlay.
        Set-OverlayClickThrough $false
        $script:CardRoot.Visibility = 'Collapsed'
        $script:BarRoot.Visibility = 'Visible'
        $script:OrbRoot.Visibility = 'Collapsed'
        Update-BarPlacement
    }
}

function Set-OrbExpanded([bool]$Expanded, [bool]$Animate = $false) {
    $anchorRight = $window.Left + $window.Width
    $anchorBottom = $window.Top + $window.Height
    $workArea = Get-OverlayMonitorWorkArea
    $targetWidth = if ($Expanded) { 520.0 } else { 84.0 }
    $targetHeight = if ($Expanded) { 150.0 } else { 120.0 }
    $targetLeft = [math]::Max($workArea.Left + 6, [math]::Min($workArea.Right - $targetWidth - 6, $anchorRight - $targetWidth))
    $targetTop = [math]::Max($workArea.Top + 6, [math]::Min($workArea.Bottom - $targetHeight - 6, $anchorBottom - $targetHeight))
    $script:OrbExpandedState = $Expanded

    if ($script:OrbAnimationTimer) { $script:OrbAnimationTimer.Stop() }
    if (-not $Animate -or -not [Windows.SystemParameters]::ClientAreaAnimation) {
        $script:OrbCollapsed.Visibility = if ($Expanded) { 'Collapsed' } else { 'Visible' }
        $script:OrbExpanded.Visibility = if ($Expanded) { 'Visible' } else { 'Collapsed' }
        $script:OrbCollapsed.Opacity = 1
        $script:OrbExpanded.Opacity = 1
        $window.Width = $targetWidth
        $window.Height = $targetHeight
        $window.Left = $targetLeft
        $window.Top = $targetTop
        return
    }

    $script:OrbCollapsed.Visibility = 'Visible'
    $script:OrbExpanded.Visibility = 'Visible'
    $script:OrbCollapsed.Opacity = if ($Expanded) { 1 } else { 0 }
    $script:OrbExpanded.Opacity = if ($Expanded) { 0 } else { 1 }
    $script:OrbAnimation = [pscustomobject]@{
        StartedAt = [DateTime]::UtcNow
        DurationMs = 180.0
        Expanded = $Expanded
        StartWidth = [double]$window.Width
        StartHeight = [double]$window.Height
        StartLeft = [double]$window.Left
        StartTop = [double]$window.Top
        TargetWidth = $targetWidth
        TargetHeight = $targetHeight
        TargetLeft = $targetLeft
        TargetTop = $targetTop
    }
    if (-not $script:OrbAnimationTimer) {
        $script:OrbAnimationTimer = New-Object Windows.Threading.DispatcherTimer
        $script:OrbAnimationTimer.Interval = [TimeSpan]::FromMilliseconds(16)
        $script:OrbAnimationTimer.Add_Tick({
            $animation = $script:OrbAnimation
            if (-not $animation) { $script:OrbAnimationTimer.Stop(); return }
            $elapsed = ([DateTime]::UtcNow - $animation.StartedAt).TotalMilliseconds
            $progress = [math]::Max(0, [math]::Min(1, $elapsed / $animation.DurationMs))
            $eased = 1 - [math]::Pow(1 - $progress, 3)
            $window.Width = $animation.StartWidth + (($animation.TargetWidth - $animation.StartWidth) * $eased)
            $window.Height = $animation.StartHeight + (($animation.TargetHeight - $animation.StartHeight) * $eased)
            $window.Left = $animation.StartLeft + (($animation.TargetLeft - $animation.StartLeft) * $eased)
            $window.Top = $animation.StartTop + (($animation.TargetTop - $animation.StartTop) * $eased)
            if ($animation.Expanded) {
                $script:OrbCollapsed.Opacity = 1 - $eased
                $script:OrbExpanded.Opacity = $eased
            } else {
                $script:OrbCollapsed.Opacity = $eased
                $script:OrbExpanded.Opacity = 1 - $eased
            }
            if ($progress -ge 1) {
                $script:OrbAnimationTimer.Stop()
                $window.Width = $animation.TargetWidth
                $window.Height = $animation.TargetHeight
                $window.Left = $animation.TargetLeft
                $window.Top = $animation.TargetTop
                $script:OrbCollapsed.Visibility = if ($animation.Expanded) { 'Collapsed' } else { 'Visible' }
                $script:OrbExpanded.Visibility = if ($animation.Expanded) { 'Visible' } else { 'Collapsed' }
                $script:OrbCollapsed.Opacity = 1
                $script:OrbExpanded.Opacity = 1
                $script:OrbAnimation = $null
            }
        })
    }
    $script:OrbAnimationTimer.Start()
}

function Snap-OrbToNearestEdge {
    $workArea = Get-OverlayMonitorWorkArea
    $window.Top = [math]::Max($workArea.Top + 6, [math]::Min($workArea.Bottom - $window.Height - 6, $window.Top))
    $centerX = $window.Left + ($window.Width / 2)
    if ($centerX -lt ($workArea.Left + ($workArea.Width / 2))) {
        $window.Left = $workArea.Left + 6
    } else {
        $window.Left = $workArea.Right - $window.Width - 6
    }
}

function Update-AutoMode {
    if ($script:ThemeMode -eq 'auto') { Apply-Theme }
    if ($script:DisplayMode -eq 'card') { Apply-VisualMode 'card'; return }
    if ($script:DisplayMode -eq 'bar') { Apply-VisualMode 'bar'; Update-BarPlacement; return }
    if ($script:DisplayMode -eq 'orb') { Apply-VisualMode 'orb'; return }
    $foreground = Get-ForegroundWindowInfo
    if (-not $foreground -or $foreground.ProcessName -in @('powershell', 'pwsh')) { return }
    if (Test-TargetIde $foreground.ProcessName) { $script:LastTargetWindow = $foreground }
    if ($foreground.ProcessName -in @('codex', 'chatgpt')) {
        if ($script:ActiveClient -ne 'codex') { Set-ActiveClient 'codex' }
        Apply-VisualMode 'card'
    } elseif ($foreground.ProcessName -in @('zcode', 'code', 'cursor', 'windsurf')) {
        if ($foreground.ProcessName -eq 'zcode' -and $script:ActiveClient -ne 'zcode') { Set-ActiveClient 'zcode' }
        Apply-VisualMode 'bar'
        Update-BarPlacement
    } else {
        Apply-VisualMode 'orb'
    }
}

function Set-ModePreference([string]$Mode) {
    $script:DisplayMode = $Mode
    Save-Settings
    Update-TrayMenu
    if ($Mode -eq 'auto') { $script:CurrentVisualMode = ''; Update-AutoMode }
    else { Apply-VisualMode $Mode }
}

function Test-TargetIde([string]$ProcessName) {
    return $ProcessName -in @('codex', 'chatgpt', 'zcode', 'code', 'cursor', 'windsurf')
}

function Set-OverlayClickThrough([bool]$Enabled) {
    $gwlExStyle = -20
    $wsExTransparent = 0x00000020
    $wsExToolWindow = 0x00000080
    $wsExNoActivate = 0x08000000
    $style = [CodexUsageNativeMethods]::GetWindowLongPtr($script:OverlayHandle, $gwlExStyle).ToInt64()
    $style = $style -bor $wsExToolWindow
    # Bar mode is intentionally non-activating but remains interactive. The
    # overlay window itself is only the compact 600-DIP bar, so there is no
    # full-titlebar transparent window intercepting IDE menus or window chrome.
    $style = $style -band (-bnot $wsExTransparent)
    if ($Enabled) { $style = $style -bor $wsExNoActivate }
    else { $style = $style -band (-bnot $wsExNoActivate) }
    [CodexUsageNativeMethods]::SetWindowLongPtr($script:OverlayHandle, $gwlExStyle, [IntPtr]::new($style))
}

function Update-BarPlacement {
    if ($script:CurrentVisualMode -ne 'bar') { return }
    $foreground = Get-ForegroundWindowInfo
    $target = $null
    if ($foreground -and (Test-TargetIde $foreground.ProcessName) -and -not $foreground.IsMinimized -and $foreground.Width -ge 360) {
        $script:LastTargetWindow = $foreground
        $target = $foreground
        if ($foreground.ProcessName -eq 'zcode' -and $script:ActiveClient -ne 'zcode') { Set-ActiveClient 'zcode' }
        elseif ($foreground.ProcessName -in @('codex', 'chatgpt') -and $script:ActiveClient -ne 'codex') { Set-ActiveClient 'codex' }
    } elseif ($foreground -and $foreground.ProcessName -in @('powershell', 'pwsh')) {
        $target = $script:LastTargetWindow
    }
    if (-not $target -or $target.IsMinimized) {
        $window.Opacity = 0
        return
    }
    $scale = [double]$target.Dpi / 96.0
    $visibleLeftPx = [math]::Max($target.Left, $target.WorkLeft)
    $visibleTopPx = [math]::Max($target.Top, $target.WorkTop)
    $visibleRightPx = [math]::Min($target.Left + $target.Width, $target.WorkRight)
    $visibleWidthPx = [math]::Max(1, $visibleRightPx - $visibleLeftPx)
    $sideMarginPx = [math]::Max(8, [math]::Round(12 * $scale))
    $controlSafeWidthPx = [math]::Max(120, [math]::Round(170 * $scale))
    $barMaxWidthPx = [math]::Round(600 * $scale)
    $barMinWidthPx = [math]::Round(360 * $scale)
    $availableWidthPx = [math]::Max(240, $visibleWidthPx - ($sideMarginPx * 2) - $controlSafeWidthPx)
    $barWidthPx = [math]::Min($barMaxWidthPx, $availableWidthPx)
    if ($availableWidthPx -ge $barMinWidthPx) { $barWidthPx = [math]::Max($barMinWidthPx, $barWidthPx) }
    $safeRightPx = $visibleRightPx - $controlSafeWidthPx
    $centeredX = $visibleLeftPx + [math]::Round(($visibleWidthPx - $barWidthPx) / 2)
    $barLeftPx = [math]::Min($centeredX, $safeRightPx - $barWidthPx)
    $barLeftPx = [math]::Max($visibleLeftPx + $sideMarginPx, $barLeftPx)
    $barHeightPx = [math]::Max(38, [math]::Round(40 * $scale))
    $barTopPx = [math]::Max($visibleTopPx, $target.Top + [math]::Max(2, [math]::Round(2 * $scale)))
    $window.Opacity = 1
    $script:BarRoot.Visibility = 'Visible'
    [void][CodexUsageNativeMethods]::SetWindowPos(
        $script:OverlayHandle,
        [IntPtr]::new(-1),
        [int]$barLeftPx,
        [int]$barTopPx,
        [int]$barWidthPx,
        [int]$barHeightPx,
        0x0050
    )
}

$script:TrayIcon = New-Object System.Windows.Forms.NotifyIcon
$script:TrayIcon.Icon = New-StatusIcon '#97A3B4'
$script:TrayIcon.Text = 'Codex 用量：正在连接'
$script:TrayIcon.Visible = $true
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$script:AutoMenuItem = $contextMenu.Items.Add('自动：Codex 卡片 / IDE 指示条 / 其他悬浮球')
$script:CardMenuItem = $contextMenu.Items.Add('始终显示卡片')
$script:BarMenuItem = $contextMenu.Items.Add('始终显示指示条')
$script:OrbMenuItem = $contextMenu.Items.Add('始终显示悬浮球')
[void]$contextMenu.Items.Add('-')
$themeMenuItem = New-Object System.Windows.Forms.ToolStripMenuItem -ArgumentList '主题'
$script:ThemeAutoMenuItem = $themeMenuItem.DropDownItems.Add('自动跟随系统')
$script:ThemeDarkMenuItem = $themeMenuItem.DropDownItems.Add('深色')
$script:ThemeLightMenuItem = $themeMenuItem.DropDownItems.Add('浅色')
[void]$contextMenu.Items.Add($themeMenuItem)
[void]$contextMenu.Items.Add('-')
$script:StartupMenuItem = $contextMenu.Items.Add('开机启动')
$refreshMenuItem = $contextMenu.Items.Add('立即刷新')
[void]$contextMenu.Items.Add('-')
$exitMenuItem = $contextMenu.Items.Add('退出')
$script:TrayIcon.ContextMenuStrip = $contextMenu

$settings = Read-Settings
$script:DisplayMode = [string]$settings.displayMode
$script:ThemeMode = [string]$settings.themeMode
$script:ResolvedTheme = ''
$script:CurrentVisualMode = ''
$script:FiveResetAt = $null
$script:WeekResetAt = $null
# Which client the card/bar shows. Updated by the header switcher; defaults to
# Codex, but auto-falls back to the first available client on first refresh.
$script:ActiveClient = [string]$settings.activeClient
$script:PreviewState = if ($script:PreviewState -in @('dual', 'weekly', 'zcode', 'zcode-empty', 'bar', 'orb', 'orb-expanded')) { $script:PreviewState } else { '' }
if ($script:PreviewState) {
    $script:DisplayMode = if ($script:PreviewState -in @('orb', 'orb-expanded')) { 'orb' } elseif ($script:PreviewState -eq 'bar') { 'bar' } else { 'card' }
    if ($script:PreviewTheme -in @('dark', 'light')) { $script:ThemeMode = $script:PreviewTheme }
    $script:ActiveClient = if ($script:PreviewState -in @('zcode', 'zcode-empty')) { 'zcode' } else { 'codex' }
}
$script:LastSnapshot = $null
$script:LastTargetWindow = $null

$script:AutoMenuItem.Add_Click({ Invoke-UiAction { Set-ModePreference 'auto' } '模式切换失败' })
$script:CardMenuItem.Add_Click({ Invoke-UiAction { Set-ModePreference 'card' } '模式切换失败' })
$script:BarMenuItem.Add_Click({ Invoke-UiAction { Set-ModePreference 'bar' } '模式切换失败' })
$script:OrbMenuItem.Add_Click({ Invoke-UiAction { Set-ModePreference 'orb' } '模式切换失败' })
$script:ThemeAutoMenuItem.Add_Click({ Invoke-UiAction { Set-ThemePreference 'auto' } '主题切换失败' })
$script:ThemeDarkMenuItem.Add_Click({ Invoke-UiAction { Set-ThemePreference 'dark' } '主题切换失败' })
$script:ThemeLightMenuItem.Add_Click({ Invoke-UiAction { Set-ThemePreference 'light' } '主题切换失败' })
$script:StartupMenuItem.Add_Click({ Invoke-UiAction { Set-StartupEnabled (-not (Test-StartupEnabled)); Update-TrayMenu } '开机启动设置失败' })
$refreshMenuItem.Add_Click({ Invoke-UiAction { Refresh-Usage $true } '刷新失败，已保留上次数据' })
$exitMenuItem.Add_Click({ $window.Close() })
$script:TrayIcon.Add_DoubleClick({ Invoke-UiAction { Apply-VisualMode 'card'; $window.Show(); $window.Activate() } '无法打开卡片' })

$CardDragArea.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq 'Pressed') { $window.DragMove() } })
$RefreshButton.Add_Click({ Invoke-UiAction { Refresh-Usage $true } '刷新失败，已保留上次数据' })
$CardModeButton.Add_Click({ Invoke-UiAction { Show-ModeDropdown } '无法打开模式菜单' })
$BarModeButton.Add_Click({ Invoke-UiAction { Set-ModePreference 'card' } '无法切换到卡片' })
$ThemeButton.Add_Click({ Invoke-UiAction { Show-ThemeDropdown } '无法打开主题菜单' })
$CloseButton.Add_Click({ $window.Close() })
$BarCloseButton.Add_Click({ Invoke-UiAction { Set-ModePreference 'orb' } '无法收起指示条' })

# Card header switcher: click the client name to open the dropdown of detected
# agents (dark-glass Popup, not the ugly default ContextMenuStrip).
$HeaderClientButton.Add_Click({ Invoke-UiAction { Show-ClientDropdown } '无法打开数据源菜单' })

# Orb collapsed interactions: manual drag (not DragMove, which blocks and
# swallows the mouse-up) plus click-to-expand. We capture the mouse on press,
# move the window while the pointer travels, and on release treat a near-stationary
# press as a click that toggles the expanded panel.
$script:OrbDragging = $false
$script:OrbDragCursor = $null
$script:OrbDragOrigin = $null
$script:OrbExpandedState = $false

function Test-OrbPointerInVisibleShape {
    if ($script:OrbAnimation) { return $true }

    $cursor = New-Object CodexUsageNativeMethods+POINT
    if (-not [CodexUsageNativeMethods]::GetCursorPos([ref]$cursor)) { return $(if ($script:OrbExpandedState) { $script:OrbExpanded.IsMouseOver } else { $script:OrbCollapsed.IsMouseOver }) }
    $rect = New-Object CodexUsageNativeMethods+RECT
    $dwmResult = [CodexUsageNativeMethods]::DwmGetWindowAttribute($script:OverlayHandle, 9, [ref]$rect, [Runtime.InteropServices.Marshal]::SizeOf($rect))
    if ($dwmResult -ne 0 -and -not [CodexUsageNativeMethods]::GetWindowRect($script:OverlayHandle, [ref]$rect)) { return $(if ($script:OrbExpandedState) { $script:OrbExpanded.IsMouseOver } else { $script:OrbCollapsed.IsMouseOver }) }
    $dpi = [CodexUsageNativeMethods]::GetDpiForWindow($script:OverlayHandle)
    if ($dpi -le 0) { $dpi = 96 }
    $scale = [double]$dpi / 96
    $x = ([double]$cursor.X - $rect.Left) / $scale
    $y = ([double]$cursor.Y - $rect.Top) / $scale
    if (-not $script:OrbExpandedState) {
        # The collapsed 72 x 108 capsule is right-aligned inside its 84 x 120
        # window. Native cursor geometry is used because MouseEnter can be
        # unreliable on transparent, non-activating layered windows.
        $orbX = $x - 12
        $orbY = $y - 6
        if ($orbX -lt 0 -or $orbX -gt 72 -or $orbY -lt 0 -or $orbY -gt 108) { return $false }
        if ($orbY -ge 36 -and $orbY -le 72) { return $true }
        $centerY = if ($orbY -lt 36) { 36.0 } else { 72.0 }
        return ([math]::Pow($orbX - 36, 2) + [math]::Pow($orbY - $centerY, 2)) -le [math]::Pow(36, 2)
    }

    if ($x -lt 0 -or $y -lt 0 -or $x -gt 520 -or $y -gt 150) { return $false }

    # Figma 2196:5318 is one 520 x 150 integrated surface. Only the two
    # transparent corners outside its 28-DIP left radius are excluded.
    if ($x -ge 28 -or ($y -ge 28 -and $y -le 122)) { return $true }
    $cornerY = if ($y -lt 28) { 28.0 } else { 122.0 }
    return ([math]::Pow($x - 28, 2) + [math]::Pow($y - $cornerY, 2)) -le [math]::Pow(28, 2)
}

$script:OrbHoverExpandTimer = New-Object Windows.Threading.DispatcherTimer
$script:OrbHoverExpandTimer.Interval = [TimeSpan]::FromMilliseconds(220)
$script:OrbHoverExpandTimer.Add_Tick({
    $script:OrbHoverExpandTimer.Stop()
    if (-not $script:OrbDragging -and $script:CurrentVisualMode -eq 'orb' -and (Test-OrbPointerInVisibleShape)) {
        Set-OrbExpanded $true $true
    }
})
$script:OrbHoverCollapseTimer = New-Object Windows.Threading.DispatcherTimer
$script:OrbHoverCollapseTimer.Interval = [TimeSpan]::FromMilliseconds(420)
$script:OrbHoverCollapseTimer.Add_Tick({
    $script:OrbHoverCollapseTimer.Stop()
    if ($script:CurrentVisualMode -eq 'orb' -and -not (Test-OrbPointerInVisibleShape) -and -not $script:DropdownPopup.IsOpen) {
        Set-OrbExpanded $false $true
    }
})

$script:OrbHoverProbeTimer = New-Object Windows.Threading.DispatcherTimer
$script:OrbHoverProbeTimer.Interval = [TimeSpan]::FromMilliseconds(80)
$script:OrbHoverProbeTimer.Add_Tick({
    if ($script:CurrentVisualMode -ne 'orb' -or $script:OrbDragging -or $script:OrbAnimation) { return }
    $inside = Test-OrbPointerInVisibleShape
    if (-not $script:OrbExpandedState) {
        $script:OrbHoverCollapseTimer.Stop()
        if ($inside) {
            if (-not $script:OrbHoverExpandTimer.IsEnabled) { $script:OrbHoverExpandTimer.Start() }
        } else {
            $script:OrbHoverExpandTimer.Stop()
        }
    } elseif ($inside -or $script:DropdownPopup.IsOpen) {
        $script:OrbHoverCollapseTimer.Stop()
    } elseif (-not $script:OrbHoverCollapseTimer.IsEnabled) {
        $script:OrbHoverCollapseTimer.Start()
    }
})

$OrbCollapsed.Add_MouseEnter({
    $script:OrbHoverCollapseTimer.Stop()
    $script:OrbHoverExpandTimer.Stop()
    $script:OrbHoverExpandTimer.Start()
})
$OrbCollapsed.Add_MouseLeave({ $script:OrbHoverExpandTimer.Stop() })
$OrbRoot.Add_MouseEnter({ $script:OrbHoverCollapseTimer.Stop() })
$OrbRoot.Add_MouseLeave({
    $script:OrbHoverExpandTimer.Stop()
    $script:OrbHoverCollapseTimer.Stop()
    $script:OrbHoverCollapseTimer.Start()
})
$window.Add_MouseMove({
    if ($script:CurrentVisualMode -ne 'orb' -or -not $script:OrbExpandedState) { return }
    if (Test-OrbPointerInVisibleShape) {
        $script:OrbHoverCollapseTimer.Stop()
    } elseif (-not $script:OrbHoverCollapseTimer.IsEnabled) {
        $script:OrbHoverCollapseTimer.Start()
    }
})

$OrbCollapsed.Add_MouseLeftButtonDown({
    $script:OrbHoverExpandTimer.Stop()
    $pt = New-Object CodexUsageNativeMethods+POINT
    [void][CodexUsageNativeMethods]::GetCursorPos([ref]$pt)
    $script:OrbDragCursor = [Windows.Point]::new($pt.X, $pt.Y)
    $script:OrbDragOrigin = [Windows.Point]::new($window.Left, $window.Top)
    $script:OrbDragging = $true
    [void]$OrbCollapsed.CaptureMouse()
    $_.Handled = $true
})
$OrbCollapsed.Add_MouseMove({
    if (-not $script:OrbDragging) { return }
    $pt = New-Object CodexUsageNativeMethods+POINT
    [void][CodexUsageNativeMethods]::GetCursorPos([ref]$pt)
    $dx = $pt.X - $script:OrbDragCursor.X
    $dy = $pt.Y - $script:OrbDragCursor.Y
    if (([Math]::Abs($dx) -gt 2) -or ([Math]::Abs($dy) -gt 2)) {
        $window.Left = $script:OrbDragOrigin.X + $dx
        $window.Top = $script:OrbDragOrigin.Y + $dy
    }
})
$OrbCollapsed.Add_MouseLeftButtonUp({
    $wasDragging = $script:OrbDragging
    $start = $script:OrbDragCursor
    $script:OrbDragging = $false
    [void]$OrbCollapsed.ReleaseMouseCapture()
    if (-not $wasDragging -or $null -eq $start) { return }
    $pt = New-Object CodexUsageNativeMethods+POINT
    [void][CodexUsageNativeMethods]::GetCursorPos([ref]$pt)
    $moved = [Math]::Abs($pt.X - $start.X) -gt 5 -or [Math]::Abs($pt.Y - $start.Y) -gt 5
    if (-not $moved) {
        # Stationary press -> click: toggle the expanded panel.
        Set-OrbExpanded (-not $script:OrbExpandedState) $true
    } else {
        Snap-OrbToNearestEdge
    }
})
# Expanded panel still uses DragMove on its header (no click conflict there).
$OrbExpDragArea.Add_MouseLeftButtonDown({ if ($_.ButtonState -eq 'Pressed') { $window.DragMove(); Snap-OrbToNearestEdge } })
$OrbCardButton.Add_Click({ Invoke-UiAction { Set-ModePreference 'card' } '无法切换到卡片' })
$OrbBarButton.Add_Click({ Invoke-UiAction { Set-ModePreference 'bar' } '无法切换到指示条' })
$OrbThemeButton.Add_Click({ Invoke-UiAction { Show-ThemeDropdown } '无法打开主题菜单' })
$OrbCollapseButton.Add_Click({ Set-OrbExpanded $false $true })

$countdownTimer = New-Object Windows.Threading.DispatcherTimer
$countdownTimer.Interval = [TimeSpan]::FromSeconds(1)
$countdownTimer.Add_Tick({ Invoke-UiAction { Update-Countdowns } '倒计时暂不可用' })
$pollTimer = New-Object Windows.Threading.DispatcherTimer
$pollTimer.Interval = [TimeSpan]::FromSeconds(60)
$pollTimer.Add_Tick({ Invoke-UiAction { Refresh-Usage $false } '刷新失败，已保留上次数据' })
$modeTimer = New-Object Windows.Threading.DispatcherTimer
$modeTimer.Interval = [TimeSpan]::FromMilliseconds(300)
$modeTimer.Add_Tick({ Invoke-UiAction { Update-AutoMode } '自动切换失败，已保留当前显示' })

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\CodexUsageMonitor', [ref]$createdNew)
if (-not $createdNew) {
    $script:TrayIcon.Visible = $false
    $script:TrayIcon.Dispose()
    $mutex.Dispose()
    return
}

try {
    $script:bridge = if ($script:PreviewState) { $null } else { Start-UsageBridge }
    Apply-Theme
    Update-TrayMenu
    Update-AutoMode
    if ($script:PreviewState -eq 'orb-expanded') { Set-OrbExpanded $true }
    $countdownTimer.Start()
    $pollTimer.Start()
    $modeTimer.Start()
    $script:OrbHoverProbeTimer.Start()
    $window.Add_Closed({
        $countdownTimer.Stop()
        $pollTimer.Stop()
        $modeTimer.Stop()
        $script:OrbHoverExpandTimer.Stop()
        $script:OrbHoverCollapseTimer.Stop()
        $script:OrbHoverProbeTimer.Stop()
        if ($script:OrbAnimationTimer) { $script:OrbAnimationTimer.Stop() }
        Stop-UsageBridge
        $script:TrayIcon.Visible = $false
    })
    Refresh-Usage $false
    [void]$window.ShowDialog()
} finally {
    Stop-UsageBridge
    $countdownTimer.Stop()
    $pollTimer.Stop()
    $modeTimer.Stop()
    $script:OrbHoverExpandTimer.Stop()
    $script:OrbHoverCollapseTimer.Stop()
    $script:OrbHoverProbeTimer.Stop()
    if ($script:OrbAnimationTimer) { $script:OrbAnimationTimer.Stop() }
    $script:TrayIcon.Visible = $false
    if ($null -ne $script:TrayIcon.Icon) { $script:TrayIcon.Icon.Dispose() }
    $script:TrayIcon.Dispose()
    $contextMenu.Dispose()
    if ($createdNew) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
