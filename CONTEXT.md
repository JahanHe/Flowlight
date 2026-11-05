# 浮光时钟发布约定

安卓手机版 APK 与 Windows / Mac 通用版是同一完整产品。功能、天气、昼夜时间线、动效、外观设置和版本号必须一起更新、一起交付，不能只发布其中一端。

共同源码位于 `work/`；`outputs/glass-clock.html` 是生成文件，不单独手改。版本号来自 `work/android/AndroidManifest.xml`。

统一打包命令（在项目根目录运行）：

```sh
python3 work/android/build-apk.py
node work/check-portable-clock.cjs
node work/android/check-phone-appassets.cjs
```

第一条自动重新生成共享网页，构建手机版 APK 与同版本通用 ZIP，并校验两端页面完全一致（仅允许平台展示标签和附加许可说明不同）。产物和校验结果写入 `outputs/` 与 `work/android/build/verification.json`。若任一构建或一致性校验失败，不将本次发布视为完成；每轮还需运行与具体改动相关的回归检查。

交付时同时给出同版本 APK 和 ZIP。系统能力按各平台提供，例如 APK 的前台常亮和返回键处理不能等同于浏览器能力；画质允许按设备自动调整，功能不因此拆成两套。

浮光·TV 1.0.4 是用户已确认冻结的独立轻量版。普通手机版/通用版更新不得重建或修改 TV 产物；用 `work/tv-frozen-1.0.4.json` 校验。

## 当前交付

2026-11-04：用户确认日历演示与新版云场，正式发布 **1.4.0 / Android code 13**。手机版与 Windows / Mac 通用版同时包含日历/农历、精选节日、金句及自定义句子、可点击及整点节气彩蛋、天气铺满/四周渐黑开关、新云场和雨势分层。主云 10 组、前景 2 层，复用六种透明纹理，保留原昼夜/天气/玻璃/人物联动。正式共享模块为 `work/calendar-data.js`、`calendar-ui.js`、`calendar-ui.css`、`calendar-effects.js`、`weather-scene.js`、`weather-app.js`；云素材复用 `work/calendar-demo/cloud-atlas.png`。不把演示的禁网或强制重置偏好带入正式版。

交付：`outputs/浮光时钟-手机版-1.4.0.apk`（3,047,969 bytes）、`outputs/浮光时钟-通用版-1.4.0.zip`（3,027,558 bytes）。正式 HTML SHA256 为 `795f8dc223db8cdbc2d9770cd7fe9f9f8e73bdcfb5a8729390651eb570ef70bc`。APK 沿用原签名，可覆盖升级；保留已有时钟设置，日历/金句/背景开关/整点偏好另存。选日期只用于浏览，进入全屏或重新打开回到今天。内容范围仍为 2026 节气及精选节日，不包含调休或完整世界节日；其他年份显示日期与农历。

校验：签名/ZIP/两端 HTML 一致性；`check-phone-native.py` 原生返回、前台常亮、Java 编译、仅用户手势 HTTPS 来源外链；`check-portable-clock.cjs` 解压包离线打开；`check-phone-appassets.cjs` 原生来源/CSP/返回/跨版本偏好；`check-calendar-settings.cjs` 持久化、旧设置、全屏日期安全、跨日、异常存储、手机布局；新天气六场景实渲染、昼夜光照、provider→页面→渲染的 10 分钟更新及 CMA 失败回退均通过。实图在 `work/release-1.4.0/`，最终记录 `work/android/build/release-verification.json`。联网实测主源请求失败后 Open-Meteo 返回 200，界面显示杭州西湖区阴天；没有实体安卓或 Windows 真机测试，未验证真机帧率/耗电。TV 1.0.4 全部冻结哈希未变。

### 上一正式版本

2026-10-19：手机版与通用版同步为 **1.3.7 / Android code 12**。太阳高度与连续的一日相位共同驱动天空、云层、玻璃和普通数字光色；正午保持蓝天白光，低角度晨昏更暖，余晖渐变到夜色。太阳盘仅小幅变化，光晕的高度变化更明显；复用原有云场，极光另用一张有界 384KiB 柔化缓存。月出月落与真实极昼跨午夜颜色均连续。沉浸天空的晚间及深夜加强三层边缘渐隐的蓝绿紫色极光云雾，沿用同一细节画布；实际可见极光同时为玻璃提供柔和的反射与背光填充，厚云时随天空一起遮蔽。

产物：`outputs/浮光时钟-手机版-1.3.7.apk`、`outputs/浮光时钟-通用版-1.3.7.zip`。最终交付校验记录在 `work/android/build/release-verification.json`；7 个时段及手机竖屏的实渲染对照在 `work/daylight-visual-contact.png`。新增共享光色回归为 `node work/check-daylight-phases.cjs`，最终网页视觉回归为 `node work/check-daylight-visual.cjs`。

