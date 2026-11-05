"""Rebuild the approved offline prototype from its archived 1.3.7 baseline, not the current release."""
from pathlib import Path
import base64,hashlib,re,zipfile
root=Path(__file__).resolve().parents[2]
source=root/'outputs/glass-clock.html'
original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
with zipfile.ZipFile(root/'outputs/浮光时钟-通用版-1.3.7.zip') as archive:
    html=archive.read('浮光时钟-通用版-1.3.7/浮光时钟.html').decode('utf-8')
# Reverse the two additions made by package-portable-clock.py to recover the approved shared page.
html=html.replace('<span class="edition-label">通用网页版 1.3.7</span>',
                  '<span class="edition-label">手机版 1.3.7</span>',1)
html=re.sub(r'<template id="solar-license">.*?</template>\n','',html,count=1,flags=re.S)
assert hashlib.sha256(html.encode('utf-8')).hexdigest()=='ed4710ca132b1e3271ed5f1c8a69ece56b6fea95241b38d8daa2927da67d8ca5', 'Unexpected 1.3.7 baseline'
html=html.replace('floating-light-','fuguang-calendar-prototype-')
html=re.sub(r'<title>.*?</title>','<title>浮光 · 日历与金句 · 本地演示</title>',html,count=1)
# Reuse the clock, including its flips and shared lighting, while choosing a calendar day independently.
needle='const now=new Date,values='
assert html.count(needle)==1
html=html.replace(needle,'const now=window.calendarDemoNow(),values=',1)
# Calendar browsing changes the printed date, not the solar timeline or the hourly scheduler.
assert html.count('updateSky(now)')==1
html=html.replace('updateSky(now)','updateSky(new Date)',1)
needle='-parseFloat(getComputedStyle(intro).marginBottom)-28)'
assert html.count(needle)==1
html=html.replace(needle,'-parseFloat(getComputedStyle(intro).marginBottom)-(window.calendarDemoQuoteHeight?.()||0)-28)',1)
assert html.count('async function loadWeather(){')==1
html=html.replace('async function loadWeather(){','async function loadWeather(){return;',1)
# This visual demonstration is offline. Keep production location/network behavior in the production file.
html=html.replace('function locate(manual=!0){','function locate(manual=!0){return;',1)
# Apply the seasonal target before the shared weather interpolation, without seeking the sky timeline.
needle='weatherBlend||(weatherBlend={...target});'
assert html.count(needle)==1
html=html.replace(needle,'if(window.calendarDemoTermWeather)window.calendarDemoTermWeather(target,now);'+needle,1)
# The renderer starts on black. In edge-to-edge mode the same weather texture needs a sky
# base all the way to the corners, so glass refraction samples it too (no extra canvas).
# ponytail: reuse production colors and canvas; this prototype fill does not add a second renderer.
needle='atmosphere=blend(nightColor.map(n=>n*(1-immersion*.65)),daytime);'
assert html.count(needle)==1
html=html.replace(needle,needle+"if(window.calendarDemoWideSky){const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'rgb('+blend(nightColor.map(n=>n*.22),daytime.map(n=>n*.58))+')');sky.addColorStop(1,'rgb('+blend(nightColor.map(n=>n*.38),daytime.map(n=>n*.76))+')');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);}",1)
# Near clouds enter from overhead; distant, thinner clouds sit lower in the view.
needle='clouds=Array.from({length:18},(_,i)=>({x:(i===0?.22:i===3?.72:i%4*.52)+random()*.18,y:.17+random()*.34,z:(i+Math.floor(i/3))%3,shape:[0,1,2,0,3,5,4,0,2,1,5,3,0,4,2,5,1,0][i],scale:.96+random()*.48,phase:random()*6.28}))'
assert html.count(needle)==1
html=html.replace(needle,'clouds=Array.from({length:10},(_,i)=>{const z=[1,0,2,0,1,2,1,2,2,0][i];return{x:i<3?[.18,.78,.63][i]+(random()-.5)*.18:random()*1.6-.3,y:z===0?.46+random()*.18:z===1?.19+random()*.25:-.12+random()*.30,z,shape:[2,1,0,3,1,2,0,5,4,3][i],scale:.88+random()*.24,phase:random()*6.28}})',1)
# Keep weather targets on the same continuous timeline. Cloud amount changes occupied
# sky area, and precipitation intensity changes both the sky and visible rain strokes.
weather_patches={
    '["noon","正午晴天",{}]':'["noon","晴空万里",{cloudCover:0}]',
    '["cloudy","多云",{condition:"cloudy",cloudCover:.5,wind:12}]':'["cloudy","多云",{condition:"cloudy",cloudCover:.6,wind:12}]',
    '["overcast","阴天",':'["overcast","乌云 / 阴天",',
    '["drizzle","毛毛雨",{condition:"rain",cloudCover:.7,intensity:.16,wind:6}]':'["drizzle","小雨 / 毛毛雨",{condition:"rain",cloudCover:.88,intensity:.12,wind:6}]',
    '["rain","下雨",':'["rain","中雨",',
    '["downpour","暴雨",':'["downpour","瓢泼大雨",',
    '["polar-night","极夜星河",{idealPolar:"night"}]]':'["polar-night","极夜星河",{idealPolar:"night"}],["few-clouds","晴间少云",{condition:"cloudy",cloudCover:.22,wind:8}]]',
    'layers.cover=Math.max(':'layers.rainShade=layers.rain*(.40+.60*clamp(state.intensity)),layers.cover=Math.max(',
    'layers.rain*(.68+.2*clamp(state.intensity))':'layers.rain*(.48+.47*clamp(state.intensity))',
    '[layers.rain*.65,[86,108,129]]':'[layers.rainShade*.9,[72,91,112]]',
    'cloudTint=Math.max(layers.overcast,layers.storm,layers.fog,layers.rain*.75)':'cloudTint=Math.max(layers.overcast,layers.storm,layers.fog,layers.rainShade*.9)',
    'veil=Math.max(smooth(.3,1,layers.cover)*.75,layers.overcast,layers.rain*.8':'veil=Math.max(smooth(.3,1,layers.cover)*.75,layers.overcast,layers.rainShade',
    '175-drizzle*75':'175-drizzle*95',
    # ponytail: a stable mixed-depth pool keeps light rain near AND far. Sorting then
    # drawing only the first N particles unintentionally restricted light rain to distant specks.
    '.sort((a,b)=>a.z-b.z)':'',
    'opacity=(snow?.2+p.z*.4:.09+p.z*.28)*(.83+.17*daylight)':'opacity=(snow?.2+p.z*.4:hail?.09+p.z*.28:(.24+p.z*.45)*(.72+.45*state.intensity))*(.83+.17*daylight)',
    'length=((8+p.z*22)*(1-drizzle)+(3+p.z*6)*drizzle)*(1-iceAmount*.28)':'length=((8+p.z*22)*(1-drizzle)+(7+p.z*12)*drizzle)*(.65+.75*state.intensity)*(1-iceAmount*.28)',
    '[174,204,225].map':'[216,233,245].map',
    'ctx.lineWidth=.55-drizzle*.1+p.z*.65':'ctx.lineWidth=Math.max(1,.65-drizzle*.08+p.z*.7+state.intensity*.35)'
}
for old,new in weather_patches.items():
    assert html.count(old)==1,old
    html=html.replace(old,new,1)
