# STM32CubeMX2 界面翻译 · 交接说明

> 本文给负责翻译的人或 AI。你不需要接触仓库里的任何代码，只需要处理一批 JSON 文件。
> 目标语言：**简体中文（zh-CN）**。

## 一、你要做什么

把 STM32CubeMX2（ST 公司的 STM32 芯片配置工具，基于 VS Code / Eclipse Theia）界面上的英文文案翻译成简体中文。
使用者是嵌入式工程师，他们熟悉 STM32、外设缩写和 VS Code 的中文界面。

你会拿到若干个 `batch-NNN.json` 文件，每个约 60 条。逐条把译文填进 `msgstr`，交回同名文件。

## 二、输入格式

```json
{
  "_readme": "……",
  "locale": "zh-CN",
  "batch": 3,
  "of": 21,
  "count": 60,
  "items": [
    {
      "n": 121,
      "msgid": "Danger Score:",
      "msgstr": "",
      "flags": ["jsx-child"],
      "where": "cube-sw-composer → CompatibilityCell",
      "context": "<CoreStack direction=\"row\"> <CoreTypography variant=\"caption_medium\" bold> Danger Score:",
      "refs": ["@prg-cube/cube-sw-composer/src/browser/draggable-elements/cells/CompatibilityCell.tsx:106"]
    }
  ]
}
```

| 字段 | 含义 |
| :-- | :-- |
| `msgid` | 英文原文，**一个字符都不能改** |
| `msgstr` | 你要填的译文；留空表示暂不翻译 |
| `flags` | 该条的性质与注意事项，见下表 |
| `where` | 界面位置：功能模块 → 组件名，帮助你判断语境 |
| `context` | 原始界面代码片段，或 Pack 的 componentid 与 schema 路径 |
| `note` | 额外提醒（有则出现） |
| `refs` | 源文件与行号，一般不用管 |

`flags` 的含义：

| 标记 | 说明 |
| :-- | :-- |
| `jsx-child` | 界面上直接显示的文字（标题、段落、按钮文本） |
| `jsx-prop` / `config-value` | 属性文案：tooltip、placeholder、表头、对话框标题等 |
| `menu-label` / `command-label` | 菜单项或命令名，要短，动词开头 |
| `nls-default` | 这条可能已有 VS Code 官方中文译法；有把握就按官方译法写，没把握照常翻 |
| `keep-whitespace` | **首尾空格有意义**，会和相邻文字拼接，译文首尾空格必须与 `msgid` 完全一致 |
| `needs-review` | 语境有歧义，拿不准就留空 |

## 三、输出格式

交回**同一个 JSON 结构、同一个文件名**，只有 `msgstr` 从空变成译文。

- 不要改 `msgid`、`flags`、`n`，不要增删条目，不要调整顺序
- 不要输出 Markdown 代码围栏、解释、问候语——文件内容必须能直接被 `JSON.parse` 读取
- JSON 里的双引号、反斜杠按 JSON 规范转义（`\"`、`\\`），换行写成 `\n`
- 拿不准的条目把 `msgstr` 留空，比猜错好

## 四、硬性规则

这些规则由程序自动校验，违反会被退回。

**1. 占位符原样保留，顺序可调。**
`{0}` `{1}` `${activeEditorShort}` `{{name}}` `%s` `#editor.fontSize#` `$(icon)` `$SolutionDir()$` 都是占位符。
- `Task {0} exited with code {1}` → `任务 {0} 已退出，代码 {1}` ✓
- 改成 `任务 {1} 已退出，代码 {0}` 也可以（顺序可按中文习惯调整）✓
- 译成 `任务已退出` ✗（丢了占位符）

**2. 反引号里的代码原样保留。**
`` Controls `editor.fontSize` `` → `` 控制 `editor.fontSize` `` ✓

**3. 禁译词原样保留（区分大小写、整词）。**
硬件与协议：`GPIO` `DMA` `NVIC` `EXTI` `SPI` `I2C` `I3C` `UART` `USART` `LPUART` `CAN` `FDCAN` `USB` `RCC` `ADC` `DAC` `TIM` `LPTIM` `RTC` `CMSIS` `HAL` `MCU` `MPU`
产品与生态：`STM32` `STM32Cube` `STM32CubeMX` `STM32CubeMX2` `Pack` `PDSC` `IOC2` `Keil` `IAR` `GCC` `CMake` `Cube`
通用：`JSON` `YAML` `URL` `URI` `API` `SDK` `IDE` `Git` `Theia`
- `Configure GPIO pins` → `配置 GPIO 引脚` ✓
- `Pack management` → `Pack 管理` ✓，`包管理` ✗

**4. 首尾空格与原文一致。** 标了 `keep-whitespace` 的尤其要注意。
- `"Your project "` → `"您的工程 "` ✓（保留尾部空格）
- `" is loaded and ready."` → `" 已加载就绪。"` ✓（保留头部空格）

**5. `&&` 助记符数量一致。** 它标记菜单快捷字母，中文写法是把字母放在括号里。
- `&&View` → `查看(&&V)` ✓

**6. 换行数一致。** 原文有 `\n` 的，译文同样位置也要有。

**7. 开头或结尾的结构符号保留。**
- `"] already exists."` → `"] 已存在。"` ✓（这条前面会拼上一个名字）

## 五、术语表

同一个英文词全表只能有一种译法。

