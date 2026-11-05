// Run: node work/check-tv-controls.cjs. Remote controls on desktop Chromium, not real-TV performance.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const html=fs.readFileSync('outputs/glass-clock-tv.html','utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH}),results=[];
 try {
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:3840,height:2160}]) {
   const page=await browser.newPage({viewport,deviceScaleFactor:1,timezoneId:'Asia/Shanghai'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   if(viewport.width===1280)await page.addInitScript(()=>{
    for(const [object,key]of [[Object,'hasOwn'],[Object,'fromEntries'],[Element.prototype,'replaceChildren'],[MediaQueryList.prototype,'addEventListener'],[MediaQueryList.prototype,'removeEventListener']])Object.defineProperty(object,key,{value:undefined,writable:true,configurable:true});
   });
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fulfill({contentType:'text/html',body:html}):route.abort());
   await page.clock.install({time:new Date('2026-10-16T12:00:00+08:00')});await page.clock.pauseAt(new Date('2026-10-16T12:00:30+08:00'));
   await page.goto('http://127.0.0.1:8765/glass-clock-tv.html');await page.clock.runFor(200);
   assert.equal(await page.evaluate(()=>window.clockTVReady&&window.clockAppReady),true,'TV/app bootstrap');
   assert(await page.locator('#tv-panel').isVisible());
   const press=async key=>{await page.keyboard.press(key);};
   const tab=async name=>{await travel(`[data-tab="${name}"]`);await press('Enter');};
   // Discover actual remote transitions; then replay the returned path with physical keyboard events.
   async function travel(selector) {
    const route=await page.evaluate(selector=>{
     const panel=document.querySelector('#tv-panel'),nodes=Array.from(panel.querySelectorAll('button')).filter(node=>!node.disabled&&node.getClientRects().length);
     const start=document.activeElement,target=panel.querySelector(selector);if(!target)throw Error('Missing target '+selector);
     const scroller=document.querySelector('#tv-content'),originalScroll=scroller.scrollTop;
     const stamp=(node,scroll)=>nodes.indexOf(node)+'@'+Math.round(scroll),queue=[[start,originalScroll,[]]],seen=new Set([stamp(start,originalScroll)]);
     while(queue.length){const [node,scroll,path]=queue.shift();if(node===target){start.focus({preventScroll:true});scroller.scrollTop=originalScroll;return path;}
      for(const key of ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft']){scroller.scrollTop=scroll;node.focus({preventScroll:true});window.clockTVRemote(key);const next=document.activeElement,nextScroll=scroller.scrollTop,id=stamp(next,nextScroll);if(nodes.includes(next)&&!seen.has(id)){seen.add(id);queue.push([next,nextScroll,path.concat(key)]);}}
     }
     start.focus();throw Error('Unreachable from remote: '+selector);
    },selector);
    for(const key of route)await press(key);
    assert(await page.locator('#tv-panel').locator(selector).evaluate(node=>node===document.activeElement),'keyboard path did not reach '+selector);
   }
   async function allReachable() {
    return page.evaluate(()=>{
     const panel=document.querySelector('#tv-panel'),nodes=Array.from(panel.querySelectorAll('button')).filter(node=>!node.disabled&&node.getClientRects().length),start=document.activeElement;
     const queue=[start],seen=new Set([start]);
     while(queue.length){const node=queue.shift();for(const key of ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft']){node.focus();window.clockTVRemote(key);const next=document.activeElement;if(nodes.includes(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}}
     start.focus();return {count:nodes.length,unreachable:nodes.filter(node=>!seen.has(node)).map(node=>node.textContent)};
    });
   }
   let graph=await allReachable();assert.deepEqual(graph.unreachable,[],'display remote graph');
   const initialSize=Number(await page.locator('#digit-size').inputValue());
   await travel('[aria-label="增大数字大小"]');await press('Enter');assert.equal(Number(await page.locator('#digit-size').inputValue()),Math.min(140,initialSize+5));
   await travel('[aria-label="减小数字大小"]');for(let i=0;i<20;i++)await press('Enter');assert.equal(await page.locator('#digit-size').inputValue(),'70');
   await travel('[aria-label="增大数字大小"]');for(let i=0;i<20;i++)await press('Enter');assert.equal(await page.locator('#digit-size').inputValue(),'140');
   for(const [label,id]of [['数字粗细','digit-weight'],['数字间距','digit-spacing'],['火柴人大小','companion-size']]){
    const before=Number(await page.locator('#'+id).inputValue()),min=Number(await page.locator('#'+id).getAttribute('min')),direction=before>min?'减小':'增大';await travel(`[aria-label="${direction}${label}"]`);await press('Enter');assert.notEqual(Number(await page.locator('#'+id).inputValue()),before,label+' step button');
   }
   const lite=await page.evaluate(()=>window.clockTVLite===true);
   if(lite)assert.equal(await page.locator('[data-toggle="use-glass"]').count(),0,'lightweight TV must not expose an unsupported glass toggle');
   else {const beforeGlass=await page.locator('#use-glass').isChecked();await travel('[data-toggle="use-glass"]');await press('Enter');assert.equal(await page.locator('#use-glass').isChecked(),!beforeGlass);await press('Enter');}
   await tab('fonts');graph=await allReachable();assert.deepEqual(graph.unreachable,[],'fonts remote graph');assert.equal(await page.locator('[data-font]').count(),12);
   await travel('[data-font="nunito"]');await press('Enter');assert.equal(await page.locator('#digit-font').inputValue(),'nunito');
   await tab('weather');graph=await allReachable();assert.deepEqual(graph.unreachable,[],'weather remote graph');assert.equal(await page.locator('#tv-panel [data-weather]').count(),18);
   await travel('#tv-day-cycle');await press('Enter');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true');
   await travel('[data-weather="rain"]');await press('Enter');assert.equal(await page.locator('.preview-option[data-preview="rain"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true','rain selection reset timeline');
   await travel('#tv-live-weather');await press('Enter');assert.equal(await page.locator('#day-cycle').getAttribute('aria-pressed'),'true','live weather reset timeline');
   await tab('cities');graph=await allReachable();assert.deepEqual(graph.unreachable,[],'province remote graph');
   await travel('[data-region="AZJ"]');await press('Enter');graph=await allReachable();assert.deepEqual(graph.unreachable,[],'city remote graph');
   assert(await page.locator('#tv-content').textContent().then(text=>text.includes('浙江')));await press('Escape');assert(await page.locator('[data-region="AZJ"]').isVisible());
   await travel('[data-city="杭州 · 西湖区"]');await press('Enter');assert.match(await page.locator('#weather-status').textContent(),/杭州/);
   await tab('display');await page.clock.runFor(200);
   const geometry=await page.evaluate(()=>({
    panel:(()=>{const r=document.querySelector('#tv-panel').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};})(),
    buttonHeights:Array.from(document.querySelectorAll('#tv-panel button')).filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height),
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
    sliders:Array.from(document.querySelectorAll('input[type="range"]')).filter(n=>n.getClientRects().length).length,
    background:(()=>{const c=document.querySelector('#weather-canvas');return {width:c.width,height:c.height};})(),
    toggles:Array.from(document.querySelectorAll('.tv-toggles button')).map(button=>{const box=button.getBoundingClientRect(),css=getComputedStyle(button),range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect();return {label:button.textContent,top:box.top,bottom:box.bottom,left:box.left,right:box.right,textLeft:text.left,textRight:text.right,lines:range.getClientRects().length,paddingLeft:parseFloat(css.paddingLeft),paddingRight:parseFloat(css.paddingRight)};}),
    steppers:(()=>{const content=document.querySelector('#tv-content').getBoundingClientRect();return Array.from(document.querySelectorAll('.tv-stepper')).map(row=>{const box=row.getBoundingClientRect();return {label:row.querySelector('span').textContent,top:box.top,bottom:box.bottom,visible:box.top>=content.top&&box.bottom<=content.bottom};});})(),
    preview:(()=>{const frame=document.querySelector('.tv-preview-frame').getBoundingClientRect(),canvas=document.querySelector('#tv-preview-canvas'),box=canvas.getBoundingClientRect();return {frame:{width:frame.width,height:frame.height,left:frame.left,right:frame.right,top:frame.top,bottom:frame.bottom},css:{width:box.width,height:box.height},pixels:{width:canvas.width,height:canvas.height}};})()
   }));
   assert(geometry.panel.left>=0&&geometry.panel.top>=0&&geometry.panel.right<=viewport.width&&geometry.panel.bottom<=viewport.height);
   assert(geometry.panel.left>=viewport.width*.039&&viewport.width-geometry.panel.right>=viewport.width*.039&&geometry.panel.top>=viewport.height*.039&&viewport.height-geometry.panel.bottom>=viewport.height*.039,'4 percent TV safe margins');
   assert.equal(geometry.toggles.length,lite?2:3);assert(Math.max(...geometry.toggles.map(t=>t.top))-Math.min(...geometry.toggles.map(t=>t.top))<1,'toggles must share one row');
   for(const toggle of geometry.toggles){assert.equal(toggle.lines,1,toggle.label+' wraps');assert(toggle.textLeft>=toggle.left+toggle.paddingLeft-1&&toggle.textRight<=toggle.right-toggle.paddingRight+1,toggle.label+' text clips');}
   assert.equal(geometry.steppers.length,4);assert(geometry.steppers.every(row=>row.visible),'all four steppers must be fully visible before scrolling');
   // A one-pixel border may add at most two display pixels; the copied canvas itself is exactly 16:9.
   assert(Math.abs(geometry.preview.frame.height-geometry.preview.frame.width*9/16)<=2.5,'preview frame ratio');assert(Math.abs(geometry.preview.css.height-geometry.preview.css.width*9/16)<=2.5,'preview CSS ratio');assert.equal(geometry.preview.pixels.width*9,geometry.preview.pixels.height*16,'preview pixel ratio');
   assert(geometry.preview.frame.left>=geometry.panel.left&&geometry.preview.frame.right<=geometry.panel.right&&geometry.preview.frame.top>=geometry.panel.top&&geometry.preview.frame.bottom<=geometry.panel.bottom,'preview fits safe panel');
   assert(Math.min(...geometry.buttonHeights)>=54);assert.equal(geometry.sliders,0);assert.equal(geometry.horizontalOverflow,false);
   assert(geometry.background.width*geometry.background.height<=1920*1080,'weather canvas exceeds TV pixel budget');
   if(viewport.width===1920)await page.screenshot({path:'work/tv-settings-qa.png'});
   if(viewport.width===3840)await page.screenshot({path:'work/tv-settings-4k-qa.png'});
   await page.clock.fastForward(15100);assert.equal(await page.locator('#tv-panel').isVisible(),false,'idle did not hide settings');
   assert.equal(await page.locator('.editor-only:visible').count(),0);assert.equal(await page.locator('.stick-world').count(),1);
   await press('Enter');assert(await page.locator('#tv-panel').isVisible(),'confirm cannot restore controls');
   await press('Escape');assert.equal(await page.locator('#tv-panel').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.clockTVRemote('Escape')),false,'return from full clock must be unhandled so native shell can exit');
   if(viewport.width===1280){
    await page.clock.fastForward(61000);await page.clock.runFor(650);
    assert.equal(await page.locator('.tile[data-unit="minutes"] .static.top .numeral').textContent(),await page.evaluate(()=>String(new Date().getMinutes()).padStart(2,'0')),'minute boundary must update TV clock');
    await page.evaluate(()=>{window.__clockTextMutations=0;window.__clockTextObserver=new MutationObserver(records=>{window.__clockTextMutations+=records.length;});window.__clockTextObserver.observe(document.querySelector('.clock'),{childList:true,characterData:true,subtree:true});});
    await page.clock.fastForward(5000);await page.clock.runFor(30);
    assert.equal(await page.evaluate(()=>window.__clockTextMutations),0,'hidden seconds must not rewrite time DOM every second');
    await page.evaluate(()=>window.__clockTextObserver.disconnect());
    await press('Enter');await travel('[data-toggle="show-seconds"]');await press('Enter');await press('Escape');await page.clock.runFor(650);
    const before=await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent();await page.clock.fastForward(2100);await page.clock.runFor(650);
    assert.notEqual(await page.locator('.tile[data-unit="seconds"] .static.top .numeral').textContent(),before,'enabled seconds must resume ticking');
   }
   if(viewport.width===1920){await page.clock.runFor(100);await page.screenshot({path:'work/tv-fullscreen-qa.png'});}
   assert.deepEqual(errors,[]);
   results.push({viewport,passed:true,geometry,checks:['all panels D-pad reachable','Enter changes toggles/steps/fonts/weather/city','step limits enforced','weather retains timeline','city Back returns to provinces','idle hides all editor UI; Enter restores','Back closes panel then delegates native exit',(lite?'two':'three')+' Chinese toggles fit one row','four steppers fully visible without scrolling','16:9 live preview inside 4 percent safe margins']});await page.close();
  }
  fs.writeFileSync('work/tv-controls-results.json',JSON.stringify({passed:true,htmlSha256:createHash('sha256').update(html).digest('hex'),scope:'Desktop Chromium with remote input; no real-TV performance claim',results},null,2));console.log(JSON.stringify({passed:true,viewports:results.map(row=>row.viewport),checks:results[0].checks},null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
