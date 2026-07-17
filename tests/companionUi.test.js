import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const xamlUrl = new URL("companion/UsageMonitor.xaml", root);
const scriptUrl = new URL("companion/CodexUsageMonitor.ps1", root);
const agentsUrl = new URL("AGENTS.md", root);
const workflowUrl = new URL("docs/ui-development-workflow.md", root);

test("companion UI enforces the typography floor and icon-only chrome", async () => {
  const xaml = await readFile(xamlUrl, "utf8");
  const fontSizes = [...xaml.matchAll(/FontSize="([0-9.]+)"/g)].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0);
  assert.ok(fontSizes.every((size) => size >= 12), `found undersized text: ${fontSizes.filter((size) => size < 12).join(", ")}`);
  assert.doesNotMatch(xaml, /Content="(?:刷新|主题|卡片|自动)"/);
  assert.match(xaml, /AutomationProperties\.Name="立即刷新"/);
  assert.match(xaml, /x:Name="BrandText" Text="CODEX"/);
  assert.match(xaml, /x:Name="PlanText" Text="PLUS"/);
  assert.doesNotMatch(xaml, /C O D E X|P L U S/);
});

test("quota status avoids repeating the prominent percentage", async () => {
  const script = await readFile(scriptUrl, "utf8");
  const statusFunction = script.match(/function Get-QuotaStatusText[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(statusFunction, /return '● 充足'/);
  assert.doesNotMatch(statusFunction, /剩余|rounded/);
  assert.match(script, /\$orbPercentLabel = '5h'/);
  assert.match(script, /\$orbPercentLabel = '周'/);
  assert.doesNotMatch(script, /\$orbPercentLabel = '(?:5h|周) 剩余'/);
});

test("ring paths reserve stroke space instead of clipping their caps", async () => {
  const [xaml, script] = await Promise.all([readFile(xamlUrl, "utf8"), readFile(scriptUrl, "utf8")]);
  assert.match(xaml, /x:Name="HeroWeekArc" Width="198" Height="198"/);
  assert.match(xaml, /x:Name="SideWeekArc" Width="126" Height="126"/);
  assert.match(xaml, /x:Name="OrbArc" Width="60" Height="60"/);
  assert.match(xaml, /x:Name="OrbPrimaryMiniArc" Width="40" Height="40"/);
  assert.match(xaml, /x:Name="OrbHandleArc" Width="48" Height="48"/);
  assert.match(script, /\$offset = \[math\]::Max\(0, \(\$pathWidth - \$Size\) \/ 2\)/);
});

test("Codex card keeps 5h first and promotes weekly only when 5h is absent", async () => {
  const [xaml, script] = await Promise.all([readFile(xamlUrl, "utf8"), readFile(scriptUrl, "utf8")]);
  assert.match(xaml, /x:Name="HeroFivePanel"/);
  assert.match(xaml, /x:Name="HeroWeekPanel"/);
  assert.match(xaml, /x:Name="SideWeekPanel"/);
  assert.match(xaml, /x:Name="SideTodayPanel"/);
  assert.match(script, /if \(\$five\) \{[\s\S]*HeroFivePanel\.Visibility = 'Visible'/);
  assert.match(script, /elseif \(\$week\) \{[\s\S]*HeroWeekPanel\.Visibility = 'Visible'/);
  assert.match(script, /\$showWeeklySide = \$null -ne \$five -and \$null -ne \$week/);
  assert.match(script, /SideTodayPanel\.Visibility = if \(\$showWeeklySide\) \{ 'Collapsed' \} else \{ 'Visible' \}/);
  assert.match(xaml, /x:Name="SideTodayValue"[^>]+FontSize="34"[^>]+LineHeight="42"/);
  assert.match(xaml, /x:Key="RefreshGeometry"/);
  assert.doesNotMatch(xaml, /Text="&#xE72C;"/);
});

test("ZCode rendering tolerates missing model data", async () => {
  const script = await readFile(scriptUrl, "utf8");
  assert.match(script, /\$modelProperties = if \(\$active\.models\) \{ @\(\$active\.models\.PSObject\.Properties\) \} else \{ @\(\) \}/);
  assert.doesNotMatch(script, /\$modelEntry = @\(\$active\.models\.PSObject\.Properties\)/);
});

test("theme and compact safe-area overlay modes remain explicit", async () => {
  const [xaml, script] = await Promise.all([readFile(xamlUrl, "utf8"), readFile(scriptUrl, "utf8")]);
  assert.match(script, /@\('auto', 'dark', 'light'\)/);
  assert.match(script, /DwmGetWindowAttribute/);
  assert.match(script, /GetAncestor/);
  assert.match(script, /MonitorFromWindow/);
  assert.match(script, /GetMonitorInfo/);
  assert.match(script, /SetWindowPos/);
  assert.match(script, /\$wsExNoActivate = 0x08000000/);
  assert.match(script, /\$barMaxWidthPx = \[math\]::Round\(600 \* \$scale\)/);
  assert.match(script, /\$controlSafeWidthPx = \[math\]::Max\(120, \[math\]::Round\(170 \* \$scale\)\)/);
  assert.match(script, /\$style = \$style -band \(-bnot \$wsExTransparent\)/);
  assert.match(script, /'chatgpt'/);
  assert.match(script, /CODEX_USAGE_MONITOR_PREVIEW/);
  assert.match(script, /'orb-expanded'/);
  assert.match(script, /'zcode', 'zcode-empty'/);
  assert.match(xaml, /x:Name="BarCodexContent"[^>]+LineHeight="20"/);
  assert.match(xaml, /<Run x:Name="BarFiveRemaining"/);
  assert.match(xaml, /x:Name="BarModeButton"/);
  assert.match(xaml, /x:Name="BarCloseButton"/);
  assert.match(script, /\$BarModeButton\.Add_Click\(\{ Invoke-UiAction \{ Set-ModePreference 'card' \}/);
  assert.match(script, /\$BarCloseButton\.Add_Click\(\{ Invoke-UiAction \{ Set-ModePreference 'orb' \}/);
  assert.match(xaml, /x:Name="OrbCollapsed" Visibility="Visible" Width="72" Height="108"/);
  assert.match(xaml, /x:Name="OrbCardButton"/);
  assert.match(xaml, /x:Name="OrbBarButton"/);
  assert.match(xaml, /x:Name="OrbThemeButton"/);
  assert.match(script, /\$OrbCardButton\.Add_Click\(\{ Invoke-UiAction \{ Set-ModePreference 'card' \}/);
  assert.match(script, /\$OrbBarButton\.Add_Click\(\{ Invoke-UiAction \{ Set-ModePreference 'bar' \}/);
  assert.match(script, /OrbHoverExpandTimer\.Interval = \[TimeSpan\]::FromMilliseconds\(220\)/);
  assert.match(script, /OrbHoverCollapseTimer\.Interval = \[TimeSpan\]::FromMilliseconds\(420\)/);
  assert.match(script, /OrbHoverProbeTimer\.Interval = \[TimeSpan\]::FromMilliseconds\(80\)/);
  assert.match(script, /The collapsed 72 x 108 capsule is right-aligned inside its 84 x 120/);
  assert.match(script, /DurationMs = 180\.0/);
  assert.match(script, /Set-OrbExpanded \$false \$true/);
  assert.match(script, /\$targetWidth = if \(\$Expanded\) \{ 520\.0 \} else \{ 84\.0 \}/);
  assert.match(xaml, /x:Name="OrbExpanded"[^>]+Background="Transparent"[^>]+BorderThickness="0"[^>]+ClipToBounds="True"/);
  assert.match(xaml, /x:Name="OrbSurfacePath" Width="520" Height="150"[^>]+M28,0 H520 V150/);
  assert.match(xaml, /x:Name="OrbExpTitle" Canvas\.Left="24" Canvas\.Top="14"[^>]+FontFamily="Segoe UI Variable Text"[^>]+FontSize="13"[^>]+LineHeight="19"[^>]+FontWeight="Bold"/);
  assert.match(xaml, /x:Name="OrbPrimaryValue" Canvas\.Left="0" Canvas\.Top="0"/);
  assert.match(xaml, /x:Name="OrbResetValue"[^>]+Margin="0,-4,0,0"/);
  assert.match(xaml, /x:Name="OrbTodayValue"[^>]+Margin="0,-4,0,0"/);
  assert.match(xaml, /<Grid Canvas\.Left="24" Canvas\.Top="45\.5" Width="366" Height="59">/);
  assert.match(xaml, /<ColumnDefinition Width="118\.229"\/><ColumnDefinition Width="1"\/><ColumnDefinition Width="72\.885"\/><ColumnDefinition Width="1"\/><ColumnDefinition Width="79\.344"\/>/);
  assert.match(xaml, /Grid\.Column="2" Width="44" Height="116" CornerRadius="22"/);
  assert.match(xaml, /x:Name="OrbHandleSurface" Width="58" Height="150"[^>]+M58,0 V150 C22,144 0,116 0,75 C0,34 22,6 58,0 Z/);
  assert.match(xaml, /x:Name="OrbHandleDot" Canvas\.Left="22\.5" Canvas\.Top="106\.5" Width="11" Height="11"[^>]+Fill="\{DynamicResource SuccessBrush\}"\/>/);
  assert.match(script, /79\.8907 276\.955 \$true/);
  assert.match(script, /100\.912 39\.0195 \$true/);
  assert.doesNotMatch(xaml, /x:Name="OrbExpandedBody"/);
  assert.doesNotMatch(xaml, /<Button\.Clip>/);
  assert.match(script, /function Test-OrbPointerInVisibleShape/);
  assert.match(script, /Figma 2196:5318 is one 520 x 150 integrated surface/);
  assert.doesNotMatch(script, /\$x -le 462|ellipseX|ellipseY/);
});

test("UI changes are gated by the canonical Figma Dev Mode workflow", async () => {
  const [agents, workflow] = await Promise.all([
    readFile(agentsUrl, "utf8"),
    readFile(workflowUrl, "utf8"),
  ]);
  for (const content of [agents, workflow]) {
    assert.match(content, /RoxNVD39VjdWWNbEvhy5HQ/);
    assert.match(content, /1689-3095/);
    assert.match(content, /Dev Mode/);
  }
  assert.match(agents, /没有对应 Figma 节点时，不得直接修改生产 UI/);
  assert.match(agents, /未先完成 Figma 设计的 UI 代码不得开发、验收或提交/);
  assert.match(workflow, /没有先完成 Figma 设计，不得开始 UI 编码、验收或提交/);
  assert.match(workflow, /P0 \/ P1 \/ P2/);
});
