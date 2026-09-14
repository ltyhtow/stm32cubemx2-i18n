# 项目交接：stm32cubemx2-translator

> 给接手这个项目的 Agent。读完这份文件应当能独立继续开发，不需要复现调查过程。
> 面向翻译人员的说明是另一份 `TRANSLATION_HANDOFF.md`，两者不要混。

---

## 0. 一句话

给 STMicroelectronics 的 STM32CubeMX2（基于 Eclipse Theia 的 Electron 应用）做多语言本地化的工具链：
从应用自带的 sourcemap 抽取界面文案，走 Gettext PO 让不懂代码的人翻译，再用运行时挂钩把译文注入界面。

仓库 `C:\Users\30496\stm32cubemx2-translator`，远端 `github.com/ltyhtow/stm32cubemx2-translator`（私有）。
Node + TypeScript，MPL-2.0，每个源文件带 Exhibit A 头。本机装的应用是 v1.1.1。

---

## 1. 为什么不用现成的那个

已有项目 `P1nkDog/STM32CubeMX2-Chinese` 的做法是**在压缩后的 `bundle.js` 里做全局字面量替换**。
这个前提决定了它必须靠正则猜哪些字符串是界面文案，而正则区分不了
`,"div")` 到底是 React 子节点还是 `f.bind(void 0,"div")` 的标签工厂参数。

给它的产物做过一轮审计，实际缺陷：

| 缺陷 | 数量 | 后果 |
| :-- | :-- | :-- |
| ID 撞车导致错译 | 121 | 译文串到别的条目上（ID 用文本 slug 截断到 60 字符，119 处重复） |
| 代码位置字符串被翻译 | ~500 | 类名、属性名、键位描述符被改，行为出错 |
| `nls.localize` 三参数调用被包裹 | 65 | `bundle.js` 变成语法错误的 JS，应用白屏 |
| 键位描述符被译 | 17 | `alt+left` → `Alt+左`，快捷键失效 |

**本项目的相反选择**：不扫压缩产物，改从 sourcemap 里的原始 TSX 判定语法位置；
分类用 allowlist（默认不可译）而不是 denylist；替换发生在运行时而不是字节层面。

### 合规约束（硬性）

那个仓库**没有声明开源许可证**，默认保留所有权利。因此：

1. 不复制它的任何代码，不沿用它的词典。
2. 旧 CSV 工作表里 `from_dict=1` 的约 1303 行是它的翻译成果。`import-legacy` **默认跳过**这些行，
   需要显式 `--include-foreign` 才导入，且导入后产出的 PO 不可公开分发。这个开关不要改成默认开。
3. 仓库不预置从 ST 二进制抽取的英文清单：`catalog/`、`out/`、`locales/*.pot`、`work/` 全部 gitignore，
   使用者在自己机器上对自有副本跑 `extract`。
4. `README.md` 与 `DISCLAIMER.md` 必须保留「与 STMicroelectronics 无关联」的声明，
   以及提示使用者自行确认 EULA 对修改程序文件的限制。

---

## 2. 两层架构

这是全项目最重要的一节。两层各管一半，互不重叠。

| 层 | 覆盖什么 | 手段 | 改 ST 文件 |
| :-- | :-- | :-- | :-- |
| **Tier 1 语言包** | Theia / VS Code 框架文案（约 1.68 万条，14 种语言现成） | `langpack install` | **零** |
| **Tier 2 运行时挂钩** | ST 自研界面的硬编码文案（约 1725 条） | `install`，在 `bundle.js` 包装 6 个渲染咽喉 | 6 处，约 638 字节 |

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
  catalog/
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
locales/
  zh-CN.po               译文（进仓库）
  zh-CN.glossary.json    术语表，lint 与交接说明共用
