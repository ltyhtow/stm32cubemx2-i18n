# STM32CubeMX2-translator

把 STM32CubeMX2 的界面翻译成任意语言的工具链。抽取用 AST 加 sourcemap 定位，
翻译人员用标准 Gettext PO 干活，译文通过运行时挂钩生效而不是逐条替换二进制里的字符串。

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
| 产物改动 | 数千处字节替换 | **2 处**函数包装，约 260 字节 |
| 切换语言 | 重新打一遍补丁 | 改 `localStorage` 后重载 |
| 应用升级后 | 全部偏移失效 | 译文表照用，未命中回落英文 |
| 译文未覆盖时 | 可能替换错位置 | 原样显示英文 |

关键在于 sourcemap 带着完整的 `sourcesContent`——也就是原始未压缩的 TypeScript/TSX。
`<CoreTypography>Danger Score:</CoreTypography>` 里的 JSX 文本子节点按定义就是显示文字，
不需要猜。而 `className="loader"` 按定义就不是。

---

## 三层覆盖

能用上层解决的绝不下沉：

**Tier 0 — 零改动。** STM32CubeMX2 基于 Eclipse Theia，而 Theia 已内置 14 种语言
（zh-cn、zh-tw、fr、de、it、es、ja、ko、ru、pt-br、tr、pl、cs、hu）。框架自身的菜单、
编辑器、设置界面早就有官方翻译，只是默认没开。按 F1 执行 **Configure Display Language** 即可，
本工具一行代码都不用装。

**Tier 1 — 语言包插件。** 插件贡献的命令标题走 VS Code 标准的 `contributes.localizations`
机制，新增目录即可，不动任何既有文件。（规划中）

**Tier 2 — 运行时挂钩。** ST 自研界面的文案没有走任何国际化框架，是硬编码在 JSX 里的。
这部分由本工具处理：在 `bundle.js` 里包装 React 的 `createElement` 与 `jsx`/`jsxs`，
渲染时查表替换。

---

## 快速开始

```bash
npm install && npm run build

# 1. 从本机安装抽取界面文本
node dist/cli.js extract

# 2. 生成开发者可查阅的文本清单（HTML，可搜索过滤）
node dist/cli.js catalog

# 3. 建立目标语言的 PO
node dist/cli.js sync --locale zh-CN

# 4. 用 Poedit / Weblate 翻译 locales/zh-CN.po

# 5. 注入运行时并部署译文
node dist/cli.js install --locale zh-CN

# 6. 启动 STM32CubeMX2，F1 → Configure Display Language → 选择语言
```

出问题随时 `node dist/cli.js rollback`。

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

同一句英文默认只出现一次，译文全局生效。确实需要按位置区分时，
可以给条目加 `msgctxt`（填组件名），运行时会优先用带 `msgctxt` 的译文。

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
| `framework-nls` | 框架 NLS 已提供翻译，属 Tier 0 |
| `not-ui-position` | 未落在任何已知 UI 文本位置 |

### 方案的固有边界

按值查表的运行时方案有一类文本**原理上够不到**：渲染时才由模板拼装的文本。

```tsx
{`${GREETING_MESSAGE} ${GREETING_HIGHLIGHT_MESSAGE}`}
title={`Last Opened project - ${formatDateAsDelay(...)}`}
```

运行时看到的是拼好的整句，而译文表里只有各个片段，永远对不上。这类条目会被收录进
文本清单并标为 `template-concat`，明确告诉开发者「不是漏了，是够不到」。
同理，Theia 主菜单与命令面板由 Lumino 而非 React 渲染，也不在 React 挂钩的覆盖范围内（见分期规划）。

### 实测覆盖率

静态分析只能告诉你抽到了什么，告诉不了你界面上还剩什么没翻。有两个办法：

**伪翻译**——把每条原文包成 `⟦原文⟧` 装进去，启动即可肉眼分辨：中文＝框架已翻译（Tier 0），
`⟦括号⟧`＝我们的挂钩命中，裸英文＝覆盖缺口。

```bash
node dist/cli.js install --locale zh-cn --pseudo
```

**运行时审计**——记录所有查表未命中的英文：

```bash
node dist/cli.js audit   # 打印操作步骤
```

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
| `extract` | 抽取文本，生成 `catalog.json` 与 `.pot` 模板 |
| `catalog` | 生成开发者 HTML 文本清单 |
| `sync --locale <x>` | 用最新模板更新语言 PO，保留已有译文 |
| `build --locale <x>` | 把 PO 编译成运行时译文表（`--pseudo` 生成伪翻译） |
| `install --locale <x>` | 注入运行时并部署译文（`--pseudo` 部署伪翻译） |
| `rollback` | 还原 `bundle.js` 与 `index.html` |
| `doctor` | 体检安装、备份、注入状态 |
| `audit` | 打印实测覆盖率的操作步骤 |
| `import-legacy` | 从旧 CSV 工作表导入译文 |

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
