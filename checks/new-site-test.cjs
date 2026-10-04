const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-create-')),sites=path.join(root,'sites');fs.mkdirSync(path.join(sites,'Новый сайт'),{recursive:true});fs.writeFileSync(path.join(sites,'Новый сайт','keep.txt'),'Не менять');
 const app=await _electron.launch({executablePath:path.resolve(__dirname,'../Windows/Draftelio.exe'),env:{...process.env,DRAFTELIO_SMOKE_ROOT:root},timeout:60000}),page=await app.firstWindow();
 try{
  await page.waitForFunction(()=>window.DesktopEditorReady && window.FrameDocument?.querySelector('h1'));await page.locator('#home-continue').click();
  await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].show();dialog.showSaveDialog=()=>{throw new Error('Выбор папки не должен открываться');};dialog.showMessageBox=async()=>({response:0});});
  const original=fs.readFileSync(path.join(root,'site','index.html'),'utf8');
  for(const number of [2,3]){
   await page.locator('#v-file').click();await page.locator('#ru-bar [data-command=create]').click();
   await page.waitForFunction(name=>DesktopEditor.project.root.endsWith(name),'Новый сайт '+number);
   await page.waitForFunction(()=>FrameDocument.querySelector('h1')?.textContent.includes('Ваши идеи'));
   assert.ok(fs.existsSync(path.join(sites,'Новый сайт '+number,'index.html')));
   assert.ok(fs.existsSync(path.join(sites,'Новый сайт '+number,'assets')));
  }
  assert.equal(fs.readFileSync(path.join(sites,'Новый сайт','keep.txt'),'utf8'),'Не менять');assert.equal(fs.readFileSync(path.join(root,'site','index.html'),'utf8'),original);
  await page.evaluate(()=>DesktopEditor.markDirty(true));await app.evaluate(()=>{});await page.locator('#v-file').click();await page.locator('#ru-bar [data-command=create]').click();
  assert.equal(await page.evaluate(()=>DesktopEditor.project.root),path.join(sites,'Новый сайт 3'));assert.equal(fs.existsSync(path.join(sites,'Новый сайт 4')),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'profile','project.json'),'utf8')).root,path.join(sites,'Новый сайт 3'));
  console.log('PASS create without folder dialog, unique names, starter files, existing projects preserved, unsaved changes confirmation, persisted project');
 }finally{await page.evaluate(()=>window.desktop.dirty(false));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