TRANSLATION_HANDOFF.md   给翻译人员/AI 的说明
```

### 命令

| 命令 | 作用 |
| :-- | :-- |
| `langpack install/list/remove --locale <x>` | Tier 1 语言包 |
| `extract` | 抽取文案 → `catalog/catalog.json` + `.pot` |
| `catalog` | 生成开发者 HTML 清单 |
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
- **稳定 ID** `sha1(file:role:text:ordinal).slice(0,12)`。**不要用文本 slug** —— 那正是旧项目 119 处撞车的原因。
- 分类是 allowlist：只有明确落在 UI 文本位置的才可译，其余一律不可译并记录 `ExclusionReason`。
  `TEXT_PROPS` 有 60 多项，其中 19 项是用数据驱动的 `propscan` 补出来的。

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
  旧项目那 65 处语法错误注入会被这一步当场拦下。

### 运行时

- `localeId` 是**小写** `zh-cn`，写译文表文件名时要 `toLowerCase()`。
- 消歧表的 key 分隔符是 **NUL**（`\u0000`）。**在源码里必须写成转义**
  （`String.fromCharCode(0)` 或 `'\u0000'`）—— 用 Write 工具写文件时曾把真的 NUL 字节落进源文件，
  症状是 grep 报「Binary file matches」。
- `translateCommand` **原地改 `.label`**，因为 Theia 按引用比较命令对象。
- 所有包装都 try/catch 回落原函数；`localeId` 为空或 `en`、或译文表加载失败时**不安装包装**，零开销。
- `file://` 下同步 XHR 可用（验证过），所以 loader 用同步 XHR 加载译文表，保证在 `bundle.js` 之前就绪。

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

```bash
node dist/cli.js export-work --locale zh-CN            # → work/zh-CN/batch-001.json …
# 把 work/zh-CN/ 与 TRANSLATION_HANDOFF.md 交给翻译方，交回到 work/zh-CN/done/
node dist/cli.js import-json --locale zh-CN --from work/zh-CN/done --source <译者名>
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

应用是 Electron，可以带 `--remote-debugging-port=9222 --remote-allow-origins=*` 启动，
然后用 WebSocket 发 `Runtime.evaluate` 读页面真实状态。`.claude/jobs/*/tmp/both-tiers.mjs` 是现成的探针，
读菜单栏、标签页、`window.__CUBEMX2_I18N__` 的命中统计和界面中文字符数。

改了译文表要生效需要 `Page.reload` 带 `ignoreCache: true`。

### 调试 nls 链路

给 bundle 打**临时**钩子暴露 `window.__nls`（唯一定位模式
`\}\)\((\w+)\|\|\(e\.nls=\1=\{\}\)\)`），就能读 `localization.translations`、
`getDefaultKey()` 的结果、各前缀的键数。这是查清 Tier 1 的关键手段。
**查完必须从 `.orig` / `.gz.orig` 还原**，这个钩子不要留在 `inject.ts` 里。

### 测试

`node --test dist/**/*.test.js`，当前 30 项：lint 规则、langpack 版本选择与 VSIX 校验、
运行时 shim 行为。运行时测试在 vm 沙箱里用假的 window/localStorage/XHR 加载 `runtime/loader.js`。

---

## 8. 当前状态（2026-09-14）

- **zh-CN 完成度 1246/1246**，lint error 0，warning 6（全是有意保留英文的产品名与内部标识）。
- 抽取 1725 条可译。语言包 `vscode-language-pack-zh-hans` 1.108.0 已装在用户目录。
- 两层已在真实应用里叠加验证过。
- 30 项测试通过。

翻译由外部 AI 完成后我做了独立复核，改了 26 条：`Line` 的语义冲突、省略号统一为 `…`、
裸 `part` 统一为「器件」（`part no` 仍用「型号」）、`Detail view` 两种译法统一、
中间件对话框拼接句的语序断裂。详见 git log。

### 还没做的

- **第二语言验证多语言链路**。目前只跑过 zh-CN，`langpack` 的 locale 映射表里另外 14 种没实测。
- **CubeMX2 升级后的 catalog diff 流程**。稳定 ID 的设计支持译文继承，但没有工具化的 diff 报告。
- **`export-work` 可以在 note 里标注「此原文在 N 个不同模块出现」**，让翻译方提前知道译文要同时适用于多处。
  §5.1 那类语义冲突就是这么漏过去的。
- CSS `content` 与 Electron 原生对话框的残留（如确有必要，用窄范围静态补丁兜底）。

---

## 9. 环境

本机是原生 Windows 11，主 shell 是 PowerShell 7。用户的全局约定在 `~/.claude/CLAUDE.md`，
其中与本项目相关的几条：内置 `WebSearch`/`WebFetch` 在这台机器上持续 429，联网走 Tavily MCP；
已知路径的文件操作用 `-LiteralPath`；改文件用 Edit/Write 工具而不是 shell 重定向。

应用装在
`C:\Users\30496\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1\resources\stm32cubemx-application\1.1.1\dist\resources\app\`，
可执行文件是上层目录的 `stm32cubemx2-1.1.1.exe`。Theia 用户目录 `~/.theia-cubemx2/`。
