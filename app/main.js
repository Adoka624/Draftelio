'use strict';
const {app,BrowserWindow,Menu,dialog,ipcMain,shell,session,nativeTheme} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {listPages,savePage,importImage,exportProject,startServer} = require('./project');
const {Ai,loadPacks,importPack}=require('./ai');
const smokeRoot = process.env.DRAFTELIO_SMOKE_ROOT || process.env.VVVEb_SMOKE_ROOT;
const documentsRoot=path.join(app.getPath('documents'),'Codex');
const migrated=smokeRoot?{profile:path.join(smokeRoot,'profile'),sites:path.join(smokeRoot,'sites')}:require('./migration').migrate(documentsRoot);
const profileRoot=migrated.profile,projectsRoot=migrated.sites;
app.setName('Draftelio');
app.setPath('userData',profileRoot);
let window,server,origin,projectRoot,dirty=false,closing=false;
let ai;
const webRoot = path.join(__dirname,'web');
const configFile = path.join(app.getPath('userData'),'project.json');
const recentFile=path.join(app.getPath('userData'),'projects.json');
const sitesRoot=()=>smokeRoot?path.join(smokeRoot,'sites'):projectsRoot;
function recentProjects(){try{const rows=JSON.parse(fs.readFileSync(recentFile,'utf8'));return Array.isArray(rows)?rows.filter(row=>row && typeof row.root==='string'):[];}catch{return [];}}
function projectList(){
 const rows=recentProjects(),known=new Set(rows.map(row=>path.resolve(row.root).toLowerCase()));
 for(const root of [projectRoot,...(fs.existsSync(sitesRoot())?fs.readdirSync(sitesRoot(),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>path.join(sitesRoot(),entry.name)):[])]) if(root && !known.has(path.resolve(root).toLowerCase())){rows.push({root,lastOpened:null});known.add(path.resolve(root).toLowerCase());}
 return rows.map(row=>{let count=0;try{count=listPages(row.root).length;}catch{}return {...row,name:path.basename(row.root),pages:count,available:count>0,current:row.root===projectRoot};}).sort((a,b)=>String(b.lastOpened||'').localeCompare(String(a.lastOpened||'')) || a.name.localeCompare(b.name,'ru'));
}
const state = ()=>({root:projectRoot,pages:listPages(projectRoot)});

function persist() {fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify({root:projectRoot}), 'utf8');const rows=recentProjects().filter(row=>path.resolve(row.root).toLowerCase()!==path.resolve(projectRoot).toLowerCase());rows.unshift({root:projectRoot,lastOpened:new Date().toISOString()});fs.writeFileSync(recentFile+'.tmp',JSON.stringify(rows.slice(0,100)),'utf8');fs.renameSync(recentFile+'.tmp',recentFile);}
function starter(root) {
  fs.mkdirSync(root,{recursive:true});
  for (const entry of fs.readdirSync(path.join(webRoot,'starter'))) if(entry!=='blank.html') fs.cpSync(path.join(webRoot,'starter',entry),path.join(root,entry),{recursive:true,errorOnExist:true,force:false});
}
async function confirmDiscard() {
  if (!dirty) return true;
  const {response} = await dialog.showMessageBox(window,{type:'warning',title:'Несохранённые изменения',message:'На странице есть несохранённые изменения.',detail:'Вернитесь в редактор и сохраните страницу или продолжите без сохранения.',buttons:['Вернуться в редактор','Продолжить без сохранения'],defaultId:0,cancelId:0});
  return response===1;
}
function handle(channel,callback) {
  ipcMain.handle(channel,async(event,...args)=>{
    const url=new URL(event.senderFrame.url);
    if (event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || url.origin!==origin || url.pathname!=='/app/editor.html') throw new Error('Доступ запрещён.');
    try {return {ok:true,value:await callback(...args)};} catch(error) {
      const messages={EACCES:'Нет доступа к папке или файлу.',EPERM:'Файл недоступен. Проверьте права и закройте его в других программах.',ENOENT:'Файл или папка не найдены.',ENOSPC:'Недостаточно свободного места на диске.',EBUSY:'Файл занят другой программой.'};
      return {ok:false,error:messages[error.code] || error.message};
    }
  });
}
const command = name=>window.webContents.send('editor:command',name);

