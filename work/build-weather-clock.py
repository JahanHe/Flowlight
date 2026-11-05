from pathlib import Path
from html import escape
import argparse, base64, json, re, subprocess
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Assemble the self-contained clock HTML.')
parser.add_argument('--tv', action='store_true', help='Assemble an experimental TV page')
parser.add_argument('--output', type=Path, help='Write the page to this .html file')
args = parser.parse_args()
tv = args.tv
frozen_tv = root / 'outputs/glass-clock-tv.html'
output = args.output.resolve() if args.output else (frozen_tv if tv else root / 'outputs/glass-clock.html')
if output == frozen_tv:
    parser.error('The released TV page is frozen. Use --tv --output work/tv-preview-build.html for a development build.')
if output.suffix.lower() != '.html':
    parser.error('--output must be an .html file')
html = (root / 'work/glass-clock-before-weather.html').read_text()
html = html.replace('data-theme="warm"', 'data-phase="unknown"', 1).replace('content="#eee9e1"', 'content="#000000"')
html = html.replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
html = re.sub(r'    :root\[data-theme="sky"\].*?    \* \{', '    * {', html, flags=re.S)
html = html.replace('color-scheme: light;', 'color-scheme: dark;').replace('--paper: #eeeae3; --ink: #413d38; --muted: #766e64;', '--paper: #000; --ink: #edf0f5; --muted: #9ba6b6;')
html = html.replace('--accent: #af6149; --accent-soft: #c87c60;', '--accent: #bed0e8; --accent-soft: #bdc7d5;')
html = html.replace('--glass: rgba(255,255,255,.23); --rim: rgba(255,255,255,.76);', '--glass: rgba(255,255,255,.045); --rim: rgba(219,232,255,.24);')
html = html.replace('--flip: #e9e3da; --shadow: rgba(83,66,46,.13);', '--flip: #171e2b; --shadow: rgba(0,0,0,.5);')
html = re.sub(r'    \.ambient \{.*?    \.shell \{', '''    .ambient { position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:0; background:#000; }
    #weather-canvas { display:block; width:100%; height:100%;
      -webkit-mask-image:radial-gradient(ellipse 50% 50% at center,#000 42%,rgba(0,0,0,.93) 64%,rgba(0,0,0,.5) 80%,transparent 96%);
      mask-image:radial-gradient(ellipse 50% 50% at center,#000 42%,rgba(0,0,0,.93) 64%,rgba(0,0,0,.5) 80%,transparent 96%);
    }
    .shell { position:relative; z-index:1;''', html, flags=re.S)