# Replace bounded existing functions rather than stack another renderer over the clock.
start=html.index('function cloudField(');end=html.index('function discardSkyImage(',start)
cloud_source=(root/'work/calendar-demo/cloud-field.js').read_text()
cloud_source=cloud_source.replace('__DEMO_CLOUD_ATLAS__','data:image/png;base64,'+base64.b64encode((root/'work/calendar-demo/cloud-atlas.png').read_bytes()).decode())
html=html[:start]+cloud_source+'\n'+html[end:]
start=html.index('function cloudWeatherWeight(');end=html.index('function glow(',start)
html=html[:start]+html[end:]
start=html.index('function prepareClouds(');end=html.index('function mist(',start)
html=html[:start]+(root/'work/calendar-demo/cloud-layer.js').read_text()+'\n'+html[end:]
# Wind-blown mist is a continuous veil, not vertically flattened copies of every cloud family.
start=html.index('function mist(');end=html.index('function precipitation(',start)
mist=html[start:end]
assert mist.count('cloudSprite(p.shape,')==2
html=html[:start]+mist.replace('cloudSprite(p.shape,','cloudSprite(5,')+html[end:]
# Foreground clouds soften over the new lunar/quote text just as they do over clock digits.
needle='.tile:not([hidden]),.date-line'
assert html.count(needle)==1
html=html.replace(needle,needle+',.demo-dayline,.demo-quote',1)
prelude='''<script>
window.calendarDemoDate=null;
window.calendarDemoWideSky=true;
window.calendarDemoNow=function(){var d=new Date();if(window.calendarDemoDate){var p=window.calendarDemoDate.split('-').map(Number);d.setFullYear(p[0],p[1]-1,p[2]);}return d;};
try{localStorage.setItem('fuguang-calendar-prototype-clock',JSON.stringify({glass:true,seconds:false,companion:true,size:100,weight:550,spacing:-5,font:'manrope',dateWeight:500,weekdayWeight:500,effectsVersion:1,immersive:true,motionSpeed:.75}));localStorage.setItem('fuguang-calendar-prototype-render-quality','fine');localStorage.removeItem('fuguang-calendar-prototype-weather');}catch(e){}
</script>'''
html=html.replace('<head>','<head>'+prelude,1)
html=html.replace('</head>','<style>'+(root/'work/calendar-demo/demo.css').read_text()+'</style></head>',1)
html=html.replace('</body>','<script>'+(root/'work/calendar-demo-data.js').read_text()+'\n'+(root/'work/calendar-demo/demo.js').read_text()+'\n'+(root/'work/calendar-demo/term-effects.js').read_text()+'</script></body>',1)
output=root/'outputs/浮光-日历金句-本地演示.html'
output.write_bytes(html.encode('utf-8'))
assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
print(f'{output}\n{output.stat().st_size:,} bytes; production unchanged: {original_hash}')
