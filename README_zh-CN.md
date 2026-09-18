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
- **Windows** 10 / 11（x64）
- EXE 安装包自带运行环境，**无需安装 PowerShell 7、Node.js 或 .NET**。

> ⚠️ **安装前请务必完全退出 STM32CubeMX2 进程。**

### 安装步骤

1. 前往 [GitHub Releases](../../releases) 下载 Windows 安装程序（若该版本尚无 EXE，可使用下方的脚本压缩包）：
   ```text
   stm32cubemx2-translator-zh-CN-v*-windows-x64-setup.exe
   ```
2. 双击 EXE，选择 **安装 / 更新简体中文**。
3. 安装位置留空即可自动查找；也可点击“浏览”选择 CubeMX2 安装根目录。
4. 再次打开同一个 EXE，可选择备份、还原或检查，并查看操作日志。

框架中文语言包默认从 Open VSX 下载。离线或已安装语言包时可勾选“跳过框架语言包下载”；下载失败会显示提示，ST 界面译文仍会继续安装。EXE 只使用临时运行环境，不向系统安装 Node.js。

### 脚本压缩包（可选）

`stm32cubemx2-translator-zh-CN-v*.zip` 仍需要 **PowerShell 7+ 和 Node.js 20+**。解压后在 PowerShell 7 中运行：

```powershell
.\Install-ZhCN.ps1
```

安装脚本将自动执行：
1. 自动探测 STM32CubeMX2 的本地安装路径。
2. 对被修改的原始文件建立安全备份。
3. 下载并安装官方 Theia 中文语言包（Tier 1）。
4. 注入运行时本地化挂钩并部署 `zh-CN` 译文表（Tier 2）。
5. 自动运行体检（`Doctor`）确认注入成功。

---

### 常用维护命令

使用 EXE 时，直接在向导中选择对应操作即可。下面的命令仅用于脚本压缩包。

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
