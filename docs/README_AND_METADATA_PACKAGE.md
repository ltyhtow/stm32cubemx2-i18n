# STM32CubeMX2 i18n — Complete Metadata & README Update Package
# (包含修正后的英文 README、中文 README、GitHub Description 与 Topics)

> **设计说明**：
> 本方案完全保留了原提案清晰、结构化、高可读性的视觉与排版风格（Highlights、Status 表格、双角色导航、ASCII 架构图、Emoji 视觉导引），同时修复了原稿中的事实疏漏、命令路径错误与技术细节：
> 1. **明确界定适用范围**：首屏明确指出仅针对全新 Theia/Electron 架构的 **STM32CubeMX2**，不适用于旧版 Java 架构的 STM32CubeMX。
> 2. **补齐关键交互步骤**：普通用户运行安装脚本后，明确提示按 `F1` 执行 `Configure Display Language` 切换至中文并重载。
> 3. **修正 CLI 命令与路径**：修正 `import-json` 导入路径为实际规范的 `translation-work/zh-CN/done/`；明确 `extract` 中 Pack 参数为可选增强项；命令默认采用易复制的格式。
> 4. **完整展现双层架构优势**：清晰阐述 Tier 1（官方 VS Code/Theia 语言包，1.6万+ 框架词条）与 Tier 2（非侵入式运行时 Hook，ST 业务与芯片描述文案）的分工。
> 5. **实事求是的验证状态**：准确描述 5,341 条中文已填且通过自动化 Lint，在 CubeMX2 1.1.1 经真实界面目视验证生效；说明 CDP 具备端到端测试能力。
> 6. **修复文档链接**：将原本退化为目录的链接全部指回具体的 `docs/DEVELOPMENT.md`、`docs/TRANSLATION_HANDOFF.md`、`docs/VERIFICATION.md` 与 `docs/AGENT_HANDOFF.md`。

---

# 1. GitHub Metadata

## 1.1 Repository Description

**建议文本（中英兼顾，提升搜索能见度，明确非官方属性）：**
```text
STM32CubeMX2 Chinese localization & multi-language i18n toolchain (Not affiliated with ST). AST/Sourcemap extraction, Gettext PO, runtime hooks.
```

**备选纯中文文本（若 GitHub 界面需全中文）：**
```text
STM32CubeMX2 汉化与多语言本地化工具链（非 ST 官方）。AST/Sourcemap 抽取、Gettext PO 词库、运行时 Hook。
```

## 1.2 GitHub Topics

建议在 GitHub 仓库设置以下 11 个 Topics（已覆盖搜索热词、核心技术栈与架构特征）：

```text
stm32
stm32cubemx2
cubemx2
chinese
localization
translation
i18n
l10n
theia
electron
gettext
```

---

# 2. English README (`README.md`)

