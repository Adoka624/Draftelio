'use strict';
window.ProjectHome=(()=>{
 let root,rows=[],busy=false;
 const call=async(name,...args)=>{const response=await window.desktop[name](...args);if(!response.ok) throw new Error(response.error);return response.value;};
 const message=text=>root.querySelector('[role=status]').textContent=text;
 function lock(value){busy=value;for(const button of root.querySelectorAll('button')) button.disabled=value || button.dataset.unavailable==='true';}
 function hide(){root.hidden=true;for(const node of document.querySelectorAll('#ru-bar,#ru-status,#ru-tools,#vvveb-builder')) node.inert=false;}
 async function open(data){if(!data) return;DesktopEditor.finishText();DesktopEditor.refreshPages(data);DesktopEditor.setMode(true);hide();}
 const guard=fn=>async()=>{if(busy) return;lock(true);message('');try{await fn();}catch(error){message(error.message);}finally{lock(false);}};
 function draw(){
  const list=root.querySelector('#home-projects'),query=root.querySelector('input').value.trim().toLocaleLowerCase('ru');list.replaceChildren();
  const filtered=rows.filter(row=>(row.name+' '+row.root).toLocaleLowerCase('ru').includes(query));
  for(const row of filtered){
   const card=document.createElement('button');card.className='home-card';card.dataset.root=row.root;card.dataset.unavailable=String(!row.available);card.disabled=!row.available;card.title=row.root;
   const symbol=document.createElement('span');symbol.className='home-symbol';symbol.textContent=row.name.slice(0,1).toUpperCase();
   const name=document.createElement('strong');name.textContent=row.name;
   const folder=document.createElement('span');folder.className='home-path';folder.textContent=row.root;
   const meta=document.createElement('span');meta.className='home-meta';meta.textContent=row.available?row.pages+' стр. · '+(row.lastOpened?'Открыт '+new Date(row.lastOpened).toLocaleDateString('ru'):'Локальный сайт'):'Папка недоступна';
   card.append(symbol,name,folder,meta);card.onclick=guard(async()=>{await open(await call('switchProject',row.root));});list.append(card);
  }
  if(!filtered.length){const empty=document.createElement('p');empty.className='home-empty';empty.textContent=query?'Проекты не найдены. Попробуйте другое название.':'Здесь появятся ваши сайты. Создайте новый или откройте папку с HTML-страницами.';list.append(empty);}
  root.querySelector('#home-count').textContent=rows.length+' проектов';
 }
 async function show(startup=false){
  if(SiteAi.busy){document.getElementById('ru-hint').textContent='Дождитесь завершения ИИ или отмените генерацию.';return;}
  DesktopEditor.finishText();
  InterfaceVariants.close();rows=await call('projects');draw();root.hidden=false;for(const node of document.querySelectorAll('#ru-bar,#ru-status,#ru-tools,#vvveb-builder')) node.inert=true;root.querySelector('input').focus();
 }
 async function init(){
  root=document.createElement('section');root.id='project-home';root.setAttribute('aria-label','Главная страница — проекты');root.innerHTML='<header><div class="home-brand"><span>D</span>Draftelio <small>Орбита</small></div><button id="home-theme">Сменить тему</button></header><main><div class="home-heading"><div><p class="home-eyebrow">ВАША МАСТЕРСКАЯ САЙТОВ</p><h1>С чего начнём?</h1><p>Выберите проект или дайте новой идее форму.</p></div><div class="home-actions"><button id="home-open">Открыть папку</button><button id="home-create">+ Новый сайт</button></div></div><div class="home-toolbar"><h2>Ваши проекты <small id="home-count"></small></h2><input type="search" placeholder="Найти проект…" aria-label="Найти проект"></div><div id="home-projects"></div><p role="status" aria-live="polite"></p><footer>Сайты хранятся на вашем компьютере. Редактор, мастерская и ИИ — внутри каждого проекта.<button id="home-continue">Вернуться в редактор →</button></footer></main>';document.body.append(root);
  root.querySelector('input').oninput=draw;
  root.querySelector('#home-create').onclick=guard(async()=>open(await call('create')));
  root.querySelector('#home-open').onclick=guard(async()=>open(await call('open')));
  root.querySelector('#home-continue').onclick=hide;
  root.querySelector('#home-theme').onclick=()=>document.getElementById('ru-theme').click();
  const button=document.createElement('button');button.id='ru-home';button.textContent='Проекты';button.title='Главная страница — переключить проект';button.onclick=()=>show().catch(error=>document.getElementById('ru-hint').textContent=error.message);document.querySelector('.ru-brand').after(button);
  await show(true);
 }
 return {init,show,hide,get open(){return !!root && !root.hidden;}};
})();
