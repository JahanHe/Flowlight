# 怎样验证浮光时钟

在仓库根目录运行下列命令。浏览器测试使用 Node.js 20 或以上版本，APK 和通用 ZIP 的内容检查还需要 Python 3。日常打开时钟或安装 APK 无需这些工具。

## 跑一次正式网页回归

```sh
npm ci
npx playwright install chromium --only-shell
npm test
```

`npm test` 读取 `outputs/glass-clock.html`，验证连续 24 小时光色、昼夜七个时段、极昼极夜，以及桌面和手机宽度下的日历、偏好、全屏、跨日更新。若只有源文件，先按 [构建说明](BUILD.md) 生成网页。Linux 缺少浏览器系统库时，可用 `npx playwright install --with-deps chromium --only-shell`。已安装 Chrome 或 Chromium 的机器也可以通过环境变量 `CLOCK_CHROMIUM_PATH` 指定浏览器可执行文件。

## 检查下载的成品

把正式 ZIP 或 APK 放入 `outputs/` 并使用下列文件名，再选择对应的检查。获取成品的入口见[项目首页](../README.md)。

| 成品 | 文件名 | 命令 |
| --- | --- | --- |
| Windows / Mac 通用版 | `浮光时钟-通用版-1.4.0.zip` | `node work/check-portable-clock.cjs` |
| 安卓手机版 | `浮光时钟-手机版-1.4.0.apk` | `node work/android/check-phone-appassets.cjs` |
| 安卓电视版 | `浮光·TV-1.0.4.apk` | `node work/android/check-tv-appassets.cjs` |

通用版测试实际解压 ZIP 并以断网方式双击等效打开，检查内嵌字体、保存设置、昼夜动效和退出全屏。安卓测试直接从 APK 读出页面，按壳程序的来源地址和安全策略验证返回键与设置；可以用 `CLOCK_APK` 指向其他位置的对应 APK。Python 命令名异常时，设置 `PYTHON` 为解释器路径。

## 按改动范围加测

- 实时天气的连续更新与备用源：`node work/check-live-weather-pipeline.cjs`，再运行 `node work/check-live-weather-pipeline.cjs --fallback-only`。测试注入保存的气象站样本，可离线运行。手动检查供应商当下的网络响应可运行 `node work/check-weather-api-live.cjs`，需准备手机版 APK。这两类测试回答不同的问题。
- 云层与雨势：macOS / Linux 在根目录运行 `CLOCK_HTML=outputs/glass-clock.html CLOCK_QA_DIR=work/qa-weather node work/calendar-demo/check-weather-contrast.cjs`。在 PowerShell 先用 `$env:CLOCK_HTML='outputs/glass-clock.html'` 与 `$env:CLOCK_QA_DIR='work/qa-weather'` 设置变量，再执行相同的 Node 命令。测试检查六类云纹理、不同雨势及连续运动，并在指定目录留下对照图。
- 电视轻量渲染：`node work/check-tv-lite-scene.cjs` 检查动效、画布缓冲上限和后台暂停。模拟旧内核的功能验证可运行 `node work/check-tv-chromium66.cjs`。
- 原生壳：按构建说明准备 JDK 与 Android SDK 后，运行 `python3 work/android/check-phone-native.py` 或 `python3 work/android/check-tv-native.py`。
- 日历独立演示：生成或下载对应的演示 HTML 后可运行 `node work/calendar-demo/check.cjs` 和 `node work/calendar-demo/check-term-tap.cjs`。

`work/check-*.cjs` 中也保留了此前各版本的单项检查，包括旧面板结构、试验中的人物形态、历史性能基线和本地预览端口。有些断言专属于当时的页面，发布 1.4.0 时以本页列出的对应版本检查为准。测试会在本地写入报告或截图；真机的帧率、总内存、耗电及 WebView 驱动表现需要在对应设备上测量。
