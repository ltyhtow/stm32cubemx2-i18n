# Windows EXE 安装入口

安装包面向 Windows 10 / 11 x64。用户双击 EXE 即可选择安装、备份、还原或检查，无需预装 PowerShell 7、Node.js 或 .NET。框架语言包默认需要网络；ST 词库、CLI、依赖和运行环境均在包内。

## 构建

构建机需要 Node.js 20+、Python 3.11+、Inno Setup 6.5+。用户机器不需要这些开发工具。当前固定 Node.js 24.21.0 Windows x64 和 Inno Setup 6.7.1 的中文向导文本；下载前后校验固定 SHA256。更新版本时需同步更新脚本中的版本、校验和及验证脚本。

在仓库根目录运行：

```powershell
npm ci
npm test
npm run pack:exe
# 编译器不在常见位置时：
npm run pack:exe -- --iscc 'C:\Tools\Inno Setup 6\ISCC.exe'
```

也可通过 `ISCC` 环境变量指定编译器。脚本编译 TypeScript，在独立 staging 目录执行 `npm ci --omit=dev`，下载并校验 Node.js，保留 Node 与 npm 依赖的许可证，最后调用 Inno Setup。EXE 只覆盖安装 / 备份 / 还原 / 检查，staging 里会去掉 `typescript` 与 `@types`（抽取命令仍需要它们，但不走安装器）。

产物位于 `work/stm32cubemx2-translator-zh-CN-v<package.json版本>-windows-x64-setup.exe`，旁边生成 `.exe.sha256`。旧的 `npm run pack:zh-cn` 继续生成 ZIP 脚本包。两个包使用不同 staging 子目录。

`.github/workflows/windows-installer.yml` 支持手动运行、版本 tag 和相关 PR 的 Windows 构建，运行测试后保留 EXE 与校验文件为 Actions artifact。它不自动发布 Release；在 GitHub 发布时把这两个文件加入对应版本资产，并将普通用户下载入口改为 EXE。

## 实现

- `scripts/windows-installer.iss` 提供中文原生向导，将文件解压到临时目录；退出后由 Inno Setup 清理。它不注册卸载项、不修改 PATH、不安装系统 Node.js。
- `src/installer/windows.ts` 使用打包的 `node.exe` 调用已有 CLI。路径通过独立参数传入，不通过 PowerShell 或命令解释器执行。
- 安装 / 还原前检查 CubeMX2 进程；下载语言包后再次检查。安装完成后验证注入标记、HTML 加载入口、运行时、译文表和 gzip 时间。
- 默认以普通用户权限运行，适配 CubeMX2 的用户目录安装。目标目录只读时会报错并保留日志；不会自动提权。
- 还原行为沿用 CLI：恢复应用 bundle / HTML，保留语言包、备份和译文文件。回滚并非卸载 CubeMX2。
- 操作日志默认在 `%LOCALAPPDATA%\stm32cubemx2-i18n\logs`。失败显示错误和日志入口；框架包下载失败单独显示提示。
- 交互安装时显示进度条。进度是估计值，工作仍在进行时最高到约 90%，结束后跳到 100%。静默安装不显示该页面。

## 成品验证

```powershell
python scripts/test-windows-installer.py 'work\stm32cubemx2-translator-zh-CN-v0.2.1-windows-x64-setup.exe'
```

脚本在 `work/installer-tests/` 创建隔离的模拟应用与用户目录，使用仅包含 Windows System32 的 PATH 运行真正的 EXE，验证自动查找、中文 / 空格 / `&` / `%` 路径、安装、重复安装、备份、检查、还原、无效路径、无效操作和运行中进程拦截。会比对原始文件、备份、还原结果与 gzip 内容，证据留在该目录。

可添加 `--source-app '...\dist\resources\app'` 复制真实应用的原始前端文件到隔离目录测试；不会写入源安装。联网下载的可用性和其它 CubeMX2 版本仍需各自验证。自动化测试不等于在未安装开发工具的全新 Windows 虚拟机上完成验证。

静默运行参数（交互用户使用向导即可）：

```powershell
.\stm32cubemx2-translator-zh-CN-v0.2.1-windows-x64-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /ACTION=doctor /APP="C:\Path to CubeMX2"
```

`/ACTION=install|backup|rollback|doctor`，`/APP=...` 可省略，`/SKIPLANGPACK=1` 跳过下载，`/OPLOG=...` 指定操作日志路径，`/LOG=...` 指定 Inno Setup 日志。退出码 0 表示所选操作成功，10 表示 ST 译文安装成功但框架语言包失败，其它非零值表示未完成 / 失败（包括取消）。

本项目默认产物未签名；公开分发时可按维护者的证书配置进行 Authenticode 签名。若签名改变 EXE 内容，需要重新生成 SHA256 文件。
