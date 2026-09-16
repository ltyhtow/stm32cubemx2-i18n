# 项目交接：stm32cubemx2-i18n

> 给接手这个项目的 Agent。读完这份文件应当能独立继续开发，不需要复现调查过程。
> 面向翻译人员的说明见 [TRANSLATION_HANDOFF.md](TRANSLATION_HANDOFF.md)。常用操作见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 当前状态（2026-09-15，翻译交回后）

正式词库和实际安装均已更新到 **5,341 条**，新增 3,445 条与交回的 58 个批次逐条一致。
68 项测试通过；lint 为 0 错误、61 个原文与译文相同的警告、0 排版问题、0 fuzzy。
用户已目视确认新译文在实际 GPIO 页面等位置生效，本批次尚未做语言质量复核。
详见 [验证记录](VERIFICATION.md)。

接下来主要处理译文质量、仍未命中的渲染路径（如 Saved）及 69 种模板/表达式的适配。
下文 §8 保留开发历史，其中“待译”“未部署”等描述属于当时状态，不再代表当前交付。

---

## 0. 一句话

给 STMicroelectronics 的 STM32CubeMX2（基于 Eclipse Theia 的 Electron 应用）做多语言本地化的工具链：
从应用自带的 sourcemap 和显式指定的 CMSIS Pack 参数 schema 抽取界面文案，
经 Gettext PO 翻译，再用运行时挂钩把译文注入界面。