```markdown
# STM32CubeMX2 Translator — Chinese & Multi-language i18n

[简体中文](README_zh-CN.md) | **English**

A community-driven **Chinese localization and multi-language i18n toolchain for STM32CubeMX2**.

> ⚠️ **Important Notice & Disclaimer**  
> - **Exclusively for STM32CubeMX2**: This project targets the modern Electron/Theia-based **STM32CubeMX2** and is **incompatible** with legacy Java-based STM32CubeMX releases.  
> - **Not affiliated with, endorsed by, or sponsored by STMicroelectronics.**

This project provides an end-to-end engineering workflow for extracting, translating, linting, synchronizing, and injecting localization resources into **STM32CubeMX2**.

Unlike fragile binary patching or blind regex replacement in minified code, this toolchain leverages **AST + Sourcemap precision**, **industry-standard GNU Gettext PO catalogs**, and **clean runtime hooks** to provide a maintainable localization architecture that easily tracks upstream CubeMX2 updates.

---

## ✨ Highlights

- 🇨🇳 **Simplified Chinese Out-of-the-Box** — Includes a verified `zh-CN` catalog with 5,341 completed entries.
- 🌍 **Language-Agnostic Architecture** — Designed from the ground up for Chinese, Japanese, German, French, and any community locale.
- 🏛️ **Two-Tier Layered Localization** — Combines official VS Code/Theia language packs (Tier 1: 16,000+ framework strings) with lightweight runtime hooks (Tier 2: ST-specific frontend & peripheral text).
- 🔍 **AST + Sourcemap Precision** — Precisely extracts translatable UI strings by mapping compiled bundles back to original TSX source semantics.
- 🔧 **Deep MCU Metadata Extraction** — Recursively parses ST HAL parameter descriptors (`*_parameters.json`) and DFP peripheral descriptors (`*_peripherals.json`).
- 📝 **GNU Gettext PO Standard** — Professional localization workflow with context preservation, placeholder guards, and strict semantic linting.
- 🔄 **Upstream Version Diff & Sync** — Automatically detects added, modified, and obsoleted strings between CubeMX2 releases to protect existing translations.
- 🪝 **Non-Intrusive Runtime Hooks** — Intercepts rendering endpoints without modifying application core logic or corrupting original source code.
- 🩺 **Backup / Doctor / Rollback** — Built-in diagnostics, automatic safety backups, and instant rollback.
- 🤖 **Automated & Visual Verification** — Supports Chrome DevTools Protocol (CDP) live UI inspection and visual regression captures.
- 🧩 **Agent & Translator-Friendly** — Export and import structured JSON translation work batches without exposing raw PO file syntax.

---

## 📦 Current Status

| Item | Status / Details |
|---|---|
| **Target Application** | **STM32CubeMX2 v1.1.1** (Verified) |
| **Simplified Chinese (`zh-CN`)** | **Available** (Production ready) |
| **Catalog Entries** | **5,341 completed** (0 lint errors, verified in live UI) |
| **Translation Format** | GNU Gettext PO / POT (`locales/`) |
| **Architecture** | Two-Tier: Theia Plugin (Tier 1) + Non-intrusive Hook (Tier 2) |
| **Frontend Extraction** | AST + Sourcemap analysis |
| **Hardware Extraction** | HAL Drivers + DFP peripheral JSON schemas |
| **Upstream Version Tracking** | Supported (`diff` & `sync`) |
| **Live UI Verification** | Supported via CDP (`scripts/verify-live.mjs`) |

> **Coverage Note**: The current `zh-CN` catalog comprehensively covers primary menus, peripheral categories, GPIO configurations, parameter options, and static tips. Deep MCU part numbers and certain dynamically concatenated strings may remain in English. See [Verification Records](docs/VERIFICATION.md) for detailed boundaries.

---

## 🚀 For End Users

If you just want to use **STM32CubeMX2 in Simplified Chinese**, you do not need to build the development toolchain from source.

### Requirements

- **STM32CubeMX2** (v1.1.1 installed)
- **Windows** 10 / 11
- **PowerShell 7+** (`pwsh`)
- **Node.js 20+**

> ⚠️ **Please completely exit STM32CubeMX2 before running the installer.**

### Install

1. Download the latest `stm32cubemx2-translator-zh-CN-v*.zip` from [GitHub Releases](../../releases).
2. Extract the archive, open **PowerShell 7** in the extracted directory, and run:

```powershell
.\Install-ZhCN.ps1
```

The installer automatically:
1. Locates the STM32CubeMX2 installation directory.
2. Creates safety backups of original application files.
3. Installs the official framework Chinese language pack (Tier 1).
4. Injects runtime localization hooks and deploys the `zh-CN` catalog (Tier 2).
5. Runs automatic health checks (`Doctor`).

### Switch Display Language in Application

Once the script finishes:
1. Launch **STM32CubeMX2**.
2. Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to open the command palette.
3. Type and select: **`Configure Display Language`**.
4. Choose **`简体中文 (zh-cn)`** and confirm reload.

---

### Maintenance Commands

- **Rollback to Original State**:
  ```powershell
  .\Install-ZhCN.ps1 -Action Rollback
  ```
- **Inspect Installation Health**:
  ```powershell
  .\Install-ZhCN.ps1 -Action Doctor
  ```
- **Create Backup Only**:
  ```powershell
  .\Install-ZhCN.ps1 -Action Backup
  ```
- **Specify Custom CubeMX2 Path** (if auto-detection fails):
  ```powershell
  .\Install-ZhCN.ps1 -App 'C:\Users\<YourUser>\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1'
  ```
- **Skip Framework Language Pack Download** (for offline environments):
  ```powershell
  .\Install-ZhCN.ps1 -SkipLangpack
  ```

---

## 🛠️ For Developers & Translators

This project is a reusable localization toolchain designed to maintain translations across upstream STM32CubeMX2 and MCU Pack releases.

### 1. Build from Source

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-i18n.git
Set-Location stm32cubemx2-i18n
npm ci
npm run build
```

