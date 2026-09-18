# Windows 一键汉化

推荐使用 `stm32cubemx2-translator-zh-CN-v*-windows-x64-setup.exe`：双击后选择安装、备份、还原或检查，安装目录留空即可自动查找。支持 Windows 10 / 11 x64，**无需预装 PowerShell 7、Node.js 或 .NET**。

EXE 会自动备份被修改的应用文件。框架语言包默认联网下载；可勾选跳过下载。下载失败会在完成页提示重试，不会被当作完整安装成功。

再次运行同一 EXE 可还原或检查。“还原”撤销本工具的注入，保留框架语言包、备份与译文文件。日志保存在 `%LOCALAPPDATA%\stm32cubemx2-i18n\logs`，可在向导内点击“查看操作日志”。

以下说明针对 **ZIP 脚本包**：

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
