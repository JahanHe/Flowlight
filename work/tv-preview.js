function createClockTVPreview(canvas) {
  // ponytail: cache text only when it changes; each animation frame copies three small sources.
  const context=canvas.getContext('2d'), overlay=document.createElement('canvas'), ink=overlay.getContext('2d');
  canvas.width=overlay.width=640;canvas.height=overlay.height=360;
  let requested=false,timer=0,dirty=true,scale=1,offsetX=0,offsetY=0;
  const rect=element=>element&&element.getClientRects().length?element.getBoundingClientRect():null;
  function text(element,box) {
    const css=getComputedStyle(element),value=element.textContent.trim(),size=parseFloat(css.fontSize)||16,spacing=parseFloat(css.letterSpacing)||0;
    ink.font=`${css.fontStyle} ${css.fontWeight} ${size*scale}px ${css.fontFamily}`;
    ink.textAlign='left';ink.textBaseline='middle';ink.fillStyle=css.color;
    const letters=Array.from(value),widths=letters.map(letter=>ink.measureText(letter).width);
    let x=offsetX+(box.left+box.width/2)*scale-(widths.reduce((sum,width)=>sum+width,0)+spacing*scale*Math.max(0,letters.length-1))/2;
    const y=offsetY+(box.top+box.height/2)*scale;
    letters.forEach((letter,index)=>{ink.fillText(letter,x,y);x+=widths[index]+spacing*scale;});
  }
  function paintText() {
    dirty=false;ink.clearRect(0,0,640,360);
    scale=Math.min(640/innerWidth,360/innerHeight);offsetX=(640-innerWidth*scale)/2;offsetY=(360-innerHeight*scale)/2;
    document.querySelectorAll('#date,#weekday').forEach(element=>{const box=rect(element);if(box)text(element,box);});
    const divider=document.querySelector('.date-divider'),dividerBox=rect(divider);
    if(dividerBox){ink.fillStyle=getComputedStyle(divider).backgroundColor;ink.fillRect(offsetX+dividerBox.left*scale,offsetY+dividerBox.top*scale,dividerBox.width*scale,dividerBox.height*scale);}
    document.querySelectorAll('.tile').forEach(tile=>{const box=rect(tile);if(box&&box.width&&box.height)text(tile.querySelector('.static.top .numeral'),box);});
    document.querySelectorAll('.colon').forEach(element=>{
      const box=rect(element);if(!box)return;
      const top=getComputedStyle(element,'::before'),bottom=getComputedStyle(element,'::after');
      const first=parseFloat(top.height)||5,last=parseFloat(bottom.height)||5,gap=(parseFloat(top.marginBottom)||0)+(parseFloat(bottom.marginTop)||0);
      let y=box.top+(box.height-first-last-gap)/2;
      [top,bottom].forEach((dot,index)=>{const size=index?last:first;ink.fillStyle=dot.backgroundColor;ink.beginPath();ink.arc(offsetX+(box.left+box.width/2)*scale,offsetY+(y+size/2)*scale,size*scale/2,0,Math.PI*2);ink.fill();y+=size+gap;});
    });
  }
  function paint() {
    if(dirty)paintText();
    context.fillStyle='#000';context.fillRect(0,0,640,360);
    const weather=document.getElementById('weather-canvas');
    if(weather&&weather.width&&weather.height)context.drawImage(weather,offsetX,offsetY,innerWidth*scale,innerHeight*scale);
    context.drawImage(overlay,0,0);
    const actor=document.querySelector('.stick-canvas'),actorBox=rect(actor);
    if(actorBox&&actorBox.width&&actorBox.height&&actor.width&&actor.height)context.drawImage(actor,offsetX+actorBox.left*scale,offsetY+actorBox.top*scale,actorBox.width*scale,actorBox.height*scale);
  }
  function update() {
    timer=0;if(!requested||document.hidden||canvas.hidden)return;
    paint();timer=setTimeout(update,1000/12);
  }
  function start(){requested=true;dirty=true;if(!timer&&!document.hidden)update();}
  function stop(){requested=false;clearTimeout(timer);timer=0;}
  const invalidate=()=>{dirty=true;};
  new MutationObserver(invalidate).observe(document.querySelector('.shell'),{subtree:true,childList:true,characterData:true,attributes:true});
  new MutationObserver(invalidate).observe(document.body,{attributes:true,attributeFilter:['style']});
  window.addEventListener('resize',invalidate);
  if(document.fonts)document.fonts.addEventListener('loadingdone',invalidate);
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);timer=0;if(!document.hidden&&requested)update();});
  return {start,stop};
}