The compiled CLI entry point will be located at:
```text
dist/cli.js
```

### 2. Extract Strings to POT Template

Extract frontend UI strings from local STM32CubeMX2, with optional CMSIS Pack parameter schemas:

```powershell
# Basic frontend extraction:
node dist/cli.js --catalog work/catalog.json extract --pot template.pot

# Full extraction including HAL parameters and DFP peripheral descriptors:
node dist/cli.js --catalog work/catalog.json extract `
  --pack-config <PathToHALDriversConfigDir> `
  --pack-descriptor <PathsToPeripheralsDescriptors...> `
  --pot template.pot
```

*(See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full reproduction scripts).*

### 3. Initialize or Synchronize a Locale

Create or merge an existing PO catalog with the latest template (e.g., Japanese or German):

```powershell
node dist/cli.js --locales locales sync --locale ja-JP --pot template.pot
```

### 4. Upstream Version Diff

Detect added, modified, or removed strings between different CubeMX2 versions:

```powershell
node dist/cli.js diff --before catalog-v1.1.1.json --after catalog-v1.2.0.json
```

### 5. Translation Workflows (Human / AI Collaboration)

Export uncompleted entries into clean JSON batches (safe for AI/human translators):

```powershell
node dist/cli.js --locales locales export-work --locale zh-CN --out translation-work/
```

Translators only fill in `msgstr` in `translation-work/<locale>/batch-*.json`. Once reviewed, place them into `translation-work/<locale>/done/` and import:

```powershell
node dist/cli.js --locales locales import-json --locale zh-CN --from translation-work/zh-CN/done/
```

Run semantic and syntax validation:

```powershell
node dist/cli.js --locales locales lint --locale zh-CN
```

Deploy the locale into your local STM32CubeMX2 installation:

```powershell
node dist/cli.js install --locale zh-CN
```

---

## 🧪 Verification & Testing

Run unit tests, extractor tests, and PO integrity checks:

```powershell
npm test
```

Live UI verification can connect to a running STM32CubeMX2 instance via Chrome DevTools Protocol (CDP):

```powershell
# Start CubeMX2 with debugging enabled:
# .bin\cube.exe mx start --remote-debugging-port 9222 --no-detached

# Run live UI audit and capture screenshot:
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --screenshot work/validation/tim1.png
```

---

## 🏗️ Architecture

```text
                       STM32CubeMX2 Installation
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
 Frontend Web UI              HAL Drivers                 DFP Descriptors
 (Sourcemap + Bundle)      (*_parameters.json)         (*_peripherals.json)
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   ▼
                       Unified Catalog Extraction
                                   │
                                   ▼
                         GNU Gettext POT / PO
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
         Human / AI Translation             Strict Semantic Lint
         (Structured JSON Batches)          (Placeholders & Terms)
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   ▼
                  ┌─────────────────────────────────┐
                  │    Two-Tier Deployment Engine   │
                  ├────────────────┬────────────────┤
                  │     Tier 1     │     Tier 2     │
                  │ Official Theia │ Non-Intrusive  │
                  │  Language Pack │  Runtime Hook  │
                  └────────────────┴────────────────┘
                                   │
                                   ▼
                      Localized STM32CubeMX2
