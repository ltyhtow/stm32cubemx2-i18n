# STM32CubeMX2 Translator

用于为 STM32CubeMX2 提取界面文案、管理 Gettext 翻译并通过运行时挂钩加载译文的社区工具链。当前仓库包含已验证的简体中文词库（5,341 条）。

## 快速开始

GitHub Release: stm32cubemx2-translator-zh-CN-v*.zip

需要 **Node.js 20+** 和 **PowerShell 7**。先**完全退出** STM32CubeMX2。

解压本包后，在解压目录打开 PowerShell：

```powershell
# 自动查找安装目录，备份由 CLI 在注入前完成；同时安装框架中文语言包
.\Install-ZhCN.ps1

# 只把当前 bundle.js / index.html 复制到备份目录（不改应用）
.\Install-ZhCN.ps1 -Action Backup

# 还原本工具的注入
.\Install-ZhCN.ps1 -Action Rollback

# 查看探测到的安装与注入状态
.\Install-ZhCN.ps1 -Action Doctor
```

自动探测失败时加上安装根目录：

```powershell
.\Install-ZhCN.ps1 -App 'C:\Users\你的用户名\AppData\Local\STMicroelectronics\STM32CubeMX2_1.1.1'
```

已装过语言包、或不想访问网络时：`.\Install-ZhCN.ps1 -SkipLangpack`。

已验证 STM32CubeMX2 **1.1.1**。修改应用文件前请自行确认 ST 最终用户许可，见 `DISCLAIMER.md`。

从源码安装：

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-translator.git
Set-Location stm32cubemx2-translator
npm ci
npm run build
.\scripts\Install-ZhCN.ps1
```

## 当前状态

- `locales/zh-CN.po` 含 5,341 条已填充译文，来自 2026-09-15 的翻译批次导入。
- 已在实际 STM32CubeMX2 界面目视确认中文菜单、分类、GPIO 配置标签、选项和提示生效。
- 仍可能看到未收录的英文、产品名或动态内容；当前验证不代表所有页面完全汉化。
- `npm test` 会构建 TypeScript 并运行完整测试；`doctor` 可检查安装、备份和运行时表。

常用维护命令：

```powershell
node dist/cli.js backup
node dist/cli.js doctor
node dist/cli.js rollback
node dist/cli.js lint --locale zh-CN
```

## 开发与翻译

- [开发指南](docs/DEVELOPMENT.md)：重新提取、升级词库、导入翻译和测试。
- [翻译 AI 说明](docs/TRANSLATION_HANDOFF.md)：只需填写 JSON 译文的交接规则。
- [验证记录](docs/VERIFICATION.md)：测试范围、结果和已知限制。
- [开发交接](docs/AGENT_HANDOFF.md)：实现细节与历史调查记录。

## 目录

```text
src/       TypeScript CLI、提取器、PO 处理和安装逻辑
runtime/   注入应用的运行时加载器
locales/   PO 词库和术语表
scripts/   Install-ZhCN.ps1, pack-zhcn-release.py, CDP 辅助脚本
docs/      翻译交接、开发交接和验证记录
```

`catalog/`、`out/`、`dist/`、`work/` 和 `node_modules/` 是本地生成目录，默认不纳入版本控制。

## 致谢与许可

本项目的最初灵感来自 [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese)。感谢作者对 STM32CubeMX2 中文本地化的探索与启发。本项目为独立实现，不复制其代码或词典。

代码以 MPL-2.0 发布，详见 [LICENSE](LICENSE)。本项目与 STMicroelectronics 无关联，也未获其背书或赞助；“STM32”和“STM32CubeMX”是 STMicroelectronics 的商标。修改 STM32CubeMX2 程序文件前，请自行确认其最终用户许可协议，详见 [DISCLAIMER.md](DISCLAIMER.md)。
