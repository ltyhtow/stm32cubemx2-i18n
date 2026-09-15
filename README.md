# STM32CubeMX2 Translator

用于为 STM32CubeMX2 提取界面文案、管理 Gettext 翻译并通过运行时挂钩加载译文的社区工具链。当前仓库包含已验证的简体中文词库（5,341 条）。

## 快速开始

需要 Windows、Node.js 20+ 和 Git。先关闭 STM32CubeMX2，再在 PowerShell 中执行：

```powershell
git clone https://github.com/ltyhtow/stm32cubemx2-translator.git
Set-Location stm32cubemx2-translator
npm ci
npm run build

# 安装框架中文语言包
node dist/cli.js langpack install --locale zh-cn

# 将运行时翻译安装到自动探测的 STM32CubeMX2 目录
node dist/cli.js install --locale zh-CN
node dist/cli.js doctor
```

完成后启动应用，按 **F1 → Configure Display Language → 简体中文**，按提示重载。若自动探测失败，可在子命令前添加 `--app 'C:\path\to\STM32CubeMX2'`，路径替换为实际安装目录。

已验证 STM32CubeMX2 **1.1.1**；其他版本的兼容性尚未验证。

## 当前状态

- `locales/zh-CN.po` 含 5,341 条已填充译文，来自 2026-09-15 的翻译批次导入。
- 已在实际 STM32CubeMX2 界面目视确认中文菜单、分类、GPIO 配置标签、选项和提示生效。
- 仍可能看到未收录的英文、产品名或动态内容；当前验证不代表所有页面完全汉化。
- `npm test` 会构建 TypeScript 并运行完整测试；`doctor` 可检查安装、备份和运行时表。

常用维护命令：

```powershell
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
scripts/   CDP 辅助脚本
docs/      翻译交接、开发交接和验证记录
```

`catalog/`、`out/`、`dist/`、`work/` 和 `node_modules/` 是本地生成目录，默认不纳入版本控制。

## 致谢与许可

本项目的最初灵感来自 [P1nkDog/STM32CubeMX2-Chinese](https://github.com/P1nkDog/STM32CubeMX2-Chinese)。感谢作者对 STM32CubeMX2 中文本地化的探索与启发。本项目为独立实现，不复制其代码或词典。

代码以 MPL-2.0 发布，详见 [LICENSE](LICENSE)。本项目与 STMicroelectronics 无关联，也未获其背书或赞助；“STM32”和“STM32CubeMX”是 STMicroelectronics 的商标。修改 STM32CubeMX2 程序文件前，请自行确认其最终用户许可协议，详见 [DISCLAIMER.md](DISCLAIMER.md)。