app.whenReady().then(async()=>{
  const themeFile=path.join(app.getPath('userData'),'interface.json');let theme='light',design='bloom';
  try{const saved=JSON.parse(fs.readFileSync(themeFile,'utf8'));if(['light','dark'].includes(saved.theme)) theme=saved.theme;}catch{}
  const persistInterface=()=>{fs.mkdirSync(path.dirname(themeFile),{recursive:true});const temp=themeFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({theme,design}),'utf8');fs.renameSync(temp,themeFile);};
  nativeTheme.themeSource=theme;
  const defaultRoot = smokeRoot?path.join(smokeRoot,'site'):path.join(projectsRoot,'Мой сайт');
  try {projectRoot=JSON.parse(fs.readFileSync(configFile,'utf8')).root;if (!listPages(projectRoot).length) projectRoot=null;} catch {projectRoot=null;}
  if (!projectRoot) {projectRoot=defaultRoot;if (!fs.existsSync(path.join(projectRoot,'index.html'))) starter(projectRoot);}
  persist();
  server=await startServer(webRoot,()=>projectRoot);
  origin='http://127.0.0.1:'+server.address().port;
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window=new BrowserWindow({width:1440,height:940,minWidth:1040,minHeight:700,title:'Draftelio — редактор сайтов',icon:path.join(webRoot,'favicon.ico'),show:!smokeRoot,backgroundColor:theme==='dark'?'#151b26':'#f4f6fa',webPreferences:{additionalArguments:['--draftelio-theme='+theme],preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  handle('interface:theme',value=>{if(!['light','dark'].includes(value)) throw new Error('Неизвестная тема интерфейса.');theme=value;persistInterface();nativeTheme.themeSource=value;window.setBackgroundColor(value==='dark'?'#151b26':'#f4f6fa');return value;});
  handle('interface:design',()=>design);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/app/editor.html') event.preventDefault();});
  window.webContents.on('will-frame-navigate',event=>{if(event.isMainFrame && event.url!==origin+'/app/editor.html') event.preventDefault();else if(!event.url.startsWith(origin+'/') && event.url!=='about:blank') event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('will-prevent-unload',event=>event.preventDefault());
  window.on('close',async event=>{
    if (!dirty || closing) return;
    event.preventDefault();
    if (await confirmDiscard()) {closing=true;window.close();}
  });
  handle('project:state',state);
  handle('project:list',projectList);
  handle('project:switch',async root=>{
    if(typeof root!=='string' || !projectList().some(row=>row.root===root)) throw new Error('Проект не найден в списке.');
    if(!await confirmDiscard()) return null;
    const resolved=fs.realpathSync(root);if(!listPages(resolved).length) throw new Error('В проекте нет HTML-страниц.');
    projectRoot=resolved;dirty=false;persist();return state();
  });
  handle('project:home',confirmDiscard);
  const blocksFile=path.join(app.getPath('userData'),'custom-blocks.json');
  const customBlocks=()=>fs.existsSync(blocksFile)?JSON.parse(fs.readFileSync(blocksFile,'utf8')):[];
  handle('blocks:list',customBlocks);
  handle('blocks:save',data=>{
    if(!data || typeof data.name!=='string' || !data.name.trim() || data.name.length>80 || typeof data.html!=='string' || !data.html.trim() || Buffer.byteLength(data.html)>20*1024*1024) throw new Error('Укажите название до 80 символов и блок размером до 20 МБ.');
    const blocks=customBlocks(),existing=blocks.find(block=>block.id===data.id);
    if(data.id && !existing) throw new Error('Блок больше не существует.');
    const block={id:existing?.id || require('node:crypto').randomUUID(),name:data.name.trim(),html:data.html};
    if(existing) blocks[blocks.indexOf(existing)]=block;else blocks.push(block);
    fs.writeFileSync(blocksFile+'.tmp',JSON.stringify(blocks),'utf8');fs.renameSync(blocksFile+'.tmp',blocksFile);return block;
  });
  handle('blocks:delete',id=>{const blocks=customBlocks().filter(block=>block.id!==id);fs.writeFileSync(blocksFile+'.tmp',JSON.stringify(blocks),'utf8');fs.renameSync(blocksFile+'.tmp',blocksFile);return blocks;});
  handle('project:open',async()=>{
    if (!await confirmDiscard()) return null;
    const result=await dialog.showOpenDialog(window,{title:'Выберите папку сайта с HTML-страницами',properties:['openDirectory']});
    if (result.canceled) return null;
    const root=fs.realpathSync(result.filePaths[0]);
    if (!listPages(root).length) throw new Error('В папке нет HTML-страниц. Выберите другой сайт или создайте новый.');
    projectRoot=root;dirty=false;persist();return state();
  });
  handle('project:create',async()=>{
    if (!await confirmDiscard()) return null;
    const sites=smokeRoot?path.join(smokeRoot,'sites'):projectsRoot;
    fs.mkdirSync(sites,{recursive:true});let root;
    for(let number=1;;number++) {
      root=path.join(sites,'Новый сайт'+(number===1?'':' '+number));
      try{fs.mkdirSync(root);break;}catch(error){if(error.code!=='EEXIST') throw error;}
    }
    starter(root);projectRoot=fs.realpathSync(root);dirty=false;persist();return state();
  });
  handle('project:save',data=>{
    if (!data || typeof data.file!=='string') throw new Error('Не выбрана страница.');
    savePage(projectRoot,data.file,data.html);dirty=false;return 'Страница сохранена. Предыдущая версия находится в папке .draftelio-backups.';
  });
  handle('project:new-page',name=>{
    const prefix='../'.repeat(String(name).split(/[\\/]/).length-1);
    const html=fs.readFileSync(path.join(webRoot,'starter','blank.html'),'utf8').replace('href="assets/','href="'+prefix+'assets/');
    savePage(projectRoot,name,html,true);return state();
  });
  handle('project:image',async()=>{
    const result=await dialog.showOpenDialog(window,{title:'Добавить изображение в сайт',properties:['openFile'],filters:[{name:'Изображения',extensions:['png','jpg','jpeg','webp','gif','avif','bmp']}]});
    return result.canceled?null:importImage(projectRoot,result.filePaths[0]);
  });
  handle('project:export',async()=>{
    if (dirty) throw new Error('Сначала сохраните изменения, затем экспортируйте сайт.');
    const result=await dialog.showSaveDialog(window,{title:'Экспорт сайта в новую папку',defaultPath:projectRoot+' — экспорт',buttonLabel:'Экспортировать'});
    return result.canceled?null:exportProject(projectRoot,result.filePath);
  });
  handle('project:reveal',()=>shell.openPath(projectRoot));
  const aiRoot=path.join(app.getPath('userData'),'ai'),packsRoot=path.join(aiRoot,'plugins'),builtin=path.join(__dirname,'ai-packs'),settingsFile=path.join(aiRoot,'settings.json');
  ai=new Ai(aiRoot,event=>{if(!window.isDestroyed()) {if(event.type==='login' && event.success){if(window.isMinimized()) window.restore();window.show();window.focus();}window.webContents.send('ai:event',event);}});
  let settings={enabledPacks:['site-core','marketing','business'],enabledSkills:['site-core/layout','site-core/accessibility','site-core/quality','marketing/copy'],customInstructions:'',paths:{}};
  try{settings={...settings,...JSON.parse(fs.readFileSync(settingsFile,'utf8'))};for(const [provider,file] of Object.entries(settings.paths||{})) ai.setExecutable(provider,file);}catch{}
  const saveSettings=()=>{fs.mkdirSync(aiRoot,{recursive:true});fs.writeFileSync(settingsFile,JSON.stringify(settings,null,2),'utf8');};
  const historyFile=path.join(aiRoot,'history.json');let history=[];
  try{const saved=JSON.parse(fs.readFileSync(historyFile,'utf8'));if(Array.isArray(saved)) history=saved.filter(entry=>typeof entry.task==='string' && typeof entry.id==='string').map(entry=>entry.status==='working'?{...entry,status:'interrupted',error:'Приложение закрыто до завершения запроса.'}:entry);}catch{}
  // ponytail: rewrite the local history atomically; per-request files if history grows large.
  const saveHistory=()=>{fs.writeFileSync(historyFile+'.tmp',JSON.stringify(history),'utf8');fs.renameSync(historyFile+'.tmp',historyFile);};
  handle('ai:history',()=>[...history].reverse());
  const catalog=()=>({packs:loadPacks(builtin,packsRoot),settings,baseInstructions:fs.readFileSync(path.join(__dirname,'AI-INSTRUCTIONS.md'),'utf8')});
  handle('ai:catalog',catalog);
  handle('ai:settings',data=>{
    const packs=loadPacks(builtin,packsRoot),packIds=new Set(packs.filter(p=>!p.error).map(p=>p.id)),skillIds=new Set(packs.flatMap(p=>p.skills.map(s=>p.id+'/'+s.id)));
    if(!data || !Array.isArray(data.enabledPacks) || !Array.isArray(data.enabledSkills) || typeof data.customInstructions!=='string' || data.customInstructions.length>10000) throw new Error('Некорректные настройки ИИ.');
    settings={...settings,enabledPacks:data.enabledPacks.filter(id=>packIds.has(id)),enabledSkills:data.enabledSkills.filter(id=>skillIds.has(id)),customInstructions:data.customInstructions};saveSettings();return catalog();
  });
  handle('ai:status',provider=>ai.status(provider));
  handle('ai:login',async provider=>{const result=await ai.login(provider);if(result.url){const url=new URL(result.url);if(url.protocol!=='https:' || !['chatgpt.com','auth.openai.com'].includes(url.hostname)) throw new Error('Неожиданный адрес входа.');await shell.openExternal(result.url);}return {pending:true};});
  handle('ai:executable',async provider=>{const result=await dialog.showOpenDialog(window,{title:provider==='chatgpt'?'Выберите официальный codex.exe':'Выберите официальный claude.exe',properties:['openFile'],filters:[{name:'Программа',extensions:['exe']}]});if(result.canceled) return null;ai.setExecutable(provider,result.filePaths[0]);settings.paths={...settings.paths,[provider]:result.filePaths[0]};saveSettings();return ai.status(provider);});
  handle('ai:cancel',()=>{ai.cancel();return true;});
  handle('ai:login-code',code=>{ai.loginCode(code);return true;});
  handle('ai:generate',async data=>{
    if(!data || typeof data.task!=='string' || !data.task.trim() || data.task.length>10000 || typeof data.html!=='string' || Buffer.byteLength(data.html)>1500000 || !['page','block'].includes(data.target)) throw new Error('Задача или контекст страницы слишком большой.');
    const {packs,baseInstructions}=catalog();let instructions=baseInstructions;
    for(const pack of packs) if(!pack.error && settings.enabledPacks.includes(pack.id)){instructions+='\n\nПЛАГИН '+pack.name+'\n'+pack.instructions;for(const skill of pack.skills) if(settings.enabledSkills.includes(pack.id+'/'+skill.id)) instructions+='\n\nНАВЫК '+skill.name+'\n'+skill.instructions;}
    instructions+='\n\nДополнительные инструкции владельца:\n'+settings.customInstructions;
    if(instructions.length>20000) throw new Error('Инструкции слишком большие. Сократите дополнительные правила или отключите часть навыков.');
    if(ai.busy) throw new Error('Дождитесь завершения текущего запроса или остановите его.');
    const entry={id:require('node:crypto').randomUUID(),createdAt:Date.now(),provider:data.provider,task:data.task,target:data.target,page:String(data.page||''),status:'working'};
    history.push(entry);saveHistory();
    window.webContents.send('ai:event',{type:'history',provider:data.provider});
    try{const answer=await ai.generate(data.provider,JSON.stringify({task:data.task,target:data.target,page:entry.page,html:data.html}),instructions);Object.assign(entry,{status:'completed',summary:answer.summary,html:answer.html,tokenUsage:answer.tokenUsage || null});saveHistory();return answer;}
    catch(error){Object.assign(entry,{status:'failed',error:error.message});saveHistory();throw error;}
    finally{if(!window.isDestroyed()) window.webContents.send('ai:event',{type:'history',provider:data.provider});}
  });
  handle('ai:import-plugin',async()=>{const result=await dialog.showOpenDialog(window,{title:'Выберите папку плагина с plugin.json',properties:['openDirectory']});if(result.canceled) return null;fs.mkdirSync(packsRoot,{recursive:true});const id=importPack(result.filePaths[0],packsRoot,builtin);settings.enabledPacks.push(id);saveSettings();return catalog();});
  handle('ai:reveal-plugins',()=>{fs.mkdirSync(packsRoot,{recursive:true});return shell.openPath(packsRoot);});
  window.on('closed',()=>ai.cancel());
  ipcMain.on('project:dirty',(event,value)=>{if(event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame) dirty=value===true;});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Файл',submenu:[{label:'Новый сайт…',click:()=>command('create')},{label:'Открыть сайт…',accelerator:'CmdOrCtrl+O',click:()=>command('open')},{label:'Новая страница…',click:()=>command('newPage')},{type:'separator'},{label:'Сохранить страницу',accelerator:'CmdOrCtrl+S',click:()=>command('save')},{label:'Экспортировать сайт…',click:()=>command('export')},{label:'Открыть папку сайта',click:()=>command('reveal')},{type:'separator'},{label:'Выход',click:()=>window.close()}]},
    {label:'Правка',submenu:[{label:'Отменить',accelerator:'CmdOrCtrl+Z',click:()=>command('undo')},{label:'Повторить',accelerator:'CmdOrCtrl+Shift+Z',click:()=>command('redo')},{type:'separator'},{label:'Вырезать',role:'cut'},{label:'Копировать',role:'copy'},{label:'Вставить',role:'paste'},{label:'Выделить всё',role:'selectAll'}]},
    {label:'Вид',submenu:[{label:'Режим редактирования',click:()=>command('edit')},{label:'Режим просмотра',click:()=>command('preview')},{label:'Полный экран',role:'togglefullscreen'},{label:'Увеличить',role:'zoomIn'},{label:'Уменьшить',role:'zoomOut'},{label:'Масштаб 100%',role:'resetZoom'}]},
    {label:'Помощь',submenu:[{label:'Как пользоваться',click:()=>command('help')},{label:'О программе',click:()=>dialog.showMessageBox(window,{title:'Draftelio',message:'Draftelio 1.1.0',detail:'Русский десктопный редактор на основе VvvebJs 2.0.9. Исходный проект: Ziadin Givan, Apache 2.0. Перевод и десктопная адаптация: 2026. Авторизация посетителей не подключена.'})}]}
  ]));
  await window.loadURL(origin+'/app/editor.html');
}).catch(error=>{dialog.showErrorBox('Не удалось запустить редактор',error.stack || error.message);app.quit();});
app.on('window-all-closed',()=>{server?.close();app.quit();});
