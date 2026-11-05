# 天气输入调查

检查时间：2026-10-17 14:22–14:24（Asia/Shanghai）。生产源码未修改。

## 结论

此时杭州西湖区的天气已成功通过备用接口进入 Android 打包网页：`weather_code=3`、`cloud_cover=96`、`precipitation=0`，界面显示“阴天”，`body.dataset.weather=overcast`、`phase=day`。因此不能以“联网后没有大晴天”推断天气输入失败，也不能把这份阴天数据强制改成晴天。阴天、晴天的画面区分程度需在渲染链路另查。

## 真实请求

- 普通沙箱请求先遇到 DNS 限制；该结果不算接口故障。网络检查获自动批准后重新执行。
- 中国气象局公开端点 `https://weather.cma.cn/api/weather/view?stationid=58457`：直接请求 HTTP 406；浏览器请求 `net::ERR_FAILED`。没有伪造请求头或绕过访问限制。
- 按生产参数请求 Open-Meteo：HTTP 200；浏览器 `Access-Control-Allow-Origin: *`。`moonrise/moonset/moon_phase` 参数有效，并不是请求失败的原因。
- 实况时间为 2026-10-17 14:15，检查时数据年龄约 9 分钟。
- 浏览器使用真实 APK 资源 `work/android/assets/glass-clock.html`，模拟原生 `https://appassets.androidplatform.net` 来源和原生 CSP。全新浏览器上下文、真实联网、不拦截天气响应。最终缓存 provider 为 `open-meteo`，没有脚本错误。
- 这是桌面 Chromium 中的 Android 网页来源检查，不是用户手机的实机网络检查。

## 现有转换检查

`node work/check-weather-provider.cjs` 通过：杭州最近站点、CMA 日夜代码映射、北京时间日期选择、观测过期拒绝、异常风速拒绝、实际降水覆盖晴天预报、CMA 失败后备用路径、国外坐标与中止请求。

CMA 返回的 `now` 只有风雨温湿度等实况，没有实时云量或晴阴代码。当前晴阴代码来自当日的日/夜预报，云量为估值。源码已通过 `detail: 实况风雨 · 日夜天气预报` 和 `cloudCoverEstimated: true` 标明；不能将它声称为逐分钟实时晴阴观测。CMA 实况超过 3 小时、来自未来超过 10 分钟、无当天预报时，会转备用接口。

## 最小建议

本次不需要替换天气接口、取消日月参数或加入原生网络绕过。优先让已有 `condition/cloudCover/overcastAmount` 对昼夜底色、云幕覆盖和日光透射产生足够可见且连续的变化，再用真实同一时刻的 clear/overcast/rain 输入对照检查。另保留当前的数据来源和缓存提示；网络失败不等于天气突然变晴。

证据：

- `work/weather-api-probe-20261017.json`：公开接口实际响应。
- `work/weather-browser-api-probe-20261017.json`：浏览器 CORS、实际回包与页面缓存。
- `node work/check-weather-api-live.cjs`：可重跑的浏览器真实请求检查。
