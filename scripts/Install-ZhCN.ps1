#Requires -Version 7.0
<#
.SYNOPSIS
  STM32CubeMX2 简体中文一键备份 / 安装 / 还原。
.DESCRIPTION
  自动查找本机 STM32CubeMX2，调用同目录下的 cubemx2-translator CLI。
  需要已安装 Node.js 20+。安装或还原前请关闭 STM32CubeMX2。
.PARAMETER Action
  Install（默认）、Backup、Rollback、Doctor
.PARAMETER App
  可选。STM32CubeMX2 安装根目录；省略则自动探测。
.PARAMETER SkipLangpack
  安装时不下载 VS Code 中文语言包（离线或已装过可用）。
.EXAMPLE
  .\Install-ZhCN.ps1
.EXAMPLE
  .\Install-ZhCN.ps1 -Action Backup
.EXAMPLE
  .\Install-ZhCN.ps1 -Action Rollback
#>
param(
    [ValidateSet('Install', 'Backup', 'Rollback', 'Doctor')]
    [string] $Action = 'Install',
    [string] $App = '',
    [switch] $SkipLangpack
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-KitRoot {
    foreach ($root in @($PSScriptRoot, (Split-Path -Parent $PSScriptRoot))) {
        if (Test-Path -LiteralPath (Join-Path $root 'dist\cli.js')) {
            return $root
        }
    }
    throw "未找到 dist\cli.js。请在 GitHub Release 压缩包的解压目录运行，或把本脚本放在仓库的 scripts 目录。"
}

$KitRoot = Get-KitRoot
Set-Location -LiteralPath $KitRoot

function Write-Step([string] $Message) {
    Write-Host $Message
}

function Get-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "未找到 Node.js。请先安装 20 或更高版本：https://nodejs.org/"
    }
    $ver = (& $cmd.Source -p "process.versions.node").Trim()
    $parts = $ver.Split('.')
    if ([int]$parts[0] -lt 20) {
        throw "需要 Node.js 20+，当前是 $ver。"
    }
    return $cmd.Source
}

function Test-CubeRunning {
    $names = @('cube', 'STM32CubeMX2', 'stm32cubemx2')
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $names -contains $_.ProcessName
    }
}

function Invoke-Translator {
    param(
        [Parameter(Mandatory)][string] $NodeExe,
        [Parameter(Mandatory)][string[]] $CliArgs
    )
    $cli = Join-Path $KitRoot 'dist\cli.js'
    & $NodeExe $cli @CliArgs
    if (-not $?) {
        throw "命令失败：node dist/cli.js $($CliArgs -join ' ')"
    }
}

$cli = Join-Path $KitRoot 'dist\cli.js'
$po = Join-Path $KitRoot 'locales\zh-CN.po'
$loader = Join-Path $KitRoot 'runtime\loader.js'
foreach ($p in @($cli, $po, $loader)) {
    if (-not (Test-Path -LiteralPath $p)) {
        throw "缺少必要文件：$p`n请使用 GitHub Release 中的完整压缩包，或在仓库根目录运行 npm ci && npm run build。"
    }
}

$node = Get-NodeExe
$nm = Join-Path $KitRoot 'node_modules'
if (-not (Test-Path -LiteralPath $nm)) {
    Write-Step '未找到 node_modules，正在 npm ci --omit=dev …'
    npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败' }
}

$appArgs = @()
if ($App) { $appArgs = @('--app', $App) }

$needsExclusive = $Action -in @('Install', 'Rollback')
if ($needsExclusive) {
    $running = @(Test-CubeRunning)
    if ($running.Count -gt 0) {
        $list = ($running | ForEach-Object { $_.ProcessName + ' PID=' + $_.Id }) -join ', '
        throw "请先完全退出 STM32CubeMX2 再执行 $Action。仍在运行：$list"
    }
}

Write-Step "Node  $($node)  |  操作 $Action"

switch ($Action) {
    'Backup' {
        Invoke-Translator -NodeExe $node -CliArgs (@('backup') + $appArgs)
    }
    'Doctor' {
        Invoke-Translator -NodeExe $node -CliArgs (@('doctor') + $appArgs)
    }
    'Rollback' {
        Invoke-Translator -NodeExe $node -CliArgs (@('rollback') + $appArgs)
    }
    'Install' {
        if (-not $SkipLangpack) {
            Write-Step '安装框架中文语言包（需访问 Open VSX）…'
            try {
                Invoke-Translator -NodeExe $node -CliArgs (@('langpack', 'install', '--locale', 'zh-cn') + $appArgs)
            }
            catch {
                Write-Warning "语言包安装失败，将继续安装 ST 界面译文。可稍后重试，或加 -SkipLangpack。`n$($_.Exception.Message)"
            }
        }
        Write-Step '注入运行时并部署 zh-CN 译文…'
        Invoke-Translator -NodeExe $node -CliArgs (@('install', '--locale', 'zh-CN') + $appArgs)
        Invoke-Translator -NodeExe $node -CliArgs (@('doctor') + $appArgs)
        Write-Step ''
        Write-Step '完成。启动 STM32CubeMX2，按 F1 → Configure Display Language → 简体中文，然后重载。'
    }
}
