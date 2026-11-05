from pathlib import Path
p=Path('work/solar-position.js')
old=p.read_text(); license=old[:old.index('const clockSolarPosition')]
source=Path('work/references/suncalc-index.js').read_text().split('function hoursLater')[0].replace('export ','')
source=source.replace("function addTime(angle, riseName, setName) {\n    times.push([angle, riseName, setName]);\n}\n",'')
p.write_text(license.replace('Sun position subset','Sun and Moon position subset')+'const clockSolarPosition=(()=>{\n'+source+'\nreturn Object.assign(getPosition,{times:getTimes,moon:getMoonPosition,illumination:getMoonIllumination});\n})();\n'+'''
// Cache only the civil day's sunrise/set solve. Positions still advance between clock ticks.
const clockSkyAt=(()=>{
  let key='', times;
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  return (date,latitude,longitude,offset=-date.getTimezoneOffset())=>{
    const stamp=date.getTime(), day=Math.floor((stamp+offset*60000)/86400000);
    const nextKey=`${day}:${latitude}:${longitude}:${offset}`;
    if(key!==nextKey){key=nextKey;times=clockSolarPosition.times(date,latitude,longitude,0,offset);}
    const sun=clockSolarPosition(date,latitude,longitude), moon=clockSolarPosition.moon(date,latitude,longitude);
    const phase=clockSolarPosition.illumination(date).phase;
    const rise=times.sunrise?.getTime(),set=times.sunset?.getTime();
    const progress=Number.isFinite(rise)&&Number.isFinite(set)?clamp((stamp-rise)/(set-rise)):clamp((sun.azimuth-90)/180);
    return {timeline:true, phase:sun.altitude < -6?'night':sun.altitude < 6?(stamp<times.solarNoon.getTime()?'sunrise':'sunset'):'day',
      sunVisible:sun.altitude>-.833,sunAltitude:sun.altitude,sunProgress:progress,
      moonVisible:moon.altitude>0,moonAltitude:moon.altitude,moonProgress:clamp((moon.azimuth-90)/180),moonPhase:phase,
      condition:'clear',variant:'',cloudCover:.08,intensity:0,wind:8,hail:false};
  };
})();
''')
p=Path('work/weather-app.js');s=p.read_text()
s=s.replace("let previewIndex=-1, previewTimer=null;", "let previewIndex=-1, previewTimer=null, dayPreview=null, skyFrame=0, lastSkyFrame=0;\n  let offline=false, companionActivity=null;")
s=s.replace("spacing:0,font:'system'", "spacing:-3,font:'inter'")
s=s.replace("spacing:[-4,24]", "spacing:[-8,24],companionSize:[65,180]")
s=s.replace("seconds:true,companion:true,...", "seconds:true,companion:true,companionSize:115,...")
s=s.replace("units*(spacing+12)-(units-1)*spacing*1.5)/(units*pairWidth+(units-1)*.24)", "units*(spacing+8)-(units-1)*spacing*.8)/(units*pairWidth+(units-1)*.16)")
s=s.replace("size*pairWidth+spacing+12", "size*pairWidth+spacing+8").replace("Math.max(12,size*.24+spacing*1.5)","Math.max(10,size*.16+spacing*.8)")
s=s.replace("stickFigure.setEnabled(settings.companion);", "stickFigure.setEnabled(settings.companion);stickFigure.setScale?.(settings.companionSize/100);\n    $('#companion-size').value=settings.companionSize;$('#companion-size-value').textContent=`${settings.companionSize}%`;")
a=s.index('    const daylight =',s.index('  function applyLight'))
b=s.index("    document.documentElement.style.setProperty('--accent'",a)
s=s[:a]+'''    const light=clockLightSource(state,innerWidth,innerHeight);
    const {x:sx,y:sy,rgb,strength,isDay:daylight,elevation}=light;
    const lowSun=1-clamp(Math.sin(Math.max(0,elevation)*Math.PI/180));
    stickFigure.setLight?.(light);
    const actor=companionActivity && performance.now()-companionActivity.at<1200 ? companionActivity : null;
    const dx=actor?actor.x-sx:0,dy=actor?actor.y-sy:0,len=Math.max(1,Math.hypot(dx,dy));
    const cast=actor?{x:actor.x+dx/len*(16+lowSun*42),y:actor.y+dy/len*(16+lowSun*42),energy:actor.energy,strength}:null;
    glassDigits.setCompanion?.(cast);
''' +s[b:]
s=s.replace("style.setProperty('--cast-y', `${-dy/length*(12+lowSun*23)*strength+12}px`);", "style.setProperty('--cast-y', `${-dy/length*(12+lowSun*23)*strength+8}px`);\n      const proximity=cast?Math.exp(-Math.pow(Math.hypot(cast.x-rect.left-rect.width/2,cast.y-rect.top-rect.height/2)/Math.max(40,rect.width*.6),2)):0;\n      style.setProperty('--actor-shade',String(1-proximity*.14*strength));\n      style.setProperty('--actor-glow',String(proximity*(actor?.energy||0)*.12));")
s=s.replace("glassDigits.setLight({x:sx,y:sy,rgb,strength});", "glassDigits.setLight(light);")
s=s.replace("  function updateSky(now) {", "  function updateSky(now,updateLabel=true) {")
s=s.replace("let state = {...latestScene, phase:'unknown', condition:'clear', variant:'', cloudCover:0, intensity:0, moonVisible:false};", "const location=weather.location||DEFAULT_LOCATION,offset=weather.data?.utc_offset_seconds/60;\n    const skyDate=dayPreview?new Date(dayPreview.midnight+((performance.now()-dayPreview.started)%60000)*1440):now;\n    let state=clockSkyAt(skyDate,location.latitude,location.longitude,Number.isFinite(offset)?offset:undefined);")
s=s.replace("if (data && stamp-weather.fetchedAt", "if (!dayPreview && !offline && navigator.onLine!==false && data && stamp-weather.fetchedAt")
s=s.replace("state = {phase, sunVisible:isDay", "state = {...state,phase, sunVisible:isDay")
s=s.replace("latestScene = previewIndex<0 ? state", "latestScene = dayPreview || previewIndex<0 ? state")
s=s.replace("document.body.dataset.preview = previewIndex<0 ? 'live' : previews[previewIndex][0];", "document.body.dataset.preview = dayPreview?'day-cycle':previewIndex<0 ? 'live' : previews[previewIndex][0];\n    if(dayPreview)$('#day-cycle-status').textContent=`昼夜快放 · ${skyDate.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · 钟面保持真实时间`;")
s=s.replace("    const stale = weather.fetchedAt", "    if(!updateLabel)return;\n    const stale = weather.fetchedAt")
s=s.replace("  function render(animate = true)", '''  function animateSky(stamp) {
    skyFrame=0;if(document.hidden)return;
    const interval=dayPreview&&!reducedMotion.matches?33:reducedMotion.matches?1000:100;
    if(stamp-lastSkyFrame>=interval){lastSkyFrame=stamp;updateSky(new Date(),false);}
    skyFrame=requestAnimationFrame(animateSky);
  }
  function stopDayPreview(){dayPreview=null;$('#day-cycle').textContent='一天快放';$('#day-cycle').setAttribute('aria-pressed','false');$('#day-cycle-status').hidden=true;}
  $('#day-cycle').addEventListener('click',()=>{
    if(isFullscreen())return;
    if(dayPreview){stopDayPreview();tick(false);return;}
    pausePreview();choosePreview(-1);
    const midnight=new Date();midnight.setHours(0,0,0,0);
    dayPreview={midnight:midnight.getTime(),started:performance.now()};
    $('#day-cycle').textContent='结束快放';$('#day-cycle').setAttribute('aria-pressed','true');$('#day-cycle-status').hidden=false;
    tick(false);
  });
  document.addEventListener('companionactivity',event=>{
    const value=event.detail;
    if(value&&[value.x,value.y,value.energy].every(Number.isFinite)) companionActivity={...value,energy:clamp(value.energy),at:performance.now()};
  });
  function render(animate = true)''')
