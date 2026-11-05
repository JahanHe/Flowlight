// Simulate a slow WebView before any application JavaScript executes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CLOCK_CHROMIUM_PATH});
 try{const page=await browser.newPage({viewport:{width:1280,height:720}});
  const html=fs.readFileSync(process.argv[2]||'outputs/glass-clock-tv.html','utf8');
  await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  assert(await page.locator('body').evaluate(n=>n.classList.contains('tv')),'TV layout must exist before the app initializes; slow startup must not expose the old web editor');
  assert.equal(await page.locator('.editor-only:visible').count(),0,'old web editor is visible during bootstrap');
  assert(await page.locator('#tv-boot').isVisible(),'show the small TV startup status while initialization is pending');
  assert.equal(await page.locator('.shell').isVisible(),false,'do not expose half-initialized clock');
  assert.equal(await page.locator('#font-licenses').evaluate(n=>n.tagName),'TEMPLATE','font license must remain inert markup, not leaked page text');
  assert.equal(await page.locator('#font-licenses').isVisible(),false);
  console.log('PASS: TV layout and startup status present before scripts; no old editor or partial clock');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
