// All tiers retain the living sky; quality controls a bounded low-power rendering budget.
(() => {
  const query=new URLSearchParams(location.search);
  function integer(name,min,max) {
    const value=query.get(name);
    if(value===null||!/^\d+$/.test(value))return null;
    const number=Number(value);return Number.isSafeInteger(number)&&number>=min&&number<=max?number:null;
  }
  const nativeRAM=integer('ramMB',512,262144),browserRAM=Number(navigator.deviceMemory);
  const ramMB=nativeRAM||(Number.isFinite(browserRAM)&&browserRAM>=.5&&browserRAM<=256?browserRAM*1024:4096);
  const available=integer('availableMB',0,262144),availableMB=available!==null&&available<=ramMB?available:null;
  const cores=integer('cores',1,256)||(Number.isFinite(navigator.hardwareConcurrency)?Math.max(1,navigator.hardwareConcurrency):4);
  const lowRam=query.get('lowRam')==='1',heapMB=integer('heapMB',16,32768);
  const deviceLevel=lowRam||ramMB<3072||cores<=2||(availableMB!==null&&availableMB<512)?0:1;
  const profiles=[
    {name:'流畅',fps:20,glassFps:12,weatherPixels:640*360,weatherDpr:1,glyphDpr:1,detail:.55},
    {name:'精细',fps:24,glassFps:15,weatherPixels:960*540,weatherDpr:1.25,glyphDpr:1.25,detail:.75},
    {name:'极致',fps:30,glassFps:20,weatherPixels:1280*720,weatherDpr:1.5,glyphDpr:1.5,detail:1}
  ];
  const modes=['auto','smooth','fine','ultra'],key='floating-light-render-quality';
  let mode='auto';try{const saved=localStorage.getItem(key);if(modes.includes(saved))mode=saved;}catch{}
  let target=mode==='auto'?deviceLevel:modes.indexOf(mode)-1;
  let average=0,intervalAverage=0,samples=0,slow=0,fast=0,lastChange=performance.now();
  const quality=window.clockQuality={level:target,mode,device:{ramMB,availableMB,cores,lowRam,heapMB,source:nativeRAM?'android':Number.isFinite(browserRAM)?'browser':'default'},...profiles[target]};
  function change(level) {
    Object.assign(quality,profiles[level],{level,mode});
    samples=slow=fast=0;average=intervalAverage=0;lastChange=performance.now();
    window.dispatchEvent(new Event('clockqualitychange'));
  }
  quality.setMode=value=>{
    if(!modes.includes(value))return;
    mode=value;target=mode==='auto'?deviceLevel:modes.indexOf(mode)-1;
    try{localStorage.setItem(key,mode);}catch{}
    change(target);
  };
  quality.reportFrame=(ms,interval)=>{
    if(document.hidden||!Number.isFinite(ms)||ms<0||ms>1000)return;
    average=samples?average*.95+ms*.05:ms;samples++;
    const budget=1000/quality.fps;
    if(Number.isFinite(interval)&&interval>0&&interval<=250)intervalAverage=intervalAverage?intervalAverage*.95+interval*.05:interval;
    slow=average>budget*.82||intervalAverage>budget*1.45?slow+1:Math.max(0,slow-2);
    fast=average<budget*.28&&intervalAverage<budget*1.15?fast+1:0;
    // ponytail: keep all effects within three bounded budgets; extra RAM never automatically buys more work.
    if(quality.level>0&&slow>=60&&performance.now()-lastChange>5000)change(quality.level-1);
    else if(quality.level<target&&fast>=900&&performance.now()-lastChange>45000)change(quality.level+1);
  };
  // The user explicitly chose continuous full effects, including when Android requests reduced motion.
  window.clockMotion=new EventTarget();window.clockMotion.matches=false;
})();
