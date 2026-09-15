# 验证记录（2026-09-14）

> 下文先保留 9 月 14 日已部署版本的验证记录。9 月 15 日的提取修复、68 项测试及新增英文结果见文末追加记录。

本轮已完成升级清单比较、PO 同步修复、Pack 参数文案抽取、TIM/LPTIM 中文补译及真实窗口验证。
最终中文部署保留在本机，调试窗口已关闭。**1896/1896 是当前 PO 的完成度，不是全应用汉化覆盖率。**

## 环境与范围

| 项目 | 本次验证值 |
| :-- | :-- |
| 主机 | 原生 Windows，PowerShell 7，Node.js 22.22.2 |
| STM32CubeMX2 | 1.1.1 |
| 框架语言包 | 微软官方中文语言包 1.108.0 |
| Pack | STMicroelectronics / stm32c5xx_hal_drivers / 2.1.0 |
| 新增抽取范围 | `.config/stm32c5xx_tim_parameters.json`、`.config/stm32c5xx_lptim_parameters.json` |
| 实测工程 | `a26091301.ioc2`，STM32C562CET6 |
| 调试入口 | 安装目录的 `.bin\cube.exe mx start --remote-debugging-port 9222 --no-detached` |

界面测试沿用用户现有配置。打开页面、展开选项后关闭选项，没有激活 LPTIM1 或更改参数。
本轮未验证新的外设配置、完整模式组合、生成代码或硬件运行结果。

## 自动检查与部署

| 检查 | 结果 |
| :-- | :-- |
| `npm test` | **56 项通过**；包含 TypeScript 编译、lint、语言包、PO 同步、升级 diff、Pack 抽取及运行时行为 |
| `lint --locale zh-CN` | 1896/1896 已翻译；错误 0、警告 6、排版问题 0、fuzzy 0 |
| 原有词条保留 | 1246 条全部保留；唯一译文调整为 `Filter`：筛选 → 过滤，兼顾列表及定时器信号处理语境 |
| TIM/LPTIM 新增词条 | 650 条；来源注释均为 `independent-timer-review-2026-09-14` |
| 合并范围的 PO 同步往返 | 保留 1896、新增 0、移除 0；序列化后运行时表相同，译者来源注释保留 |
| 最终部署词表 | 与当前 PO 构建出的词表完全一致 |
| `doctor` | 注入、HTML、运行时文件、备份均存在；gzip 同步；仅部署 `zh-cn.json` |
| 注入完整性 | 6 处挂钩，`bundle.js` 增加 638 字节；部署 loader 与仓库文件一致 |

6 条 lint 警告都是有意保留的名称：`STM32 MX Config` 及其 CRC/UART/I2C/DMA 变体、
`VsCode WebView`。无新增占位符、寄存器标识、空白或标点错误。

合并后的清单为 **21352 条记录、2766 个可译位置、1896 条不同原文**。
其中前端基线为 20271 条记录、1811 个可译位置、1246 条原文；TIM/LPTIM 两个 schema
另加 1081 个显示字段，包含 955 个可译位置。

Pack 抽取只读取已知 schema 中的显示字段及静态提示，不执行表达式，不抽取 `const`、
`default`、`computed` 等数据字段；动态模板保留排除理由。另对该 HAL Pack 的 48 个参数
schema 做过读取检查，共 8006 个显示字段；**这不表示其余外设已翻译或已完成界面测试**。

## 真实界面检查

检查通过表示指定文案、菜单和标签已观察到，运行时表存在并有命中，未观察到伪翻译标记或
本次 CDP 连接期间的未捕获渲染异常。它不代表所有第三方组件、后台任务或应用日志无错误。

