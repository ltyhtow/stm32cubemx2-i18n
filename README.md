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
- **Windows** 10 / 11 (x64)
- The EXE bundles its runtime: **no PowerShell 7, Node.js, or .NET installation required**.

> ⚠️ **Please completely exit STM32CubeMX2 before running the installer.**

### Install

1. Download `stm32cubemx2-translator-zh-CN-v*-windows-x64-setup.exe` from [GitHub Releases](../../releases). If that release does not yet include an EXE, use the script archive below.
2. Double-click the EXE and choose **安装 / 更新简体中文** (install/update Chinese).
3. Leave the application path blank for automatic detection, or browse to your CubeMX2 installation.
4. After installation, switch the display language as described below. Run the same EXE again to back up, roll back, or inspect the installation and view its operation log.

The framework language pack is downloaded from Open VSX. You can skip this download when offline or when the pack is already installed. Download failures are reported while ST translations are still deployed. The EXE uses a temporary private runtime; it does not install Node.js system-wide.

### Script Archive (Optional)

The `stm32cubemx2-translator-zh-CN-v*.zip` archive still requires **PowerShell 7+ and Node.js 20+**. Extract it, open PowerShell 7 in that directory, and run:

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

Once installation finishes:
1. Launch **STM32CubeMX2**.
2. Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to open the command palette.
3. Type and select: **`Configure Display Language`**.
4. Choose **`简体中文 (zh-cn)`** and confirm reload.

---

### Maintenance Commands

EXE users can select these operations in the wizard. The commands below apply to the script archive.

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
