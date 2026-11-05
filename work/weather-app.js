(() => {
  'use strict';
  if(window.clockTV===true&&window.clockTVIncompatible)return;
  if(window.clockTVDiagnostics)window.clockTVDiagnostics.stage='clock-initialization';
  const $ = selector => document.querySelector(selector);
  const pad = value => String(value).padStart(2, '0');
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const secondsInput = $('#show-seconds'), secondsCluster = $('#seconds-cluster');
  const dateElement = $('#date'), weekdayElement = $('#weekday'), description = $('#clock-description');
  const fullscreen = $('#fullscreen'), status = $('#weather-status'), locateButton = $('#locate');
  const reducedMotion = window.clockMotion || matchMedia('(prefers-reduced-motion: reduce)');
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('is-fullscreen'));
  const tv=window.clockTV===true;
  const weatherCanvas=$('#weather-canvas');
  const glassDigits = tv ? null : createGlassDigits(weatherCanvas);
  const stickFigure = createStickFigure();
  const scene = createWeatherScene(weatherCanvas, reducedMotion, tv ? null : () => glassDigits.draw());
  const tiles = [...document.querySelectorAll('.tile')].map(element => ({
    element, unit:element.dataset.unit, value:null, timer:null,
    top:element.querySelector('.static.top .numeral'), bottom:element.querySelector('.static.bottom .numeral'),
    foldTop:element.querySelector('.flap.top .numeral'), foldBottom:element.querySelector('.flap.bottom .numeral')
  }));
  const REFRESH_MS = 10 * 60 * 1000;
  const knownCodes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99];
  const previewBase = {condition:'clear',variant:'',cloudCover:.12,intensity:0,wind:8,hail:false};
  const previews = [
    ['sunrise','日出',{cloudCover:.12}],
    ['noon','晴空万里',{cloudCover:0}],
    ['sunset','日落',{cloudCover:.14}],
    ['night','星空月夜',{}],
    ['cloudy','多云',{condition:'cloudy',cloudCover:.6,wind:12}],
    ['cloudy-night','多云月夜',{condition:'cloudy',cloudCover:.57,wind:14}],
    ['overcast','乌云 / 阴天',{condition:'overcast',cloudCover:1,wind:18}],
    ['fog','雾',{condition:'fog',cloudCover:.85,intensity:.8,wind:2}],
    ['drizzle','小雨 / 毛毛雨',{condition:'rain',cloudCover:.88,intensity:.12,wind:6}],
    ['rain','中雨',{condition:'rain',cloudCover:.86,intensity:.5,wind:20}],
    ['downpour','瓢泼大雨',{condition:'rain',cloudCover:1,intensity:1,wind:50}],
    ['freezing-rain','冻雨',{condition:'rain',variant:'freezing-rain',cloudCover:.9,intensity:.35,wind:14}],
    ['snow','飘雪',{condition:'snow',cloudCover:.8,intensity:.32,wind:8}],
    ['blizzard','暴雪',{condition:'snow',cloudCover:1,intensity:1,wind:55}],
    ['storm','雷雨',{condition:'storm',cloudCover:1,intensity:.8,wind:38}],
    ['hail','雷雨冰雹',{condition:'storm',cloudCover:1,intensity:1,wind:40,hail:true}],
    ['polar-day','极昼巡游',{idealPolar:'day'}],
    ['polar-night','极夜星河',{idealPolar:'night'}],
    ['few-clouds','晴间少云',{condition:'cloudy',cloudCover:.22,wind:8}]
  ];
  let previewIndex=-1, previewTimer=null, dayPreview=null, timelineAnchor=null, skyFrame=0, lastSkyFrame=0;
  let weatherBlend=null, lastBlendTime=performance.now();
  let skySampleKey='', skySample;
  let companionActivity=null;
  const settingsKey=tv?'floating-light-clock-tv':'floating-light-clock',weatherKey=tv?'floating-light-weather-tv':'floating-light-weather';
  const defaultAppearance={glass:!tv,size:tv?140:100,weight:tv?800:550,spacing:-5,font:tv?'inter':'manrope',dateSize:100,dateWeight:tv?400:500,dateSpacing:0,dateFont:'system',weekdaySize:100,weekdayWeight:tv?400:500,weekdaySpacing:0,weekdayFont:'system'};
  const fontFamilies={system:'-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',rounded:'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", sans-serif',mono:'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',serif:'ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif'};
  for(const option of document.querySelectorAll('#digit-font option[data-family]')) fontFamilies[option.value]=option.dataset.family;
  const presets={minimal:{size:100,weight:300,spacing:-5,font:'inter'},classic:{size:100,weight:500,spacing:0,font:'manrope'},rounded:{size:105,weight:650,spacing:0,font:'nunito'},mono:{size:95,weight:500,spacing:2,font:'jetbrainsmono'}};
  const settingBounds={size:[70,tv?140:500],weight:[300,800],spacing:[-8,24],companionSize:[65,tv?180:500],dateSize:[50,500],dateWeight:[300,800],dateSpacing:[-2,12],weekdaySize:[50,500],weekdayWeight:[300,800],weekdaySpacing:[-2,12],companionActivity:[1,5],companionRest:[1,5]};
  let settings = {seconds:false,companion:true,companionSize:115,companionActivity:3,companionRest:3,motionSpeed:.75,immersive:true,...defaultAppearance};
  let requestedFont='';
  const fontMeasure=document.createElement('canvas').getContext('2d');
  let timer, noticeTimer, refreshTimer, lastAttempt = 0, weatherRequest = 0, locationRequest = 0;
  let weatherController, searchController, locating = false;
  const DEFAULT_LOCATION = {latitude:30.26, longitude:120.13, label:'杭州 · 西湖区', source:'city'};
  let weather = {location:DEFAULT_LOCATION, data:null, fetchedAt:0};
  let latestScene = {phase:'unknown', condition:'clear', sunProgress:.5, cloudCover:0, intensity:0, wind:0, moonPhase:.5, moonVisible:false};
  // ponytail: preferences and weather cache are optional; storage denial must never break the clock.
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    for(const key of ['seconds','companion','glass']) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
    if(!tv&&typeof saved?.immersive==='boolean')settings.immersive=saved.immersive;
    if(!tv&&Number.isFinite(saved?.motionSpeed)&&saved.motionSpeed>=.25&&saved.motionSpeed<=3)settings.motionSpeed=saved.motionSpeed;
    for(const [key,[min,max]] of Object.entries(settingBounds)) if(Number.isFinite(saved?.[key]) && saved[key]>=min && saved[key]<=max && (!['companionActivity','companionRest'].includes(key)||Number.isInteger(saved[key]))) settings[key]=saved[key];
    for(const key of ['font','dateFont','weekdayFont'])if(Object.prototype.hasOwnProperty.call(fontFamilies,saved?.[key]))settings[key]=saved[key];
    if(!tv&&window.clockFullEffects) {
      if(saved?.effectsVersion!==1)settings.glass=settings.companion=true;
      settings.effectsVersion=1;
    }
  } catch {}
  if(tv) settings.glass=false;
  function saveSettings() { try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch {} }
  function layoutDigits() {
    const units=settings.seconds?3:2, family=fontFamilies[settings.font], spacing=settings.spacing;
    fontMeasure.font=`${settings.weight} 100px ${family}`;
    const pairWidth=Math.max(...'0123456789'.split('').map(char=>fontMeasure.measureText(char).width))*2/100;
    const stacked=!tv&&innerHeight>innerWidth&&settings.size>=180;
    document.body.classList.toggle('clock-stacked',stacked);
    const stage=$('#clock-stage'),stageWidth=!tv&&stage?stage.clientWidth:innerWidth,stageHeight=!tv&&stage?stage.clientHeight:innerHeight;
    const available=tv?innerWidth*.90:stageWidth-(isFullscreen()?Math.max(24,innerWidth*.08):24);
    if(!tv)for(const [prefix,element]of [['date',dateElement],['weekday',weekdayElement]]) {
      const base=isFullscreen()?clamp(innerWidth*(prefix==='date'?.014:.012),prefix==='date'?14:13,prefix==='date'?21:18):innerWidth<760?12:14;
      const wanted=base*settings[prefix+'Size']/100,letterSpacing=settings[prefix+'Spacing'],font=fontFamilies[settings[prefix+'Font']];
      fontMeasure.font=`${settings[prefix+'Weight']} 100px ${font}`;
      const text=element.textContent||(prefix==='date'?'2026年12月31日':'星期三'),width=fontMeasure.measureText(text).width/100;
      const fitted=Math.min(wanted,(available-Math.max(0,text.length-1)*letterSpacing)/Math.max(.1,width),stageHeight*.13);
      Object.assign(element.style,{fontSize:`${Math.max(8,fitted)}px`,fontWeight:String(settings[prefix+'Weight']),letterSpacing:`${letterSpacing}px`,fontFamily:font});
      const output=$(`#${prefix}-size-value`);if(output)output.textContent=`${settings[prefix+'Size']}%${fitted<wanted-.5?' · 已适配屏幕':''}`;
    }
    // ponytail: a vertical clock makes large sizes useful on portrait screens; fit to the real date footprint.
    const stageStyle=stage?getComputedStyle(stage):null,intro=$('.intro');
    const heightAvailable=!tv&&stage?Math.max(60,stageHeight-parseFloat(stageStyle.paddingTop)-parseFloat(stageStyle.paddingBottom)-intro.getBoundingClientRect().height-parseFloat(getComputedStyle(intro).marginBottom)-(window.calendarDemoQuoteHeight?.()||0)-28):innerHeight*.52;
    const editing=document.body.classList.contains('panel-open') && !isFullscreen();
    const desired=tv?Math.min(innerWidth*(units===3?.19:.29),innerHeight*.52)*settings.size/140:Math.min(220,stageWidth*(units===3?.16:.235),stageHeight*(stage ? .40 : editing ? .19 : .32))*settings.size/100;
    const widthLimit=stacked?(available-spacing-4)/pairWidth:(available-units*(spacing+4)-(units-1)*spacing*.65)/(units*pairWidth+(units-1)*.115);
    const heightLimit=tv?innerHeight*.52:(heightAvailable/(stacked?units:1)-16)/1.12;
    const size=Math.max(16,Math.min(desired,widthLimit,heightLimit));
    if(!tv)$('#size-value').textContent=`${settings.size}%${size<desired-.5?' · 已适配屏幕':''}`;
    const style=document.body.style;
    style.setProperty('--digit-size',`${size}px`);style.setProperty('--tile-width',`${Math.ceil(size*pairWidth+spacing+4)}px`);
    style.setProperty('--tile-height',`${Math.ceil(size*1.12+16)}px`);style.setProperty('--colon-width',`${Math.max(8,size*.115+spacing*.65)}px`);
    style.setProperty('--digit-weight',settings.weight);style.setProperty('--digit-spacing',`${spacing}px`);style.setProperty('--clock-font',family);
    for(const tile of tiles)tile.lightRect=null;
    glassDigits?.refresh();stickFigure.refresh();applyLight(latestScene);
    if(!tv){const actual=Number($('.stick-world')?.dataset.effectiveScale);$('#companion-size-value').textContent=`${settings.companionSize}%${actual>0&&actual*100<settings.companionSize-.5?' · 已适配屏幕':''}`;window.dispatchEvent(new Event('clocklayoutchange'));}
  }
  function applySettings() {
    secondsInput.checked = settings.seconds;
    secondsCluster.hidden = !settings.seconds;
    document.body.classList.toggle('seconds-hidden', !settings.seconds);
    $('#show-companion').checked=settings.companion; stickFigure.setEnabled(settings.companion);stickFigure.setScale?.(settings.companionSize/100);
    $('#companion-size').value=settings.companionSize;$('#companion-size-value').textContent=`${settings.companionSize}%`;
    if(!tv){
      stickFigure.setBehavior?.({activity:settings.companionActivity,rest:settings.companionRest});
      for(const name of ['activity','rest']){const key=name==='activity'?'companionActivity':'companionRest';$(`#companion-${name}`).value=settings[key];$(`#companion-${name}-value`).textContent=['很少','较少','适中','较多','频繁'][settings[key]-1];}
      for(const prefix of ['date','weekday'])for(const field of ['size','weight','spacing','font']){const key=prefix+field[0].toUpperCase()+field.slice(1);$(`#${prefix}-${field}`).value=settings[key];if(field!=='font')$(`#${prefix}-${field}-value`).textContent=`${settings[key]}${field==='size'?'%':field==='spacing'?' px':''}`;}
    }
    $('#use-glass').checked=settings.glass;
    document.body.classList.toggle('plain-digits',!settings.glass);glassDigits?.setEnabled(settings.glass);
    for(const key of ['size','weight','spacing']) { $(`#digit-${key}`).value=settings[key];$(`#${key}-value`).textContent=`${settings[key]}${key==='size'?'%':key==='spacing'?' px':''}`; }
    $('#digit-font').value=settings.font;
    document.querySelectorAll('[data-clock-preset]').forEach(button=>button.setAttribute('aria-pressed',String(Object.entries(presets[button.dataset.clockPreset]).every(([key,value])=>settings[key]===value))));
    layoutDigits();
    const font=`${settings.weight} 100px ${fontFamilies[settings.font]}`;
    if(document.fonts && requestedFont!==font) {
      requestedFont=font;
      document.fonts.load(font,'0123456789:').then(()=>{if(requestedFont===font) layoutDigits();}).catch(()=>{});
    }
  }
  function settle(tile,paint = false) {
    clearTimeout(tile.timer); tile.element.classList.remove('flipping');
    tile.top.textContent = tile.bottom.textContent = tile.foldTop.textContent = tile.foldBottom.textContent = tile.value;
    if(paint)glassDigits?.commitFlip?.();
  }
  function setTile(tile, value, animate) {
    if (value === tile.value) { const settling=!animate&&tile.element.classList.contains('flipping');if (!animate) settle(tile);return settling; }
    const previous = tile.value; settle(tile); tile.value = value;
    if (tv || previous === null || !animate || reducedMotion.matches) { settle(tile); return true; }
    tile.top.textContent = value; tile.bottom.textContent = previous;
    tile.foldTop.textContent = previous; tile.foldBottom.textContent = value;
    void tile.element.offsetWidth;
    tile.element.classList.add('flipping'); tile.timer = setTimeout(() => settle(tile,true), 600);
    stickFigure.onFlip(tile.unit);return true;
  }
  function applyLight(state) {
    if(tv)return;
    const light=clockLightSource({...state,motionTime:reducedMotion.matches?20:window.clockMotion?.time??performance.now()/1000},innerWidth,innerHeight);
    if(window.clockFullEffects&&light.isDay){const transmission=weatherCanvas.clockSolarTransmission??1;light.strength*=.30+.70*transmission;light.visibility*=transmission;}
    const aurora=window.clockFullEffects&&weatherCanvas.clockAuroraLight;
    if(aurora){
      const color=aurora.rgb.split(',').map(Number),amount=clamp(aurora.amount)*(1-light.daylight);
      const tint=(rgb,weight)=>rgb.split(',').map((n,i)=>Math.round(Number(n)+(color[i]-Number(n))*weight)).join(',');
      light.ambientRgb=tint(light.ambientRgb,amount*.50);light.rgb=tint(light.rgb,amount*.16);
    }
    const {x:sx,y:sy,rgb,strength,isDay:daylight,elevation}=light;
    const directional=strength*light.visibility;
    const lowSun=1-clamp(Math.sin(Math.max(0,elevation)*Math.PI/180));
    stickFigure.setLight?.(light);
    const actor=companionActivity && performance.now()-companionActivity.at<1200 ? companionActivity : null;
    const dx=actor?actor.x-sx:0,dy=actor?actor.y-sy:0,len=Math.max(1,Math.hypot(dx,dy));
    const cast=actor?{x:actor.x+dx/len*(16+lowSun*42),y:actor.y+dy/len*(16+lowSun*42),energy:actor.energy,strength:directional}:null;
    glassDigits.setCompanion?.(cast);
    document.documentElement.style.setProperty('--accent', daylight ? `rgb(${rgb})` : '#b8cced');
    document.documentElement.style.setProperty('--flip', daylight ? '#31343a' : '#171e2b');
    for (const tile of tiles) {
      // Geometry changes on resize, settings or scroll, not when the light moves.
      const rect = tile.lightRect||(tile.lightRect=tile.element.getBoundingClientRect()); if (!rect.width) continue;
      const dx = sx - rect.left - rect.width / 2, dy = sy - rect.top - rect.height / 2;
      const length = Math.max(1, Math.hypot(dx,dy));
      const style = tile.element.style;
      style.setProperty('--light-angle', `${Math.atan2(dx,-dy)*180/Math.PI}deg`);
      style.setProperty('--plain-shadow-x',`${-dx/length*2*strength}px`);style.setProperty('--plain-shadow-y',`${-dy/length*2*strength+1}px`);
      style.setProperty('--number-light', `rgb(${rgb})`);
      style.setProperty('--number-shade', `rgb(${light.ambientRgb})`);
      style.setProperty('--cast-x', `${-dx/length*(12+lowSun*23)*directional}px`);
      style.setProperty('--cast-y', `${-dy/length*(12+lowSun*23)*directional+8}px`);
      const proximity=cast?Math.exp(-Math.pow(Math.hypot(cast.x-rect.left-rect.width/2,cast.y-rect.top-rect.height/2)/Math.max(40,rect.width*.6),2)):0;
      style.setProperty('--actor-shade',String(1-proximity*.14*strength));
    }
    glassDigits.setLight(light);
    glassDigits.draw();
  }
  function weatherKind(code) {
    if (code >= 95) return ['storm',[96,99].includes(code)?'雷雨伴冰雹':code===97?'强雷雨':'雷雨'];
    if ([71,73,75,77,85,86].includes(code)) return ['snow','降雪'];
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return ['rain',[56,57,66,67].includes(code)?'冻雨':'降雨'];
    if ([45,48].includes(code)) return ['fog','雾'];
    return code === 3 ? ['overcast','阴天'] : code === 2 ? ['cloudy','多云'] : ['clear',code === 1 ? '晴间多云' : '晴'];
  }
  function updateSky(now,updateLabel=true) {
    const data=weather.data, stamp=now.getTime(), elapsed=performance.now();
    const location=weather.location||DEFAULT_LOCATION, offset=data?.utc_offset_seconds/60;
    const sampleKey=`${Math.floor(stamp/1000)}:${location.latitude}:${location.longitude}:${offset}`;
    if(sampleKey!==skySampleKey){skySampleKey=sampleKey;skySample=clockSkyAt(now,location.latitude,location.longitude,Number.isFinite(offset)?offset:undefined);}
    const realSky=skySample;
    // A failed refresh is not evidence that rain stopped: retain a recent observation.
    const fresh=data && stamp-weather.fetchedAt<6*3600000 && stamp>=weather.fetchedAt-3600000;
    const code=fresh?data.current.weather_code:0, kind=weatherKind(code);
    const observed=fresh?{condition:kind[0],variant:[56,57,66,67].includes(code)?'freezing-rain':'',hail:[96,99].includes(code),cloudCover:clamp(data.current.cloud_cover/100),intensity:code>=51?clamp(data.current.precipitation/5,.16,1):0,wind:data.current.wind_speed_10m}:realSky;
    const selected=previewIndex<0?observed:{...previewBase,...previews[previewIndex][2]};
    const polar=previewIndex<0?'':previews[previewIndex][2].idealPolar||'';
    let sky=realSky;
    if(dayPreview || timelineAnchor || polar) {
      const progress=dayPreview?dayPreview.progress+(elapsed-dayPreview.started)/60000:timelineAnchor?timelineAnchor.progress+(elapsed-timelineAnchor.started)/86400000:(now.getHours()*3600+now.getMinutes()*60+now.getSeconds())/86400;
      sky=clockIdealSky(progress,elapsed/1000,polar);sky.idealCycle=!!dayPreview;
    }
    const target={cloudCover:selected.cloudCover,intensity:selected.intensity,wind:selected.wind,
      rainAmount:['rain','storm'].includes(selected.condition)?1:0,snowAmount:selected.condition==='snow'?1:0,
      fogAmount:selected.condition==='fog'?1:0,stormAmount:selected.condition==='storm'?1:0,
      hailAmount:selected.hail?1:0,overcastAmount:selected.condition==='overcast'?1:0};
    // One shared blend drives the sky, glyph lighting and companion; no weather owns the clock.
    window.calendarDemoTermWeather?.(target,now);
    if(!weatherBlend)weatherBlend={...target};
    const blend=tv||reducedMotion.matches?1:1-Math.exp(-Math.min(1000,Math.max(0,elapsed-lastBlendTime))/1800);
    for(const key of Object.keys(target))weatherBlend[key]+=(target[key]-weatherBlend[key])*blend;
    lastBlendTime=elapsed;
    latestScene={...sky,...weatherBlend,condition:selected.condition,variant:selected.variant||'',hail:!!selected.hail,enhancedSky:true};
    document.body.dataset.phase=latestScene.phase;document.body.dataset.weather=latestScene.condition;
    document.body.dataset.preview=dayPreview?'day-cycle':previewIndex<0?'live':previews[previewIndex][0];
    $('.weather-info').classList.toggle('preview-active',previewIndex>=0);
    if(dayPreview && !tv) {
      const hour=latestScene.dayProgress*24,period=hour<5?'深夜':hour<7?'晨曦':hour<10?'上午':hour<16?'日间':hour<19?'暮色':'月夜';
      $('#day-cycle-time').textContent=`${pad(Math.floor(hour))}:${pad(Math.floor(hour%1*60))}`;
      $('#day-cycle-progress').style.width=`${((elapsed-dayPreview.started)%60000)/600}%`;
      $('#day-cycle-label').textContent=`${previewIndex<0?(fresh?kind[1]:'晴天'):previews[previewIndex][1]} · ${period} · 昼夜快放`;
    }
    scene.setState(latestScene);applyLight(latestScene);stickFigure.setState(latestScene);
    if(!updateLabel)return;
    const stale=weather.fetchedAt && stamp-weather.fetchedAt>REFRESH_MS*2;
    $('#weather-age').textContent=weather.fetchedAt?`${stale?'上次获取（已过期）':'最近获取'} ${new Date(weather.fetchedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · 每 10 分钟刷新`:`每 10 分钟刷新天气 · ${tv?'云和天气持续移动':'光影随时间连续变化'}`;
  }
  function queueTVSky() {
    clearTimeout(skyFrame);
    // Simple weather motion owns its timer; civil sky positions need no frame-by-frame polling.
    if(!document.hidden)skyFrame=setTimeout(()=>{updateSky(new Date(),false);queueTVSky();},dayPreview?250:30000);
  }
  function animateSky(stamp) {
    skyFrame=0;if(document.hidden)return;
    const ideal=dayPreview||(previewIndex>=0&&previews[previewIndex][2].idealPolar);
    // ponytail: particles own their animation clock; solar state and CSS lighting only need eight updates a second.
    const interval=reducedMotion.matches?1000:tv?(document.body.classList.contains('tv-settings-open')?250:100):window.clockFullEffects?125:ideal?33:100;
    if(stamp-lastSkyFrame>=interval){lastSkyFrame=stamp;updateSky(new Date(),false);}
    skyFrame=requestAnimationFrame(animateSky);
  }
  function stopDayPreview(){dayPreview=null;timelineAnchor=null;$('#day-cycle').innerHTML='<span aria-hidden="true">▶</span> 昼夜快放 <small>60 秒</small>';$('#day-cycle').setAttribute('aria-pressed','false');$('#day-cycle-status').hidden=true;}
  $('#day-cycle').addEventListener('click',()=>{
    if(isFullscreen())return;
    if(dayPreview){stopDayPreview();tick(false);return;}
    pausePreview();closeAppearance();gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');syncPanels();
    const started=performance.now(),progress=timelineAnchor?timelineAnchor.progress+(started-timelineAnchor.started)/86400000:.25;
    dayPreview={started,progress};
    $('#day-cycle').innerHTML='<span aria-hidden="true">■</span> 停止快放 <small>60 秒 / 天</small>';$('#day-cycle').setAttribute('aria-pressed','true');$('#day-cycle-status').hidden=false;
    tick(false);
  });
  document.addEventListener('companionactivity',event=>{
    const value=event.detail;
    if(value&&[value.x,value.y,value.energy].every(Number.isFinite)) companionActivity={...value,energy:clamp(value.energy),at:performance.now()};
  });
  function render(animate = true) {
    const now = new Date(), values = {hours:pad(now.getHours()),minutes:pad(now.getMinutes()),seconds:pad(now.getSeconds())};
    let changed=false;
    tiles.forEach(tile => {if(setTile(tile,values[tile.unit],animate && (tile.unit !== 'seconds' || settings.seconds)))changed=true;});
    if(changed)glassDigits?.commitFlip?.();
    if(window.clockFullEffects) {
      const next=new Date(now.getTime()+1000),upcoming={hours:pad(next.getHours()),minutes:pad(next.getMinutes()),seconds:pad(next.getSeconds())};
      for(const tile of tiles)if(tile.unit!=='seconds'||settings.seconds)glassDigits?.prepareNext?.(tile.element,upcoming[tile.unit]);
    }
    const displayDate=window.calendarDemoNow?.()||now;
    const key = `${displayDate.getFullYear()}-${pad(displayDate.getMonth()+1)}-${pad(displayDate.getDate())}`;
    if (dateElement.dateTime !== key) {
      dateElement.dateTime = key; dateElement.textContent = displayDate.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
      weekdayElement.textContent = displayDate.toLocaleDateString('zh-CN',{weekday:'long'});
      if(!tv)layoutDigits();
    }
    description.textContent = `${dateElement.textContent} ${weekdayElement.textContent} ${values.hours}时${values.minutes}分${settings.seconds ? values.seconds+'秒' : ''}`;
    const offset = -now.getTimezoneOffset();
    $('#timezone').textContent = `本地时间 · UTC${offset<0?'−':'+'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
    updateSky(now);
  }
  function tick(animate = true) { clearTimeout(timer); if(document.hidden) return; render(animate); if(tv)queueTVSky(); const interval=tv&&!settings.seconds?60000:1000; timer = setTimeout(tick,interval-Date.now()%interval+12); }
  const gallery=$('#weather-gallery'), previewGrid=$('#preview-grid');
  const appearance=$('#appearance-panel');
  function syncPanels() {document.body.classList.toggle('panel-open',!appearance.hidden||!gallery.hidden);layoutDigits();}
  function closeAppearance() {appearance.hidden=true;$('#appearance-toggle').setAttribute('aria-expanded','false');syncPanels();}
  $('#appearance-toggle').addEventListener('click',()=>{
    if(isFullscreen())return;
    const show=appearance.hidden;appearance.hidden=!show;$('#appearance-toggle').setAttribute('aria-expanded',String(show));
    if(show){gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');$('#digit-font').focus({preventScroll:true});}
    syncPanels();
  });
  $('#appearance-close').addEventListener('click',()=>{if(!isFullscreen()){closeAppearance();$('#appearance-toggle').focus();}});
  for(const key of ['size','weight','spacing','font']) $(`#digit-${key}`).addEventListener('input',event=>{
    if(isFullscreen()){applySettings();return;}
    const value=key==='font'?event.target.value:Number(event.target.value);
    if(key==='font'?!Object.prototype.hasOwnProperty.call(fontFamilies,value):!Number.isFinite(value)||value<settingBounds[key][0]||value>settingBounds[key][1])return;
    settings[key]=value;applySettings();saveSettings();tick(false);
  });
  $('#companion-size').addEventListener('input',event=>{if(isFullscreen()){applySettings();return;}const value=Number(event.target.value);if(!Number.isFinite(value)||value<65||value>settingBounds.companionSize[1])return;settings.companionSize=value;applySettings();saveSettings();});
  if(!tv){
    for(const prefix of ['date','weekday'])for(const field of ['size','weight','spacing','font'])$(`#${prefix}-${field}`).addEventListener('input',event=>{
      if(isFullscreen()){applySettings();return;}const key=prefix+field[0].toUpperCase()+field.slice(1),value=field==='font'?event.target.value:Number(event.target.value);
      if(field==='font'?!Object.prototype.hasOwnProperty.call(fontFamilies,value):!Number.isFinite(value)||value<settingBounds[key][0]||value>settingBounds[key][1])return;
      settings[key]=value;applySettings();saveSettings();
      if(field==='font'&&document.fonts)document.fonts.load(`${settings[prefix+'Weight']} 100px ${fontFamilies[value]}`,'0123456789').then(layoutDigits).catch(()=>{});
    });
    for(const name of ['activity','rest'])$(`#companion-${name}`).addEventListener('input',event=>{if(isFullscreen()){applySettings();return;}const value=Number(event.target.value);if(!Number.isInteger(value)||value<1||value>5)return;settings[name==='activity'?'companionActivity':'companionRest']=value;applySettings();saveSettings();});
  }
  $('#use-glass').addEventListener('change',event=>{if(isFullscreen()){applySettings();return;}settings.glass=!tv&&event.target.checked;applySettings();saveSettings();tick(false);});
  document.querySelectorAll('[data-clock-preset]').forEach(button=>button.addEventListener('click',()=>{if(isFullscreen())return;Object.assign(settings,presets[button.dataset.clockPreset]);applySettings();saveSettings();tick(false);}));
  $('#appearance-reset').addEventListener('click',()=>{if(isFullscreen())return;Object.assign(settings,defaultAppearance,tv?{}:{companionSize:115,companionActivity:3,companionRest:3});applySettings();saveSettings();tick(false);});
  function pausePreview() {
    clearInterval(previewTimer);previewTimer=null;
    $('#preview-play').textContent='自动轮播';$('#preview-play').setAttribute('aria-pressed','false');
  }
  function choosePreview(index,seek=true) {
    if(isFullscreen()) return;
    previewIndex=index;
    if(index<0)timelineAnchor=null;
    const anchors={sunrise:.25,noon:.5,sunset:.75,night:.875,'cloudy-night':.875};
    const anchor=index>=0?anchors[previews[index][0]]:undefined;
    if(seek && anchor!==undefined) {
      timelineAnchor={progress:anchor,started:performance.now()};
      if(dayPreview)dayPreview.progress=anchor-(performance.now()-dayPreview.started)/60000;
    }
    $('#preview-mode').hidden=index<0;
    $('#preview-name').textContent=index<0 ? '' : `效果预览 · ${previews[index][1]}`;
    $('#gallery-current').textContent=index<0 ? '实时天气' : `正在预览：${previews[index][1]}`;
    $('.weather-info').classList.toggle('preview-active',index>=0);
    previewGrid.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preview===previews[index]?.[0])));
    tick(false);
  }
  previews.forEach(([id,label],index)=>{
    const button=document.createElement('button');button.type='button';button.dataset.preview=id;
    button.className='preview-option';button.textContent=label;button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{if(isFullscreen())return;pausePreview();choosePreview(index);});previewGrid.append(button);
  });
  $('#weather-browse').addEventListener('click',()=>{
    if(isFullscreen())return;
    closeAppearance();
    gallery.hidden=!gallery.hidden;$('#weather-browse').setAttribute('aria-expanded',String(!gallery.hidden));
    if(!gallery.hidden) (previewGrid.querySelector(`[data-preview="${previews[Math.max(0,previewIndex)][0]}"]`)).focus({preventScroll:true});
    syncPanels();
  });
  $('#gallery-close').addEventListener('click',()=>{
    if(isFullscreen())return;
    gallery.hidden=true;$('#weather-browse').setAttribute('aria-expanded','false');
    syncPanels();$('#weather-browse').focus();
  });
  document.querySelectorAll('[data-return-live]').forEach(button=>button.addEventListener('click',()=>{if(!isFullscreen()){pausePreview();choosePreview(-1);}}));
  $('#preview-play').addEventListener('click',()=>{
    if(isFullscreen())return;
    if(previewTimer){pausePreview();return;}
    const sequence=previews.map((_,index)=>index).filter(index=>previews[index][0]==='noon'||previews[index][2].condition&&previews[index][0]!=='cloudy-night');
    const nextWeather=()=>choosePreview(sequence[(sequence.indexOf(previewIndex)+1)%sequence.length],false);
    nextWeather();
    $('#preview-play').textContent='暂停轮播';$('#preview-play').setAttribute('aria-pressed','true');
    previewTimer=setInterval(()=>{if(!document.hidden&&!isFullscreen())nextWeather();},5000);
  });
  function validLocation(value) {
    return value && Number.isFinite(value.latitude) && Math.abs(value.latitude)<=90 && Number.isFinite(value.longitude) && Math.abs(value.longitude)<=180 && ['device','city'].includes(value.source);
  }
  function validateWeather(data) {
    const c=data?.current, d=data?.daily;
    if (!c || !d || !knownCodes.includes(c.weather_code) || ![0,1].includes(c.is_day) || ![c.time,c.cloud_cover,c.precipitation,c.wind_speed_10m].every(Number.isFinite) || c.cloud_cover<0 || c.cloud_cover>100 || c.precipitation<0 || c.wind_speed_10m<0) throw Error('天气数据不完整');
    if (!Array.isArray(d.time) || !d.time.length || !d.time.every(Number.isFinite) || !['sunrise','sunset','moonrise','moonset','moon_phase'].every(key => Array.isArray(d[key]) && d[key].length===d.time.length && d[key].every(v => v===null || Number.isFinite(v)))) throw Error('日月数据不完整');
    return data;
  }
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if(document.hidden) scheduleRefresh(); else refreshWeather(); }, REFRESH_MS); }
  async function loadWeather() {
    const location=weather.location; if(!validLocation(location)) return;
    const request=++weatherRequest; weatherController?.abort(); weatherController=new AbortController();
    const controller=weatherController, timeout=setTimeout(()=>controller.abort(),15000);
    lastAttempt=Date.now(); status.textContent=`${location.label} · 正在更新天气…`; scheduleRefresh();
    try {
      const data=validateWeather(await clockFetchWeather(location,{signal:controller.signal}));if(request!==weatherRequest)return;
      weather={location,data,fetchedAt:Date.now()};
      try {localStorage.setItem(weatherKey,JSON.stringify(weather));} catch {}
      status.textContent=`${location.label} · ${weatherKind(data.current.weather_code)[1]}`;
      const credit=$('#weather-source');credit.textContent=data.providerName||'Open-Meteo';credit.href=data.providerId==='cma'?'https://weather.cma.cn/':'https://open-meteo.com/';$('#weather-source-detail').textContent=data.detail?` · ${data.detail}`:'';
      tick(false);
    } catch(error) {
      if(request!==weatherRequest) return;
      status.textContent=weather.data&&Date.now()-weather.fetchedAt<6*3600000?`${location.label} · 暂时无法更新，沿用上次天气`:`${location.label} · 天气暂时无法更新，离线晴天 · 日月位置跟随当地时间`;tick(false);
    } finally {clearTimeout(timeout);}
  }
  function selectLocation(location) {
    const changed=!weather.location || location.latitude!==weather.location.latitude || location.longitude!==weather.location.longitude;
    weather.location=location;
    if(changed) {weather.data=null;weather.fetchedAt=0;}
    tick(false); loadWeather();
  }
  if(tv) window.addEventListener('clocktvlocation',event=>{
    const location=event.detail;
    if(validLocation(location)&&location.source==='city'&&typeof location.label==='string'&&location.label.length<=120)
      selectLocation({latitude:location.latitude,longitude:location.longitude,label:location.label,source:'city'});
  });
  function locate(manual = true) {
    if(locating && !manual) return;
    const request=++locationRequest; locating=true; locateButton.disabled=true;
    status.textContent='正在获取当地位置…';
    const failure=error => {
      if(request!==locationRequest) return;
      locating=false;locateButton.disabled=false;
      const message=error?.code===1 ? '定位未获允许，可在浏览器中允许定位，或手动选择城市。' : '暂时无法定位，可重试或手动选择城市。';
      if(manual) {
        const notice=$('#notice');notice.textContent=message;notice.hidden=false;
        clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.hidden=true,7000);
      }
      if(weather.location) {loadWeather();status.textContent=message+' 正沿用上次位置查询。';}
      else {status.textContent=message;$('#city-form').hidden=false;$('#city-toggle').setAttribute('aria-expanded','true');}
    };
    if(!navigator.geolocation || !window.isSecureContext) {failure();return;}
    navigator.geolocation.getCurrentPosition(position => {
      if(request!==locationRequest) return;
      locating=false;locateButton.disabled=false;
      // Weather grids do not need exact coordinates; send only about 1 km precision.
      const location={latitude:Math.round(position.coords.latitude*100)/100,longitude:Math.round(position.coords.longitude*100)/100,label:'当前位置',source:'device'};
      if(!validLocation(location)) {failure();return;} selectLocation(location);
    },failure,{enableHighAccuracy:false,timeout:12000,maximumAge:REFRESH_MS});
  }
  function refreshWeather() { if(weather.location?.source==='city') loadWeather(); else if(weather.location) locate(false); }
  const cityForm=$('#city-form'), cityResults=$('#city-results');
  $('#city-toggle').addEventListener('click',() => {
    if(isFullscreen()) return;
    cityForm.hidden=!cityForm.hidden;$('#city-toggle').setAttribute('aria-expanded',String(!cityForm.hidden));
    if(!cityForm.hidden) $('#city-name').focus();
  });
  cityForm.addEventListener('submit',async event => {
    event.preventDefault(); if(isFullscreen()) return;
    const name=$('#city-name').value.trim(); if(name.length<2) {cityResults.textContent='请输入至少两个字的城市名。';return;}
    searchController?.abort(); const controller=searchController=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
    cityResults.textContent='正在查找城市…';
    try {
      const local=clockFindLocalCities(name);
      let data={results:local};
      if(!local.length){
        const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name,count:'5',language:'zh',format:'json'})}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw Error();data=await response.json();
      }
      if(searchController!==controller)return;
      const results=(Array.isArray(data.results)?data.results:[]).filter(item=>validLocation({...item,source:'city'}));
      cityResults.replaceChildren(); if(!results.length) cityResults.textContent='没有找到，可试试城市英文名。';
      results.forEach(item=>{
        const button=document.createElement('button');button.type='button';button.className='city-result';
        const label=[item.name,item.admin1,item.country].filter(v=>typeof v==='string').join(' · ');
        button.textContent=label;
        button.addEventListener('click',()=>{
          if(isFullscreen()) return;
          ++locationRequest;locating=false;locateButton.disabled=false;
          selectLocation({latitude:Math.round(item.latitude*100)/100,longitude:Math.round(item.longitude*100)/100,label,source:'city'});
          cityForm.hidden=true;$('#city-toggle').setAttribute('aria-expanded','false');
        });cityResults.append(button);
      });
    } catch {if(searchController===controller) cityResults.textContent='城市查询暂不可用，请稍后重试。';} finally {clearTimeout(timeout);}
  });
  secondsInput.addEventListener('change',()=>{if(isFullscreen()){applySettings();return;}settings.seconds=secondsInput.checked;applySettings();saveSettings();tick(false);});
  $('#show-companion').addEventListener('change',event=>{if(isFullscreen()){applySettings();return;}settings.companion=event.target.checked;applySettings();saveSettings();});
  locateButton.addEventListener('click',()=>{if(!isFullscreen()) locate();});
  document.addEventListener('visibilitychange',()=>{if(tv)clearTimeout(skyFrame);else{cancelAnimationFrame(skyFrame);skyFrame=requestAnimationFrame(animateSky);}tick(false);if(!document.hidden && Date.now()-lastAttempt>=REFRESH_MS) refreshWeather();});
  window.addEventListener('offline',()=>{status.textContent=weather.data&&Date.now()-weather.fetchedAt<6*3600000?`${weather.location.label} · 已离线，沿用上次天气`:`${weather.location.label} · 离线晴天 · 日月位置跟随当地时间`;tick(false);});
  window.addEventListener('online',()=>{if(weather.location) loadWeather();});
  window.addEventListener('pageshow',()=>tick(false));
  window.addEventListener('resize',layoutDigits);
  window.addEventListener('scroll',()=>{for(const tile of tiles)tile.lightRect=null;},{passive:true});
  reducedMotion.addEventListener('change',()=>tick(false));
  function syncFullscreen(active) {
    if(active) pausePreview();
    document.body.classList.toggle('is-fullscreen',active);
    document.querySelectorAll('.editor-only').forEach(element=>element.inert=active);
    fullscreen.setAttribute('aria-pressed',String(active));
    window.scrollTo(0,0); glassDigits?.refresh(); tick(false);
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  fullscreen.addEventListener('click',async()=>{
    const enter=document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    // ponytail: older iPad browsers use an in-page immersive view when native fullscreen is unavailable.
    try {if(!enter) throw Error(); await enter.call(document.documentElement);}
    catch {syncFullscreen(true);}
  });
  for(const name of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(name,()=>syncFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement)));
  async function exitFullscreen() {
    const exit=document.exitFullscreen || document.webkitExitFullscreen;
    if((document.fullscreenElement || document.webkitFullscreenElement) && exit) {try {await exit.call(document);} catch {}}
    else syncFullscreen(false);
  }
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(isFullscreen())exitFullscreen();
    else if(!tv){if(!appearance.hidden)$('#appearance-close').click();else if(!gallery.hidden)$('#gallery-close').click();else if(!cityForm.hidden)$('#city-toggle').click();}
  });
  document.addEventListener('dblclick',event=>{if(isFullscreen() && !event.target.closest('button,input,label,a')) exitFullscreen();});
  let lastTouch=null;
  document.addEventListener('pointerup',event=>{
    if(event.pointerType!=='touch' || !isFullscreen() || event.target.closest('button,input,label,a')) return;
    const touch={x:event.clientX,y:event.clientY,time:performance.now()};
    if(lastTouch && touch.time-lastTouch.time<340 && Math.hypot(touch.x-lastTouch.x,touch.y-lastTouch.y)<24) {lastTouch=null;exitFullscreen();}
    else lastTouch=touch;
  });
  try {
    const cached=JSON.parse(localStorage.getItem(weatherKey));
    if(validLocation(cached?.location)) {
      weather.location={...cached.location,label:typeof cached.location.label==='string'?cached.location.label:'上次位置'};
      if(Number.isFinite(cached.fetchedAt) && Date.now()-cached.fetchedAt<6*3600000 && cached.fetchedAt<=Date.now()+60000) {
        weather.data=validateWeather(cached.data);weather.fetchedAt=cached.fetchedAt;
        status.textContent='显示上次天气，正在更新…';
      }
    }
  } catch {}
  if(!tv&&window.clockQuality) {
    const qualityInput=$('#render-quality'),qualityStatus=$('#quality-status');
    const speedInput=$('#motion-speed'),immersiveInput=$('#immersive-sky');
    const syncMotion=()=>{
      window.clockMotion.speed=settings.motionSpeed;window.clockMotion.immersive=settings.immersive;
      speedInput.value=settings.motionSpeed;$('#motion-speed-value').textContent=`${Number(settings.motionSpeed.toFixed(2))}×`;
      immersiveInput.checked=settings.immersive;
      $('#immersive-status').textContent=!settings.immersive?'显示常规天气天空。':'银河、行星、极光与云海穿行已启用 · 所有画质可用。';
    };
    const syncQuality=()=>{qualityInput.value=clockQuality.mode;const capacity=clockQuality.device.source==='default'?'自动':`约 ${Math.round(clockQuality.device.ramMB/1024)}GB`;qualityStatus.textContent=`${capacity} · ${clockQuality.name}`;syncMotion();};
    qualityInput.addEventListener('change',()=>{if(isFullscreen()){syncQuality();return;}clockQuality.setMode(qualityInput.value);});
    speedInput.addEventListener('input',()=>{const value=Number(speedInput.value);if(!isFullscreen()&&Number.isFinite(value)&&value>=.25&&value<=3){settings.motionSpeed=value;saveSettings();}syncMotion();});
    immersiveInput.addEventListener('change',()=>{if(!isFullscreen()){settings.immersive=immersiveInput.checked;saveSettings();}syncMotion();});
    window.addEventListener('clockqualitychange',syncQuality);syncQuality();
  }
  applySettings();tick(false);if(!tv)skyFrame=requestAnimationFrame(animateSky);
  if(!tv&&window.clockFullEffects)saveSettings();
  if(weather.location?.source==='city') loadWeather();else locate(false);
  window.clockAppReady=true;
  if(tv&&window.clockTVDiagnostics)window.clockTVDiagnostics.stage='controls-initialization';
})();
