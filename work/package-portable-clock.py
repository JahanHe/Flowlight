"""Package the existing self-contained clock for file:// use; no desktop runtime."""
from pathlib import Path
from html import escape
import re
import zipfile

root = Path(__file__).resolve().parent.parent
html = (root / 'outputs/glass-clock.html').read_text(encoding='utf-8')
version = re.search(r'<meta name="clock-mobile-version" content="([\d.]+)">', html)[1]
label = f'<span class="edition-label">手机版 {version}</span>'
assert html.count(label) == 1
html = html.replace(label, f'<span class="edition-label">通用网页版 {version}</span>')
solar_license = (root / 'work/references/suncalc-LICENSE').read_text()
html = html.replace('</body>', '<template id="solar-license">SunCalc\nhttps://github.com/mourner/suncalc\n' + escape(solar_license) + '</template>\n</body>')
folder = root / 'outputs' / f'浮光时钟-通用版-{version}'
folder.mkdir(exist_ok=True)
(folder / '浮光时钟.html').write_text(html, encoding='utf-8')
instructions = f'''浮光时钟 · Windows / Mac 通用网页版 {version}

三步打开
1. 将整个 ZIP 文件发给对方，下载保存到电脑。
2. Windows：右键 ZIP → 全部解压。Mac：双击 ZIP 解压。
3. 打开解压后文件夹中的“浮光时钟.html”。
   Windows 用 Edge 或 Chrome；Mac 用 Chrome。建议使用较新版本的浏览器。
   如果双击变成文字编辑器，右键 HTML → 打开方式 → 选择浏览器。

这是免安装网页，不需要 APK、Java、Python或启动本地服务。
HTML 本身包含完整时钟、动画、字体和星空素材，也可以单独转发。
若聊天软件不能预览 HTML，先下载到电脑，再用浏览器打开。
不要只发 127.0.0.1 / localhost 地址：该地址只对应打开它的那台电脑。

使用
• 点击“全屏”开始展示；按 Esc 或双击空白处退出全屏，继续调整设置。
• 设置集中在“日历 / 每日金句 / 显示”三个标签。可切换纯时钟、节日日历、节日＋金句。
• 日历内置 2026 年二十四节气、中国节日和精选国际纪念日；不含放假调休，未标记不代表没有节日。
  其他年份可查看日期与农历，节日资料范围以页面说明为准。
• 每日金句可换句、自定义并调整字号；日历选日期用于预览，进入全屏恢复今天。
• 点击钟面的节气文字可播放对应天气彩蛋；整点自动播放可关闭，彩蛋结束后渐变回原天气。
• “显示”内可调整液态玻璃、字体、大小、粗细、日期、星期、火柴人、背景速度及画质。
  “天气铺满屏幕”开启时铺满背景，关闭后四周渐黑。十组分层主云减少重复碎云，保留连续漂移。
• 天气效果和“昼夜快放 · 60秒”离线也能使用。实时钟面跟随电脑系统时间。
• 默认杭州西湖区，可在设置中选择城市。实时天气需要联网，每10分钟尝试更新。
• 定位取决于浏览器权限；不能定位时手动选城市即可。天气接口暂不可用时，
  自动沿用最近有效天气，或显示离线晴天，并继续播放昼夜动画。
• 你的设置保存在当前浏览器中，不会随文件转发给别人。
  换浏览器、移动或重命名文件后，设置可能需要重新调整。
• 网页版不会修改电脑的休眠设置；长期展示时，可在系统设置中调整息屏时间。
• 如果设备较慢，可把“画质”改为“流畅”，仍保留动态天空。

文件说明
浮光时钟.html：直接打开使用；字体许可和影像署名已保留在页面内。
使用说明.txt：本说明。
第三方许可.txt：随包保留的字体及日月位置计算许可。

验证范围
已在 Mac 的 Chrome 中直接用本地文件打开，检查离线时钟、动态天空、内嵌字体、
设置保存和全屏退出。没有在实体 Windows 电脑上进行测试。
这是浏览器网页版，不是 Windows EXE / Mac APP，也不是系统屏保安装程序。
'''
(folder / '使用说明.txt').write_text(instructions, encoding='utf-8-sig')
licenses = (root / 'work/font-licenses.txt').read_text() + '\n\nSunCalc\nhttps://github.com/mourner/suncalc\n' + solar_license
(folder / '第三方许可.txt').write_text(licenses, encoding='utf-8-sig')
# ponytail: native ZIP extraction and an existing browser cover both operating systems.
archive = folder.parent / (folder.name + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for name in ['浮光时钟.html', '使用说明.txt', '第三方许可.txt']:
        package.write(folder / name, arcname=f'{folder.name}/{name}')
print(f'{archive}\n{archive.stat().st_size:,} bytes')
