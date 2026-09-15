# STM32CubeMX2-translator

把 STM32CubeMX2 的界面翻译成任意语言的工具链。用 AST 和 sourcemap 抽取前端文案，
也可读取本机 CMSIS Pack 的参数表单；译文使用标准 Gettext PO，通过运行时挂钩生效。

已在 Windows 的 STM32CubeMX2 **1.1.1** 验证中文，并用德语样例验证第二语言链路。
中文词库含 **1896 条**：前端原文 1246 条，加上 STM32C5 TIM/LPTIM 参数表单新增的 650 条。
这表示已收录词条全部处理完毕，**不代表整个应用所有页面均已汉化**。测试范围见 [VERIFICATION.md](VERIFICATION.md)。

> **本项目与 STMicroelectronics 无关联，未获其背书或赞助。**
> "STM32"、"STM32Cube"、"STM32CubeMX" 是 STMicroelectronics 的商标，此处仅用于指明本工具的作用对象。
> 修改 STM32CubeMX2 的程序文件是否符合其最终用户许可协议，请自行确认。

---

## 为什么不直接替换字符串

常见做法是在压缩后的 `bundle.js` 里全局搜索替换英文字面量。这条路有个绕不开的问题：
正则分不清 `,"div")` 到底是 React 的文本子节点，还是 `f.bind(void 0,"div")` 里的 HTML 标签工厂参数。
一旦把后者也换掉，创建出来的就是 `<分区>` 元素。同类的还有 `setAttribute("role","menu")` 的属性值、
`hasStringProp(o,"label")` 的属性名、`alt+left` 这样的键位描述符——它们都是英文，但都不是给人看的文字。

本项目换了个思路：

| | 全局字面量替换 | 本项目 |
| :-- | :-- | :-- |
| 判断依据 | 正则猜测 | 原始 TSX 的语法位置 |
| 判定方向 | 默认可译，出事再排除 | **默认不可译**，只收明确的 UI 文本位置 |
| 产物改动 | 数千处字节替换 | **6 处**函数包装，约 640 字节 |
| 切换语言 | 重新打一遍补丁 | 改 `localStorage` 后重载 |
| 应用升级后 | 全部偏移失效 | 译文表照用，未命中回落英文 |
| 译文未覆盖时 | 可能替换错位置 | 原样显示英文 |

关键在于 sourcemap 带着完整的 `sourcesContent`——也就是原始未压缩的 TypeScript/TSX。
`<CoreTypography>Danger Score:</CoreTypography>` 里的 JSX 文本子节点按定义就是显示文字，
不需要猜。而 `className="loader"` 按定义就不是。

---

## 覆盖分层

两层分别覆盖框架文案和 ST 界面文案：

| 层 | 覆盖什么 | 怎么做 | 改动 ST 文件 |
| :-- | :-- | :-- | :-- |
| **Tier 1 语言包** | Theia / VS Code 框架文案：菜单、编辑器、设置、命令面板（约 1.7 万条，14 种语言现成） | `langpack install` 把微软官方 VS Code 语言包（MIT）放进 Theia 用户插件目录 | **零** |
| **Tier 2 运行时挂钩** | ST 前端文案（1811 个可译位置、1246 条原文），以及显式抽取的 Pack 参数文案 | `install` 在 `bundle.js` 包装六个渲染入口，渲染时查表替换 | 6 处，638 字节（v1.1.1 实测） |

### Tier 1：语言包为什么必须装

STM32CubeMX2 基于 Eclipse Theia，后端**已内置** 14 种语言的翻译
（zh-cn、zh-tw、fr、de、it、es、ja、ko、ru、pt-br、tr、pl、cs、hu）。但只设 `localStorage.localeId` 不会生效，
实测界面一个中文字符都没有。原因有两层，都在 Theia 的代码里：