| 英文 | 用 | 不用 |
| :-- | :-- | :-- |
| project | 工程 | 项目 |
| workspace | 工作区 | 工作空间 |
| board | 开发板 | 板子 |
| peripheral | 外设 | 外围设备 |
| pin | 引脚 | 针脚 |
| pinout | 引脚配置 | 针脚输出 |
| package（芯片） | 封装 | 包裹 |
| middleware | 中间件 | 中间设备 |
| utilities | 实用程序 | 效用 |
| toolchain | 工具链 | 工具串 |
| firmware | 固件 | 韧体 |
| generate code | 生成代码 | 产生代码 |
| build | 构建 | 编译（compile 才是编译） |
| flash（动词） | 烧录 | 刷写 |
| debug | 调试 | 除错 |
| breakpoint | 断点 | 中断点 |
| preferences | 首选项 | 偏好设置 |
| settings | 设置 | 设定 |
| remove / delete | 移除 / 删除 | 两者要区分 |
| highlight | 高亮 | 突出显示 |
| minimap | 小地图 | 缩略图 |
| gutter | 装订线 | 槽边距 |
| selection | 选区 | 所选内容 |
| decorator | 装饰器 | 修饰器 |
| separator | 分隔符 | 分隔线 |
| font family | 字体系列 | 字体族 |
| inlay hints | 内联提示 | 内嵌提示 |
| color picker | 颜色选择器 | 取色器 |
| sticky | 粘性 | 粘滞 |
| autoclose | 自动关闭 | 自动闭合 |
| wrapped lines | 折行 | 换行行 |
| tab completion | Tab 补全 | 制表符补全 |
| counter / prescaler | 计数器 / 预分频器 | |
| time-base | 时基 | |
| capture / compare | 捕获 / 比较 | |
| break（定时器） | 刹车 | |
| deadtime | 死区时间 | |

完整版在仓库的 `locales/zh-CN.glossary.json`，校验程序用的就是它。
`Filter` 在列表和定时器参数中共用同一原文，目前统一用「过滤」。
Pack 的寄存器、信号名和分频公式保持原样；带 `{{...}}` 的动态标题不应手工展开成一批猜测值。

## 六、风格

对齐 **VS Code 简体中文界面**的风格，工程师一眼看去要觉得"这就是 VS Code 的中文"。

- **全角标点**：中文语境用 `，。：；？！（）`；只有代码、路径、时间里才保留半角
- **短标签不加句号，完整句子加句号**：`Open Project` → `打开工程`；`The file is too large.` → `文件过大。`
- **命令与按钮动词开头**：`Create project` → `创建工程`，不要 `工程创建`
- **省略号用 `…`** 或原文的 `...`，不要 `。。。`
- **中英文之间加一个空格**：`配置 GPIO 引脚`、`Pack 管理`
- **不要翻译成口语或加语气词**：不要"哦""吧""哦！"
- **不要扩写解释**：原文是 `Vendor` 就译 `厂商`，不要 `芯片厂商名称`
- **表头、单个名词保持名词**：`Status` → `状态`，不要 `状态：`
- `Loading...` 类进行时译为 `正在……`：`正在加载…`
- 单个英文单词如果是界面控件值（`on` / `off` / `auto`），一般已被排除在外；若出现，按上下文译，拿不准留空

## 七、自检清单

交回前逐批过一遍：

- [ ] 每个 `msgid` 与收到时逐字相同
- [ ] 条目数与 `count` 一致
- [ ] 所有 `{0}` `${…}` `` `…` `` 在译文里都能找到
- [ ] 表里的禁译词一个没动
- [ ] `keep-whitespace` 条目首尾空格核对过
- [ ] `&&` 数量一致
- [ ] 中文语境全是全角标点
- [ ] 术语表里的词没用"不用"栏的写法
- [ ] 文件能被 JSON 解析（没有围栏、没有尾随逗号、没有注释）

## 八、交回与复核

1. 你交回 `batch-NNN.json`（可以分批交，可以只交做完的）
2. 审阅方运行导入与校验，会得到一份机器报告，形如：

   ```json
   {
     "severity": "error",
     "rule": "placeholder",
     "msgid": "Task {0} exited with code {1}",
     "msgstr": "任务已退出",
     "message": "占位符丢失：{0} {1}"
   }
   ```

3. 报告会回给你。`error` 必须改，`warning` 请看一眼（多数是术语或译文与原文相同），`style` 是标点
4. 只交回被点名的条目即可（保持同一 JSON 结构，`msgid` 不变）
5. 审阅方在校验通过后还会抽读译文质量，可能提出改法建议

## 九、示例

```json
{ "msgid": "Expand all", "msgstr": "全部展开" }
{ "msgid": "Installation of missing pack(s) is required to continue", "msgstr": "需要安装缺失的 Pack 才能继续" }
{ "msgid": "Task '{0}' terminated with exit code {1}.", "msgstr": "任务 '{0}' 已终止，退出代码为 {1}。" }
{ "msgid": "Your project ", "msgstr": "您的工程 " }
{ "msgid": "Controls whether the editor should highlight the active indent guide.", "msgstr": "控制编辑器是否高亮活动的缩进参考线。" }
{ "msgid": "&&Save All", "msgstr": "全部保存(&&S)" }
```

（上面是示意；实际交回的是完整的批次 JSON，不是这种逐行形式。）
