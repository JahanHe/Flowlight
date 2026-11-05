# 从源码构建浮光时钟

直接使用时，打开仓库里的 `outputs/glass-clock.html`，或从 [Releases](https://github.com/JahanHe/fuguang-clock/releases) 下载安装包。下面的命令用于修改源码后的重建，均从仓库根目录执行。

## 网页和 Windows／Mac 通用 ZIP

准备 Python 3、Node.js 20 或更新版本，以及随 Node.js 安装的 npm。首次安装锁定版本的页面编译器需要联网。字体、云图和天文影像已经随源码保存。

```sh
npm ci --prefix work/tv-tooling
python3 work/build-weather-clock.py
python3 work/package-portable-clock.py
```

第一条命令安装 esbuild。后两条生成 `outputs/glass-clock.html` 和 `outputs/浮光时钟-通用版-1.4.0.zip`。开发时可以用 `python3 work/build-weather-clock.py --output work/preview.html` 单独生成预览，在浏览器打开。Windows 上可用 `py -3 -X utf8` 代替 `python3`，并设置环境变量 `PYTHONUTF8=1` 供子进程读取中文源码。

## 在自己的安卓设备上测试

安装 JDK 21 和 Android SDK。将 `JAVA_HOME` 指向 JDK 安装目录，`ANDROID_HOME` 指向 SDK 根目录。在 Android Studio 的 SDK Manager 中安装 Android SDK Platform 35 及 Build-Tools 35.0.0；使用命令行工具时，可运行 `sdkmanager "platforms;android-35" "build-tools;35.0.0"`。在原开发机上，构建脚本也可复用项目已有的本地工具。手机和电视共用这套 SDK，均使用系统 WebView。

运行以上 npm 安装命令后，按目标设备选择一条。

```sh
python3 work/android/build-apk.py --dev
python3 work/android/build-apk.py --dev --tv
```

| 设备 | 自测包 | 可与正式版并存的应用标识 |
| --- | --- | --- |
| 安卓手机 | `work/android/build-dev/test.apk` | `local.fuguang.clock.dev` |
| 安卓电视 | `work/android/build-tv-dev/test.apk` | `local.fuguang.clock.tv.dev` |

首次构建会在对应的本地构建目录中生成测试签名。保留其中的 `signing/`，下次测试 APK 可以覆盖同一个自测应用。构建完成前会检查签名、启动 Activity、资源完整性、页面哈希和 APK 对齐，结果在同目录的 `verification.json`。

手机自测包从当前共享源码生成页面。电视自测包读取仓库中已经确认的 1.0.4 页面，并与 `work/tv-frozen-1.0.4.json` 比对。若要研究电视前端源码，可用 `python3 work/build-weather-clock.py --tv --output work/tv-preview-build.html` 单独生成实验页面。

## 正式发布

正式手机 APK 必须使用原发布证书才能覆盖用户已经安装的应用。由维护者在持有原密钥的构建机执行：

```sh
python3 work/android/build-apk.py
```

脚本从 `work/android/signing/` 读取本机保管的 `local-release.jks` 与 `keystore-password`，先核对证书指纹，然后生成共享页面、手机 APK 和同版本通用 ZIP，并比较两端内嵌的网页内容。产物在 `outputs/`，校验摘要在 `work/android/build/verification.json`。正式签名需由维护者单独备份；GitHub 仓库和下载的 APK 均无法恢复其私钥。

电视发布独立于手机。获取已确认的电视版本请使用[电视 1.0.4 发行页](https://github.com/JahanHe/fuguang-clock/releases/tag/tv-v1.0.4)。日历设计演示可运行 `python3 work/calendar-demo/build.py` 重建，使用归档的 `outputs/浮光时钟-通用版-1.3.7.zip` 做输入。功能测试与验收范围见[测试说明](TESTING.md)。