1. 后端 `registerLocalizationFromRequire()` 注册内置翻译时不设 `languagePack: true`，而前端
   `I18nPreloadContribution` 只装载 `languagePack` 为真的语言。**任何**声明了 `contributes.localizations`
   的插件都会把该语言标成 `languagePack`，Theia 随即把内置的 `theia/*` 翻译（约 1300 条）一并激活。
2. 但菜单、编辑器、设置这些大头走的是 `localizeByDefault('View')`——它通过 VS Code 的 metadata
   把英文反查成 `vscode/menubarControl/mView` 这样的键，再去表里找。这些 `vscode/*` 键的翻译
   只在**微软官方的 VS Code 语言包**里（约 1.55 万条）。

所以 `langpack install` 做的事就是：从 Open VSX 下载 `MS-CEINTL.vscode-language-pack-<语言>`
（MIT 许可），挑与应用内置 VS Code API 版本最匹配的那一版（键会随版本漂移，宁旧勿新），
校验后放进 `~/.theia-cubemx2/plugins/`。实测装完后：

```
theia/* 键 1267 ・ vscode/* 键 15524
View → 查看(V)   Help → 帮助(H)   Save → 保存(S)
```

全程不动 ST 任何文件；`langpack remove` 即可撤销。

### Tier 2：运行时挂钩

ST 自研文案来自 JSX、显示属性和 Pack 参数模型。本工具在 `bundle.js` 里包装六个渲染入口：

| 挂钩点 | 覆盖 |
| :-- | :-- |
| `React.createElement` | JSX 文本子节点与文本属性 |
| `jsx` / `jsxs` | 新 JSX 转换产物 |
| `CommandRegistry.doRegisterCommand` | 命令面板里的命令标签 |
| `MenuModelRegistry.registerSubmenu` | 主菜单与右键菜单的子菜单标题 |
| `MenuModelRegistry.registerMenuAction` | 菜单项标签 |
| `Lumino Title.label` | 标签页与菜单栏标题 |

前两个覆盖 React 渲染的内容，后四个覆盖 Theia/Lumino 渲染的菜单与标签页——后者 React 够不到。

两层叠加时的规则很简单：框架先译了，挂钩看到的已是译文，不会再动；框架没译（ST 自创的文案、
ST 自定义的 nls 键），挂钩按原文替换。运行时挂钩因此是整套方案的安全网。

---

## 快速开始

需要 Node.js 20 或更新版本。直接使用仓库已有的中文译文：

```powershell
npm install
npm run build

# 1. 框架语言包（Tier 1）：菜单、编辑器、设置立刻有官方翻译，不碰 ST 文件
node dist/cli.js langpack install --locale zh-cn

# 2. 注入运行时并部署已有中文译文（Tier 2）
node dist/cli.js install --locale zh-CN

# 3. 启动 STM32CubeMX2，F1 → Configure Display Language → 选择语言
#    装了语言包后该语言会出现在列表里；两层翻译随这一个开关同时切换
```

出问题随时 `node dist/cli.js rollback`。

### 更新词库与 Pack 参数文案

只抽取前端时运行 `node dist/cli.js extract`。外设设置的许多文案位于 HAL 驱动 Pack 的
隐藏 `.config/*_parameters.json` 中，不在前端 sourcemap 里。用 `--pack-config` 显式补充：

```powershell
# 按本机的 Pack 系列、版本调整路径；以下是本次验证使用的两个文件
$packConfigDir = Join-Path $env:LOCALAPPDATA 'stm32cube\packs\STMicroelectronics\stm32c5xx_hal_drivers\2.1.0\.config'
$timerConfig = Join-Path $packConfigDir 'stm32c5xx_tim_parameters.json'
$lowPowerTimerConfig = Join-Path $packConfigDir 'stm32c5xx_lptim_parameters.json'
node dist/cli.js extract --pack-config $timerConfig $lowPowerTimerConfig
node dist/cli.js catalog
node dist/cli.js sync --locale zh-CN
# 用 Poedit / Weblate 修改 PO，或使用下面的 JSON 批次流程
node dist/cli.js lint --locale zh-CN
node dist/cli.js install --locale zh-CN
```

