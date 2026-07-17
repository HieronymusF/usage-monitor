<#
.SYNOPSIS
  Builds the portable (no-install) Windows exe via Inno Setup.

.DESCRIPTION
  1. npm run build  -> produce dist/
  2. Download a Node.js portable zip and extract it into bundle\node\
  3. Copy dist/, companion/, plugin manifests, and the VBS launcher into bundle\
  4. Rewrite bundle\.mcp.json so the MCP server uses the bundled node
  5. ISCC.exe portable.iss  ->  usage-monitor-portable.exe

  The resulting exe extracts to %LOCALAPPDATA%\usage-monitor\ and launches the
  floating window, with no requirement for the user to install Node.js.

.PARAMETER NodeVersion
  The Node.js version to bundle (from nodejs.org/dist). Defaults to 20.18.1.

.PARAMETER Proxy
  Optional proxy for downloading Node (e.g. http://127.0.0.1:7897).
#>
param(
    [string]$NodeVersion = '20.18.1',
    [string]$Proxy
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Resolve-Iscc {
    $candidates = @()
    $onPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'
    $candidates += Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
    $candidates += Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'
    $found = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $found) { throw '未找到 ISCC.exe。请安装 Inno Setup 6。' }
    return $found
}

Write-Output '=== 1/5 npm run build ==='
npm run build
if ($LASTEXITCODE -ne 0) { throw 'build 失败' }

Write-Output "=== 2/5 准备 bundle 目录（清理旧产物）==="
$bundle = Join-Path $root 'bundle'
if (Test-Path -LiteralPath $bundle) { Remove-Item -Recurse -Force -LiteralPath $bundle }
New-Item -ItemType Directory -Path $bundle | Out-Null
$nodeDir = Join-Path $bundle 'node'

Write-Output "=== 2/5 下载 Node $NodeVersion portable（如未缓存）==="
$cacheDir = Join-Path $env:LOCALAPPDATA 'usage-monitor-build-cache'
if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }
$nodeZip = Join-Path $cacheDir "node-v$NodeVersion-win-x64.zip"
if (-not (Test-Path -LiteralPath $nodeZip)) {
    $url = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    Write-Output "下载 $url"
    $curlArgs = @('-L', '--max-time', '180', '-o', $nodeZip, $url)
    if ($Proxy) { $curlArgs = @('--proxy', $Proxy) + $curlArgs }
    & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) { throw "Node 下载失败（可加 -Proxy http://127.0.0.1:7897 重试）" }
}

Write-Output '=== 2/5 解压 Node 到 bundle\node ==='
$tempExtract = Join-Path $cacheDir "node-v$NodeVersion-extracted"
if (Test-Path -LiteralPath $tempExtract) { Remove-Item -Recurse -Force -LiteralPath $tempExtract }
Expand-Archive -Path $nodeZip -DestinationPath $tempExtract -Force
# The zip contains a top-level dir like node-v20.18.1-win-x64; flatten into bundle\node.
$topLevel = Get-ChildItem -Directory -LiteralPath $tempExtract | Select-Object -First 1
Move-Item -LiteralPath $topLevel.FullName -Destination $nodeDir

Write-Output '=== 3/5 复制项目文件到 bundle ==='
# dist/ (compiled JS)
Copy-Item -Recurse -LiteralPath (Join-Path $root 'dist') -Destination $bundle
# companion/ (PS1 + XAML)
Copy-Item -Recurse -LiteralPath (Join-Path $root 'companion') -Destination $bundle
# Plugin manifests
Copy-Item -Recurse -LiteralPath (Join-Path $root '.codex-plugin') -Destination $bundle
Copy-Item -Recurse -LiteralPath (Join-Path $root 'skills') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $root '.mcp.json') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $root 'start-floating-window.vbs') -Destination $bundle

Write-Output '=== 4/5 改写 bundle\.mcp.json 使用捆绑 node ==='
$mcpPath = Join-Path $bundle '.mcp.json'
$mcp = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
# Point the MCP server at the bundled node.exe so it works without system Node.
$mcp.mcpServers.'codex-usage-monitor'.command = './node/node.exe'
$mcp.mcpServers.'codex-usage-monitor'.args = @('./dist/index.js')
$mcp.mcpServers.'codex-usage-monitor'.cwd = './'
$mcp | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $mcpPath -Encoding UTF8

Write-Output '=== 5/5 ISCC 打包 ==='
$iscc = Resolve-Iscc
$iss = Join-Path $root 'portable.iss'
& $iscc /Q $iss
if ($LASTEXITCODE -ne 0) { throw 'ISCC 打包失败' }

$exe = Join-Path $root 'usage-monitor-portable.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "未找到产物 $exe" }
$size = [math]::Round((Get-Item -LiteralPath $exe).Length / 1MB, 1)
Write-Output ""
Write-Output "=== ✅ 打包完成 ==="
Write-Output "产物: $exe"
Write-Output "体积: ${size} MB"
Write-Output "双击将解压到 %LOCALAPPDATA%\usage-monitor\ 并启动悬浮窗"