远端仓库：[ltyhtow/stm32cubemx2-i18n](https://github.com/ltyhtow/stm32cubemx2-i18n)。
Node + TypeScript，MPL-2.0，每个源文件带 Exhibit A 头。本机装的应用是 v1.1.1。

---

## 1. 灵感与实现选择

本项目灵感来自 [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese)，感谢作者对中文本地化的探索。

本工具从 sourcemap 中的原始 TSX 判断界面文本位置，再通过运行时挂钩应用译文。
标签名、属性值、快捷键和显示文字可能使用相同的英文，提取器因此只收录明确的显示位置。
代码和词库独立维护。

### 合规约束（硬性）

那个仓库**没有声明开源许可证**，默认保留所有权利。因此：

1. 不复制它的任何代码，不沿用它的词典。
2. 旧 CSV 工作表里 `from_dict=1` 的约 1303 行是它的翻译成果。`import-legacy` **默认跳过**这些行，
   需要显式 `--include-foreign` 才导入，且导入后产出的 PO 不可公开分发。这个开关不要改成默认开。
3. `catalog/`、`out/`、`locales/*.pot`、`work/` 全部 gitignore，使用者对自有副本跑 `extract`。
   已跟踪的 PO 含原文和简短来源语境；不要再声称仓库「不含任何 ST 界面文本」。
4. `README.md` 与 `DISCLAIMER.md` 必须保留「与 STMicroelectronics 无关联」的声明，
   以及提示使用者自行确认 EULA 对修改程序文件的限制。

---

## 2. 两层架构

两层分别覆盖框架文案和 ST 界面文案，已由框架翻译的文字通常不会再命中原文词库。

| 层 | 覆盖什么 | 手段 | 改 ST 文件 |
| :-- | :-- | :-- | :-- |
| **Tier 1 语言包** | Theia / VS Code 框架文案（约 1.68 万条，14 种语言现成） | `langpack install` | **零** |
| **Tier 2 运行时挂钩** | ST 前端 1811 个可译位置（1246 条原文），以及指定 Pack 的参数文案 | `install`，在 `bundle.js` 包装 6 个渲染入口 | 6 处，638 字节（v1.1.1） |

### 2.1 Tier 1：为什么必须装微软的语言包

这一节的结论是实测出来的，中途我判断错过一次并写进了 README，后来推翻。**不要重新推导，直接用：**

1. Theia 后端**已内置** 14 种语言（zh-cn、zh-tw、fr、de、it、es、ja、ko、ru、pt-br、tr、pl、cs、hu）。
2. 但只设 `localStorage.localeId = 'zh-cn'` 界面一个中文字符都不会出现。原因在 Theia 自己的代码：
   后端 `registerLocalizationFromRequire()` 注册内置翻译时**不设 `languagePack: true`**，
   而前端 `I18nPreloadContribution` 只装载 `languagePack` 为真的语言，否则把 locale 退回默认值。
3. **任何**声明了 `contributes.localizations` 的插件都会把该语言标成 `languagePack`，
   Theia 随即把内置的 `theia/*` 翻译（约 1300 条）一并激活。我用一个最小桩插件验证过这一步成立。
4. **但界面依然全英文。** 决定性的事实：菜单、编辑器、设置这些大头走的是 `localizeByDefault('View')`，
   它通过 VS Code 的 metadata 把英文反查成 `vscode/menubarControl/mView` 这样的键。
   激活后加载的 1293 个键里 **`vscode/` 前缀的有 0 个** —— Theia 只带 `theia/*`，不带 VS Code 自己的字符串。
5. 这些 `vscode/*` 键（约 1.55 万条）只在**微软官方的 VS Code 语言包**里。MIT 许可，Open VSX 上是
   `MS-CEINTL.vscode-language-pack-<lang>`。

所以 `langpack install` 做的是：读后端 `main.js` 里的 `DEFAULT_SUPPORTED_API_VERSION`（本机 1.108.0），
到 Open VSX 挑同 `major.minor` 的语言包（键会随 VS Code 版本漂移，**宁旧勿新**），
用一个自带的最小 zip 读取器校验 VSIX 的 `contributes.localizations` 确实声明了目标语言，
放进 `~/.theia-cubemx2/plugins/`。目录名 `.theia-cubemx2` 也是从后端的 `configurationFolder` 读的，没硬编码。

装完实测：

```
theia/* 键 1267 ・ vscode/* 键 15524
View → 查看(V)   Help → 帮助(H)   Save → 保存(S)
```

**全程不碰 ST 任何文件**，`langpack remove` 即可撤销。

### 2.2 Tier 2：六个挂钩点

ST 自研界面的文案没走任何国际化框架，硬编码在 JSX 里。挂钩点都是单点赋值，用正则精确定位后包装：

| 挂钩点 | 覆盖 |
| :-- | :-- |
| React `createElement` | JSX 文本子节点与文本属性 |
| `jsx` / `jsxs` | 新 JSX 转换产物 |
| `CommandRegistry.doRegisterCommand` | 命令面板里的命令标签 |
| `MenuModelRegistry.registerSubmenu` | 主菜单与右键菜单的子菜单标题 |
| `MenuModelRegistry.registerMenuAction` | 菜单项标签 |
| Lumino `Title.label` | 标签页与菜单栏标题 |

前两个覆盖 React 渲染的内容，后四个覆盖 Theia/Lumino 渲染的菜单与标签页 —— 后者 React 够不到，
少了它们菜单栏和标签页会保持英文。

**两层叠加的规则**：框架先译了，挂钩看到的已是中文、不会再动；框架没译（ST 自创文案、ST 自定义的 nls 键），
挂钩按原文替换。所以运行时挂钩是整套方案的安全网，`nls-default` 角色的条目也照常收进 PO。

---

## 3. 仓库结构

```
src/
  cli.ts                 全部命令的入口（commander）
  types.ts               StringRole / ExclusionReason / CatalogEntry / Installation / RuntimeTable
  locate.ts              定位安装：--app > 环境变量 > 常见路径 > Windows 注册表
  extract/
    sourcemap.ts         VLQ 解码，originFor() 二分查找，contextAround()
    source-tsx.ts        抽取的核心：TypeScript API 解析 sourcesContent，判定语法位置
    bundle-scan.ts       acorn tokenizer 单遍扫描压缩产物，统计字面量 + 识别代码位置
    catalog.ts           合并三路信号，生成稳定 ID
    pack-config.ts       读取 Pack 的 *_parameters.json，按 schema 显示字段白名单抽取
    pack-descriptor.ts   DFP 分类、外设说明、功能标签和定时器通道名称
    text-expressions.ts  静态读取模板与拼接表达式的文案形状，不执行代码
  catalog/
    diff.ts              升级清单差异，另统计按原文可继承的翻译范围
    po.ts                catalogToPot / mergePo（msgmerge 语义）/ poToRuntimeTable / pseudoTable / poStats
    lint.ts              译文校验，三档严重度
    work.ts              JSON 批次的导出与导回
    report.ts            自包含可搜索的 HTML 文本清单
    import-legacy.ts     从旧 CSV 导入（合规敏感，见 §1）
  runtime/
    inject.ts            6 个注入点的定位与包装，含安全闸
    loader.test.ts       运行时 shim 的行为测试（vm 沙箱 + 假 window/localStorage/XHR）
  apply/
    index.ts             install / rollback / doctor
    langpack.ts          Tier 1 语言包
runtime/loader.js        注入到页面的运行时（纯 JS，不经 TS 编译）
scripts/cdp.mjs          Node 22+ 的开发用 CDP 连接与页面状态读取
scripts/verify-live.mjs  可重复的活体验证、审计与截图
locales/
  zh-CN.po               译文（进仓库）
  zh-CN.glossary.json    术语表，lint 与交接说明共用
docs/
  DEVELOPMENT.md        开发与翻译操作
  AGENT_HANDOFF.md      实现细节和开发历史
  TRANSLATION_HANDOFF.md 给翻译人员/AI 的说明
  VERIFICATION.md       验证范围、证据与剩余限制
```

### 命令

| 命令 | 作用 |
| :-- | :-- |
| `langpack install/list/remove --locale <x>` | Tier 1 语言包 |
| `extract` | 抽取文案 → `catalog/catalog.json` + `.pot` |
| `extract --pack-config <路径...>` | 同时抽取指定 Pack 参数文件/目录，包含隐藏 `.config` |
| `extract --pack-descriptor <文件...>` | 同时抽取 DFP 映射与外设描述文件的显示字段 |
| `catalog` | 生成开发者 HTML 清单 |
| `diff --before <旧清单> [--after <新清单>]` | 报告条目与可译原文的新增、移除、变化 |
| `sync --locale <x>` | 用新模板更新 PO，保留已有译文 |
| `export-work --locale <x>` | 待翻条目 → JSON 批次 |
| `import-json --locale <x> --from <路径>` | 交回的 JSON → PO，自动跑 lint |
| `lint --locale <x>` | 校验译文（`--json` 输出给翻译方，`--strict` 警告也算失败） |
| `build --locale <x>` | PO → 运行时译文表（`--pseudo` 生成伪翻译） |
| `install --locale <x>` | 注入 + 部署译文（`--pseudo`、`--dry-run`、`--force`） |
| `rollback` | 还原 `bundle.js` 与 `index.html` |
| `doctor` | 体检安装、备份、注入状态、语言包 |
| `audit` | 打印实测覆盖率的操作步骤 |
| `import-legacy` | 从旧 CSV 导入（默认排除他人词典） |

`build` 与 `install` 会先跑 lint，有 error 就拒绝，`--force` 跳过。

---

## 4. 必须知道的事实与坑

这些是调查出来的，重新发现每一条都要花不少时间。

### 抽取

- **sourcemap 带完整 `sourcesContent`**，9503 个原始 TypeScript/TSX 文件都在里面。
  18.8MB 的 VLQ mappings 解码约 4 秒，反查精度到行。
- **ST 自研代码的三个源根**：`@prg-cube/`、`libs/features/`、`src/`。`isVendorSource()` 判这个，
  漏一个就少一大片文案（我最初只写了 `@prg-cube/`，漏了后两个）。
- **压缩产物 28MB，不要用 acorn 完整 parse**，会吃掉几个 GB 内存。用 tokenizer 单遍扫，
  维护一个 6 个 token 的环形缓冲判断代码位置。
- **JSX 文本折叠必须照 Babel 的 `cleanJSXElementLiteralChild` 语义**：只裁剪与换行相邻的空白，
  行内空格保留。另外要解码 HTML 实体（`&nbsp;` `&apos;` `&hellip;` 与数字实体）。
  这条最初做错，导致 83 条抽出来的字符串在产物里找不到；改对后归零。
- **稳定 ID** `sha1(file:role:text:ordinal).slice(0,12)`。不要用截断的文本 slug，以免不同原文发生 ID 冲突。
- 分类是 allowlist：只有明确落在 UI 文本位置的才可译，其余一律不可译并记录 `ExclusionReason`。
  `TEXT_PROPS` 有 60 多项，其中 19 项是用数据驱动的 `propscan` 补出来的。
- **外设参数不全在前端里**。STM32C5 HAL Pack 的 `.config/*_parameters.json` 含 TIM/LPTIM
  的标题、说明和校验提示；`rg` 默认跳过点目录，查找时要加 `--hidden`。
  `extract --pack-config` 只访问已知 schema 子树、静态 action 提示和 attributes 显示字段，
  不执行脚本，不遍历 `computed`、`condition`、`default` 或 `const`。
  Pack ID 使用虚拟来源名、componentid 和 JSON Pointer，不含安装绝对路径或 Pack 版本。
- **保持抽取范围一致**：现有 PO 含 C5 HAL 48 个参数文件及 DFP 4 个描述文件的文案。
  省略 Pack 输入再 `sync` 会删除范围外的词条；[开发指南](DEVELOPMENT.md#重新提取)提供完整命令。

### 注入

- **产物里 `X.createElement=Y` 有两处**，另一处是 Theia 给 `document.createElement` 起的别名。
  靠模块上下文消歧：窗口内出现 `react.production.min`，或同时有 `.createContext=` 与 `.createRef=`。
- **后端优先服务预压缩的 `bundle.js.gz`**。改了 `bundle.js` 必须重压 `.gz`，否则改动完全不生效
  （这个坑会让你以为注入失败）。
- **回滚要优先拷回 `.gz.orig`**，不要重压。重压出来的 `.gz` 内容等价但字节不同，
  会让「与原始安装逐字节比对」的校验失败。
- 注入**永远以 `.orig` 为基准**，不在别人的补丁上叠加。本工具自己的备份叫
  `bundle.js.cubemx2-translator.bak`，不覆盖另一个工具的 `.orig`。
- 安全闸：注入后用 acorn 重新 parse，parse 失败拒绝写盘；再查括号/引号收支平衡。
  校验用于防止注入破坏 JavaScript 语法。

### 运行时

- `localeId` 是**小写** `zh-cn`，写译文表文件名时要 `toLowerCase()`。
- 消歧表的 key 分隔符是 **NUL**（`\u0000`）。**在源码里必须写成转义**
  （`String.fromCharCode(0)` 或 `'\u0000'`）—— 用 Write 工具写文件时曾把真的 NUL 字节落进源文件，
  症状是 grep 报「Binary file matches」。
- `translateCommand` **原地改 `.label`**，因为 Theia 按引用比较命令对象。
- 翻译出错时以原参数调用原函数；**原函数只调用一次**，它自身的异常继续向上传播。
  `localeId` 为空或 `en`、或译文表加载失败时不安装包装。
- `highlightedText` 是 Typography 在原文中查找高亮片段的条件，不能先翻译它。
  最终生成的高亮文字仍会走 React 翻译；曾经直接翻译此 prop 导致首页高亮内容回落英文，已修复。
- `file://` 下同步 XHR 可用（验证过），所以 loader 用同步 XHR 加载译文表，保证在 `bundle.js` 之前就绪。

### PO 同步

- `mergePo` 保留仍有效的人工 `msgctxt`、译者来源注释和 fuzzy/custom flags，更新模板生成的来源与标记。
- 已存在但未翻译的条目不再每次算作「新增」；头字段按不区分大小写合并。
- 安装的 `gettext-parser` 是 v8，`parse` 第二参数是 `{ defaultCharset: 'utf-8' }`；
  `@types` v4 的旧字符串签名不准确。兼容桥接留在 `parsePo` 中，不要改回旧调用。

---

## 5. 已知的固有限制

这三条不是 bug，是方案的边界。遇到相关问题不要试图「修好」，先确认是不是这里。

### 5.1 运行时无法按组件消歧表格列头 —— 影响 msgctxt 的可用性

`runtime/loader.js` 里 `owner = nameOf(type)`，取的是**当前正被 createElement 创建的组件**。
字符串作为数据传进通用渲染器（比如 DataGrid 的列描述符 `header: 'Line'`）时，
真正渲染它的是 DataGrid 内部的表头组件，**不是** `ExtiTableView`。
所以对 `config-value` 角色的条目，`msgctxt`/scoped 表**没法用组件名区分**。

实例：`Line` 同时出现在

- `mcu-selector-component.tsx:27` —— `{ id: 'line', prettyName: 'Line' }`，MCU 选择器的筛选列，意思是**产品线**
- `exti-configuration/exti-table-view.tsx:144` —— `{ field: 'line', header: 'Line' }`，EXTI 表格列头，意思是**中断线**

两个语义无法区分，只能挑一个两边都不误导的译法。现在译成「线」并在此记录。
新增 Pack 范围后，`Filter` 也同时用于列表与定时器信号处理，统一为「过滤」。
`msgctxt` 对**直接**作为组件子节点或 prop 的字符串仍然有效。

### 5.2 拼接片段互相牵制

同一个空白片段可能被多个句子共用，改一个会影响另一个。
`middleware-utilities-selection-dialog.tsx` 里：

- 338 行标题句 `Add {type} to your {type} panel`
- 384 行按钮句 `Add ({N}) {type} to your {type} panel`

两句共用 `" to your "` 和 `" panel"`。把 `" to your "` 改成更顺的「 添加到您的 」，
按钮就会变成「添加 (3) 中间件 添加到您的 中间件 面板」，两个「添加」。
**改任何带首尾空格的片段前，先用 catalog 确认它只在一处使用。**

### 5.3 `template-concat`

渲染时才由模板字符串拼装的文案，按值查表原理上够不到，抽取时标 `template-concat` 排除。
另外 CSS `::after { content: "..." }` 生成的文本和 Electron 原生对话框也在覆盖范围外，数量在十位数。

---

## 6. 翻译工作流

`export-work` → 交给人或 AI → `import-json` → `lint` → 人工抽读复核。

交接用 **JSON 批次而不是 PO**：AI 几乎写不坏 `msgid → msgstr` 的 JSON，却很容易写坏 PO 的转义与折行。
批次每条自带 `flags`、界面位置、原始 JSX 语境、注意事项，翻译方不需要接触仓库其它文件。
导回按 `msgid` 对齐，所以批次可以拆给多方、乱序、部分交回。

```powershell
node dist/cli.js export-work --locale zh-CN            # → work/zh-CN/batch-001.json …
# 把 work/zh-CN/ 与 docs/TRANSLATION_HANDOFF.md 交给翻译方，交回到 work/zh-CN/done/
node dist/cli.js import-json --locale zh-CN --from work/zh-CN/done --source remote-agent
node dist/cli.js lint --locale zh-CN --json > lint.json   # 有问题把报告回给翻译方
```

`--source` 会把译者写进 PO 注释，便于按来源复核。

### lint 的三档

| 档 | 规则 | 处理 |
| :-- | :-- | :-- |
| **error** | 占位符丢失/多出、反引号代码被改、禁译词被译、首尾空格不一致、换行数不一致、`&&` 数量不一致、开头/结尾结构符号丢失、伪翻译标记泄漏 | `build`/`install` 拒绝 |
| **warning** | 术语用了 avoid 写法、译文与原文相同、fuzzy、省略号/冒号收尾不一致 | 人工看 |
| **style** | 中文语境里的半角标点 | 人工看 |

术语表 `locales/zh-CN.glossary.json`：`terms` 每项有 `use`/`avoid`；`keep` 是禁译词，
与 lint 内置的硬件缩写列表（GPIO、DMA、NVIC…）合并。

术语检查有一处刻意的宽松：某个 avoid 写法如果同时是另一个已命中术语正确译法的一部分，不算违规。
例如 `build` 禁「编译」，但 `Add Build Target: Compiler` 里 `compiler` 正确译成「编译器」包含「编译」，
这种不报警。

---

## 7. 怎么验证

### 伪翻译测覆盖率

`install --pseudo` 把每条原文包成 `⟦原文⟧` 部署下去。界面上带括号的即为已覆盖，
裸英文即为覆盖缺口。这是测量抽取完整度的主力手段，比读代码可靠。

### CDP 实测

使用安装根目录的 `.bin\cube.exe`，通过 Cube 启动器保留 `CMSIS_PACK_ROOT` 等后端环境：

```powershell
$cubeLauncher = Join-Path $env:LOCALAPPDATA 'STMicroelectronics\STM32CubeMX2_1.1.1\.bin\cube.exe'
& $cubeLauncher mx start --remote-debugging-port 9222 --no-detached
# 另一个 PowerShell 中，页面打开后：
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --expect-tab 主页
```

根目录的 `stm32cubemx2-1.1.1.exe` 启动器未能传入 CDP 开关；直接启动内部 Electron 虽然可开端口，
却会丢失后端环境。上述入口已成功实测，不需要继续调查旧的「端口拒绝连接」。
脚本要求 Node 22+，支持断言可见文字、菜单、标签、译文命中、伪翻译残留与未捕获渲染异常。
`--screenshot <路径>` 可截图；窗口最小化时截图可能超时，先恢复窗口。
Page.reload 会关闭部分外设标签页，重载后先重新打开待测页。

改了译文表要生效需要 `Page.reload` 带 `ignoreCache: true`。

### 调试 nls 链路

给 bundle 打**临时**钩子暴露 `window.__nls`（唯一定位模式
`\}\)\((\w+)\|\|\(e\.nls=\1=\{\}\)\)`），就能读 `localization.translations`、
`getDefaultKey()` 的结果、各前缀的键数。这是查清 Tier 1 的关键手段。
**查完必须从 `.orig` / `.gz.orig` 还原**，这个钩子不要留在 `inject.ts` 里。

### 测试

`npm test` 先编译再运行，当前 **68 项**：lint、语言包、PO 同步、升级 diff、
Pack 参数与 DFP 安全抽取、前端文案及运行时 shim 行为。运行时测试在 vm 沙箱中使用假的 window/localStorage/XHR。

---

## 8. 已部署基线（2026-09-14）

- **zh-CN 1896/1896**，lint error 0、warning 6、style 0。警告是原来有意保留的产品名/内部标识。
- 前端基线 20271 条 catalog 记录，1811 个可译位置、1246 条不同原文。
  STM32C5 HAL 驱动 2.1.0 的 TIM/LPTIM 两个 schema 另加 1081 个显示字段，
  其中 955 个可译位置；合并后 21352 条记录、2766 个可译位置、1896 条不同原文。
- 中文官方语言包 `vscode-language-pack-zh-hans` 1.108.0 已安装；应用仍保留最终中文部署。
- 中文首页、创建 MCU 工程向导、菜单、TIM1 参数及下拉选项已在真实窗口验证并截图。
  TIM1 翻译前后 41 个参数控件值一致，用户工程文件 SHA256 一致。
- 英文回落已验证：英文菜单、无运行时翻译 API。德语以 4 条自写词条配合官方 1.108.0
  语言包验证了 `Projekt / Anzeigen / Hilfe / Startseite`，测试后移除了德语 VSIX 和部署词表。
- 重抽前端清单与旧清单比较无内容差异；同步再构建仍保留全部原有翻译。
  另实测 rollback 的 JS、gzip、HTML 与备份逐字节一致，再重新安装了中文。
- 56 项测试通过。详细证据和调试窗口最终状态见 `VERIFICATION.md`。

翻译由外部 AI 完成后我做了独立复核，改了 26 条：`Line` 的语义冲突、省略号统一为 `…`、
裸 `part` 统一为「器件」（`part no` 仍用「型号」）、`Detail view` 两种译法统一、
中间件对话框拼接句的语序断裂。改动清单在 `work/review-fix/fix.json`，详见 git log。
外部 AI 交回的批次文件在 `work/zh-CN/`（已全部导入，导入时没带 `--source`，
所以 PO 注释里分不出哪些是它译的；要区分就 diff `a7b64e7` 之前的 PO）。

650 条新增的 TIM/LPTIM 译文由本轮独立编写，未使用其他汉化项目的词典，
来源注释为 `independent-timer-review-2026-09-14`。此前 1246 条翻译保留，
仅把跨列表/滤波语境的 `Filter` 从「筛选」调整为「过滤」。

### 部署与后续边界

- `doctor` 应看到 6 处挂钩对应的注入状态、HTML/runtime、同步的 gzip 和 `zh-cn.json`。
  本工具备份与 `.orig` 未被覆盖；要恢复英文原始文件可运行 `rollback`。
- **词库完成度不是全应用覆盖率。** 外设树分类（如 `Timers`）、未补译的
  `Channel 1`、其他 Pack 参数、CSS 文本及部分第三方/原生控件仍有英文。
  TIM 的 `Channel 1`～`Channel 7` 已确认来自 DFP 静态名称，LPTIM 的通道名才由模板生成。
  整个 HAL 2.1.0 `.config` 的 48 个 schema 可读取（8006 个显示字段），但本轮只补译 TIM/LPTIM。
- UI 检查覆盖实际观察到的状态，不覆盖全部外设模式组合或代码生成结果。
  后端原有的 `onChanged` 初始化异常等日志在英文状态也出现；CDP 检查通过不代表后端无错误。
- `diff` 已有精确匹配与升级继承回归测试，但未安装另一版本的 CubeMX2 做跨版本补丁适配。
- 上述工作已于 2026-09-15 按用户要求提交为 `c20e60a`，其中还包含当时尚未完成的英文补提取代码。
  该条记录对应当时的本地提交阶段。

### 历史阶段：英文补提取（2026-09-15，翻译交回前）

- 修复了 `textShapes` 把 `i + 1` 当字符串拼接的问题：现在抽取为一个未知值；真正的相邻插值保持各自占位符。
- 实际 DFP 文件存在同名、不同硬件关联的外设，ID 现包含配置类型与排序后的关联硬件；真正重复的身份仍拒绝。
- 文案常量表中的 camelCase 和枚举键可读取，但 `variant` / `color` 等已知代码属性不会被误收为文案。
- **68 项测试通过**。已从前端、STM32C5 HAL 2.1.0 的 48 个参数文件、DFP 2.1.0 的 4 个描述文件完成抽取。
  合并清单 **28659 个位置、9582 个可译位置、5341 条不同静态原文**。
- 相对已部署基线新增 **3445 条原文**，旧 1896 条全部保留；另有 **69 种模板/表达式线索（89 个位置）**。
- 结果入口：`work/residual-extraction/REPORT.md`；`new-english.json` 带全部来源，
  `translation-work/zh-CN/` 有 **58 批**可直接交给翻译方，`dynamic-review.json` 供适配审查。
  `pack-sources.json` 保存实际读取的 Pack 文件路径和哈希，`summary.json` 保存完整性校验结果。
- 待译 PO 是 `work/residual-extraction/locales/zh-CN.po`，5341 条中已翻译 1896 条，
  lint 错误 0、警告 6、排版 0；保留原有译文和译者来源。主 `locales/zh-CN.po` 与应用部署仍为 1896 条。
- 后续工作：补译这 3445 条静态文案；检查已有译文仍显示英文的渲染路径（如首页片段、Saved）；
  对模板/表达式另做适配。`residual-status.json` 记录已知残留文字的现状，不能把新增抽取数量当成界面覆盖率。
- 本轮没有运行新的 UI 测试或修改用户工程；2026-09-14 的截图与控件比对只证明前述已部署基线。

### 翻译 AI 交接包（2026-09-15）

- 面向远程翻译 Agent 的完整说明已更新在 `TRANSLATION_HANDOFF.md`，开头有可直接转发的指令。
- 压缩包：`work/residual-extraction/STM32CubeMX2-zh-CN-translation-kit-2026-09-15.zip`，473380 字节。
  解压目录为 `translator-kit/`；本机对应目录在 `work/residual-extraction/translator-kit/`。
- 包内共 121 个文件：58 个原样复制的待译批次、58 个对应的语境文件（全部 5185 处来源）、
  翻译说明、术语表、1896 条已有译文参考、批次清单及疑问模板。待译任务仍为 3445 条静态原文。
- 119 个 JSON 文件均可解析，ZIP 内每个文件均已解压读取并通过 SHA256 比对。
  ZIP SHA256：`0718b54225f90ef2eb6a2442e775e2d27eebc55a1af537a2100d9788792ce766`。
- 远程 Agent 只修改批次的 `items[].msgstr`，可交回含 `done/batch-NNN.json` 与 `questions.md` 的 ZIP。
  接收后只把 `done/` 中的译文批次导入 `work/residual-extraction/locales/zh-CN.po`，保留 `--locales`
  参数；参考词库和语境文件不作译文输入。随后执行校验和质量复核，再安排部署与界面验证。
- 批次、参考文件与 ZIP 均属于本机 `work/` 过程产物，不随 Git 分发；动态模板审查仍由工程侧单独处理。

---

## 9. 环境

本机是原生 Windows，主 shell 为 PowerShell 7，Node v22.22.2。
遵循当前会话用户提供的 AGENTS 约定：Windows 路径、已知路径操作用 `-LiteralPath`，
源文件修改用 `apply_patch`；不切 Bash/WSL/cmd，不覆盖无关工作区改动。

应用装在
`%LOCALAPPDATA%\STMicroelectronics\STM32CubeMX2_1.1.1\resources\stm32cubemx-application\1.1.1\dist\resources\app\`，
调试入口是安装根目录的 `.bin\cube.exe mx start`（见 §7），Theia 用户目录为
`%USERPROFILE%\.theia-cubemx2\`。CMSIS Packs 位于 `%LOCALAPPDATA%\stm32cube\packs\`。
