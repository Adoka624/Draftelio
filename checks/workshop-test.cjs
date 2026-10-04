const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-workshop-')),errors=[];let app,page;
 const launch=async()=>{app=await _electron.launch({executablePath:path.resolve(__dirname,'../Windows/Draftelio.exe'),env:{...process.env,DRAFTELIO_SMOKE_ROOT:root},timeout:60000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.waitForFunction(()=>window.DesktopEditorReady && window.FrameDocument?.querySelector('h1'));await page.locator('#home-continue').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());};
 try{
  await launch();const before=await page.evaluate(()=>Vvveb.Builder.getHtml());await page.locator('#ru-workshop').click();await page.locator('#workshop [name=blockName]').fill('Моя карточка');
  await page.locator('#workshop [data-add=text]').click();await page.locator('#ws-properties [name=text]:visible').fill('Создано в мастерской');await page.locator('#ws-properties [name=text]:visible').press('Tab');
  await page.locator('#workshop [data-add=box]').click();const box=await page.locator('#ws-board [data-ws-index="1"]').boundingBox();await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+150,box.y+110,{steps:8});await page.mouse.up();assert.equal(await page.locator('#ws-properties [name=x]').inputValue(),'176');assert.equal(await page.locator('#ws-properties [name=y]').inputValue(),'136');
  await page.locator('#ws-undo').click();await page.locator('#ws-board [data-ws-index="1"]').click();assert.equal(await page.locator('#ws-properties [name=x]').inputValue(),'56');await page.locator('#ws-redo').click();
  await page.locator('#workshop [data-add=ellipse]').click();await page.locator('#workshop [data-add=button]').click();await page.locator('#ws-properties [name=href]').fill('https://example.com');await page.locator('#ws-properties [name=href]').press('Tab');
  await page.locator('#ws-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUqkAAAAASUVORK5CYII=','base64')});await page.waitForFunction(()=>document.querySelectorAll('#ws-board img').length===1);
  const handle=await page.locator('#ws-board > [data-ws-resize]').boundingBox();await page.mouse.move(handle.x+6,handle.y+6);await page.mouse.down();await page.mouse.move(handle.x+46,handle.y+30,{steps:6});await page.mouse.up();assert.equal(await page.locator('#ws-properties [name=w]').inputValue(),'224');assert.equal(await page.locator('#ws-properties [name=h]').inputValue(),'144');
  await page.locator('#ws-zoom').selectOption('0.5');assert.equal(await page.locator('#ws-board').evaluate(n=>n.style.transform),'scale(0.5)');
  await page.locator('#ws-save').click();await page.waitForFunction(()=>document.querySelector('#ws-library strong')?.textContent==='Моя карточка');assert.equal(await page.evaluate(()=>Vvveb.Builder.getHtml()),before);
  const stored=JSON.parse(fs.readFileSync(path.join(root,'profile','custom-blocks.json'),'utf8'));assert.equal(stored.length,1);assert.match(stored[0].html,/Создано в мастерской/);assert.match(stored[0].html,/data:image\/png;base64/);assert.doesNotMatch(stored[0].html,/data-ws-|ws-board|scale\(/);
  await page.locator('#ws-insert').click();await page.waitForFunction(()=>!document.querySelector('#workshop').open);assert.equal(await page.evaluate(()=>FrameDocument.querySelector('[data-ru-canvas]')?.children.length),5);await page.locator('[data-action=undo]').click();assert.equal(await page.evaluate(()=>Vvveb.Builder.getHtml()),before);
  await page.evaluate(()=>window.desktop.dirty(false));await app.close();await launch();assert.equal(await page.evaluate(()=>Vvveb.BlocksGroup['Мои блоки'].length),1);
  await page.locator('#ru-workshop').click();await page.locator('[data-ws-tab=library]').click();await page.locator('#ws-library button').filter({hasText:'Изменить'}).click();assert.equal(await page.locator('#ws-board [data-ws-index]').count(),5);await page.locator('#ws-layers .ws-layer-row > button:first-child').first().click();await page.locator('#ws-properties [name=text]:visible').fill('Обновлённый текст');await page.locator('#ws-properties [name=text]:visible').press('Tab');await page.locator('#ws-save').click();await page.waitForFunction(()=>document.querySelector('#workshop [role=status]').textContent.includes('сохранён'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'profile','custom-blocks.json'),'utf8')).length,1);assert.match(fs.readFileSync(path.join(root,'profile','custom-blocks.json'),'utf8'),/Обновлённый текст/);await page.screenshot({path:path.resolve(__dirname,'../Мастерская блоков.png')});
  await page.locator('[data-ws-tab=library]').click();await page.locator('#ws-library button').filter({hasText:'Удалить'}).click();await page.waitForFunction(()=>Vvveb.BlocksGroup['Мои блоки'].length===0);assert.deepEqual(errors,[]);
  console.log('PASS workshop starts blank, text/shapes/button/image, mouse drag, undo/redo, zoom, persistent shared library, edit existing, insert and site undo, clean HTML, delete');
 }finally{if(app){await page.evaluate(()=>window.desktop.dirty(false));await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1;});





