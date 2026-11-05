from pathlib import Path
p=Path('work/build-weather-clock.py');s=p.read_text()
s=s.replace('        <button class="text-button" id="day-cycle" type="button" aria-pressed="false">一天快放</button>\n','')
s=s.replace("html = html.replace('class=\"topbar\"'", "html = html.replace('<div class=\"top-actions\">', '<div class=\"top-actions\"><button class=\"day-cycle-button\" id=\"day-cycle\" type=\"button\" aria-pressed=\"false\"><span aria-hidden=\"true\">▶</span> 昼夜快放 <small>60 秒</small></button>')\nhtml = html.replace('class=\"topbar\"'")
s=s.replace('<p id="day-cycle-status" class="editor-only day-cycle-status" role="status" hidden></p>', '''<div id="day-cycle-status" class="editor-only day-cycle-status" hidden>
        <div class="day-cycle-heading"><strong id="day-cycle-label">理想的一天</strong><span id="day-cycle-time">05:30</span></div>
        <div class="day-cycle-track" aria-hidden="true"><span id="day-cycle-progress"></span></div>
        <div class="day-cycle-landmarks" aria-hidden="true"><span>日出</span><span>晴空</span><span>落日</span><span>月夜 · 流星</span></div>
        <p>理想光影演示 · 每分钟循环一次 · 钟面保持真实时间</p>
      </div>''')
s=s.replace('<span>火柴人</span>','<span>小生灵</span>').replace('人物大小','生灵大小').replace('火柴人也会感受','小生灵也会感受').replace('火柴人仍可互动','小生灵仍可互动')
s=s.replace("    .tile { filter:drop-shadow(var(--cast-x,0px) var(--cast-y,15px) 5px #000b); }", "    .tile { filter:drop-shadow(var(--cast-x,0px) var(--cast-y,8px) 6px #0005); }")
s=s.replace('    .day-cycle-status { font-size:11px; color:#aab8ca; margin:8px 0 0; text-align:center; }', '''    .day-cycle-button { display:flex; align-items:center; justify-content:center; gap:9px; min-height:44px; padding:0 17px; color:#edf4ff; border:1px solid #c8dcff48; background:#b7cbed15; border-radius:30px; font-size:13px; white-space:nowrap; }
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
    @media(max-width:600px) { .top-actions { gap:10px; } .day-cycle-button { padding:0 11px; gap:6px; font-size:12px; } .brand-name { font-size:15px; } }''')