```

- **Tier 1 (Framework Layer)**: Downloads official Microsoft VS Code language packs (MIT) into the Theia plugin directory. Localizes 16,000+ framework strings (menus, status bars, file explorer, settings) with **zero modifications** to ST files.
- **Tier 2 (Application Layer)**: Injects 6 lightweight wrapping hooks into `bundle.js` (~638 bytes) to translate ST's proprietary UI components, HAL parameters, and DFP descriptors on the fly.

---

## 📁 Project Structure

```text
src/        TypeScript CLI, AST/Sourcemap extraction, catalog processing, and installers
runtime/    Lightweight runtime localization loader injected into the application
locales/    GNU Gettext PO catalogs and glossary files (zh-CN.po, zh-CN.glossary.json)
scripts/    One-click installer (Install-ZhCN.ps1), packaging, and CDP verification scripts
docs/       Technical documentation, verification reports, and handoff specifications
```

---

## 🌏 Adding a New Language

This project is strictly **language-agnostic**. To introduce a new locale (e.g., `ja-JP`, `de-DE`, `fr-FR`):

1. Extract the latest template using `node dist/cli.js extract --pot template.pot`.
2. Initialize your target locale via `node dist/cli.js sync --locale <locale>`.
3. Install the corresponding Tier 1 framework language pack via `node dist/cli.js langpack install --locale <locale>`.
4. Translate entries in `locales/<locale>.po` (or export batches using `export-work`).
5. Run `node dist/cli.js lint --locale <locale>` to ensure all placeholders and syntax rules are respected.
6. Install and test using `node dist/cli.js install --locale <locale>`.
7. Submit a Pull Request! Community contributions are warmly welcome.

---

## ⚠️ Compatibility & Legal Notice

- This project modifies specific files within your local STM32CubeMX2 installation to enable runtime localization. Before using it, please verify that this complies with your applicable STMicroelectronics end-user license agreement.
- See [DISCLAIMER.md](DISCLAIMER.md) for the complete legal notice.
- **STM32**, **STM32Cube**, and **STM32CubeMX** are registered trademarks of STMicroelectronics.
- This project is an independent community project and is **not affiliated with, endorsed by, or sponsored by STMicroelectronics**.

---

## 🙏 Acknowledgments

- Originally inspired by [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese). Thanks to the author for their early explorations in STM32CubeMX2 Chinese localization.
- This repository is an independent, clean-room implementation with no copied code or proprietary translation dictionaries.

---

## 📚 Documentation

- 📖 [Development & Reproduction Guide](docs/DEVELOPMENT.md) — Detailed extraction commands, pack handling, and development setup.
- 🤝 [Translation Handoff Specification](docs/TRANSLATION_HANDOFF.md) — Batch splitting rules, glossary constraints, and AI prompt guidelines.
- 🔍 [Verification Records](docs/VERIFICATION.md) — Verified scopes, screenshots, and known edge-case limitations.
- 🏗️ [Architecture & Agent Handoff](docs/AGENT_HANDOFF.md) — Internal reverse-engineering insights, AST decisions, and design principles.

---

## 📄 License

Distributed under the [Mozilla Public License 2.0 (MPL-2.0)](LICENSE).
```

---

# 3. 简体中文 README (`README_zh-CN.md`)

