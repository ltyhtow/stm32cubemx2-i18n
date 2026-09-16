# STM32CubeMX2 Translator (`i18n`)

**English** | [简体中文](README_zh-CN.md)

---

A multi-language localization toolchain and runtime hook engine for STM32CubeMX2.

Moving beyond brittle binary patching and crude string replacement, this project leverages AST + Sourcemap precision to extract UI text from the frontend bundles, deeply parses STMicroelectronics HAL drivers and DFP peripheral descriptors, manages translations via GNU Gettext PO standards, and dynamically applies translations via non-intrusive runtime hooks.

> 💡 **Multi-Language Architecture Note**  
> This project is a **language-agnostic i18n/l10n infrastructure**. The repository includes a verified **Simplified Chinese (`zh-CN`, 5,341 translated strings)** catalog as the initial out-of-the-box reference implementation. The toolchain natively supports extracting, maintaining, and applying any target language (such as Japanese `ja-JP`, German `de-DE`, French `fr-FR`, etc.) and seamlessly tracking upstream releases.

---

## Key Features

- **Multi-Layer Deep String Extraction**: Combines AST + Sourcemap reverse analysis of the frontend Web UI with recursive scanning of ST HAL Drivers (`*_parameters.json`) and DFP peripheral descriptors (`*_peripherals.json`) to capture both UI text and deep hardware parameters.
- **Production-Grade Gettext Pipeline**: Built on standard GNU Gettext POT/PO specifications with context comment preservation, format placeholder guards, and automated semantic linting to prevent app crashes.
- **Upstream Version Diff & Sync**: When ST releases a new CubeMX2 version or MCU pack, catalog diffing detects changes, automatically inherits existing translations, and isolates only new or modified strings for translation.
- **Non-Intrusive Runtime Hooking**: Injects runtime hooks into application render entry points without altering the application's core business logic, complete with automated backup, self-diagnostics (`Doctor`), and one-click rollback.
- **Automated End-to-End Verification**: Includes Chrome DevTools Protocol (CDP) automation scripts for headless startup and automated visual regression screenshots.

---

## Quick Start Guide

### Scenario A: Using the Simplified Chinese Language Pack (End Users)

If you only want to use STM32CubeMX2 in Simplified Chinese, you can directly use the pre-packaged release:

1. **Prerequisites**: Install **PowerShell 7** and **Node.js 20+**. Completely close STM32CubeMX2.
2. **Download Release**: Download and extract `stm32cubemx2-translator-zh-CN-v*.zip` from GitHub Releases.
3. **Run Installation**: In the extracted directory, open PowerShell 7 and run:

```powershell
# Automatically detects installation path, backs up original files, and injects runtime hooks & framework language pack
.\Install-ZhCN.ps1
```

> **Common Maintenance Commands**:
> - Revert application to original state: `.\Install-ZhCN.ps1 -Action Rollback`
> - Backup current files only: `.\Install-ZhCN.ps1 -Action Backup`
> - Inspect injection and backup status: `.\Install-ZhCN.ps1 -Action Doctor`
> - Specify custom installation path: `.\Install-ZhCN.ps1 -App 'C:\Users\<YourUser>\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1'`
> - Skip downloading framework language pack: `.\Install-ZhCN.ps1 -SkipLangpack`

---

### Scenario B: Using the Toolkit for Localization & Development (Developers / Contributors)

If you want to maintain catalogs, contribute new languages (such as Japanese, German, etc.), or track upstream ST updates:

#### 1. Build from Source

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-i18n.git
Set-Location stm32cubemx2-i18n
npm ci
npm run build
```

#### 2. CLI Toolchain Commands

The project provides a unified CLI tool `cubemx2-translator` (located at `dist/cli.js` after build):

```powershell
# 1. Extract UI strings and MCU pack metadata into a POT template
node dist/cli.js --catalog work/catalog.json extract --pack-config <PackDir> --pack-descriptor <Descriptors...> --pot template.pot

# 2. Initialize or synchronize a target language PO catalog (e.g. ja-JP / de-DE / zh-CN)
node dist/cli.js --locales locales sync --locale ja-JP --pot template.pot

# 3. Diff upstream version changes
node dist/cli.js diff --before catalog-v1.1.1.json --after catalog-v1.2.0.json

# 4. Dispatch translation work batches & import reviewed translations (Human/AI Agent workflow)
node dist/cli.js --locales locales export-work --locale zh-CN --out translation-work/
node dist/cli.js --locales locales import-json --locale zh-CN --from translation-work/done/
node dist/cli.js --locales locales lint --locale zh-CN

# 5. Build catalog and install into local CubeMX2
node dist/cli.js install --locale zh-CN
```

#### 3. Automated Testing & Verification

```powershell
# Run unit tests and catalog linting
npm test

# Connect to CubeMX2 via Chrome DevTools Protocol (CDP) for live visual verification & screenshot capture
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --screenshot work/validation/tim1.png
```

---

## Status & Scope

- **Verified Version**: STM32CubeMX2 **1.1.1**.
- **Reference Catalog**: `locales/zh-CN.po` containing **5,341 verified entries**, covering menus, peripheral categories, GPIO configurations, options, and static hints.
- **Community Contributions**: Pull Requests for new locales (e.g., `locales/ja-JP.po`) are warmly welcome!
- **Coverage Notice**: Some deep hardware part numbers or dynamically concatenated strings may remain in English; see [docs/VERIFICATION.md](docs/VERIFICATION.md) for testing details.

---

## Project Structure & Documentation

```text
src/         TypeScript CLI, AST+Sourcemap extractors, PO processing, and runtime installers
runtime/     Non-intrusive runtime loader injected into the application
locales/     GNU Gettext PO catalogs and glossary files
scripts/     Installation scripts (Install-ZhCN.ps1), release packaging, and CDP verification scripts
docs/        Development guides, translation handoff guidelines, and architecture records
```

- 📖 [Development Guide](docs/DEVELOPMENT.md): Detailed extractor options, differential updates, and test workflows.
- 🤝 [Translation Handoff Specification](docs/TRANSLATION_HANDOFF.md): Work batch format, glossary constraints, and validation rules.
- 🔍 [Verification Records](docs/VERIFICATION.md): Verified UI scope, known limitations, and screenshot artifacts.
- 🏗️ [Architecture & Agent Handoff](docs/AGENT_HANDOFF.md): Implementation details, AST extraction mechanism, and reverse engineering notes.

---

## Acknowledgments & License

Originally inspired by [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese). Thanks to the author for their early exploration and inspiration in STM32CubeMX2 Chinese localization. This project is an independent clean-room implementation.

- Code is released under the [MPL-2.0](LICENSE) License.
- This project is an independent community open-source project and is not affiliated with, endorsed by, or sponsored by STMicroelectronics. "STM32" and "STM32CubeMX" are registered trademarks of STMicroelectronics.
- Before modifying application files, please review the STMicroelectronics end-user license agreement, as outlined in [DISCLAIMER.md](DISCLAIMER.md).
