const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-toolbar-'));
 const app=await _electron.launch({executablePath:path.resolve(__dirname,'../Windows/Draftelio.exe'),env:{...process.env,DRAFTELIO_SMOKE_ROOT:root},timeout:60000}),page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.waitForFunction(()=>window.DesktopEditorReady && window.FrameDocument?.body);await page.locator('#home-continue').click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
  await page.evaluate(()=>{FrameDocument.body.innerHTML='<header style="display:flex;justify-content:space-between"><h2 id="left">Левый край</h2><h2 id="right">Правый край</h2></header><main style="height:1400px;padding-top:400px"><p id="middle">Текст в середине</p></main>';FrameDocument.body.style.margin='0';});
  const frame=page.frameLocator('#iframe-wrapper iframe');
  const check=async()=>{await page.waitForFunction(()=>{const t=document.getElementById('wysiwyg-editor').getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect();return t.width>0 && t.left>=Math.max(0,c.left) && t.right<=Math.min(innerWidth,c.right)+1 && t.top>=c.top && t.bottom<=Math.min(innerHeight,c.bottom)+1;});};
  await frame.locator('#left').click();await check();assert.equal(await page.locator('#bold-btn').isVisible(),true);
  await page.locator('#bold-btn').click();assert.equal(await page.evaluate(()=>Vvveb.WysiwygEditor.isActive),true);
  await page.evaluate(()=>DesktopEditor.finishText());await frame.locator('#right').click();await check();
  await page.evaluate(()=>FrameWindow.scrollTo(0,300));await check();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,650));await check();
  await page.evaluate(()=>DesktopEditor.finishText());await frame.locator('#middle').click();await check();
  await page.locator('#v-preferences').click();await page.locator('#ru-theme').click();await check();await page.screenshot({path:path.resolve(__dirname,'../Панель редактирования текста.png')});
  await page.evaluate(()=>DesktopEditor.finishText());assert.equal(await page.locator('#wysiwyg-editor').isVisible(),false);assert.deepEqual(errors,[]);
  console.log('PASS toolbar stays inside canvas at top/left/right, follows scrolling and resizing, wraps in narrow window, formatting works, dark theme and closing');
 }finally{await page.evaluate(()=>window.desktop.dirty(false));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