```markdown
# STM32CubeMX2 汉化与多语言本地化工具

**简体中文** | [English](README.md)

面向 **STM32CubeMX2** 的开源中文汉化与通用多语言本地化工具链。

> ⚠️ **重要提示与免责声明**  
> - **仅适用于 STM32CubeMX2**：本项目专门面向基于 Electron / Eclipse Theia 现代化架构的 **STM32CubeMX2**，**不适用于**旧版 Java 架构的传统 STM32CubeMX。  
> - **非 ST 官方项目**：本项目为独立开源社区项目，与意法半导体（STMicroelectronics）无任何隶属、认可、赞助或合作关系。

本项目提供从**界面文案抽取、翻译维护、质量校验、上游版本同步，到运行时注入生效**的一整套工程化本地化方案。

不同于脆弱的二进制补丁或针对压缩代码的粗暴正则替换，本项目采用 **AST + Sourcemap 精确逆向语义分析**、**行业标准 GNU Gettext PO 词库体系** 以及 **非侵入式运行时挂钩（Runtime Hook）**，让本地化工作能够随着 STM32CubeMX2 官方版本的迭代持续、低成本地维护更新。

---

## ✨ 核心特性

- 🇨🇳 **开箱即用简体中文**：内置已完成的 `zh-CN` 词库，收录 **5,341 条精校词条**。
- 🌍 **通用多语言架构**：底层设计完全语言无关，不仅服务于中文，还可无缝支持日语、德语、法语等任意社区语种。
- 🏛️ **分层解耦双层架构**：结合微软官方 Theia 语言包（Tier 1：1.6 万+ 框架词条）与非侵入式挂钩（Tier 2：ST 专属界面与外设参数），兼顾稳定性与轻量化。
- 🔍 **AST + Sourcemap 精确抽取**：通过 Sourcemap 将压缩产物映射回原始 TSX 源码语法位置，杜绝误提取变量名或内部标识符。
- 🔧 **深层芯片参数抽取**：递归扫描解析 ST 官方 HAL 驱动参数（`*_parameters.json`）与 DFP 外设描述符（`*_peripherals.json`）。
- 📝 **GNU Gettext PO 工业标准**：保留上下文注释、格式化占位符防护与自动化语义 Lint，杜绝因翻译失误导致界面崩溃。
- 🔄 **上游版本差量追踪（Diff & Sync）**：官方升级版本或发布新芯片 Pack 时，自动比对文案差异，无损继承历史译文，仅需翻译新增变动词条。
- 🪝 **非侵入式运行时挂钩**：仅在渲染入口动态劫持文案，不篡改应用核心业务逻辑代码，保持原程序清洁。
- 🩺 **备份 / 体检 / 一键还原**：内置完善的自检机制（`Doctor`）、自动备份与快速回滚能力（`Rollback`）。
- 🤖 **自动化与视觉化验证**：支持基于 Chrome DevTools Protocol (CDP) 的自动化界面巡视与真实渲染截屏验收。
- 🧩 **对协作与 AI 翻译友好**：支持导出与回传结构化 JSON 翻译工作批次，无需译者接触复杂的 PO 语法。

---

## 📦 当前状态

| 项目 | 状态 / 详情 |
|---|---|
| **目标应用** | **STM32CubeMX2 v1.1.1**（已验证） |
| **简体中文（`zh-CN`）** | **可用**（开箱即用） |
| **收录词条规模** | **5,341 条已全部翻译**（0 处 Lint 错误，真实界面验证生效） |
| **词库格式** | GNU Gettext PO / POT（位于 `locales/`） |
| **技术架构** | 双层架构：Theia 插件 (Tier 1) + 运行时 Hook (Tier 2) |
| **前端文本抽取** | AST + Sourcemap 逆向分析 |
| **硬件参数抽取** | HAL Drivers + DFP 外设描述 JSON Schema |
| **上游差量同步** | 支持（`diff` 与 `sync` 命令） |
| **自动化界面验证** | 支持（基于 CDP 的 `scripts/verify-live.mjs`） |

> **覆盖范围说明**：目前 `zh-CN` 词库已全面覆盖主菜单、外设分类、GPIO 配置树、参数选项及静态提示。部分深层芯片型号及动态拼接文案可能仍保留英文，详细边界与说明请参阅 [验证记录](docs/VERIFICATION.md)。

---

## 🚀 普通用户：一键安装中文汉化

如果你只需要在 **STM32CubeMX2** 中获得完整的简体中文界面，无需自行配置编译环境。

### 环境要求

- **STM32CubeMX2**（已安装 1.1.1 版本）
- **Windows** 10 / 11
- **PowerShell 7+**（`pwsh`）
- **Node.js 20+**

> ⚠️ **安装前请务必完全退出 STM32CubeMX2 进程。**

### 安装步骤

1. 前往 [GitHub Releases](../../releases) 下载最新的发布包：
   ```text
   stm32cubemx2-translator-zh-CN-v*.zip
   ```
2. 解压压缩包，在解压目录下打开 **PowerShell 7**，运行：

```powershell
.\Install-ZhCN.ps1
```

安装脚本将自动执行：
1. 自动探测 STM32CubeMX2 的本地安装路径。
2. 对被修改的原始文件建立安全备份。
3. 下载并安装官方 Theia 中文语言包（Tier 1）。
4. 注入运行时本地化挂钩并部署 `zh-CN` 译文表（Tier 2）。
5. 自动运行体检（`Doctor`）确认注入成功。

### 在应用内切换语言（关键步骤）

脚本执行完毕后：
1. 打开 **STM32CubeMX2**。
2. 按键盘 <kbd>F1</kbd>（或快捷键 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>）调出命令面板。
3. 输入并选择：**`Configure Display Language`**。
4. 选择 **`简体中文 (zh-cn)`**，点击提示中的重载按钮（Reload）。

---

### 常用维护命令

- **一键还原原版应用**：
  ```powershell
  .\Install-ZhCN.ps1 -Action Rollback
  ```
- **检查注入与备份健康状态**：
  ```powershell
  .\Install-ZhCN.ps1 -Action Doctor
  ```
- **仅建立应用备份**：
  ```powershell
  .\Install-ZhCN.ps1 -Action Backup
  ```
- **手动指定安装路径**（当自动探测失败时）：
  ```powershell
  .\Install-ZhCN.ps1 -App 'C:\Users\你的用户名\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1'
  ```
- **跳过框架语言包下载**（适用于纯离线网络或已装过语言包的环境）：
  ```powershell
  .\Install-ZhCN.ps1 -SkipLangpack
  ```

---

## 🛠️ 开发者与翻译贡献者指南

本项目是一套长效的多语言本地化基础设施，可用于跟踪 STM32CubeMX2 官方新版本升级或为其他语言制作词库。

### 1. 从源码构建

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-i18n.git
Set-Location stm32cubemx2-i18n
npm ci
npm run build
```