html = re.sub(r'    \.themes \{.*?    \.settings-divider \{', '    .settings-divider {', html, flags=re.S)
html = re.sub(r'      \.orb \{.*?\n    }', '    }', html, flags=re.S)
html = html.replace('<div class="ambient" aria-hidden="true"><div class="orb one"></div><div class="orb two"></div><div class="orb three"></div><div class="contour"></div></div>', '<div class="ambient" aria-hidden="true"><canvas id="weather-canvas"></canvas></div>')
html = html.replace('<div class="top-actions">', '<div class="top-actions"><button class="day-cycle-button" id="day-cycle" type="button" aria-pressed="false"><span aria-hidden="true">▶</span> 昼夜快放 <small>60 秒</small></button>')
html = html.replace('class="topbar"', 'class="topbar editor-only"').replace('class="eyebrow"', 'class="eyebrow editor-only"').replace('class="unit-label"', 'class="unit-label editor-only"')
html = html.replace('class="notice"', 'class="notice editor-only"')
start = html.index('      <div class="reflection"')
end = html.index('      <noscript>', start)
html = html[:start] + '''      <div class="settings editor-only" aria-label="时钟设置">
        <label class="seconds-control"><input id="use-glass" type="checkbox" checked><span class="switch" aria-hidden="true"></span><span>液态玻璃</span></label>
        <label class="seconds-control"><input id="show-seconds" type="checkbox" checked><span class="switch" aria-hidden="true"></span><span>显示秒数</span></label>
        <span class="settings-divider" aria-hidden="true"></span>
        <button class="text-button" id="appearance-toggle" type="button" aria-expanded="false" aria-controls="appearance-panel">数字外观</button>
        <button class="text-button" id="weather-browse" type="button" aria-expanded="false" aria-controls="weather-gallery">浏览天气效果 <span aria-hidden="true">↗</span></button>
      </div>
      <div id="day-cycle-status" class="editor-only day-cycle-status" hidden>
        <div class="day-cycle-heading"><strong id="day-cycle-label">连续的一天</strong><span id="day-cycle-time">06:00</span></div>
        <div class="day-cycle-track" aria-hidden="true"><span id="day-cycle-progress"></span></div>
        <div class="day-cycle-landmarks" aria-hidden="true"><span>日出</span><span>日间</span><span>落日</span><span>深夜</span></div>
        <p>叠加当前天气 · 60 秒循环全天 · 钟面保持真实时间</p>
      </div>
      <section id="appearance-panel" class="appearance-panel editor-only" aria-label="数字外观设置" hidden>
        <div class="appearance-heading"><h2>数字外观</h2><button id="appearance-close" class="text-button" type="button" aria-label="关闭外观设置">完成</button></div>
        <div class="clock-presets" aria-label="外观预设"><button type="button" data-clock-preset="minimal">极简</button><button type="button" data-clock-preset="classic">经典</button><button type="button" data-clock-preset="rounded">圆润</button><button type="button" data-clock-preset="mono">等宽</button></div>
        <label class="appearance-row" for="digit-font"><span>字体</span><select id="digit-font"><option value="system">系统无衬线</option><option value="rounded">圆润字体</option><option value="mono">等宽字体</option><option value="serif">衬线字体</option></select></label>
        <label class="appearance-row" for="digit-size"><span>大小 <output id="size-value">100%</output></span><input id="digit-size" type="range" min="70" max="140" step="1" value="100"></label>
        <label class="appearance-row" for="digit-weight"><span>粗细 <output id="weight-value">500</output></span><input id="digit-weight" type="range" min="300" max="800" step="50" value="500"></label>
        <label class="appearance-row" for="digit-spacing"><span>间距 <output id="spacing-value">0</output></span><input id="digit-spacing" type="range" min="-8" max="24" step="1" value="0"></label>
        <label class="appearance-row" for="companion-size"><span>火柴人大小 <output id="companion-size-value">115%</output></span><input id="companion-size" type="range" min="65" max="180" step="5" value="115"></label>
        <div class="appearance-bottom"><label class="seconds-control"><input id="show-companion" type="checkbox" checked><span class="switch" aria-hidden="true"></span><span>火柴人</span></label><button class="text-button" id="appearance-reset" type="button">恢复默认外观</button></div>
      </section>
      <form id="city-form" class="city-form editor-only" hidden>
        <div class="city-search"><label class="sr-only" for="city-name">城市名称</label><input id="city-name" placeholder="输入城市名" autocomplete="off" maxlength="80"><button class="text-button" type="submit">查找</button></div>
        <div id="city-results" role="status"></div>
      </form>
      <div class="weather-info editor-only">
        <div id="preview-mode" hidden><span id="preview-name"></span><button class="text-button" data-return-live type="button">回到实时天气</button></div>
        <p id="weather-status" role="status">正在获取当地位置…</p>
        <p id="weather-age">每 10 分钟刷新天气 · 光影随时间连续变化</p>
        <div class="location-actions"><button class="text-button" id="locate" type="button">使用当前位置</button><button class="text-button" id="city-toggle" type="button" aria-expanded="false" aria-controls="city-form">选城市</button></div>
        <p class="weather-credit">位置仅用于查询天气 · 数据来自 <a id="weather-source" href="https://weather.cma.cn/" target="_blank" rel="noopener noreferrer">中国气象局 / Open-Meteo</a><span id="weather-source-detail"></span></p>
        <p class="companion-hint">轻点和它打招呼 · 拖动带它到屏幕各处 · 全屏也能玩</p>
      </div>
      <section id="weather-gallery" class="weather-gallery editor-only" aria-label="天气效果预览" hidden>
        <div class="gallery-heading"><h2>天气效果</h2><button class="icon-button" id="gallery-close" type="button" aria-label="关闭天气预览">×</button></div>
        <p class="gallery-copy">天气叠加在同一条昼夜时间线上。可先选晴雨，再快放一整天。</p>
        <div id="preview-grid" class="preview-grid"></div>
        <div class="gallery-bottom"><span id="gallery-current" role="status">实时天气</span><div><button class="text-button" id="preview-play" aria-pressed="false" type="button">自动轮播</button><button class="text-button" data-return-live type="button">回到实时天气</button></div></div>
      </section>
''' + html[end:]
html = html.replace('<noscript>', '<noscript class="editor-only">')
fonts = json.loads((root/'work/embedded-fonts.json').read_text())
font_options = ''.join(f'<option value="{escape(font["id"])}" data-family="{escape(chr(34)+font["cssFamily"]+chr(34)+", "+font["fallback"])}">{escape(font["label"])}</option>' for font in fonts)
html = re.sub(r'(<select id="digit-font">)(.*?)(</select>)', lambda match: match[1] + '<optgroup label="内嵌字体 · 离线可用">' + font_options + '</optgroup><optgroup label="设备字体">' + match[2] + '</optgroup>' + match[3], html)
html = re.sub(r'    <footer.*?</footer>', '''    <footer class="footer editor-only"><span class="footer-note"><span class="status-dot" aria-hidden="true"></span><span id="timezone">跟随系统时间</span></span><span>全屏隐藏设置 · 双击空白处退出 · 火柴人仍可互动</span></footer>''', html)
css = '''
    .day-cycle-button { display:flex; align-items:center; justify-content:center; gap:9px; min-height:44px; padding:0 17px; color:#edf4ff; border:1px solid #c8dcff48; background:#b7cbed15; border-radius:30px; font-size:13px; white-space:nowrap; }
    .day-cycle-button small { font-size:10px; color:#bbcce1; }
    .day-cycle-button[aria-pressed="true"] { background:#d9e5f1; color:#17202b; border-color:transparent; }
    .day-cycle-button[aria-pressed="true"] small { color:#526171; }
    .day-cycle-status { width:min(430px,calc(100vw - 48px)); margin:16px 0 0; color:#b8c7da; font-size:11px; }
    .day-cycle-heading { display:flex; justify-content:space-between; align-items:center; }
    .day-cycle-heading strong { font-weight:500; color:#e6edf6; }
    #day-cycle-time { font-variant-numeric:tabular-nums; }
    .day-cycle-track { height:2px; margin:10px 0 8px; background:#ffffff15; }
    #day-cycle-progress { display:block; height:100%; width:0; background:linear-gradient(90deg,#e6b995,#e4efff,#7f9bc7); }
    .day-cycle-landmarks { display:flex; justify-content:space-between; color:#94a4b9; font-size:10px; }
    .day-cycle-status p { text-align:center; margin:10px 0 0; font-size:10px; color:#8f9aaa; }
    @media(max-width:600px) { .top-actions { gap:10px; } .day-cycle-button { padding:0 11px; gap:6px; font-size:12px; } .brand-name { font-size:15px; } }
    .tile { filter:drop-shadow(var(--cast-x,0px) var(--cast-y,8px) 6px #0005); }
    body.plain-digits .numeral { opacity:var(--actor-shade,1); }
    /* The weather is the light source; all four edges dissolve into the black canvas. */
    body { background:#000; }
    main { padding:38px 0; }
    .tile {
      --light-angle:320deg; --surface-light:rgba(188,210,255,.08); --edge-light:rgba(210,225,255,.28);
      --number-light:#e4edff; --number-shade:#8493ac; --digit-x:-1px; --digit-y:2px; --digit-blur:4px;
      --cast-x:0px; --cast-y:15px;
      background:transparent; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none;
    }
    .tile::after,.seam,.flap.top::after,.flap.bottom::after { display:none; }
    .numeral {
      background:linear-gradient(var(--light-angle),var(--number-shade) 4%,var(--number-light) 90%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      text-shadow:none;
      font-family:var(--clock-font,-apple-system,BlinkMacSystemFont,sans-serif); letter-spacing:var(--digit-spacing,0px); padding:0;
    }
    .static.top,.static.bottom,.flap { background:transparent; }
    .tile.flipping .flap.top { animation:fold-up .24s cubic-bezier(.55,.06,.75,.43) both; }
    .tile.flipping .flap.bottom { animation:fold-down .32s .24s cubic-bezier(.15,.55,.3,1) both; }
    .tile.flipping .static.top { animation:reveal-top .24s ease-out both; }
    .tile.flipping .static.bottom { animation:hide-bottom .32s .24s ease-in both; }
    .tile.flipping .flap { will-change:transform,opacity; }
    @keyframes fold-up { from {transform:rotateX(0);opacity:1} to {transform:rotateX(-90deg);opacity:0} }
    @keyframes fold-down { from {transform:rotateX(90deg);opacity:0} to {transform:rotateX(0);opacity:1} }
    @keyframes reveal-top { from {opacity:0} to {opacity:1} }
    @keyframes hide-bottom { from {opacity:1} to {opacity:0} }
    .settings { margin-top:37px; gap:18px; }
    .text-button { border:0; background:transparent; padding:8px 0; font-size:12px; color:var(--ink); }
    .text-button:hover { color:var(--accent); }
    .text-button:disabled { opacity:.45; cursor:wait; }
    .weather-info { text-align:center; font-size:11px; line-height:1.7; color:var(--muted); max-width:440px; margin-top:14px; }
    .weather-info p { margin:3px 0; }
    .weather-info p:first-child { color:#c4cbd6; font-size:12px; }
    .weather-credit { font-size:10px; opacity:.7; }
    .weather-credit a { color:inherit; text-decoration-color:#677383; text-underline-offset:3px; }
    .world-controls { display:flex; align-items:center; justify-content:center; gap:20px; margin-top:8px; }
    .world-controls .text-button { min-height:44px; }
    .world-controls .seconds-control { min-height:44px; }
    .companion-hint { color:#a5b2c4; }
    .preview-active #weather-status,.preview-active #weather-age { display:none; }
    #preview-mode { display:flex; align-items:center; gap:16px; justify-content:center; color:#e0c4a5; flex-wrap:wrap; }
    #preview-mode .text-button { min-height:44px; color:#f2d8b8; text-decoration:underline; text-underline-offset:4px; }
    .weather-gallery { position:fixed; z-index:20; bottom:max(20px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); width:min(900px,calc(100vw - 40px)); max-height:55svh; overflow:auto; padding:24px; border:1px solid rgba(222,230,245,.18); border-radius:24px; background:rgba(12,16,23,.95); box-shadow:0 25px 100px #000a; -webkit-backdrop-filter:blur(25px); backdrop-filter:blur(25px); }
    .gallery-heading { display:flex; justify-content:space-between; align-items:center; gap:14px; }
    .gallery-kicker { margin:0 0 6px; color:#bc9d7a; font-size:10px; letter-spacing:.22em; }
    .gallery-heading h2 { margin:0; font:400 22px "Songti SC",serif; letter-spacing:.04em; }
    .gallery-copy { font-size:11px; line-height:1.6; color:#99a6b9; margin:13px 0 18px; }
    .preview-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:8px; }
    .preview-option { border:1px solid rgba(200,214,235,.12); background:rgba(150,180,220,.035); min-height:50px; border-radius:12px; font-size:12px; padding:8px 3px; }
    .preview-option:hover { background:rgba(150,180,220,.12); }
    .preview-option[aria-pressed="true"] { background:rgba(225,197,164,.14); color:#f9dcba; border-color:rgba(225,197,164,.65); }
    .gallery-bottom { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:16px; font-size:11px; color:#a9b7c9; }
    .gallery-bottom > div { display:flex; gap:20px; }
    .gallery-bottom .text-button { min-height:44px; }
    .text-button,.seconds-control,.icon-button { touch-action:manipulation; }
    @media (pointer:coarse) { .icon-button { width:48px; height:48px; } .settings .text-button,.settings .seconds-control { min-height:44px; } }
    @media (max-width:800px) { .preview-grid { grid-template-columns:repeat(4,1fr); } .weather-gallery { padding:18px; } .gallery-heading h2 { font-size:20px; } }
    .city-form { width:min(360px,90vw); margin-top:13px; background:rgba(15,21,30,.8); border:1px solid var(--rim); border-radius:18px; padding:12px 16px; }
    .city-search { display:flex; gap:14px; }
    .city-search input { min-width:0; flex:1; border:0; outline:0; color:var(--ink); background:transparent; font-size:13px; }
    .city-search input:focus-visible { outline:1px solid var(--accent); outline-offset:3px; border-radius:3px; }
    #city-results { font-size:12px; color:var(--muted); }
    .city-result { display:block; width:100%; border:0; border-top:1px solid var(--rim); background:transparent; text-align:left; font-size:12px; padding:10px 0; line-height:1.5; }
    .city-result:hover { color:var(--accent); }
    .footer { line-height:1.7; letter-spacing:.04em; }
    .intro { margin-bottom:30px; }
    .date-line { padding:9px 16px; border-radius:30px; background:rgba(0,0,0,.32); border:1px solid rgba(255,255,255,.06); text-shadow:0 1px 3px #000,0 2px 8px #000; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
    .notice { background:#1b2532; }
    :fullscreen { background:#000; }
    :fullscreen .editor-only, .is-fullscreen .editor-only { display:none !important; }
    :fullscreen .shell, .is-fullscreen .shell { padding:0; min-height:100svh; }
    :fullscreen main, .is-fullscreen main { padding:6vh 4vw; min-height:100svh; }
    :fullscreen .intro, .is-fullscreen .intro { margin-bottom:36px; }
    :fullscreen .date-line time, .is-fullscreen .date-line time { font-size:clamp(14px,1.4vw,21px); }
    :fullscreen .weekday, .is-fullscreen .weekday { font-size:clamp(13px,1.2vw,18px); }
    @media (max-width:640px) {
      .shell { padding:24px 18px 18px; }
      .settings { padding:10px 15px; gap:13px; margin-top:32px; }
      .text-button,.seconds-control { font-size:11px; }
      .weather-info { max-width:310px; font-size:10px; }
      .footer { flex-wrap:wrap; justify-content:center; text-align:center; font-size:9px; gap:5px; }
      .brand-caption { font-size:8px; }
      :fullscreen .intro,.is-fullscreen .intro { margin-bottom:27px; }
    }
    @media (max-height:700px) and (min-width:641px) {
      .shell { padding-top:20px; }
      main { padding:22px 0; }
      .settings { margin-top:24px; }
      .weather-info { margin-top:10px; }
    }
    /* Flat controls and a quiet typographic canvas keep the clock in front. */
    .brand-mark,.brand-caption,.local-label,.eyebrow,.unit-label { display:none; }
    .brand-name { font-family:inherit; font-size:18px; font-weight:500; letter-spacing:.14em; }
    .topbar { position:relative; z-index:10; }
    .shell { z-index:auto; padding:max(26px,env(safe-area-inset-top)) max(28px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(28px,env(safe-area-inset-left)); }
    .intro { margin-bottom:64px; }
    .date-line { background:none; border:0; padding:0; border-radius:0; backdrop-filter:none; -webkit-backdrop-filter:none; text-shadow:0 1px 2px #000b,0 2px 7px #0007; }
    .date-line time,.weekday { letter-spacing:.03em; }
    .settings { flex-wrap:wrap; gap:8px 22px; padding:0; margin-top:48px; max-width:calc(100vw - 48px); background:none; border:0; border-radius:0; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }
    .settings .text-button,.settings .seconds-control { min-height:44px; }
    .seconds-control { gap:8px; }
    .switch { width:28px; height:17px; background:#ffffff25; }
    .switch::after { width:13px; height:13px; box-shadow:none; }
    input:checked + .switch { background:#8c9aa9; }
    input:checked + .switch::after { transform:translateX(11px); }
    .colon { width:var(--colon-width,40px); gap:calc(var(--digit-size)*.12); }
    .colon::before,.colon::after { width:clamp(3px,calc(var(--digit-size)*.028),7px); height:clamp(3px,calc(var(--digit-size)*.028),7px); background:#d5dee9; opacity:.75; }
    body.plain-digits .glass-numeral { display:none; }
    .glass-digits-ready body.plain-digits .numeral { opacity:1; }
    body.plain-digits .numeral { filter:brightness(var(--actor-shade,1)) drop-shadow(var(--plain-shadow-x,0px) var(--plain-shadow-y,2px) 5px #0004); }
    .weather-info { margin-top:17px; }
    .location-actions { display:flex; justify-content:center; gap:20px; }
    .location-actions .text-button { color:#97a4b5; font-size:11px; min-height:44px; }
    .weather-credit,.companion-hint { font-size:10px; opacity:.65; }
    .icon-button { border:0; box-shadow:none; background:#ffffff0a; }
    .icon-button:hover { background:#ffffff12; transform:none; }
    .appearance-panel { position:fixed; top:50%; right:max(28px,env(safe-area-inset-right)); transform:translateY(-50%); z-index:22; width:320px; max-width:calc(100vw - 32px); max-height:80svh; overflow:auto; background:#121417; border:1px solid #ffffff13; border-radius:18px; padding:20px; box-shadow:0 12px 50px #0004; }
    .appearance-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .appearance-heading h2,.gallery-heading h2 { font-family:inherit; font-size:16px; font-weight:500; letter-spacing:0; margin:0; }
    .appearance-heading button { min-height:44px; }
    .clock-presets { display:flex; gap:6px; padding-bottom:12px; }
    .clock-presets button { flex:1; border:0; border-radius:8px; min-height:44px; background:#ffffff08; font-size:12px; }
    .clock-presets [aria-pressed="true"] { background:#ffffff20; color:#fff; }
    .appearance-row { min-height:66px; border-top:1px solid #ffffff0c; display:flex; align-items:center; gap:18px; font-size:12px; }
    .appearance-row > span { flex:0 0 77px; color:#d2d7df; }
    .appearance-row output { display:block; margin-top:4px; color:#808b9a; font-size:10px; font-variant-numeric:tabular-nums; }
    .appearance-row input { min-width:0; width:100%; height:44px; accent-color:#ced5dd; touch-action:pan-y; }
    .appearance-row select { min-width:0; flex:1; max-width:180px; min-height:44px; border:0; background:#1b1e23; color:#dce1e8; font:inherit; border-radius:7px; padding:8px; }
    .appearance-bottom { display:flex; justify-content:space-between; align-items:center; gap:12px; border-top:1px solid #ffffff0c; padding-top:12px; }
    .appearance-bottom .text-button,.appearance-bottom .seconds-control { min-height:44px; font-size:11px; }
    .weather-gallery { background:#121417; border-color:#ffffff13; box-shadow:0 12px 50px #0004; -webkit-backdrop-filter:none; backdrop-filter:none; border-radius:18px; }
    .preview-option { border:0; background:#ffffff08; border-radius:8px; }
    .preview-option[aria-pressed="true"] { background:#ffffff20; color:#fff; }
    .is-fullscreen { overflow:hidden; touch-action:manipulation; }
    @media (max-width:700px) { .appearance-panel { right:16px; top:auto; bottom:max(16px,env(safe-area-inset-bottom)); transform:none; } .settings { gap:4px 14px; margin-top:36px; } .settings-divider { display:none; } .settings .seconds-control,.settings .text-button { font-size:11px; } .shell { padding-left:20px; padding-right:20px; } }
    /* Settings stay in document flow, below the digits, and never cover the clock. */
    .appearance-panel,.weather-gallery { position:relative; inset:auto; transform:none; margin:18px 0 0; width:min(780px,calc(100vw - 48px)); max-width:none; max-height:none; overflow:visible; flex-shrink:0; }
    .appearance-panel { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; padding:16px 22px; }
    .appearance-heading,.clock-presets,.appearance-bottom { grid-column:1/-1; }
    .appearance-heading { margin-bottom:0; }
    .clock-presets { padding-bottom:8px; }
    .appearance-row { min-height:60px; }
    .appearance-row select { max-width:none; }
    .panel-open:not(.is-fullscreen) .weather-info,.panel-open:not(.is-fullscreen) .footer { display:none; }
    .panel-open:not(.is-fullscreen) main { padding:20px 0; }
    .panel-open:not(.is-fullscreen) .settings { margin-top:22px; }
    .panel-open:not(.is-fullscreen) .intro { margin-bottom:64px; }
    :fullscreen .intro,.is-fullscreen .intro { margin-bottom:64px; }
    @media (max-width:600px) { .appearance-panel { grid-template-columns:1fr; padding:14px 18px; } .appearance-heading,.clock-presets,.appearance-bottom { grid-column:auto; } }
'''
css += '''
    .intro,.date-line,.clock,.unit,.seconds-cluster,.tile,.half { background:none; box-shadow:none; border:0; -webkit-backdrop-filter:none; backdrop-filter:none; }
    .half { border-radius:0; }

    @media (min-width:700px) and (max-height:850px) {
      .panel-open:not(.is-fullscreen) main { padding:12px 0; }
      .panel-open:not(.is-fullscreen) .intro { margin-bottom:48px; }
      .panel-open:not(.is-fullscreen) .settings { margin-top:16px; }
      .panel-open .appearance-row { min-height:54px; }
      .panel-open .appearance-panel,.panel-open .weather-gallery { margin-top:12px; }
    }
'''
html = html.replace('  </style>', css + (root/'work/embedded-fonts.css').read_text() + ((root/'work/glass-digits.css').read_text() if not tv else '') + ((root/'work/stick-figure.css').read_text() if (root/'work/stick-figure.css').exists() else '') + ((root/'work/tv-controls.css').read_text() if tv else '') + '  </style>')
# ponytail: the 1 GB television loads no glass shader, pixel scanner, or procedural renderer.
scripts = ['solar-position.js','weather-provider.js','tv-lite-scene.js'] if tv else ['mobile-performance.js','text-metrics.js','solar-position.js','weather-provider.js','glass-digits.js','sky-assets.js','weather-scene.js','stick-figure.js']
scripts.append('weather-app.js')
if not tv:
    scripts += ['calendar-data.js','calendar-ui.js','calendar-effects.js']
