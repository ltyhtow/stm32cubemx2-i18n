# 开发与翻译操作

以下命令在仓库根目录、PowerShell 7 中执行。CLI 需要 Node.js 20+，CDP 脚本需要 Node.js 22+。普通安装见[快速开始](../README.md#快速开始)。

## 重新提取

当前中文覆盖 CubeMX2 1.1.1 前端、STM32C5 HAL 2.1.0 的 48 个参数文件，以及 DFP 2.1.0 的 4 个描述文件。同步时必须保持这些输入；只提取前端再 `sync` 会移除 Pack 词条。下面在工作副本中复现该范围，需安装 `rg`，并按本机版本调整路径。

```powershell
$packRoot = Join-Path $env:LOCALAPPDATA 'stm32cube\packs\STMicroelectronics'
$configDir = Join-Path $packRoot 'stm32c5xx_hal_drivers\2.1.0\.config'
$descriptorDir = Join-Path $packRoot 'stm32c5xx_dfp\2.1.0\Descriptors'
Get-Command rg -ErrorAction Stop | Out-Null
$descriptorFiles = @(Join-Path $descriptorDir 'peripheral_configuration_mapping.json') + @(rg --files --hidden $descriptorDir -g '*_peripherals.json')
if ($LASTEXITCODE -ne 0) { throw '未能列出 DFP 描述文件' }

node dist/cli.js --catalog work/catalog-refresh/catalog.json extract --pack-config $configDir --pack-descriptor @descriptorFiles --pot work/catalog-refresh/template.pot
if ($LASTEXITCODE -ne 0) { throw '提取失败' }

$workLocales = 'work\catalog-refresh\locales'
New-Item -ItemType Directory -Path $workLocales -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $workLocales 'zh-CN.po'))) {
    Copy-Item -LiteralPath 'locales\zh-CN.po' -Destination $workLocales
    Copy-Item -LiteralPath 'locales\zh-CN.glossary.json' -Destination $workLocales
}
node dist/cli.js --locales $workLocales sync --locale zh-CN --pot work/catalog-refresh/template.pot
if ($LASTEXITCODE -ne 0) { throw '同步失败' }
```

`--pack-config` 支持文件或目录，递归读取隐藏目录内的 `*_parameters.json`；`--pack-descriptor` 接收显式文件列表。提取器仅读取已知显示字段、静态提示和 DFP 显示名称，不执行脚本、不修改 Pack 文件。动态模板另列为审查项。

升级应用或 Pack 前先保存旧清单，新版本提取后用 `node dist/cli.js diff --before work/catalog-before.json --after work/catalog-refresh/catalog.json` 比较。`sync` 精确继承原文相同的译文及译者注释，改写的原文需重新翻译。未验证其他 CubeMX2 版本的注入兼容性。

## 翻译交接

沿用上一步的工作词库：

```powershell
node dist/cli.js --locales $workLocales export-work --locale zh-CN --out work/catalog-refresh/translation-work
# 批次在 translation-work/zh-CN/；让翻译方交回到该目录的 done/ 下
node dist/cli.js --locales $workLocales import-json --locale zh-CN --from work/catalog-refresh/translation-work/zh-CN/done --source remote-agent
if ($LASTEXITCODE -ne 0) { throw '导入或校验失败' }
node dist/cli.js --locales $workLocales lint --locale zh-CN
node dist/cli.js --locales $workLocales build --locale zh-CN
```

远程翻译方只修改批次的 `items[].msgstr`。随包提供[翻译 AI 说明](TRANSLATION_HANDOFF.md)、术语表和语境，工程侧负责导入与验证。正式词库目前全部已填写，默认导出不会产生待译批次；复核已有译文可加 `--include-translated`，接受复核改动时导入需加 `--overwrite`。

工作副本通过核对后，将其 PO 和术语表提升到 `locales/`，再用默认路径安装。PO 的原文、占位符、首尾空格和来源注释应保留；lint 无错误不等于译文语义已审核。

## 测试与安装

```powershell
npm test
node dist/cli.js lint --locale zh-CN
node dist/cli.js install --locale zh-CN --dry-run
```

关闭 CubeMX2 后执行 `node dist/cli.js install --locale zh-CN`，再运行 `node dist/cli.js doctor`。安装会构建词表、包装 6 个渲染入口并同步 gzip；失败时不使用 `--force` 掩盖校验错误。`node dist/cli.js rollback` 可还原 bundle、gzip 与 HTML 备份。框架语言包通过 `langpack install/list/remove` 独立管理。

## 界面调试

Windows EXE 的构建与验证见 [Windows 安装包](WINDOWS-INSTALLER.md)。

退出已有 CubeMX2 实例，再从安装根目录的 `.bin\cube.exe` 启动：

```powershell
$cubeRoot = Join-Path $env:LOCALAPPDATA 'STMicroelectronics\STM32CubeMX2_1.1.1'
$cubeExe = Join-Path $cubeRoot '.bin\cube.exe'
& $cubeExe mx start --remote-debugging-port 9222 --no-detached
```

在另一终端、仓库目录中执行，页面标题按实际场景替换：

```powershell
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --expect-tab TIM1 --expect 常规信息 --out work/validation/tim1.json --screenshot work/validation/tim1.png
```

窗口应保持非最小化状态。已有实例可能导致启动器复用进程，调试端口不会生效；验证前确认 9222 已监听。截图和本机清单保存在被忽略的 `work/` 中。

实现细节见[开发交接](AGENT_HANDOFF.md)，已完成的测试和剩余范围见[验证记录](VERIFICATION.md)。