构建生成的统一 CLI 工具入口位于：
```text
dist/cli.js
```

### 2. 抽取文案并生成 POT 模板

从本机 CubeMX2 前端抽取文本，并可选择性挂载芯片 Pack 参数 Schema：

```powershell
# 基础前端抽取：
node dist/cli.js --catalog work/catalog.json extract --pot template.pot

# 完整抽取（包含 HAL 参数文件与 DFP 外设描述）：
node dist/cli.js --catalog work/catalog.json extract `
  --pack-config <HAL驱动配置目录> `
  --pack-descriptor <DFP描述文件列表...> `
  --pot template.pot
```

*(完整复现与 Pack 抽取脚本参见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md))*。

### 3. 创建或同步目标语种（`sync`）

例如初始化或用新模板同步日语（`ja-JP`）或德语（`de-DE`）：

```powershell
node dist/cli.js --locales locales sync --locale ja-JP --pot template.pot
```

### 4. 上游版本文案比对（`diff`）

当官方发布新版本时，快速比对版本间变动：

```powershell
node dist/cli.js diff --before catalog-v1.1.1.json --after catalog-v1.2.0.json
```

### 5. 翻译协同工作流（人工 / AI）

将待翻译条目打包为结构化 JSON 批次：

```powershell
node dist/cli.js --locales locales export-work --locale zh-CN --out translation-work/
```

翻译方只需在 `translation-work/<locale>/batch-*.json` 中填写 `msgstr`。审核完成后放入 `translation-work/<locale>/done/` 目录并批量回填：

```powershell
node dist/cli.js --locales locales import-json --locale zh-CN --from translation-work/zh-CN/done/
```

执行格式与语义校验：

```powershell
node dist/cli.js --locales locales lint --locale zh-CN
```

编译译文并直接安装到本地 CubeMX2：

```powershell
node dist/cli.js install --locale zh-CN
```

---

## 🧪 自动化测试与验证

运行单元测试、抽取器逻辑与 PO 解析完整性测试：

```powershell
npm test
```

通过 Chrome DevTools Protocol (CDP) 连接本地运行的 STM32CubeMX2 进行界面验证：

```powershell
# 先以调试模式启动 CubeMX2：
# .bin\cube.exe mx start --remote-debugging-port 9222 --no-detached

# 执行界面巡视并截取验证图片：
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --screenshot work/validation/tim1.png
```

---

## 🏗️ 工作原理与双层架构

```text
                     本地 STM32CubeMX2 安装目录
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    ▼                            ▼                            ▼
前端 Web 产物                HAL 驱动参数                DFP 外设描述
(Sourcemap + Bundle)      (*_parameters.json)         (*_peripherals.json)
    │                            │                            │
    └────────────────────────────┼────────────────────────────┘
                                 ▼
                     统一文案提取与分类 (AST 分析)
                                 │
                                 ▼
                      GNU Gettext POT / PO 词库
                                 │
               ┌─────────────────┴─────────────────┐
               ▼                                   ▼
        人工 / AI 翻译协同                  自动化严格 Lint
       (安全结构化 JSON 批次)               (占位符/术语/标点校验)
               │                                   │
               └─────────────────┬─────────────────┘
                                 ▼
                ┌─────────────────────────────────┐
                │          双层注入引擎           │
                ├────────────────┬────────────────┤
                │     Tier 1     │     Tier 2     │
                │ 官方 Theia 插件│ 非侵入式运行时 │
                │   (框架语言包) │    挂钩 Hook   │
                └────────────────┴────────────────┘
                                 │
                                 ▼
                    完成本地化的 STM32CubeMX2