| 场景 | 实测内容 | 本地证据 |
| :-- | :-- | :-- |
| 最终中文首页 | 工程 / 查看(V) / 帮助(H)，主页标签及“尽情创造吧！”；运行时 1896 条 | [报告](work/validation/zh-cn-final-home.json)、[截图](work/validation/zh-cn-final-home.png) |
| 中文 MCU 创建向导 | 向导与搜索、选择界面的中文；只检查页面，未创建工程 | [报告](work/validation/zh-cn-mcu.json)、[截图](work/validation/zh-cn-mcu.png) |
| 最终 TIM1 参数页 | 常规信息、软件层、定时器输出频率、时基、采样时钟、通道、高级功能及过滤等文字 | [报告](work/validation/zh-cn-tim1-final.json)、[截图](work/validation/zh-cn-tim1-final.png) |
| TIM1 初始化下拉选项 | 打开后观察中文选项，按 Escape 关闭，未选择新值 | [报告](work/validation/zh-cn-tim1-options.json)、[截图](work/validation/zh-cn-tim1-options.png) |
| LPTIM1 | 标签页及“参数设置”等未激活状态；没有激活以测试完整参数页 | [报告](work/validation/zh-cn-lptim1-inactive.json)、[截图](work/validation/zh-cn-lptim1-inactive.png) |
| 最终引脚配置页 | 中文菜单和标签，运行时表 1896 条 | [报告](work/validation/zh-cn-pinout-final.json) |
| 英文回落 | Project / View / Help / Home；运行时翻译 API 不存在，观察页面无中文 | [报告](work/validation/en-home.json)、[截图](work/validation/en-home.png) |
| 德语链路 | 官方德语语言包加 4 条自写样例；观察到 Projekt / Anzeigen / Hilfe / Startseite | [报告](work/validation/de-home.json)、[截图](work/validation/de-home.png) |

最终首页和 TIM1 截图已按最后一次安装重新生成。MCU 向导与英文回落是在补入 Pack 前的
1246 条前端词库上验证的；TIM1 下拉与 LPTIM1 截图在最后一次 `Filter` 译法调整之前。
德语样例只有 Project、Home、Continue、Cancel 四条，**不是完整德语词库**；测试用德语 VSIX
和部署词表已移除，最终仅保留中文语言包与词表。

TIM1 翻译前后 **41 个参数控件的值、勾选和禁用状态完全一致**。窗口关闭后再次核对工程文件，
SHA256 与翻译前一致：

```text
5f5fe682552a7c479e87e5ac53e90f58f07c66f63d6db89e63797b9aa0e8d69f
```

参数快照见 [检查前](work/validation/project-controls-before.json) 和
[检查后](work/validation/project-controls-after.json)。2026-09-14 20:13（Asia/Shanghai）关闭调试窗口后，
主进程 PID 63504 已退出，9222 端口无监听；最终复核再次确认该状态。
汇总见 [final-review.json](work/validation/final-review.json)。

## 升级、回滚与运行时修复

同版本前端重抽的 20271 条记录无新增、移除或字段变化，1246 条原文全部保留，见
[catalog-diff.json](work/validation/catalog-diff.json)。加入 TIM/LPTIM 后的变化见
[pack-catalog-diff.json](work/validation/pack-catalog-diff.json)。
另以模拟版本变化验证文件迁移、原文改写、行号/语境变化、重复 ID 拒绝及 PO 译文继承。
**没有安装另一版本的 STM32CubeMX2，因此不作跨版本注入兼容承诺。**

真实安装回滚检查确认：

- `bundle.js` 与 `.orig`、本工具备份逐字节相同。
- `bundle.js.gz` 与 `.gz.orig` 逐字节相同。
- `index.html` 与本工具备份逐字节相同。
- gzip 解压后与对应 `bundle.js` 完全一致。

随后重新安装最终中文。证据为 [rollback-integrity.json](work/validation/rollback-integrity.json)
及 [installed-integrity.json](work/validation/installed-integrity.json)。

运行时回归检查覆盖原函数仅执行一次、原函数异常继续抛出、翻译失败时保留原参数及 `this`、
命令对象身份不变和冻结对象回退。首页高亮问题已修复：`highlightedText` 保持原文匹配条件，
最终渲染文字仍会翻译。