s=s.replace("    previewIndex=index;", "    stopDayPreview();previewIndex=index;")
s=s.replace("  $('#use-glass').addEventListener", "  $('#companion-size').addEventListener('input',event=>{if(isFullscreen()){applySettings();return;}const value=Number(event.target.value);if(!Number.isFinite(value)||value<65||value>180)return;settings.companionSize=value;applySettings();saveSettings();});\n  $('#use-glass').addEventListener",1)
s=s.replace("weather={location,data,fetchedAt:Date.now()};", "offline=false;weather={location,data,fetchedAt:Date.now()};")
s=s.replace("status.textContent=`天气暂时无法更新${weather.data ? '，保留上次天气' : '，等待恢复连接'}。稍后自动重试。`;", "offline=true;status.textContent=`${location.label} · 离线晴天 · 日月位置跟随当地时间，联网后恢复实时天气`;tick(false);")
s=s.replace("document.addEventListener('visibilitychange',()=>{tick(false);", "document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(skyFrame);skyFrame=requestAnimationFrame(animateSky);tick(false);")
s=s.replace("window.addEventListener('online'", "window.addEventListener('offline',()=>{offline=true;status.textContent=`${weather.location.label} · 离线晴天 · 日月位置跟随当地时间`;tick(false);});\n  window.addEventListener('online'")
s=s.replace("  applySettings();tick(false);", "  applySettings();tick(false);skyFrame=requestAnimationFrame(animateSky);")
p.write_text(s)
p=Path('work/build-weather-clock.py');s=p.read_text()
s=s.replace('<button class="text-button" id="weather-browse"', '<button class="text-button" id="day-cycle" type="button" aria-pressed="false">一天快放</button>\n        <button class="text-button" id="weather-browse"',1)
s=s.replace('<section id="appearance-panel"', '<p id="day-cycle-status" class="editor-only day-cycle-status" role="status" hidden></p>\n      <section id="appearance-panel"',1)
s=s.replace('min="-4" max="24"','min="-8" max="24"')
s=s.replace('<div class="appearance-bottom">','<label class="appearance-row" for="companion-size"><span>人物大小 <output id="companion-size-value">115%</output></span><input id="companion-size" type="range" min="65" max="180" step="5" value="115"></label>\n        <div class="appearance-bottom">',1)
s=s.replace('拖动带它去数字上','拖动带它到屏幕各处')
s=s.replace('    /* The weather is the light source;', '''    .day-cycle-status { font-size:11px; color:#aab8ca; margin:8px 0 0; text-align:center; }
    .tile { filter:drop-shadow(var(--cast-x,0px) var(--cast-y,15px) 5px #000b); }
    body.plain-digits .numeral { opacity:var(--actor-shade,1); }
    /* The weather is the light source;''')
p.write_text(s)
