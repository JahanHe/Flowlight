(() => {
  'use strict';
  if (!window.clockAppReady || window.clockTVIncompatible) return;
  const $=id=>document.getElementById(id), panel=document.createElement('aside');
  panel.id='tv-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','电视时钟设置');
  panel.innerHTML=`<div class="tv-heading"><div><h1>浮光·TV<span id="tv-version" class="tv-version"></span></h1><p>方向键选择 · 确定键调节 · 返回键收起</p></div><button id="tv-close">全屏看时钟</button></div>
    <div class="tv-split"><div class="tv-settings-column"><nav class="tv-tabs" aria-label="设置分类"><button data-tab="display">画面</button><button data-tab="fonts">字体</button><button data-tab="weather">天气</button><button data-tab="cities">城市</button></nav>
    <div id="tv-content" class="tv-content"></div></div><section class="tv-preview" aria-label="时钟实时预览"><div class="tv-preview-heading"><h2>实时预览</h2><span>与你的全屏画面同步</span></div><div class="tv-preview-frame"><canvas id="tv-preview-canvas" role="img" aria-label="当前时钟和动态天气的实时预览"></canvas></div><p>调好喜欢的样子，按「全屏看时钟」开始。</p></section></div>
    <div class="tv-footer"><span id="tv-weather-status"></span><span>无操作 15 秒自动全屏</span></div>`;
  document.body.classList.add('tv');document.body.append(panel);
  $('tv-version').textContent=document.querySelector('meta[name="clock-tv-version"]').content;
  const content=$('tv-content'),preview=createClockTVPreview($('tv-preview-canvas'));let tab='display',idle=0,province='',cityPage=0;
  const rangeLabels={'digit-size':'数字大小','digit-weight':'数字粗细','digit-spacing':'数字间距','companion-size':'火柴人大小'};
  function button(label,action,attributes={}) {
    const element=document.createElement('button');element.type='button';element.textContent=label;
    for(const key of Object.keys(attributes))element.setAttribute(key,attributes[key]);
    element.addEventListener('click',()=>{touch();action(element);});return element;
  }
  function grid(){const element=document.createElement('div');element.className='tv-grid';content.append(element);return element;}
  function change(input,type='input'){input.dispatchEvent(new Event(type,{bubbles:true}));}
  function refreshLabels() {
    panel.querySelectorAll('[data-toggle]').forEach(element=>{const input=$(element.dataset.toggle);element.textContent=`${element.dataset.label}：${input.checked?'开启':'关闭'}`;element.setAttribute('aria-pressed',String(input.checked));});
    panel.querySelectorAll('[data-value]').forEach(element=>{const input=$(element.dataset.value);element.textContent=input.value+(input.id==='digit-size'||input.id==='companion-size'?'%':input.id==='digit-spacing'?' px':'');});
    panel.querySelectorAll('[data-font]').forEach(element=>element.setAttribute('aria-pressed',String(element.dataset.font===$('digit-font').value)));
    const cycle=$('tv-day-cycle');if(cycle){const active=$('day-cycle').getAttribute('aria-pressed')==='true';cycle.textContent=active?'停止昼夜快放':'昼夜快放 · 60 秒';cycle.setAttribute('aria-pressed',String(active));}
    panel.querySelectorAll('[data-weather]').forEach(element=>element.setAttribute('aria-pressed',document.querySelector(`.preview-option[data-preview="${element.dataset.weather}"]`).getAttribute('aria-pressed')));
  }
  function render() {
    content.replaceChildren();content.scrollTop=0;
    panel.querySelectorAll('[data-tab]').forEach(element=>element.setAttribute('aria-selected',String(element.dataset.tab===tab)));
    if(tab==='display') {
      const toggles=grid();toggles.classList.add('tv-toggles');
      for(const [id,label] of [['show-seconds','显示秒数'],['show-companion','火柴人']])toggles.append(button(label,()=>{$(id).checked=!$(id).checked;change($(id),'change');refreshLabels();},{'data-toggle':id,'data-label':label}));
      for(const [id,label]of Object.entries(rangeLabels)) {
        const row=document.createElement('div');row.className='tv-stepper';const title=document.createElement('span');title.textContent=label;
        const value=document.createElement('output');value.dataset.value=id;
        const adjust=direction=>{const input=$(id),step=id==='digit-size'?5:Number(input.step)||1;input.value=String(Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)+direction*step)));change(input);refreshLabels();};
        row.append(title,button('−',()=>adjust(-1),{'aria-label':`减小${label}`}),value,button('＋',()=>adjust(1),{'aria-label':`增大${label}`}));content.append(row);
      }
      const presets=grid();document.querySelectorAll('[data-clock-preset]').forEach(original=>presets.append(button(original.textContent,()=>{original.click();refreshLabels();})));
      presets.append(button('和火柴人打招呼',()=>{document.querySelector('.stick-hit')?.click();}));
    } else if(tab==='fonts') {
      const choices=grid();for(const option of $('digit-font').options)choices.append(button(option.textContent,()=>{$('digit-font').value=option.value;change($('digit-font'));refreshLabels();},{'data-font':option.value}));
    } else if(tab==='weather') {
      const actions=grid();actions.append(button('昼夜快放 · 60 秒',()=>{$('day-cycle').click();refreshLabels();},{id:'tv-day-cycle'}));
      actions.append(button('使用实时天气',()=>{document.querySelector('[data-return-live]').click();refreshLabels();},{id:'tv-live-weather'}));
      actions.append(button('自动轮播天气',element=>{$('preview-play').click();element.textContent=$('preview-play').getAttribute('aria-pressed')==='true'?'停止轮播天气':'自动轮播天气';}));
      const hint=document.createElement('p');hint.className='tv-copy';hint.textContent='天气叠加在连续的昼夜上；晴雨更新不会重置时间。';content.append(hint);
      const choices=grid();document.querySelectorAll('.preview-option').forEach(original=>choices.append(button(original.textContent,()=>{original.click();refreshLabels();},{'data-weather':original.dataset.preview})));
    } else {
      const current=document.createElement('p');current.className='tv-copy';current.textContent='用方向键选择省份和城市，无需打字。默认杭州西湖区。';content.append(current);
      if(!province) {
        const choices=grid();choices.append(button('杭州 · 西湖区',()=>selectCity({name:'杭州 · 西湖区',latitude:30.26,longitude:120.13,admin1:'浙江'}),{'data-city':'杭州 · 西湖区'}));
        for(const [key,label]of Object.entries(clockWeatherProvider.regions))choices.append(button(label,()=>{province=key;cityPage=0;render();content.querySelector('button').focus();},{'data-region':key}));
      } else {
        const rows=clockWeatherProvider.listCities(province),pages=Math.ceil(rows.length/20),controls=grid();
        controls.append(button('‹ 返回省份',()=>{province='';render();content.querySelector('button').focus();}));
        const previous=button('上一页',()=>{cityPage--;render();content.querySelector('button').focus();});previous.disabled=cityPage===0;controls.append(previous);
        const next=button('下一页',()=>{cityPage++;render();content.querySelector('button').focus();});next.disabled=cityPage>=pages-1;controls.append(next);
        const label=document.createElement('p');label.className='tv-copy';label.textContent=`${clockWeatherProvider.regions[province]} · 第 ${cityPage+1} / ${pages} 页`;content.append(label);
        const choices=grid();rows.slice(cityPage*20,cityPage*20+20).forEach(row=>choices.append(button(row.name,()=>selectCity(row),{'data-city':row.name})));
      }
    }
    refreshLabels();
  }
  function selectCity(row) {
    window.dispatchEvent(new CustomEvent('clocktvlocation',{detail:{latitude:row.latitude,longitude:row.longitude,label:[row.name,row.admin1].filter(Boolean).join(' · '),source:'city'}}));
    panel.querySelectorAll('[data-city]').forEach(element=>element.setAttribute('aria-pressed',String(element.dataset.city===row.name)));
  }
  function touch(){clearTimeout(idle);if(!panel.hidden)idle=setTimeout(close,15000);}
  function open(initial=false) {
    document.body.classList.remove('is-fullscreen');document.body.classList.add('tv-settings-open');panel.hidden=false;
    render();window.dispatchEvent(new Event('resize'));preview.start();(initial?$('tv-close'):panel.querySelector(`[data-tab="${tab}"]`)).focus();touch();
  }
  function close() {
    clearTimeout(idle);preview.stop();panel.hidden=true;document.activeElement?.blur();document.body.classList.remove('tv-settings-open');document.body.classList.add('is-fullscreen');
    window.dispatchEvent(new Event('resize'));
  }
  $('tv-close').addEventListener('click',close);
  panel.querySelectorAll('[data-tab]').forEach(element=>element.addEventListener('click',()=>{tab=element.dataset.tab;render();element.focus();touch();}));
  function move(key) {
    const active=document.activeElement,rect=active?.getBoundingClientRect();
    const nodes=Array.from(panel.querySelectorAll('button')).filter(element=>!element.disabled&&element.getClientRects().length);
    if(!rect||!panel.contains(active)){nodes[0]?.focus();return;}
    const vertical=key==='ArrowUp'||key==='ArrowDown',sign=key==='ArrowUp'||key==='ArrowLeft'?-1:1;
    let best=null,score=Infinity;
    for(const node of nodes) {
      if(node===active)continue;const box=node.getBoundingClientRect(),dx=box.left+box.width/2-rect.left-rect.width/2,dy=box.top+box.height/2-rect.top-rect.height/2;
      const forward=(vertical?dy:dx)*sign,cross=Math.abs(vertical?dx:dy);
      if(forward<2)continue;const distance=forward+cross*3;
      if(distance<score){score=distance;best=node;}
    }
    if(best){best.focus({preventScroll:true});best.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  window.clockTVRemote=key=>{
    if(key==='Escape') {
      if(panel.hidden)return false;
      if(tab==='cities'&&province){province='';render();content.querySelector('button').focus();touch();}else close();
      return true;
    }
    if(!['Enter','Menu','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return false;
    if(panel.hidden){if(key==='Enter'||key==='Menu')open();return true;}
    touch();if(key==='Menu'){close();return true;}
    if(key==='Enter'){if(panel.contains(document.activeElement))document.activeElement.click();else panel.querySelector('button').focus();}
    else move(key);
    return true;
  };
  document.addEventListener('keydown',event=>{const key=event.key==='Backspace'?'Escape':event.key===' '? 'Enter':event.key;if(window.clockTVRemote(key)){event.preventDefault();event.stopImmediatePropagation();}},true);
  panel.addEventListener('pointerdown',touch);panel.addEventListener('wheel',touch,{passive:true});
  document.addEventListener('visibilitychange',()=>{clearTimeout(idle);if(document.hidden)preview.stop();else{if(!panel.hidden)preview.start();touch();}});
  const updateStatus=()=>{$('tv-weather-status').textContent=$('weather-status').textContent;};
  new MutationObserver(updateStatus).observe($('weather-status'),{childList:true,characterData:true,subtree:true});updateStatus();
  open(true);document.body.classList.remove('tv-booting');$('tv-boot')?.remove();window.clockTVReady=true;if(window.clockTVDiagnostics)window.clockTVDiagnostics.stage='ready';
})();