```

- **Tier 1（框架层）**：直接从 Open VSX 下载微软官方 VS Code 语言包（MIT 许可）部署至 Theia 用户插件目录。以 **零改动 ST 官方文件** 的方式，完美汉化 1.6 万+ 条菜单栏、状态栏、快捷键、文件树等框架文本。
- **Tier 2（应用层）**：仅在 `bundle.js` 的 6 处渲染关键路径动态包装挂钩（代码增量仅约 638 字节），在内存中动态替换 ST 自研的前端文案及芯片参数，完全保留原始业务代码完整性。

---

## 📁 项目结构

```text
src/        TypeScript CLI 工具链、AST/Sourcemap 提取器、PO 处理及安装器源码
runtime/    注入应用前端的高性能运行时本地化加载器 (loader.js)
locales/    GNU Gettext PO 词库与术语映射表 (zh-CN.po, zh-CN.glossary.json)
scripts/    一键安装脚本 (Install-ZhCN.ps1)、发行打包脚本及 CDP 自动化验证脚本
docs/       开发全流程指南、翻译交接规范、验证记录与架构设计备忘录
```

---

## 🌏 添加新语言

本项目从设计之初即完全遵循**语言无关**原则。如需为项目添加新语种（如 `ja-JP`、`de-DE`、`fr-FR`）：

1. 执行 `node dist/cli.js extract --pot template.pot` 提取最新模板。
2. 执行 `node dist/cli.js sync --locale <语种代码>` 初始化该语言的 PO 词库。
3. 执行 `node dist/cli.js langpack install --locale <语种代码>` 安装对应框架语言包。
4. 翻译 `locales/<语种代码>.po` 中的词条（或使用 `export-work` 批次处理）。
5. 执行 `node dist/cli.js lint --locale <语种代码>` 确保占位符与语法无误。
6. 执行 `node dist/cli.js install --locale <语种代码>` 部署并进入应用测试。
7. 欢迎提交 Pull Request，共同完善全球多语言生态！

---

## ⚠️ 兼容性与法律声明

- 本项目为了实现本地化显示，需对本地 STM32CubeMX2 安装目录下的个别文件做挂钩处理。使用前请自行查阅并遵守 STMicroelectronics 适用的最终用户许可协议（EULA）。
- 完整法律声明详见 [DISCLAIMER.md](DISCLAIMER.md)。
- **STM32**、**STM32Cube** 与 **STM32CubeMX** 是意法半导体（STMicroelectronics）的注册商标。
- 本项目为独立的社区开源项目，与意法半导体**无任何隶属、授权、背书或赞助关系**。

---

## 🙏 致谢

- 本项目最初受到 [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese) 的启发。感谢作者在 STM32CubeMX2 中文本地化方向上的早期探索与开拓。
- 本项目为独立 clean-room 净室架构实现，不包含该项目的任何代码或词典内容。

---

## 📚 项目文档导航

- 📖 [开发与复现指南](docs/DEVELOPMENT.md) — 详细的文案抽取参数、Pack 扫描与本地开发指南。
- 🤝 [翻译交接工作流规范](docs/TRANSLATION_HANDOFF.md) — JSON 批次切分规范、术语约束与翻译 AI 提示词规范。
- 🔍 [端到端验证记录](docs/VERIFICATION.md) — 界面测试覆盖范围、实测截图归档与已知边界。
- 🏗️ [技术架构与交接备忘录](docs/AGENT_HANDOFF.md) — 逆向调研结论、AST 解析决策与底层实现备忘。

---

## 📄 开源协议

本项目代码基于 [Mozilla Public License 2.0 (MPL-2.0)](LICENSE) 协议发布。
```
