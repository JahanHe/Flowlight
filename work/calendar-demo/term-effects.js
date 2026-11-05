(() => {
  'use strict';
  // ponytail: reuse the existing weather blend, particles and lighting. These are seasonal
  // art directions, not weather forecasts; no extra canvas, texture cache or animation loop.
  const themes = [
    ['小寒','晴寒薄霭',.30,.16,5,0,.22,.14], ['大寒','寒云飞雪',.72,.42,16,0,.82,.08],
    ['立春','轻云初晴',.26,0,13,0,0,.04], ['雨水','细雨润物',.62,.18,8,.70,0,.10],
    ['惊蛰','春雷疏雨',.70,.30,18,.65,0,.04,.26], ['春分','流云和风',.40,0,20,0,0,.02],
    ['清明','烟雨轻岚',.64,.13,9,.58,0,.28], ['谷雨','雨润新绿',.72,.27,12,.85,0,.12],
    ['立夏','晴空积云',.34,0,14,0,0,0], ['小满','云舒雨歇',.52,.10,16,.25,0,.04],
    ['芒种','暖雨随风',.66,.30,25,.72,0,.06], ['夏至','晴光云影',.15,0,18,0,0,0],
    ['小暑','风过云隙',.44,0,26,0,0,.02], ['大暑','云涌夏雨',.82,.48,30,.90,0,.04,.20],
    ['立秋','高云清风',.24,0,24,0,0,.02], ['处暑','疏云渐清',.18,0,16,0,0,.03],
    ['白露','薄雾轻云',.36,0,7,0,0,.40], ['秋分','云影澄明',.28,0,19,0,0,.02],
    ['寒露','清寒微雾',.40,0,10,0,0,.32], ['霜降','冷云薄霭',.30,.06,8,0,.08,.20],
    ['立冬','初雪轻飘',.48,.20,10,0,.52,.08], ['小雪','疏雪浮云',.58,.28,12,0,.72,.06],
    ['大雪','雪幕流动',.80,.58,22,0,1,.12], ['冬至','静夜轻雪',.34,.14,6,0,.38,.08]
  ];
  const $ = s => document.querySelector(s), terms = window.calendarDemoData.terms;
  const presets = new Map(themes.map(([name,label,cloudCover,intensity,wind,rainAmount,snowAmount,fogAmount,stormAmount=0]) =>
    [name,{label,values:{cloudCover,intensity,wind,rainAmount,snowAmount,fogAmount,stormAmount,hailAmount:0,overcastAmount:0}}]));
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function currentTerm(now) {
    const date = window.calendarDemoDate || dateKey(now);
    return date.startsWith('2026-') ? terms.filter(t => t.date <= date).at(-1)?.name : null;
  }
  const group = document.createElement('details');group.className='control-details demo-term-controls';
  group.innerHTML=`<summary>节气彩蛋</summary>
    <label class="demo-row"><span>整点播放</span><input id="demo-term-enabled" type="checkbox" checked></label>
    <label class="demo-row"><span>效果预览</span><select id="demo-term-choice"><option value="current">当前节气</option>${themes.map(([name,label])=>`<option value="${name}">${name} · ${label}</option>`).join('')}</select></label>
    <button class="demo-wide" id="demo-term-play">立即预览</button>
    <p id="demo-term-status" class="demo-note" role="status" aria-live="polite"></p>
    <p class="demo-note">每到整点，播放当前节气意境 40 秒，再柔和回到原天空。保持当前昼夜与时钟时间；节气意境不代表当地实况。</p>`;
  $('#pane-display').append(group);
  const enabled=$('#demo-term-enabled'),choice=$('#demo-term-choice'),button=$('#demo-term-play'),status=$('#demo-term-status');
  let active=null,lastHour='';
  function stop(){active=null;delete document.body.dataset.termEffect;button.textContent='立即预览';status.textContent=enabled.checked?'整点自动播放已开启':'整点自动播放已关闭';}
  function play(name,elapsed){
    if(!presets.has(name)){status.textContent='此日期暂未收录节气，可选择一个节气预览。';return;}
    active={name,started:elapsed};document.body.dataset.termEffect=name;button.textContent='结束彩蛋';status.textContent=`${name} · ${presets.get(name).label}`;
  }
  button.onclick=()=>active?stop():play(choice.value==='current'?currentTerm(new Date()):choice.value,performance.now());
  choice.onchange=()=>{if(active){stop();play(choice.value==='current'?currentTerm(new Date()):choice.value,performance.now());}};
  enabled.onchange=stop;
  // Native buttons keep keyboard/touch access in fullscreen; manual play is independent of hourly opt-in.
  document.addEventListener('click',event=>{
    const name=event.target.closest('[data-calendar-term]')?.dataset.calendarTerm;
    if(presets.has(name)){choice.value=name;play(name,performance.now());}
  });
  // Called by the existing sky update. The local hour key prevents duplicate triggers;
  // late returns to a background tab do not replay missed hours.
  window.calendarDemoTermWeather=(target,now,elapsed=performance.now())=>{
    const hour=`${dateKey(now)}T${now.getHours()}`;
    if(enabled.checked&&!document.hidden&&now.getMinutes()===0&&now.getSeconds()<5&&hour!==lastHour){
      lastHour=hour;if(!active)play(currentTerm(now),elapsed);
    }
    if(!active)return;
    const age=(elapsed-active.started)/1000;
    if(age>=40){stop();return;}
    const smooth=n=>{const x=Math.max(0,Math.min(1,n));return x*x*(3-2*x);};
    const amount=smooth(age/4)*smooth((40-age)/6),values=presets.get(active.name).values;
    for(const key of Object.keys(values))target[key]+=(values[key]-target[key])*amount;
  };
  stop();
})();
