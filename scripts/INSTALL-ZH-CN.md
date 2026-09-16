# Windows 一键汉化

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
