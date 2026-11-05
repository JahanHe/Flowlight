# 项目地图

浮光时钟有两条发布线。安卓手机和 Windows／Mac 共用一个网页内核；浮光·TV 使用独立的轻量场景。日历演示是合入手机版之前保留的设计稿。当前版本、发布日期和验收范围见 [发布记录](../CONTEXT.md)。

## 从哪里开始

| 要做的事 | 对应文件 |
| --- | --- |
| 在电脑本地打开正式时钟 | 下载通用版 ZIP，解压后双击“浮光时钟.html”。克隆仓库后也可打开 `outputs/glass-clock.html`。 |
| 安装到安卓手机或电视 | 手机选「浮光时钟-手机版」1.4.0，电视选「浮光·TV」1.0.4。安装说明见 [手机版](../outputs/安卓安装说明.txt)、[电视版](../outputs/电视版安装说明.txt)。 |
| 看日历与云层设计稿 | 打开 `outputs/浮光-日历金句-本地演示.html`。该独立演示在离线样例上切换天气。正式软件通过天气服务更新。 |
| 修改时钟、生成正式软件 | 先改下方共享模块，再按[构建说明](BUILD.md)生成网页及安装包。 |

## 源码对应的屏幕效果

以下路径以仓库根目录为起点。

| 功能 | 维护入口 |
| --- | --- |
| 页面组装 | `work/build-weather-clock.py` 读取 `work/glass-clock-before-weather.html` 作为基础模板，再组合样式、脚本、字体和云图。这个带有 before 的文件是当前正式构建的输入。 |
| 实时天气和昼夜 | `work/weather-provider.js` 选择天气源，`work/solar-position.js` 提供日月位置，`work/weather-scene.js` 绘制天空、星体、云、极光及降水。设置和场景联动在 `work/weather-app.js`。 |
| 时钟、光照和人物 | `work/glass-digits.js`、`glass-digits.css` 与 `text-metrics.js` 负责数字及文字测量；`work/stick-figure.js`、`stick-figure.css` 负责单个人物；`work/mobile-performance.js` 负责画质调节。 |
| 日期、诗句和节气彩蛋 | `work/calendar-data.js` 按条目记录内容和资料来源，`calendar-ui.js`、`calendar-ui.css` 控制排版和选项，`calendar-effects.js` 负责节气主题及触发。1.4.0 收录 2026 年的 24 节气、29 个精选节日或纪念日及 10 条古典诗词。 |
| 安卓应用外壳 | `work/android/src/` 和 `AndroidManifest.xml` 属于手机；`work/android/tv-src/` 和 `AndroidManifest-tv.xml` 属于电视。两个包各有自己的应用标识。 |
| 低内存电视、遥控器 | `work/tv-lite-scene.js`、`tv-controls.js`、`tv-controls.css`、`tv-preview.js`、`tv-compat.js`。1.0.4 的已确认网页、APK 和安装说明由 `work/tv-frozen-1.0.4.json` 记录哈希。 |
| 日历演示 | `work/calendar-demo/` 与 `work/calendar-demo-data.js`。演示重建使用已发行的 `浮光时钟-通用版-1.3.7.zip`；正式版源码和日历演示的设置存储分别维护。 |

## 素材与署名

- **云层**　正式版和演示共用 `work/calendar-demo/cloud-atlas.png`。这张透明图集来自生成工具，运行时按太阳与月亮的光色着色。六种云形、布局及制作过程见[云图来源](../work/calendar-demo/cloud-assets.md)。
- **星空和行星**　`work/sky-source/` 保存制作素材，`work/build-sky-assets.py` 和 `build-sky-stars.py` 处理图像和星点，`work/sky-assets.js` 供网页离线使用。银河图来自 ESO/S. Brunier，行星和 M101 图像使用 NASA、ESA 及其他原作者的影像。每张图的原作、署名与加工说明见[天文影像说明](../work/sky-asset-credits.html)。
- **历史星系备选图**　早期试作还收集了双子座北望远镜的 M74 图像。原作署名为 NASA、ESA 和 GMOS Commissioning Team（Gemini Observatory），可按原图名和分辨率核对。[M74 原图与署名](https://science.nasa.gov/asset/hubble/gemini-north-gmos-image-of-m74/)
- **字体**　`work/fonts/` 保存字体文件、元数据和各字体的许可证。正式网页嵌入 8 套供数字显示的子集，可在离线状态下切换。子集名称、修改说明、上游版本和 SIL OFL 1.1 全文见[字体许可](../work/font-licenses.txt)。
- **太阳与月亮**　日月位置计算使用 SunCalc 的部分公式；上游文件和版权说明在 `work/references/`。见 [SunCalc 许可](../work/references/suncalc-LICENSE)。
- **天气、节日及诗句**　天气样本按城市和公共气象站整理。节气按东八区公历日期记录；节日数据中保留香港天文台、中国政府网、联合国及教科文组织等来源。金句采用古典诗词原文。见[日历资料](../work/calendar-data.js)。

## 怎样查历史与验收

- 查「哪一版做了什么」看根目录 [CONTEXT.md](../CONTEXT.md)。包含 1.4.0 正式交付、1.3.7 昼夜光照，以及新版云场和日历演示的演进。
- 查「同一时段不同天气的画面」看 [1.4.0 天气对照图](../work/release-1.4.0/weather-contrast-contact.png)。该目录还保存桌面、竖屏雨势图和发布当时的联网探测记录。
- 查「怎么重跑检查」看 `work/check-*.cjs`、`work/android/check-*` 和 `work/calendar-demo/check-*.cjs`。早期版本的对照页面、快照和检测数据按 `baseline`、版本或功能命名，分别对应当时的实现。
- 1.4.0 的已有验证包含桌面 Chromium 离线运行、手机视口、APK 结构与签名，以及安卓返回键测试。实体安卓和 Windows 设备上的帧率、功耗与兼容性仍需真机测量。