if tv:
    scripts.insert(0, 'tv-compat.js')
    scripts += ['tv-preview.js', 'tv-controls.js']
    html = re.sub(r'<title>.*?</title>', '<title>浮光·TV</title>', html)
    tv_manifest = ET.parse(root/'work/android/AndroidManifest-tv.xml').getroot()
    tv_version = tv_manifest.get('{http://schemas.android.com/apk/res/android}versionName')
    html = html.replace('</head>', '<meta name="clock-tv-version" content="'+escape(tv_version, quote=True)+'">\n</head>')
    html = html.replace('<body>', '<body class="tv tv-lite plain-digits tv-settings-open tv-booting"><div id="tv-boot" role="status"><strong>浮光·TV</strong><span>正在打开时钟…</span></div>', 1)
else:
    # The full edition explicitly keeps its continuous animation, including digit flips.
    html=html.replace('    @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none !important; transition:none !important; } }','')
    mobile_manifest=ET.parse(root/'work/android/AndroidManifest.xml').getroot()
    mobile_version=mobile_manifest.get('{http://schemas.android.com/apk/res/android}versionName')
    html=html.replace('</head>', '<meta name="clock-mobile-version" content="'+escape(mobile_version,quote=True)+'">\n</head>')
    # Keep the existing controls and event IDs; only the full edition gets one settings surface.
    controls_start=html.index('      <div class="settings editor-only"')
    controls_end=html.index('      <noscript',controls_start)
    day_start=html.index('      <div id="day-cycle-status"',controls_start)
    appearance_start=html.index('      <section id="appearance-panel"',day_start)
    city_start=html.index('      <form id="city-form"',appearance_start)
    weather_start=html.index('      <div class="weather-info',city_start)
    gallery_start=html.index('      <section id="weather-gallery"',weather_start)
    day_status=html[day_start:appearance_start]
    appearance_panel=html[appearance_start:city_start]
    city_form=html[city_start:weather_start]
    weather_gallery=html[gallery_start:controls_end]
    appearance_panel=appearance_panel.replace('>完成</button>','>返回</button>')
    font_menu=re.search(r'<select id="digit-font">(.*?)</select>',appearance_panel,re.S)[1]
    clock_rows=appearance_panel[appearance_panel.index('<div class="clock-presets"'):appearance_panel.index('        <label class="appearance-row" for="companion-size"')]
    clock_rows=clock_rows.replace('max="140"','max="500"')
    date_sections=''
    for prefix,title in [('date','年月日'),('weekday','星期')]:
        date_sections+='<details class="appearance-section"><summary>'+title+'</summary>'
        date_sections+='<label class="appearance-row" for="'+prefix+'-font"><span>字体</span><select id="'+prefix+'-font">'+font_menu+'</select></label>'
        for field,label,minimum,maximum,step,value in [('size','大小',50,500,5,100),('weight','粗细',300,800,50,400),('spacing','间距',-2,12,1,0)]:
            ident=prefix+'-'+field
            date_sections+='<label class="appearance-row" for="'+ident+'"><span>'+label+' <output id="'+ident+'-value"></output></span><input id="'+ident+'" type="range" min="'+str(minimum)+'" max="'+str(maximum)+'" step="'+str(step)+'" value="'+str(value)+'"></label>'
        date_sections+='</details>'
    appearance_panel='''<section id="appearance-panel" class="appearance-panel editor-only" aria-label="数字外观设置" hidden>
      <div class="appearance-heading"><h2>数字与日期外观</h2><button id="appearance-close" class="text-button" type="button" aria-label="关闭外观设置">返回</button></div>
      <details class="appearance-section" open><summary>时钟数字</summary>'''+clock_rows+'''</details>'''+date_sections+'''
      <details class="appearance-section"><summary>火柴人</summary>
        <label class="appearance-row" for="companion-size"><span>大小 <output id="companion-size-value">115%</output></span><input id="companion-size" type="range" min="65" max="500" step="5" value="115"></label>
        <label class="appearance-row" for="companion-activity"><span>活动频率 <output id="companion-activity-value">适中</output></span><input id="companion-activity" type="range" min="1" max="5" step="1" value="3"></label>
        <label class="appearance-row" for="companion-rest"><span>休息频率 <output id="companion-rest-value">适中</output></span><input id="companion-rest" type="range" min="1" max="5" step="1" value="3"></label>
        <div class="appearance-bottom"><label class="seconds-control"><input id="show-companion" type="checkbox" checked><span class="switch" aria-hidden="true"></span><span>显示火柴人</span></label></div>
      </details>
      <p class="section-note">大小最高 500%。超出可用空间时自动适配；手机竖屏的大时钟会改为上下排列，保留完整时间。</p>
      <div class="appearance-bottom"><button class="text-button" id="appearance-reset" type="button">恢复默认外观</button></div>
    </section>'''
    weather_gallery=weather_gallery.replace('aria-label="关闭天气预览">×','aria-label="关闭天气预览">返回')
    html=html[:controls_start]+html[controls_end:]
    html=re.sub(r'    <header class="topbar editor-only">.*?</header>','',html,flags=re.S)
    html=html.replace('<body>','<body class="mobile-full">',1).replace('<main>','<main id="clock-stage" aria-label="时钟实时预览">',1)
    panel='''    <aside class="control-panel editor-only" aria-label="时钟设置">
      <header class="control-heading"><div><h1>浮光</h1><p>时钟与天气</p></div><span class="edition-label">手机版 '''+escape(mobile_version)+'''</span></header>
      <button class="fullscreen-action" id="fullscreen" type="button" aria-label="进入全屏" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>全屏显示</button>
      <div class="control-home">
        <section class="control-section"><h2>显示</h2><div class="control-group settings">
          <label class="seconds-control"><span class="control-label">液态玻璃</span><input id="use-glass" type="checkbox" checked><span class="switch" aria-hidden="true"></span></label>
          <label class="seconds-control"><span class="control-label">显示秒数</span><input id="show-seconds" type="checkbox" checked><span class="switch" aria-hidden="true"></span></label>
          <button class="control-link" id="appearance-toggle" type="button" aria-expanded="false" aria-controls="appearance-panel"><span>数字外观</span><span class="row-chevron" aria-hidden="true">›</span></button>
        </div></section>
        <section class="control-section"><h2>天气</h2><div class="control-group weather-info">
          <div class="weather-summary"><div id="preview-mode" hidden><span id="preview-name"></span><button class="text-button" data-return-live type="button">回到实时天气</button></div><p id="weather-status" role="status">正在获取天气…</p><p id="weather-age">每 10 分钟更新</p></div>
          <button class="control-link" id="weather-browse" type="button" aria-expanded="false" aria-controls="weather-gallery"><span>浏览天气效果</span><span class="row-chevron" aria-hidden="true">›</span></button>
          <div class="location-actions"><button class="text-button" id="city-toggle" type="button" aria-expanded="false" aria-controls="city-form">选择城市</button><button class="text-button" id="locate" type="button">使用当前位置</button></div>
          '''+city_form+'''
        </div></section>
        <section class="control-section"><h2>播放</h2><div class="control-group playback-group">
          <label class="appearance-row playback-row" for="render-quality"><span>画质 <output id="quality-status">自动检测</output></span><select id="render-quality"><option value="auto">自动 · 省电优先</option><option value="smooth">流畅</option><option value="fine">精细</option><option value="ultra">极致</option></select></label>
          <label class="seconds-control"><span class="control-label">沉浸天空</span><input id="immersive-sky" type="checkbox" checked><span class="switch" aria-hidden="true"></span></label>
          <p class="immersive-status" id="immersive-status">所有画质均可开启 · 低功耗分层动画</p>
          <label class="appearance-row playback-row" for="motion-speed"><span>背景速度 <output id="motion-speed-value">1×</output></span><input id="motion-speed" type="range" min="0.25" max="3" step="0.25" value="1" aria-describedby="motion-note"></label>
          <button class="day-cycle-button" id="day-cycle" type="button" aria-pressed="false"><span aria-hidden="true">▶</span> 昼夜快放 <small>60 秒</small></button>'''+day_status+'''</div><p class="section-note" id="motion-note">背景速度独立可调。昼夜快放仍为一分钟一圈，钟面保持真实时间。</p><p class="section-note">沉浸天空为艺术化演示，随昼夜与天气变化。行星轮流巡游，极夜预览可持续欣赏。</p><p class="section-note sky-credit">银河影像：<a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener">ESO/S. Brunier</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>，已裁切、调色。</p><details class="control-details"><summary>天文影像来源</summary>'''+(root/'work/sky-asset-credits.html').read_text()+'''</details></section>
        <details class="control-details"><summary>天气来源与使用说明</summary><p class="weather-credit">位置仅用于查询天气。数据来自 <a id="weather-source" href="https://weather.cma.cn/" target="_blank" rel="noopener noreferrer">中国气象局 / Open-Meteo</a><span id="weather-source-detail"></span></p><p class="companion-hint">轻点火柴人打招呼，拖动带它到屏幕各处。全屏时双击空白处或按返回键退出。</p><p id="timezone">跟随系统时间</p></details>
      </div>
      '''+appearance_panel+weather_gallery+'''
    </aside>'''
    html=re.sub(r'    <footer.*?</footer>',lambda _:panel,html,flags=re.S)
    html=html.replace('  </style>',(root/'work/mobile-controls.css').read_text()+'\n'+(root/'work/calendar-ui.css').read_text()+'\n  </style>',1)
