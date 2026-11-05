const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});try{
 const page=await browser.newPage({viewport:{width:1024,height:768}});await page.route('**/*',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let html=fs.readFileSync(path.join(__dirname,'../outputs/glass-clock.html'),'utf8');
 const old=fs.readFileSync(path.join(__dirname,'stick-figure-before-line-restore.js'),'utf8'),fresh=fs.readFileSync(path.join(__dirname,'stick-figure.js'),'utf8');
 if(html.includes(old))html=html.replace(old,fresh);else if(!html.includes(fresh))throw new Error('Clock bundle does not contain expected companion source');
 await page.setContent(html);await page.waitForTimeout(1000);
 await page.evaluate(()=>{const pet=document.querySelector('.stick-world').stickFigure;pet.setScale(1.6);pet.setState({phase:'day',condition:'clear'});});
 await page.locator('.stick-hit').click();await page.waitForTimeout(450);
 await page.screenshot({path:path.join(__dirname,'stick-restored-clock.png')});
 console.log(JSON.stringify({errors,petCount:await page.locator('.stick-world').count()}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
