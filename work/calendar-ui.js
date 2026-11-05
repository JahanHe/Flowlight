(() => {
  'use strict';
  const $=s=>document.querySelector(s),data=window.calendarDemoData;
  const pad=n=>String(n).padStart(2,'0'),key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const localDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>key(new Date());
  const settingsKey='floating-light-calendar';
  const state={date:today(),month:new Date().getMonth(),year:new Date().getFullYear(),mode:'quote',tab:'calendar',quoteOffset:0,quoteSize:21,quoteKind:'daily',custom:'',traditional:true,world:true,terms:true,wideSky:true};
  // Only calendar preferences are restored. Browsed dates never become the real clock's date.
  try{
    const saved=JSON.parse(localStorage.getItem(settingsKey));
    if(['clock','calendar','quote'].includes(saved?.mode))state.mode=saved.mode;
    if(['daily','nature','custom'].includes(saved?.quoteKind))state.quoteKind=saved.quoteKind;
    if(Number.isFinite(saved?.quoteSize)&&saved.quoteSize>=14&&saved.quoteSize<=30)state.quoteSize=saved.quoteSize;
    if(typeof saved?.custom==='string')state.custom=saved.custom.slice(0,64);
    for(const name of ['traditional','world','terms','wideSky'])if(typeof saved?.[name]==='boolean')state[name]=saved[name];
  }catch{}
  function saveSettings(){try{const {mode,quoteSize,quoteKind,custom,traditional,world,terms,wideSky}=state;localStorage.setItem(settingsKey,JSON.stringify({mode,quoteSize,quoteKind,custom,traditional,world,terms,wideSky}));}catch{}}
  const dayNames=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  let lunarFormat;try{lunarFormat=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{month:'long',day:'numeric'});}catch{}
  function lunar(date,short=false){if(!lunarFormat)return '';const parts=lunarFormat.formatToParts(localDate(date)),month=parts.find(p=>p.type==='month')?.value||'',day=dayNames[Number(parts.find(p=>p.type==='day')?.value)-1]||'';return short?(day==='初一'?month:day):month+day;}
  const terms=date=>data.terms.filter(x=>x.date===date);
  const events=date=>data.events.filter(x=>x.date===date&&(x.type==='world'?state.world:state.traditional));
  const items=date=>{const ev=events(date);return [...(state.terms?terms(date).filter(x=>!ev.some(e=>e.name===x.name+'节')).map(x=>({...x,type:'term',description:'二十四节气 · 随季节感受时间',sourceUrl:data.sources[0].url})):[]),...ev];};
  function selectedQuote(){if(state.quoteKind==='custom'&&state.custom.trim())return {text:state.custom.trim(),author:'我的摘录',source:'自定义金句'};const d=localDate(state.date),number=Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);const list=state.quoteKind==='nature'?[0,1,2,4,6,8].map(i=>data.quotes[i]):data.quotes;const themed={'2026-02-17':7,'2026-04-23':5,'2026-09-25':2,'2026-11-07':8,'2026-11-22':8};const index=state.quoteKind==='daily'?(themed[state.date]??number):number;return list[((index+state.quoteOffset)%list.length+list.length)%list.length];}
  document.body.classList.add('calendar-demo');
  document.body.classList.toggle('weather-edge-to-edge',state.wideSky);window.calendarDemoWideSky=state.wideSky;
  const intro=$('.intro'),line=document.createElement('div'),quote=document.createElement('blockquote');
  line.className='demo-dayline';quote.className='demo-quote';quote.innerHTML='<p></p><cite></cite>';
  intro.append(line);$('.clock').after(quote);
  window.calendarDemoQuoteHeight=()=>getComputedStyle(quote).display==='none'?0:quote.getBoundingClientRect().height+parseFloat(getComputedStyle(quote).marginTop);
  const panel=$('.control-panel'),consoleView=document.createElement('div');consoleView.id='demo-console';panel.append(consoleView);
  consoleView.innerHTML=`
    <div class="demo-head"><h1>浮光</h1></div>
    <div id="demo-fullscreen-slot"></div>
    <label class="demo-row demo-fill-row" title="关闭后恢复四周渐黑"><span>天气铺满屏幕</span><input id="demo-wide-sky" type="checkbox" checked role="switch" aria-label="天气铺满屏幕"></label>
    <nav class="demo-tabs" role="tablist" aria-label="日历设置"><button role="tab" id="tab-calendar" aria-controls="pane-calendar" data-tab="calendar" aria-selected="true">日历</button><button role="tab" id="tab-quote" aria-controls="pane-quote" data-tab="quote" aria-selected="false">每日金句</button><button role="tab" id="tab-display" aria-controls="pane-display" data-tab="display" aria-selected="false">显示</button></nav>
    <section id="pane-calendar" role="tabpanel" aria-labelledby="tab-calendar">
      <div class="demo-toolbar"><h2 id="demo-month"></h2><button class="today-button" id="demo-today">今天</button><button class="arrow" id="demo-prev" aria-label="上个月">‹</button><button class="arrow" id="demo-next" aria-label="下个月">›</button></div>
      <div class="demo-week" aria-hidden="true">${['一','二','三','四','五','六','日'].map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="demo-grid" id="demo-days" aria-label="选择预览日期"></div>
      <div class="demo-selected"><div class="demo-detail-title"><strong id="demo-detail-date"></strong><span id="demo-lunar"></span></div><div class="demo-event-list" id="demo-events"></div></div>
      <div class="demo-shortcuts" aria-label="节日效果示例"><button data-date="2026-11-07">立冬</button><button data-date="2026-09-25">中秋</button><button data-date="2026-04-23">世界读书日</button></div>
      <p class="demo-note" id="demo-date-note"></p>
      <details class="control-details"><summary>内容范围与来源</summary><p>当前收录 2026 年二十四节气、中国节日与精选国际纪念日，未收录放假调休。其他年份可查看日期与农历；未标注不代表没有节日。浏览日期仅用于预览，进入全屏会回到今天。</p><div id="demo-sources"></div></details>
    </section>
    <section id="pane-quote" role="tabpanel" aria-labelledby="tab-quote" hidden>
      <div class="demo-quote-preview"><p id="demo-quote-text"></p><span id="demo-quote-author"></span></div><a class="demo-source" id="demo-quote-source" target="_blank" rel="noopener">查看原文与出处 ↗</a>
      <button class="demo-wide" id="demo-change-quote">换一句</button>
      <label class="demo-row"><span>内容偏好</span><select id="demo-quote-kind"><option value="daily">每日精选</option><option value="nature">山水与时令</option><option value="custom">我的句子</option></select></label>
      <div id="demo-custom-area" hidden><label class="demo-label" for="demo-custom">输入想留在钟面上的一句话</label><textarea class="demo-edit" id="demo-custom" maxlength="64" rows="3" placeholder="写下你今天想记住的一句话"></textarea></div>
      <label class="demo-row"><span>文字大小 <output id="demo-quote-size-label">21</output></span><input aria-label="金句文字大小" id="demo-quote-size" type="range" min="14" max="30" value="21"></label>
      <p class="demo-note">内置 ${data.quotes.length} 条古诗文，每日精选由日期决定。也可保存自己的句子；手动换句在本次打开期间生效。</p>
    </section>
    <section id="pane-display" role="tabpanel" aria-labelledby="tab-display" hidden>
      <section id="demo-live-weather" aria-labelledby="demo-live-weather-title"><h2 id="demo-live-weather-title">实时天气与位置</h2></section>
      <details id="demo-appearance-settings" class="demo-settings-group" open><summary>时钟与液态玻璃</summary><div id="demo-material-controls"></div><div id="demo-appearance-controls"></div></details>
      <details id="demo-motion-settings" class="demo-settings-group"><summary>天气与昼夜动效</summary><div id="demo-playback-controls"></div><div id="demo-weather-controls"></div></details>
      <span class="demo-label">钟面内容</span><div class="demo-mode" aria-label="显示模式"><button data-mode="clock" aria-pressed="false">纯时钟</button><button data-mode="calendar" aria-pressed="false">节日日历</button><button data-mode="quote" aria-pressed="true">节日＋金句</button></div>
      <label class="demo-row"><span>中国节日与纪念日</span><input id="demo-traditional" type="checkbox" checked></label>
      <label class="demo-row"><span>二十四节气</span><input id="demo-terms" type="checkbox" checked></label>
      <label class="demo-row"><span>国际纪念日</span><input id="demo-world" type="checkbox" checked></label>
      <label class="demo-row"><span>天空预览</span><select id="demo-sky"><option value="live">实时天气</option><option value="sunrise">清晨</option><option value="noon">白昼</option><option value="sunset">落日</option><option value="night">星空与极光</option></select></label>
      <p class="demo-note">全屏只保留展示内容。按 Esc 或双击空白处退出，再调整设置。手机横屏空间不足时，优先收起金句。</p>
    </section>`;
  const edition=$('.edition-label');if(edition)$('.demo-head').append(edition);
  $('#demo-fullscreen-slot').append($('#fullscreen'));$('#fullscreen').innerHTML='<span aria-hidden="true">⛶</span> 全屏显示';
  $('#fullscreen').addEventListener('click',()=>{if(window.calendarDemoDate)chooseDate(today());},true);
  for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{if((document.fullscreenElement||document.webkitFullscreenElement)&&window.calendarDemoDate)chooseDate(today());});
  // ponytail: move the existing controls, preserving listeners and one source of settings.
  for(const id of ['use-glass','show-seconds'])$('#demo-material-controls').append($('#'+id).closest('label'));
  for(const child of [...$('#appearance-panel').children])if(!child.classList.contains('appearance-heading'))$('#demo-appearance-controls').append(child);
  const playback=$('.playback-group');$('#demo-playback-controls').append(playback,$('#motion-note'));
  const credits=$('.sky-credit');if(credits)$('#demo-playback-controls').append(credits,credits.nextElementSibling||document.createTextNode(''));
  for(const child of [...$('#weather-gallery').children])if(!child.classList.contains('gallery-heading'))$('#demo-weather-controls').append(child);
  $('[data-preview="noon"]').after($('[data-preview="few-clouds"]'));
  // Move the real weather form and source nodes, preserving their network/location listeners.
  const liveWeather=$('.weather-info'),weatherSource=$('#weather-source').closest('details');
  $('#demo-live-weather').append(liveWeather,weatherSource);
  $('#weather-browse').hidden=true;
  for(const name of ['traditional','world','terms'])$('#demo-'+name).checked=state[name];
  $('#demo-wide-sky').checked=state.wideSky;
  $('#demo-quote-kind').value=state.quoteKind;$('#demo-custom').value=state.custom;$('#demo-quote-size').value=state.quoteSize;

  $('#demo-sources').innerHTML=data.sources.map(x=>`<p><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a></p>`).join('');
  function renderMonth(){
    $('#demo-month').textContent=`${state.year}年 ${state.month+1}月`;
    const start=(new Date(state.year,state.month,1).getDay()+6)%7,count=new Date(state.year,state.month+1,0).getDate();
    $('#demo-days').innerHTML='<span class="demo-empty"></span>'.repeat(start)+Array.from({length:count},(_,i)=>{
      const date=`${state.year}-${pad(state.month+1)}-${pad(i+1)}`,all=items(date),label=all[0]?.name||lunar(date,true);
      return `<button class="demo-day ${all.length?'has-event':''} ${date===today()?'today':''} ${date===state.date?'selected':''}" data-day="${date}" aria-label="${date} ${esc(all.map(x=>x.name).join('，'))}" aria-pressed="${date===state.date}"><b>${i+1}</b><small>${esc(label)}</small></button>`;
    }).join('');
    $('#demo-prev').disabled=state.year<=1901&&state.month===0;$('#demo-next').disabled=state.year>=2099&&state.month===11;
  }
  function refresh(){
    const date=localDate(state.date),all=items(state.date),q=selectedQuote(),cn=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
    window.calendarDemoDate=state.date===today()?null:state.date;
    const previous=data.terms.filter(x=>x.date<=state.date).slice(-1)[0];
    const season=state.terms&&state.date.startsWith('2026-')&&!terms(state.date).length&&previous?previous.name+'时节':'';
    const captions=[lunar(state.date),...all.slice(0,2).map(x=>x.name)];if(all.length===0&&season)captions.push(season);
    line.innerHTML=captions.filter(Boolean).map((x,i)=>{
      const term=data.terms.find(t=>x===t.name||x===t.name+'时节'||x===t.name+'节');
      return `${i?'<span class="dot">·</span>':''}${term?`<button type="button" class="day-event demo-term-trigger" data-calendar-term="${esc(term.name)}" title="点击播放${esc(term.name)}彩蛋" aria-label="播放${esc(term.name)}节气彩蛋">${esc(x)}</button>`:`<span class="${i?'day-event':''}">${esc(x)}</span>`}`;
    }).join('');line.hidden=state.mode==='clock';
    quote.hidden=state.mode!=='quote';quote.querySelector('p').textContent=q.text;quote.querySelector('p').style.fontSize=`${state.quoteSize}px`;quote.querySelector('cite').textContent=[q.author,q.source].filter(Boolean).join(' · ');
    $('#demo-detail-date').textContent=`${cn} · ${date.toLocaleDateString('zh-CN',{weekday:'long'})}`;$('#demo-lunar').textContent=lunar(state.date);
    $('#demo-events').innerHTML=all.length?all.map(x=>`<div class="demo-event"><div><a href="${esc(x.sourceUrl||data.sources[0].url)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a><small>${esc(x.description||({world:'国际纪念日',traditional:'中国传统节日',china:'国内纪念日',term:'二十四节气'}[x.type]))}</small></div></div>`).join(''):`<p>${season?esc(season):'暂无节日'}</p>`;
    $('#demo-date-note').hidden=!window.calendarDemoDate;$('#demo-date-note').textContent=window.calendarDemoDate?`预览 ${state.date} · 点“今天”恢复`:'';
    $('#demo-quote-text').textContent=q.text;$('#demo-quote-author').textContent=[q.author,q.source].filter(Boolean).join(' · ');$('#demo-quote-source').hidden=!q.sourceUrl;if(q.sourceUrl)$('#demo-quote-source').href=q.sourceUrl;
    $('#demo-custom-area').hidden=state.quoteKind!=='custom';$('#demo-quote-size-label').value=state.quoteSize;
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===state.mode));
    renderMonth();window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('resize'));
  }
  function chooseDate(date){state.date=date;const d=localDate(date);state.month=d.getMonth();state.year=d.getFullYear();state.quoteOffset=0;refresh();}
  consoleView.addEventListener('click',e=>{
    const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===state.tab;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;$('#pane-'+b.dataset.tab).hidden=!on;});}
    const day=e.target.closest('[data-day],[data-date]');if(day)chooseDate(day.dataset.day||day.dataset.date);
    const mode=e.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;saveSettings();refresh();}
  });
  $('.demo-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(document.activeElement),next=tabs[(i+(e.key==='ArrowRight'?1:2))%3];next.click();next.focus();});
  $('#demo-today').onclick=()=>chooseDate(today());
  for(const [id,step]of [['demo-prev',-1],['demo-next',1]])$('#'+id).onclick=()=>{const d=new Date(state.year,state.month+step,1);state.year=d.getFullYear();state.month=d.getMonth();renderMonth();};
  $('#demo-change-quote').onclick=()=>{state.quoteOffset++;refresh();};
  $('#demo-quote-kind').onchange=e=>{state.quoteKind=e.target.value;saveSettings();refresh();};
  $('#demo-custom').oninput=e=>{state.custom=e.target.value.slice(0,64);saveSettings();refresh();};
  $('#demo-quote-size').oninput=e=>{state.quoteSize=Number(e.target.value);saveSettings();refresh();};
  for(const k of ['traditional','world','terms'])$('#demo-'+k).onchange=e=>{state[k]=e.target.checked;saveSettings();refresh();};
  $('#demo-wide-sky').onchange=e=>{state.wideSky=e.target.checked;window.calendarDemoWideSky=state.wideSky;document.body.classList.toggle('weather-edge-to-edge',state.wideSky);saveSettings();};
  $('#demo-sky').onchange=e=>{if(e.target.value==='live')$('[data-return-live]').click();else $('[data-preview="'+e.target.value+'"]').click();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!window.calendarDemoDate)chooseDate(today());});
  // Reuse the production date change rather than adding an animation or polling loop for the calendar.
  let lastToday=today();new MutationObserver(()=>{if(!window.calendarDemoDate&&today()!==lastToday){lastToday=today();chooseDate(lastToday);}}).observe($('#date'),{childList:true});
  refresh();
  window.clockCalendarReady=true;
})();