参数也可传目录，递归读取其中的 `*_parameters.json`，包含隐藏目录。
只收 schema 的 `title`、`description`、静态 action 提示及显示属性；不执行 Pack 脚本，
不提取 `const`、`default`、`condition`、`computed` 等代码或数据值。
`{{...}}` / `${...}` 动态文案记录为不可译；原始 Pack 文件不做修改。

**同步时保持抽取范围一致。** 现有中文包含上述 TIM/LPTIM 文案；若重新抽取时省略
`--pack-config`，后续 `sync` 会把该范围之外的词条当成已失效而移除。
换系列或扩展到其他外设时，新增原文仍需翻译，不能沿用当前完成度作为覆盖保证。

### 补提取外设分类、通道与其他参数

`--pack-descriptor <文件...>` 可读取 DFP 的 `peripheral_configuration_mapping.json` 和
`*_peripherals.json`：分类、外设说明、功能标签及定时器通道显示名称进入清单，硬件标识保持原样。
同名外设通过配置类型和关联硬件区分，条目 ID 不依赖数组顺序。
参数文件中 `itemTitle` 引用的 `source` 表达式只做静态读取，不执行代码。

2026-09-15 在本机 STM32C5 HAL/DFP 2.1.0 上扩展到 48 个参数文件和 4 个 DFP 描述文件，
共收录 **5341 条不同静态原文**，其中 **3445 条待补译**；另有 69 种模板/表达式线索。
已部署的中文词库仍是前述 1896 条。提取结果见本机 [报告](work/residual-extraction/REPORT.md)，
含完整来源的 JSON、可搜索清单及 58 个翻译批次；这些过程文件不随 Git 分发。

以下命令复现该范围，并在工作副本中保留已有译文：

```powershell
$packRoot = Join-Path $env:LOCALAPPDATA 'stm32cube\packs\STMicroelectronics'
$configDir = Join-Path $packRoot 'stm32c5xx_hal_drivers\2.1.0\.config'
$descriptorDir = Join-Path $packRoot 'stm32c5xx_dfp\2.1.0\Descriptors'
$descriptorFiles = @(Join-Path $descriptorDir 'peripheral_configuration_mapping.json') + @(rg --files --hidden $descriptorDir -g '*_peripherals.json')
if ($LASTEXITCODE -ne 0) { throw '未能列出 DFP 描述文件' }
node dist\cli.js --catalog work\residual-extraction\catalog.json extract --pack-config $configDir --pack-descriptor @descriptorFiles --pot work\residual-extraction\stm32cubemx2.pot
if ($LASTEXITCODE -ne 0) { throw '提取失败' }

$workLocales = 'work\residual-extraction\locales'
New-Item -ItemType Directory -Path $workLocales -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $workLocales 'zh-CN.po'))) {
    Copy-Item -LiteralPath 'locales\zh-CN.po' -Destination $workLocales
    Copy-Item -LiteralPath 'locales\zh-CN.glossary.json' -Destination $workLocales
}
node dist\cli.js --locales $workLocales sync --locale zh-CN --pot work\residual-extraction\stm32cubemx2.pot
if ($LASTEXITCODE -ne 0) { throw '同步失败' }
node dist\cli.js --locales $workLocales export-work --locale zh-CN --out work\residual-extraction\translation-work
```

翻译交回时仍应指定这个 `--locales` 工作目录。动态模板保留为 `template-concat` 审查项，
需要确认渲染位置并适配后才能进入运行时词表；抽取到静态文案也不等于已在界面验证命中。

### 应用或 Pack 升级

先保存旧清单，再用相同的源范围抽取新版本。沿用上面的 Pack 路径变量，并按实际版本更新：

```powershell
Copy-Item -LiteralPath catalog\catalog.json -Destination catalog\before-upgrade.json
node dist/cli.js extract --pack-config $timerConfig $lowPowerTimerConfig
node dist/cli.js diff --before catalog/before-upgrade.json
node dist/cli.js sync --locale zh-CN
node dist/cli.js export-work --locale zh-CN
```