光色设计参考 [NOAA 云的颜色](https://www.noaa.gov/jetstream/clouds/color-of-clouds) 与 [NASA 云隙光和散射](https://science.nasa.gov/earth/earth-observatory/crepuscular-rays-and-light-scattering-150090/)；使用轻量视觉近似，不作光谱或真实天文影像模拟。实体 Android 手机与 Windows 设备尚未验证，桌面浏览器检查不能代替真机性能结果。

极光隔离回归：`node work/check-aurora.cjs`，同时间 A/B 验证晚间/深夜的实际天空及玻璃像素变化、关闭沉浸/厚云零残留。桌面实时采样下，流畅约20帧、精细约24帧；新增极光画布原始RGBA为384KiB，不代表整个应用内存或手机真机帧率。证据在 `work/aurora-results.json` 与 `work/sky-detail-after-results.json`。

## 日历演示与合入记录

以下为 1.4.0 合入前的设计迭代历史。已确认演示文件保留供对照，`work/calendar-demo/build.py` 改读已归档 1.3.7 通用包以保持可复现；现行软件修改和发布走上面的共享源码及正式打包命令。

2026-11-04：用户要求先看本地演示，再决定日历金句设计。独立入口 `outputs/浮光-日历金句-本地演示.html`；由 `python3 work/calendar-demo/build.py` 基于当前正式网页生成，未修改正式 HTML/APK/通用包。界面在 `work/calendar-demo/`，精选内容为 `work/calendar-demo-data.js`。演示包含 2026 全年节气、29 个精选节日/纪念日与 10 条公版诗词；不含放假调休或完整世界节日。关闭联网查询，设置使用隔离命名；支持月历选日期、三种内容模式、金句切换/自定义/字号、全屏及手机布局。验收记录 `work/calendar-demo/check-results.json`。设计尚待用户反馈，未进入正式两端发布。

同日演示调整：移除“此刻 · 每日一页”等装饰文案，中文与金句改用系统无衬线字体，时钟默认 Manrope 550，并提供简洁/圆润/等宽选择。设置顶部新增“天气铺满屏幕”开关，默认开启；关闭恢复四周渐黑。三层天气画布统一切换蒙版，原天气画布复用昼夜颜色补满边角，使玻璃折射同步。`node work/calendar-demo/check.cjs` 验证离线电脑/手机布局、字体实际变化、昼夜边角像素、三层蒙版来回切换及全屏；正式网页 SHA 与冻结 TV 哈希均未变。

随后恢复了演示遗漏的原外观控件：在“显示 → 时钟与液态玻璃”直接复用原 DOM/事件，时钟、日期、星期、火柴人的大小/粗细/字体/间距等设置与 500% 上限保留；“天气与昼夜动效”恢复画质、速率、沉浸天空、60 秒快放和全部天气预览。新增 `term-effects.js`：24 节气艺术天气主题，默认每整点叠加 40 秒，也可关闭或立即预览，沿用同一天气渐变和光照，不改昼夜时间线；2026 以外无自动节气内容。日历选日期只影响文字日期，天空和整点调度仍用真实当前时间。云池 18→24，绘制基数 14→22，按画质缩放；远中近尺度分别为屏宽 .24/.37/.52，穿行云缩小，仍复用 6 种纹理缓存。前景云对新农历/金句也做局部柔化保护。`node work/calendar-demo/check-effects.cjs` 覆盖控件实效、24 节气、触发去重/取消/恢复/跨日、全屏夜间连续性；`check.cjs` 增加实际云绘制、尺度差和持续位移检查。仍仅为本地演示，未改正式双端及冻结 TV。

交互与天气辨识继续调整：钟面节气文字为透明原生按钮，44px 点击区域，点击/触摸/Enter 复用原彩蛋播放，全屏及关闭整点自动播放时仍可手动触发；`node work/calendar-demo/check-term-tap.cjs` 覆盖电脑与手机。天气去除晴天强制云底线，按云量平滑显现不同数量的云；增加“晴间少云”，明确“晴空万里/多云/乌云/小雨/中雨/瓢泼大雨”预设。降雨强度同时影响云暗度、天空灰度和雨丝，粒子改用原持久随机顺序，避免低密度只绘制远处微弱粒子；近远层持续移动。`node work/calendar-demo/check-weather-contrast.cjs` 对同一中午六种天气与手机雨势作实际像素、绘制量、连续运动检查，图为 `work/calendar-demo/weather-contrast-contact.png`。此检查仅验证离线渲染，不代表联网天气接口或手机 APK 真机验收。

用户仍认为天气不明显、云不自然，本轮重做演示云场：`cloud-field.js` 从内置 image_gen 生成的六格透明 `cloud-atlas.png` 提取云体明暗/透明度，替换圆团轮廓；生成记录和完整提示词见 `work/calendar-demo/cloud-assets.md`。图集嵌入 HTML，384×300 缓存复用原太阳遮挡、昼夜染色、玻璃和前后景逻辑，解码失败仍有程序云兜底。`cloud-layer.js` 调整为近云从上方经过、远云更小，同向分层漂移；高云量连续云幕覆盖天空并压暗太阳。手机云幕保持纹理比例，用裁切覆盖竖屏，不再拉伸。云纹理及图集原始像素合计上限约 21 MiB，不代表网页总内存。小雨采用较短、稀疏但可见的雨丝，大雨更密、更长，天空更暗。新版电脑和手机全屏实图已检查，四个演示回归脚本通过；最终云幕比例调整的天气回归也已通过（含手机防竖向拉伸检查）。仍未修改正式手机版/通用版或冻结 TV，视觉自然度最终待用户反馈。

用户随后确认“云形单一、碎小云过多”两个问题同时存在。原因是主池 24 个实例中 11 个使用同一积云，加上薄云权重太低。现将主池减至 10 个，重复积云仅 2 个；提升卷云和层积云可见度，放大中远层而保留近云空间，颗粒云只作淡远景。前景穿行由 4 个副本改为 2 层宽薄云纱；雨雾仅复用连续云幕，不再把不同积云压扁。复用原六种纹理，未增加素材或缓存上限。新版多云/阴天全屏实图已检查，测试改为检测实际可见云形、主云尺寸、远近层次及持续位移，不再以“绘制数大于 10”为合格条件。新版 `check.cjs` 与 `check-weather-contrast.cjs` 均通过，电脑/手机实图已检查；正式版与冻结 TV 哈希未变。
