const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-colors-')),errors=[];
 const app=await _electron.launch({executablePath:path.resolve(__dirname,'../Windows/Draftelio.exe'),env:{...process.env,DRAFTELIO_SMOKE_ROOT:root},timeout:60000}),page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
  await page.waitForFunction(()=>window.DesktopEditorReady && window.FrameDocument?.querySelector('h1'));await page.locator('#home-continue').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
  await page.locator('#ru-workshop').click();await page.locator('#workshop [name=blockName]').fill('Карточка с палитрой');
  const set=async(name,value)=>{const field=page.locator('#ws-properties [name='+name+']:visible');await field.fill(String(value));await field.press('Tab');};
  const selected=()=>page.locator('#ws-board [data-ws-selected]');
  await page.locator('[data-color-group=board] [aria-label="Чёрный"]').click();assert.equal(await page.locator('#ws-board').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(17, 24, 39)');
  await page.locator('#workshop [data-add=box]').click();assert.equal(await page.locator('#ws-text-color').isVisible(),false);assert.equal(await page.locator('#ws-fill').isVisible(),true);
  await page.locator('#ws-fill [aria-label="Красный"]').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(239, 68, 68)');
  await page.locator('#ws-undo').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(220, 230, 255)');await page.locator('#ws-redo').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(239, 68, 68)');
  await page.locator('#ws-fill [aria-label="Без заливки"]').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.evaluate(()=>{const field=document.querySelector('#ws-fill input[type=color]');for(const value of ['#14b8a6','#3b82f6']){field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));}});assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(59, 130, 246)');await page.evaluate(()=>document.querySelector('#ws-fill input').dispatchEvent(new Event('change',{bubbles:true})));await page.locator('#ws-undo').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');await page.locator('#ws-redo').click();
  await set('x',48);await set('y',48);await set('w',704);await set('h',304);
  await page.locator('#workshop [data-add=text]').click();await set('text','Ваша идея — готовый блок');await set('x',72);await set('y',80);await set('w',640);await set('h',70);await set('font',36);
  await page.locator('#ws-text-color [aria-label="Белый"]').click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');await page.locator('#ws-properties [name=bold]').check();assert.equal(await selected().evaluate(n=>getComputedStyle(n).fontWeight),'700');
  await page.locator('#ws-properties [name=family]').selectOption('Georgia, serif');assert.match(await selected().evaluate(n=>getComputedStyle(n).fontFamily),/Georgia/);await page.locator('#ws-properties [name=align]').selectOption('center');assert.equal(await selected().evaluate(n=>getComputedStyle(n).textAlign),'center');
  await page.locator('#ws-duplicate').click();assert.equal(await page.locator('#ws-layers .ws-layer-row > button:first-child').count(),3);await page.locator('#ws-remove').click();assert.equal(await page.locator('#ws-layers .ws-layer-row > button:first-child').count(),2);
  await page.locator('#ws-layers .ws-layer-row > button:first-child').nth(1).click();await page.locator('#ws-board').focus();await page.keyboard.press('Shift+ArrowRight');assert.equal(await selected().evaluate(n=>parseFloat(n.style.left)),82);await page.evaluate(()=>DesktopEditor.run('undo'));assert.equal(await selected().evaluate(n=>parseFloat(n.style.left)),72);await page.evaluate(()=>DesktopEditor.run('redo'));assert.equal(await selected().evaluate(n=>parseFloat(n.style.left)),82);await page.evaluate(()=>DesktopEditor.run('undo'));
  await page.locator('#workshop [data-add=button]').click();await set('text','Создать свой дизайн');await set('x',72);await set('y',210);await set('w',280);await set('h',56);await page.locator('#ws-fill [aria-label="Белый"]').click();await page.locator('#ws-text-color [aria-label="Чёрный"]').click();
  await page.locator('#ws-align [title="По центру горизонтально"]').click();assert.equal(await selected().evaluate(n=>parseFloat(n.style.left)),260);
  await page.locator('.ws-grid-toggle input').uncheck();assert.equal(await page.locator('#ws-board').evaluate(n=>getComputedStyle(n).backgroundImage),'none');await page.locator('#ws-zoom').selectOption('fit');
  await page.locator('#ws-save').click();await page.waitForFunction(()=>document.querySelector('#workshop [role=status]').textContent.includes('сохранён'));
  const block=JSON.parse(fs.readFileSync(path.join(root,'profile','custom-blocks.json'),'utf8'))[0];assert.match(block.html,/background: rgb\(17, 24, 39\)/);assert.match(block.html,/font-weight: 700/);assert.doesNotMatch(block.html,/data-ws|ws-board/);
  await page.screenshot({path:path.resolve(__dirname,'../Мастерская — палитры.png')});
  await page.locator('#ws-close').click();await page.locator('#v-preferences').click();await page.locator('#ru-theme').click();await page.locator('#ru-workshop').click();await page.locator('[data-ws-tab=library]').click();await page.locator('#ws-library button').filter({hasText:'Изменить'}).click();await page.locator('#ws-layers .ws-layer-row > button:first-child').nth(1).click();assert.equal(await selected().evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');assert.equal(await selected().evaluate(n=>getComputedStyle(n).fontWeight),'700');assert.equal(await page.locator('#ws-board').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(17, 24, 39)');
  await page.screenshot({path:path.resolve(__dirname,'../Мастерская — тёмная тема.png')});assert.deepEqual(errors,[]);
  console.log('PASS contextual fill and text palettes, canvas background, transparent fill, immediate custom color, grouped color undo/redo, typography, duplicate/delete, alignment, grid, fit, saved colors and dark theme');
 }finally{await page.evaluate(()=>window.desktop.dirty(false));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