# Compute only after all preceding markup replacements; offsets cannot survive title/body edits.
script_start = html.index('  <script>')
# Keep this ES5 preflight separate so even a main-script syntax error can be reported by an older WebView.
preflight = '''<script>window.clockTV=true;window.clockTVLite=true;window.clockTVDiagnostics={stage:'script-start',reason:'',firstError:''};window.addEventListener('error',function(event){if(!window.clockTVDiagnostics.firstError)window.clockTVDiagnostics.firstError=String(event.message||'Script error').slice(0,500)+(event.lineno?' (line '+event.lineno+')':'');});</script>\n''' if tv else '''<script>
window.clockFullEffects=true;
window.calendarDemoDate=null;
window.calendarDemoWideSky=true;
window.calendarDemoNow=function(){var d=new Date();if(window.calendarDemoDate){var p=window.calendarDemoDate.split('-').map(Number);d.setFullYear(p[0],p[1]-1,p[2]);}return d;};
</script>\n'''
script_source='\n'.join((root/'work'/name).read_text() for name in scripts)
if not tv:
    assert script_source.count('__DEMO_CLOUD_ATLAS__') == 1
    script_source=script_source.replace('__DEMO_CLOUD_ATLAS__','data:image/png;base64,'+base64.b64encode((root/'work/calendar-demo/cloud-atlas.png').read_bytes()).decode())
html = html[:script_start] + '<template id="font-licenses">' + escape((root/'work/font-licenses.txt').read_text()) + '</template>\n  ' + preflight + '<script>\n' + script_source + '\n  </script>\n</body>\n</html>\n'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(html.encode('utf-8'))
if tv: subprocess.run(['node',str(root/'work/build-tv-bundle.cjs'),str(output)],check=True)
else: subprocess.run(['node',str(root/'work/build-tv-bundle.cjs'),str(output),'chrome90'],check=True)
print('Built '+str(output))
