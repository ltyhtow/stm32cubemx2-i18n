# STM32CubeMX2 Translator (`i18n`)

[English](README.md) | **简体中文**

---

用于 STM32CubeMX2 的多语言本地化工具链与运行时挂钩引擎。

突破传统二进制打补丁与粗暴字符串替换的局限，通过 AST + Sourcemap 精确抽取前端界面文案、深度解析 ST 官方 HAL/DFP 芯片外设描述符，依托行业标准的 GNU Gettext PO 管理翻译，并通过非侵入式运行时挂钩（Runtime Hook）动态加载译文。

> 💡 **多语言架构说明**  
> 本项目是一套**语言无关（Language-Agnostic）的通用 i18n/l10n 基础设施**。当前仓库内置已验证的**简体中文（`zh-CN`，5,341 条已填充译文）**作为开箱即用的首个参考实现。工具链完全支持提取、管理和注入任何其他语种（如日语 `ja-JP`、德语 `de-DE`、法语 `fr-FR` 等），并能轻松追踪上游版本的增量更新。

---

## 核心特性

- **多层文案精准抽取**：结合前端 Web UI 的 AST + Sourcemap 逆向分析，以及递归扫描 ST HAL Drivers（`*_parameters.json`）与 DFP 外设描述符（`*_peripherals.json`），完整提取静态配置与深层外设参数。
- **工业级 Gettext 标准流**：全流程基于 GNU Gettext POT/PO 标准体系，提供严格的上下文注释保护、格式化占位符校验与自动化语义 Lint，杜绝破坏原程序逻辑。
- **上游版本差量增量追踪（Diff & Sync）**：当 ST 官方发布 CubeMX2 新版本或新芯片 Pack 时，支持新旧 Catalog 差量比对，自动继承历史译文，仅需增量翻译变动词条。
- **非侵入式运行时挂钩**：在渲染入口动态挂钩劫持文案，不破坏应用原始代码与核心逻辑，全流程提供自动化备份（Backup）、自检（Doctor）与一键还原（Rollback）。
- **自动化端到端验收**：内置基于 Chrome DevTools Protocol (CDP) 的自动化脚本，支持静默启动与界面视觉回归截屏验收。

---

## 快速指南

### 场景 A：直接使用简体中文语言包（终端用户）

如果你只想在 STM32CubeMX2 中使用简体中文，可直接使用发布的预打包脚本：

1. **环境准备**：安装 **PowerShell 7** 与 **Node.js 20+**，并**完全退出** STM32CubeMX2。
2. **下载 Release**：前往 GitHub Releases 下载 `stm32cubemx2-translator-zh-CN-v*.zip` 并解压。
3. **执行安装**：在解压目录下打开 PowerShell 7 执行：

```powershell
# 自动查找安装目录，备份原始文件并注入中文运行时与框架语言包
.\Install-ZhCN.ps1
```

> **常用维护参数**：
> - 还原应用到修改前：`.\Install-ZhCN.ps1 -Action Rollback`
> - 仅备份当前文件：`.\Install-ZhCN.ps1 -Action Backup`
> - 检查当前注入与备份状态：`.\Install-ZhCN.ps1 -Action Doctor`
> - 手动指定安装路径（探测失败时）：`.\Install-ZhCN.ps1 -App 'C:\Users\你的用户名\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1'`
> - 跳过下载框架语言包：`.\Install-ZhCN.ps1 -SkipLangpack`

---

### 场景 B：作为多语言工具链使用（开发者 / 本地化贡献者）

如果你希望维护词库、为 CubeMX2 贡献新的语种（如日语、德语等），或跟踪 ST 官方新版本升级：

#### 1. 源码编译

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-i18n.git
Set-Location stm32cubemx2-i18n
npm ci
npm run build
```

#### 2. 核心 CLI 工具链指令

本项目提供标准 CLI 工具 `cubemx2-translator`（构建后位于 `dist/cli.js`）：

```powershell
# 1. 从前端和芯片 Pack 提取文案，生成 POT 模板
node dist/cli.js --catalog work/catalog.json extract --pack-config <Pack目录> --pack-descriptor <描述文件...> --pot template.pot

# 2. 初始化或同步目标语言的 PO 词库（支持任意语言代码，如 ja-JP / de-DE / zh-CN）
node dist/cli.js --locales locales sync --locale ja-JP --pot template.pot

# 3. 对比上游版本变动（Diff）
node dist/cli.js diff --before catalog-v1.1.1.json --after catalog-v1.2.0.json

# 4. 派发翻译工作批次与回传校验（适用于人工翻译或自动化翻译 Agent）
node dist/cli.js --locales locales export-work --locale zh-CN --out translation-work/
node dist/cli.js --locales locales import-json --locale zh-CN --from translation-work/done/
node dist/cli.js --locales locales lint --locale zh-CN

# 5. 构建词表并注入到本地 CubeMX2
node dist/cli.js install --locale zh-CN
```

#### 3. 自动化验证与测试

```powershell
# 运行单元测试与 Lint 校验
npm test

# 通过 CDP 远程调试协议在后台挂接 CubeMX2 进行端到端渲染验证与截屏
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --screenshot work/validation/tim1.png
```

---

## 当前状态与范围

- **验证版本**：STM32CubeMX2 **1.1.1**。
- **已收录参考语种**：`locales/zh-CN.po` 包含 **5,341 条**已验证的简体中文词条，涵盖菜单、外设分类、GPIO 配置、选项和静态提示。
- **多语种扩展**：欢迎社区开发者基于此工具链提交其他语种（如 `locales/ja-JP.po`）的 Pull Request！
- **完整性说明**：仍可能存在未收录的深层英文、硬件型号专有名词或动态拼接内容；详细验证边界见 [验证记录](docs/VERIFICATION.md)。

---

## 项目结构与文档导引

```text
src/         TypeScript CLI、AST+Sourcemap 提取器、PO 处理和运行时安装器
runtime/     非侵入式注入应用的运行时加载器 (Loader)
locales/     GNU Gettext PO 词库与术语对照表 (Glossary)
scripts/     安装脚本 (Install-ZhCN.ps1)、发布打包与 CDP 端到端验证脚本
docs/        开发指南、翻译交接规范与架构记录
```

- 📖 [开发与全流程指南](docs/DEVELOPMENT.md)：深入了解提取器参数、差量升级、自动化测试流程。
- 🤝 [翻译交接规范](docs/TRANSLATION_HANDOFF.md)：了解译文批次切分、术语表规范与校验规则。
- 🔍 [端到端验证记录](docs/VERIFICATION.md)：已测试的界面范围、已知限制与截图归档。
- 🏗️ [架构设计细节](docs/AGENT_HANDOFF.md)：技术选型背景、AST 机制与逆向调研细节。

---

## 致谢与许可

本项目的最初灵感来自 [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese)。感谢作者对 STM32CubeMX2 中文本地化的早期探索与启发。本项目为独立架构实现，不复制其代码或词典。

- 代码以 [MPL-2.0](LICENSE) 协议发布。
- 本项目为独立社区开源项目，与 STMicroelectronics 无关联，亦未获其背书或赞助；“STM32”和“STM32CubeMX”是 STMicroelectronics 的注册商标。
- 修改 STM32CubeMX2 程序文件前，请自行确认其最终用户许可协议，详见 [免责声明 (DISCLAIMER.md)](DISCLAIMER.md)。