# Explicit transparent canvas: only glyphs and their soft cast shadows paint pixels.
s=s.replace("css += '''", "css += '''\n    .intro,.date-line,.clock,.unit,.seconds-cluster,.tile,.half { background:none; box-shadow:none; border:0; -webkit-backdrop-filter:none; backdrop-filter:none; }\n    .half { border-radius:0; }\n",1)
p.write_text(s)
p=Path('work/weather-app.js');s=p.read_text()
s=s.replace("const defaultAppearance={glass:true,size:100,weight:500,spacing:-3,font:'inter'}", "const defaultAppearance={glass:true,size:100,weight:400,spacing:-5,font:'inter'}")
s=s.replace("size:100,weight:300,spacing:-2", "size:100,weight:300,spacing:-5")
s=s.replace("units*(spacing+8)-(units-1)*spacing*.8)/(units*pairWidth+(units-1)*.16)", "units*(spacing+4)-(units-1)*spacing*.65)/(units*pairWidth+(units-1)*.115)")
s=s.replace("size*pairWidth+spacing+8", "size*pairWidth+spacing+4").replace("Math.max(10,size*.16+spacing*.8)", "Math.max(8,size*.115+spacing*.65)")
s=s.replace(";scene.setClockBounds?.($('.clock').getBoundingClientRect())",'')
s=s.replace("  window.addEventListener('scroll',()=>scene.setClockBounds?.($('.clock').getBoundingClientRect()),{passive:true});\n",'')
s=s.replace("['hail','雷雨冰雹',{condition:'storm',cloudCover:1,intensity:1,wind:40,hail:true}]", "['hail','雷雨冰雹',{condition:'storm',cloudCover:1,intensity:1,wind:40,hail:true}],\n    ['polar-day','极昼巡游',{idealPolar:'day'}],\n    ['polar-night','极夜星河',{idealPolar:'night'}]")
s=s.replace("((performance.now()-dayPreview.started)%60000)*1440", "((performance.now()-dayPreview.started+13750)%60000)*1440")
s=s.replace("latestScene = dayPreview || previewIndex<0 ? state : {...previewBase,...previews[previewIndex][2]};", "latestScene = dayPreview ? clockIdealSky(((performance.now()-dayPreview.started+13750)%60000)/60000,(performance.now()-dayPreview.started)/1000) : previewIndex<0 ? state : previews[previewIndex][2].idealPolar ? clockIdealSky((performance.now()%60000)/60000,performance.now()/1000,previews[previewIndex][2].idealPolar) : {...previewBase,...previews[previewIndex][2]};")
s=s.replace("if(dayPreview)$('#day-cycle-status').textContent=`昼夜快放 · ${skyDate.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · 钟面保持真实时间`;", "if(dayPreview){const hour=latestScene.dayProgress*24;$('#day-cycle-time').textContent=`${pad(Math.floor(hour))}:${pad(Math.floor(hour%1*60))}`;$('#day-cycle-progress').style.width=`${((performance.now()-dayPreview.started)%60000)/600}%`;$('#day-cycle-label').textContent=`理想的一天 · ${hour<6?'晨光初现':hour<10?'晨曦与流云':hour<16?'晴空与日光':hour<19?'落日余晖':'月夜与流星'}`;}")
s=s.replace("$('#day-cycle').textContent='一天快放'", "$('#day-cycle').innerHTML='<span aria-hidden=\"true\">▶</span> 昼夜快放 <small>60 秒</small>'")
s=s.replace("$('#day-cycle').textContent='结束快放'", "$('#day-cycle').innerHTML='<span aria-hidden=\"true\">■</span> 停止快放 <small>60 秒 / 天</small>'")
s=s.replace("'preview-active',index>=0", "'preview-active',index>=0")
# Show the visual day preview status even when the weather gallery was open.
s=s.replace("pausePreview();choosePreview(-1);\n    const midnight", "pausePreview();choosePreview(-1);closeAppearance();gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');syncPanels();\n    const midnight")
p.write_text(s)
p=Path('work/solar-position.js');s=p.read_text();s+='''
// An explicitly idealised exhibition day, separate from actual astronomical/weather data.
function clockIdealSky(progress,elapsed,polar='') {
  const p=((progress%1)+1)%1,angle=(p-.25)*Math.PI*2;
  const clamp=n=>Math.max(0,Math.min(1,n));
  let altitude=Math.sin(angle)*65,sunProgress=clamp((p-.25)*2);
  let moonAltitude=-Math.sin(angle)*55,moonProgress=clamp(p<.25?(p+.25)*2:(p-.75)*2);
  if(polar==='day'){altitude=24+12*Math.cos(p*Math.PI*2);sunProgress=.5+.4*Math.sin(p*Math.PI*2);moonAltitude=-25;}
  if(polar==='night'){altitude=-30;moonAltitude=30+16*Math.cos(p*Math.PI*2);moonProgress=.5+.4*Math.sin(p*Math.PI*2);}
  return {timeline:true,idealCycle:true,idealPolar:polar,dayProgress:p,cycleElapsed:elapsed,
    phase:altitude < -6?'night':altitude<6?(p<.5?'sunrise':'sunset'):'day',
    sunVisible:altitude>-.833,sunAltitude:altitude,sunProgress,
    moonVisible:moonAltitude>0,moonAltitude,moonProgress,moonPhase:.46,
    condition:'clear',variant:'',cloudCover:.10+.13*(.5+.5*Math.sin(p*Math.PI*4)),intensity:0,wind:12,hail:false};
}
''';p.write_text(s)