## 已知边界

- 仍可观察到英文外设分类，如 `Timers` / `TIMERS`、`Analog`、`Connectivity`；动态 `Channel 1`
  以及部分首页片段、提示、状态文字也未覆盖。
- 未收录的其他 Pack 参数、运行时拼接文本、CSS 生成文字及部分第三方/原生控件仍可能显示英文。
- 通用数据组件通常无法按原组件 `msgctxt` 消歧；`Line`、`Filter` 等共享原文保留折中译法。
- 英文环境也出现过的 `onChanged` 初始化异常等后台日志不属于本轮已解决问题。
- 不修改 Pack 原文件。后续 `extract` / `sync` 应保持相同 `--pack-config` 范围，避免把已有 Pack
  词条视为失效而删除；具体命令见 [README.md](README.md#更新词库与-pack-参数文案)。

## 证据保存与复查

本报告链接的 `work/validation/` 文件仅保存在当前工作区，受 gitignore 保护；清单、POT、
截图及工作批次不随源码分发。其他机器应使用自己的安装副本重建证据。
本轮未提交、推送或发布。

复查代码与词库：

```powershell
npm test
node dist/cli.js lint --locale zh-CN
node dist/cli.js doctor
```

按 README 的入口打开调试应用并切到目标页后，可复用跟踪在仓库中的验证脚本：

```powershell
node scripts/verify-live.mjs --locale zh-cn --expect-menu 工程 --expect-tab TIM1 --expect 常规信息 --out work/validation/tim1.json --screenshot work/validation/tim1.png
```

截图需要窗口处于恢复状态；最小化时可能超时。重载页面可能关闭外设标签，应重新打开目标页。
当前工作区还保留 `work/validation/final-review.mjs`，用于复查现有证据、译文保留、同步往返、
部署词表及工程哈希；它的关闭状态断言针对本轮 PID 与端口，不适用于另开调试会话后直接运行。

## 2026-09-15：提取修复与范围扩展

用户要求先保存已有工作，再修复检查失败并继续提取英文。已有工作首先提交为 `c20e60a`。
修复了算术插值被拆成两个占位符的问题，以及真实 DFP 文件中同名不同硬件关联被误判为重复的问题；
文案常量表同时排除已知代码属性，避免把样式值 `h3` 当作英文标签。

| 检查 | 结果 |
| :-- | :-- |
| `npm test` | **68 项通过**，含 TypeScript 编译 |
| 实际抽取 | CubeMX2 1.1.1 前端 + C5 HAL 2.1.0 的 48 个参数文件 + C5 DFP 2.1.0 的 4 个描述文件 |
| 清单 | 28659 个位置，9582 个可译位置，5341 条不同静态原文 |
| 相对旧清单 | 1896 条原文保留，新增 3445 条，原有可译原文移除 0 条，无重复 ID |
| 模板审查 | 69 种模板/表达式，涉及 89 个位置；保留来源，未直接并入 PO |
| 翻译交接 | 58 个 JSON 批次，3445 条待译；无重复 msgid，内容与新增原文集合完全一致 |
| 工作 PO | 5341 条中保留 1896 条译文及来源注释；错误 0、警告 6、排版 0 |
| 主 PO | SHA256 仍为 `8a7d983429e0192630018b0368f49c6d18a2bc6d2d6e6f32d2468796841b14af` |

提取与核对结果见 [本机报告](work/residual-extraction/REPORT.md)、
[完整性结果](work/residual-extraction/summary.json)、[Pack 输入及哈希](work/residual-extraction/pack-sources.json)。
同名 DFP 外设重排、算术与字符串拼接、样式对象与文案表分别有回归检查。

新增文案尚未补译或部署。本次没有重新进行 UI、代码生成或硬件验证；既有截图、工程哈希与
41 个控件比对仍属于 9 月 14 日的部署基线。后续翻译应使用工作 PO，并保持相同的 Pack 抽取范围。