`diff` 输出 `catalog/diff.json`，区分条目的新增、移除、字段变化和可译原文的变化。
文件搬迁或 ID 变化不等于需要重翻：`sync` 按原文精确继承已有译文，保留译者注释、
fuzzy 标记及仍有效的组件 `msgctxt`；改写后的原文留空等待翻译。
可用 `--after <路径>` 指定新清单，`--json` 输出完整机器报告。

---

## 给翻译人员

你只需要 `locales/<语言>.po` 这一个文件，用 [Poedit](https://poedit.net/) 打开就能改，
全程看不到任何代码：

```po
#: @prg-cube/cube-sw-composer/src/browser/draggable-elements/cells/CompatibilityCell.tsx:106
#. 界面位置：cube-sw-composer → CompatibilityCell
#. 语境：<CoreStack direction="row"> <CoreTypography variant="caption_medium" bold> Danger Score:
#, jsx-child
msgid "Danger Score:"
msgstr "风险评分："
```

几条注意事项：

- **占位符原样保留**。`{0}`、`${...}`、`%s` 不要翻译，顺序可以按中文习惯调整。
- **标了 `keep-whitespace` 的条目，首尾空格必须保留**。这类片段会和相邻内容拼接，
  少一个空格就会粘在一起。
- **留空就是不翻译**，界面会显示英文原文，不会出错。
- 标了 `needs-review` 的条目语境有歧义，拿不准就先留空。

同一句英文默认只出现一次，译文全局生效。**同一原文在不同模块里含义不同时，只能挑一个都不误导的说法**——
`export-work` 会在这类条目的 `note` 里标出它跨了哪几个模块，原因见下面「方案的固有边界」。
若该原文是直接写在组件里的子节点或属性（不是表格列描述符那种数据），
可以给条目加 `msgctxt`（填组件名），运行时会优先用带 `msgctxt` 的译文。

### 交给 AI 翻译

不想开 Poedit 也行。把待翻条目打包成 JSON 批次，连同 `TRANSLATION_HANDOFF.md` 一起交给翻译方
（人或 AI），交回后灌回 PO 并自动校验：

```powershell
node dist/cli.js export-work --locale zh-CN            # → work/zh-CN/batch-001.json …
#   把 work/zh-CN/ 与 TRANSLATION_HANDOFF.md 交给翻译方，交回到 work/zh-CN/done/
node dist/cli.js import-json --locale zh-CN --from work/zh-CN/done --source claude
node dist/cli.js lint --locale zh-CN --json > lint.json  # 有问题时把报告回给翻译方
```

批次 JSON 每条自带界面位置、原始 JSX 语境和注意事项，翻译方不需要接触仓库里的任何其它文件；
导回按 `msgid` 对齐，批次可以任意拆分、乱序、部分交回。`lint` 的规则与交接说明里的硬性规则一一对应。

---

## 给开发者

`catalog` 命令生成的 HTML 收录**全部**抽取结果，包括被判为不可译的条目及其理由——
这是查"某句话为什么没被翻译"的地方。按功能模块分组，支持搜索与过滤。

排除原因一览：

| 原因 | 含义 |
| :-- | :-- |
| `tag-factory` | HTML 标签工厂参数，如 `f.bind(void 0,"div")` |
| `type-guard` | 类型守卫的属性名，如 `hasStringProp(o,"label")` |
| `dom-attribute` | DOM 属性值，如 `setAttribute("role","menu")` |
| `css-class` / `css-selector` | CSS 类名、选择器、属性值 |
| `keybinding` | 框架解析的键位描述符，如 `ctrlcmd+shift+t` |
| `enum-value` | 枚举或状态字面量 |
| `identifier` | 标识符形态（camelCase / kebab-case / CONST） |
| `template-concat` | 渲染时才由模板拼装，按值查表够不到 |
| `not-ui-position` | 未落在任何已知 UI 文本位置 |

角色标为 `nls-default` 的条目是 ST 代码里 `nls.localize()` / `localizeByDefault()` 的默认文案。
装了语言包后其中一部分会由框架先译，但 ST 自创的文案不在任何语言包里，仍需在 PO 里翻——
两者叠加时框架优先，挂钩兜底，翻了不会冲突。

### 方案的固有边界

按值查表的运行时方案有以下限制，遇到残留文案时先对照这里。

**一、渲染时才拼装的文本。**

```tsx
{`${GREETING_MESSAGE} ${GREETING_HIGHLIGHT_MESSAGE}`}
title={`Last Opened project - ${formatDateAsDelay(...)}`}
```

运行时看到的是拼好的整句，而译文表里只有各个片段，永远对不上。这类条目会被收录进
文本清单并标为 `template-concat`，明确告诉开发者「不是漏了，是够不到」。
Theia 主菜单、命令面板与标签页由 Lumino 而非 React 渲染，已由另外四个挂钩点覆盖。

**二、表格列头这类「数据形态」的文案没法按组件消歧。**

运行时取的 `owner` 是**当前正在创建的组件**。字符串作为数据传进通用渲染器时
（比如 `{ field: 'line', header: 'Line' }` 交给 DataGrid），真正渲染它的是 DataGrid 内部的表头组件，
不是写下这个描述符的那个业务组件。所以 `msgctxt` 对这类条目无效。

实例：`Line` 同时是 MCU 选择器的筛选列（**产品线**）和 EXTI 表格的列头（**中断线**），
两个语义无法区分，只能挑一个两边都不误导的译法。`export-work` 因此会对跨模块的条目加提醒。
同样，`Filter` 同时用于列表和定时器信号处理，目前统一用「过滤」。

**三、共用的拼接片段互相牵制。**

同一个带首尾空格的片段可能被多个句子共用。中间件选择对话框里，标题句
`Add {type} to your {type} panel` 和按钮句 `Add ({N}) {type} to your {type} panel`
共用 `" to your "` 与 `" panel"`；把 `" to your "` 改成更顺的「 添加到您的 」，
按钮就会变成「添加 (3) 中间件 添加到您的 中间件 面板」。
改这类片段前先在文本清单里确认它只在一处使用。

**四、抽取范围之外的文案。**

其他 Pack、外设分类名称、运行时生成的通道名称，以及部分第三方控件、CSS `content`
和 Electron 原生对话框仍可能显示英文。当前仅补译了 STM32C5 HAL 驱动 2.1.0 的
TIM/LPTIM 参数 schema；其余 Pack 可用上述命令抽取后继续翻译。
`highlightedText` 是组件的原文匹配条件，不作为普通 prop 翻译；最终高亮文本仍会翻译。

### 实测覆盖率

静态分析只能告诉你抽到了什么，告诉不了你界面上还剩什么没翻。有两个办法：

**伪翻译**——把每条原文包成 `⟦原文⟧` 装进去，启动即可肉眼分辨：
`⟦括号⟧`＝挂钩命中，裸英文＝覆盖缺口。

```powershell
node dist/cli.js install --locale zh-cn --pseudo
```

**运行时审计**——记录所有查表未命中的英文：

```powershell
node dist/cli.js audit   # 打印操作步骤
```

仓库提供可重复运行的 CDP 检查脚本（**仅这些开发脚本需要 Node.js 22+**）。
Windows 上应通过 Cube 启动器启动调试实例，以保留后端所需的 Pack 环境变量：

```powershell
$cubeLauncher = Join-Path $env:LOCALAPPDATA 'STMicroelectronics\STM32CubeMX2_1.1.1\.bin\cube.exe'
& $cubeLauncher mx start --remote-debugging-port 9222 --no-detached
# 在另一个 PowerShell 中，首页可见时执行
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --expect-tab 主页 --out work/validation/live.json
```

可添加 `--screenshot work/validation/live.png` 保存截图；截图时窗口应处于恢复状态，不能最小化。
`--reload` 忽略缓存重载，`--set-locale en` 可检查英文回落，`--audit` 开启并记录漏译审计。
重载可能关闭外设标签页，需先重新打开待测页面。检查结果包括菜单、标签、实际查表命中、
伪翻译残留和此次连接期间观察到的未捕获渲染异常；不代表已经检查后端全部日志。

开发检查：`npm test` 编译 TypeScript 并执行测试；`node dist/cli.js lint --locale zh-CN` 校验词库。

### 安全保证

注入前后各有一道闸：

- 注入后用 acorn 重新解析整个 `bundle.js`，**解析不通过就不写盘**
- 括号与引号收支必须与注入前完全一致
- 始终以 `bundle.js.orig` 为基准，绝不在已有补丁上叠加
- 后端会优先服务预压缩的 `bundle.js.gz`，注入后自动同步重压
- 运行时全程 `try/catch`，译文表缺失或损坏都静默回落英文，不影响应用启动

---

## 命令

| 命令 | 作用 |
| :-- | :-- |
| `langpack install --locale <x>` | 下载微软 VS Code 语言包到 Theia 用户插件目录（Tier 1） |
| `langpack list` / `langpack remove --locale <x>` | 查看 / 移除已装语言包 |
| `extract` | 抽取文本，生成 `catalog.json` 与 `.pot` 模板 |
| `extract --pack-config <路径...>` | 同时读取指定 Pack 参数文件或目录的显示文案 |
| `catalog` | 生成开发者 HTML 文本清单 |
| `diff --before <旧清单> [--after <新清单>]` | 比较升级差异与可继承原文 |
| `sync --locale <x>` | 用最新模板更新语言 PO，保留已有译文 |
| `export-work --locale <x>` | 把待翻条目打包成 JSON 批次，交给翻译人员或 AI |
| `import-json --locale <x> --from <路径>` | 把交回的 JSON 灌回 PO 并立即校验 |
| `lint --locale <x>` | 校验译文：占位符、禁译词、空格、助记符、术语、中文标点 |
| `build --locale <x>` | 把 PO 编译成运行时译文表（`--pseudo` 生成伪翻译） |
| `install --locale <x>` | 注入运行时并部署译文（`--pseudo` 部署伪翻译） |
| `rollback` | 还原 `bundle.js` 与 `index.html` |
| `doctor` | 体检安装、备份、注入状态、语言包 |
| `audit` | 打印实测覆盖率的操作步骤 |
| `import-legacy` | 从旧 CSV 工作表导入译文 |

`build` 与 `install` 会先跑 `lint`，有 error（占位符丢失、禁译词被改、首尾空格丢失等）就拒绝，
`--force` 可跳过。

全局选项：`--app <路径>` 指定安装目录，`--locales <目录>` 指定译文目录。

---

## 合规

- 本项目是独立实现，不含任何其它 STM32CubeMX2 本地化项目的代码或词典。
- `catalog/`（完整文本清单）与 `.pot`（抽取模板）**不进仓库**，两者都由使用者在本机
  针对其自有副本用 `extract` 重新生成，已由 `.gitignore` 排除。
- **`locales/*.po` 需要进仓库**——译文是本项目的成果。但 PO 格式要求 `msgid` 为英文原文，
  因此 `.po` 必然内嵌 STM32CubeMX2 的界面字符串。这是 Gettext 生态的固有约束，
  公开发布前请自行评估可接受度。
- `import-legacy` 默认拒绝导入来源不明的译文。旧工作表里 `from_dict=1` 的行
  属于其它项目的翻译成果，需要显式加 `--include-foreign` 才会导入，
  且那样产出的 PO 不可公开分发。

代码以 Mozilla Public License 2.0 授权，详见 `LICENSE` 与 `DISCLAIMER.md`。
