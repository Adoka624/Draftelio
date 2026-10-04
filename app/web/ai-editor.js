'use strict';
window.SiteAi=(()=>{
  let catalog,panel,transaction=null,busy=false,progressStage='',received=0;
  const call=async(name,...args)=>{const result=await window.desktop[name](...args);if(!result.ok) throw new Error(result.error);return result.value;};
  const message=(text,error=false)=>{panel.querySelector('[role=status]').textContent=text;panel.querySelector('[role=status]').classList.toggle('ai-error',error);};
  const provider=()=>panel.querySelector('[name=provider]').value;
  async function renderHistory() {
    const holder=panel.querySelector('#ai-history'),entries=await call('aiHistory');holder.replaceChildren();
    panel.querySelector('#ai-history-title').textContent='История запросов ('+entries.length+')';
    if(!entries.length) {holder.textContent='Здесь появятся отправленные задачи и результаты.';return;}
    for(const entry of entries) {
      const item=document.createElement('details'),title=document.createElement('summary');title.textContent=new Date(entry.createdAt).toLocaleString('ru-RU')+' · '+({working:'В работе',completed:'Готово',failed:'Ошибка',interrupted:'Прервано'}[entry.status] || entry.status);item.append(title);
      const task=document.createElement('p');task.textContent=entry.task;item.append(task);
      const answer=document.createElement('p');answer.textContent=entry.summary || entry.error || 'Генерация выполняется…';item.append(answer);
      if(entry.html){const details=document.createElement('details'),label=document.createElement('summary'),html=document.createElement('textarea');label.textContent='HTML результата';html.readOnly=true;html.rows=6;html.value=entry.html;details.append(label,html);item.append(details);}
      const repeat=document.createElement('button');repeat.textContent='Повторить задачу';repeat.disabled=busy;repeat.onclick=()=>{if(busy) return;panel.querySelector('[name=task]').value=entry.task;panel.querySelector('[name=target]').value=entry.target;panel.querySelector('[name=task]').focus();};item.append(repeat);holder.append(item);
    }
  }
  function sanitize(html,target) {
    const parsed=new DOMParser().parseFromString(html,'text/html');
    for(const node of parsed.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]')) node.remove();
    for(const node of parsed.querySelectorAll('*')) for(const attr of [...node.attributes]) {
      if(/^on/i.test(attr.name) || ['srcdoc','contenteditable','data-ru-dragging'].includes(attr.name) || (/^(?:href|src|action|formaction|xlink:href)$/i.test(attr.name) && /^(?:javascript|vbscript|data:text\/html):/i.test(attr.value.replace(/[\u0000-\u0020\u007f]/g,'')))) node.removeAttribute(attr.name);
    }
    parsed.querySelector('#ru-layout-helpers')?.remove();
    if(target==='block') {
      if(parsed.body.children.length!==1 || [...parsed.body.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) throw new Error('Для блока ИИ должен вернуть один корневой элемент.');
      return parsed.body.firstElementChild.outerHTML;
    }
    if(!parsed.body.children.length) throw new Error('В ответе нет содержимого страницы.');
    return '<!DOCTYPE html>\n'+parsed.documentElement.outerHTML;
  }
  function renderPacks() {
    const holder=panel.querySelector('#ai-packs');holder.replaceChildren();
    for(const pack of catalog.packs) {
      const section=document.createElement('section'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.pack=pack.id;check.checked=catalog.settings.enabledPacks.includes(pack.id);check.disabled=!!pack.error;label.append(check,document.createTextNode(' '+pack.name));section.append(label);
      const detail=document.createElement('small');detail.textContent=pack.error || pack.description;section.append(detail);
      for(const skill of pack.skills) {const line=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.skill=pack.id+'/'+skill.id;input.checked=catalog.settings.enabledSkills.includes(input.dataset.skill);line.append(input,document.createTextNode(' '+skill.name));section.append(line);}
      holder.append(section);
    }
    panel.querySelector('[name=instructions]').value=catalog.settings.customInstructions;
    panel.querySelector('#ai-base-instructions').textContent=catalog.baseInstructions;
    registerBlocks();
  }
  function registerBlocks() {
    for(const name of Object.keys(Vvveb.BlocksGroup)) if(name.startsWith('Плагин: ')) delete Vvveb.BlocksGroup[name];
    for(const pack of catalog.packs) if(!pack.error && catalog.settings.enabledPacks.includes(pack.id) && pack.blocks.length) {
      const group='Плагин: '+pack.name;Vvveb.BlocksGroup[group]=[];
      for(const [index,block] of pack.blocks.entries()) {const id='ai-pack/'+pack.id+'/'+index;try{Vvveb.Blocks.add(id,{name:block.name,image:'libs/builder/icons/section.svg',html:sanitize(block.html,'block')});Vvveb.BlocksGroup[group].push(id);}catch{}}
    }
    Vvveb.Builder.loadBlockGroups();
  }
  async function saveSettings() {
    catalog=await call('aiSettings',{enabledPacks:[...panel.querySelectorAll('[data-pack]:checked')].map(n=>n.dataset.pack),enabledSkills:[...panel.querySelectorAll('[data-skill]:checked')].map(n=>n.dataset.skill),customInstructions:panel.querySelector('[name=instructions]').value});
    renderPacks();message('Настройки сохранены. Включённые навыки будут использованы в следующей задаче.');
  }
  async function status() {
    const selected=provider();panel.querySelector('#ai-account').replaceChildren();message('Проверяю подключение…');const result=await call('aiStatus',selected);
    if(provider()!==selected) return result;
    renderAccount(result);
    message(result.connected?'Подключено по подписке'+(result.plan?' · '+result.plan:''):result.installed?'Программа найдена. Нажмите «Подключить» и войдите в аккаунт.':'Программа не найдена. Установите официальный Codex CLI / Claude Code или выберите его .exe.');
    return result;
  }
  function renderAccount(result) {
    const holder=panel.querySelector('#ai-account');holder.replaceChildren();if(!result.connected) return;
    const line=text=>{const p=document.createElement('p');p.textContent=text;holder.append(p);};
    line('Аккаунт: '+(result.email || result.name || 'Вход выполнен'));
    line('Тариф: '+(result.plan || 'провайдер не передал'));
    const buckets=result.limits?.rateLimitsByLimitId;
    const bucket=buckets?.codex || result.limits?.rateLimits || Object.values(buckets || {})[0],window=bucket?.primary;
    if(Number.isFinite(window?.usedPercent)) {
      const mins=window.windowDurationMins,duration=Number.isFinite(mins)?(mins>=1440?mins/1440+' дн.':mins>=60?mins/60+' ч.':mins+' мин.'):'Основной лимит';
      const remaining=Math.max(0,Math.min(100,100-window.usedPercent));
      line((bucket.limitName || bucket.limitId || 'codex')+' · '+duration+': осталось '+remaining+'%');
      if(Number.isFinite(window.resetsAt)) line('Обновление: '+new Date(window.resetsAt*1000).toLocaleString('ru-RU'));
    }
  }
  function undoLabel() {
    const button=document.querySelector('#ru-tools [data-action=undo]'),last=Vvveb.Undo.mutations[Vvveb.Undo.undoIndex];
    button.textContent=busy || last?.ai?'↶ Отменить ИИ':'↶ Отменить';
    button.title=busy?'Остановить ИИ и вернуть страницу до генерации':last?.ai?'Отменить все изменения последней генерации (Ctrl + Z)':'Отменить (Ctrl + Z)';
  }
  function capture(root,helper) {helper?.remove();try{return LayoutEditor.captureTree(root);}finally{if(helper) FrameDocument.head.append(helper);}}
  function startLive(target,node,page) {
    const root=target==='page'?FrameDocument.documentElement:node.parentNode,helper=FrameDocument.getElementById('ru-layout-helpers');
    helper?.remove();const initialHTML=root.outerHTML,oldValue=LayoutEditor.captureTree(root);if(helper) FrameDocument.head.append(helper);
    transaction={target,node,current:node,page,document:FrameDocument,root,helper,initialHTML,oldValue,dirty:DesktopEditor.dirty,changed:false,cancelled:false,lastHtml:null};
  }
  function liveHtml(html,partial=false) {
    const t=transaction;if(!busy || !t || t.cancelled) return;
    if(FrameDocument!==t.document || Vvveb.FileManager.getPageData().file!==t.page) throw new Error('Страница изменилась. Генерация отменена.');
    let cleaned;try{cleaned=sanitize(html,t.target);}catch(error){if(partial) return;throw error;}
    if(cleaned===t.lastHtml) return;t.lastHtml=cleaned;
    if(t.target==='block') {
      const template=FrameDocument.createElement('template');template.innerHTML=cleaned;
      if(!t.current?.isConnected) throw new Error('Исходный блок изменился. Генерация отменена.');
      const replacement=template.content.firstElementChild;t.current.replaceWith(replacement);t.current=replacement;
    } else {
      const parsed=new DOMParser().parseFromString(cleaned,'text/html');
      t.helper?.remove();FrameDocument.head.innerHTML=parsed.head.innerHTML;FrameDocument.body.innerHTML=parsed.body.innerHTML;
      for(const [dst,src] of [[FrameDocument.documentElement,parsed.documentElement],[FrameDocument.body,parsed.body]]) {for(const name of dst.getAttributeNames()) dst.removeAttribute(name);for(const attr of src.attributes) dst.setAttribute(attr.name,attr.value);}
      if(t.helper) FrameDocument.head.append(t.helper);
    }
    t.changed=true;DesktopEditor.markDirty(true);Vvveb.Builder.selectNode(false);
  }
  function restoreLive() {
    const t=transaction;if(!t || t.cancelled) return;t.cancelled=true;
    if(t.changed && FrameDocument===t.document) {Vvveb.Undo.restore({type:'domTree',ai:true,target:t.root,oldValue:t.oldValue},true);if(t.helper && !FrameDocument.getElementById('ru-layout-helpers')) FrameDocument.head.append(t.helper);}
    DesktopEditor.markDirty(t.dirty);Vvveb.Builder.selectNode(t.node?.isConnected?t.node:false);
  }
  async function cancel() {if(!busy) return;transaction.userCancelled=true;restoreLive();message('Генерация остановлена. Изменения ИИ отменены.');await call('aiCancel');}
  async function generate() {
    if(busy) return;const task=panel.querySelector('[name=task]').value.trim();if(!task) {message('Опишите, что нужно создать или изменить.',true);return;}
    DesktopEditor.finishText();const target=panel.querySelector('[name=target]').value,node=Vvveb.Builder.selectedEl,page=Vvveb.FileManager.getPageData().file;
    if(target==='block' && (!node?.isConnected || ['HTML','BODY'].includes(node.tagName))) {message('Выберите блок на странице или переключитесь на «Вся страница».',true);return;}
    if(target==='page' && LayoutEditor.scope) {message('Нажмите «Вся страница», чтобы изменить страницу целиком.',true);return;}
    const html=target==='block'?node.outerHTML:Vvveb.Builder.getHtml();startLive(target,node,page);busy=true;undoLabel();
    panel.querySelector('#ai-generate').disabled=true;panel.querySelector('#ai-stop').hidden=false;message('ИИ изменяет сайт прямо на странице. «Отменить ИИ» вернёт состояние до генерации.');
    const progress=panel.querySelector('#ai-progress'),started=Date.now();progressStage='Отправляю задачу…';received=0;progress.hidden=false;progress.querySelector('progress').hidden=false;panel.querySelector('[name=task]').value='';
    const updateProgress=()=>progress.querySelector('span').textContent=progressStage+' · '+Math.floor((Date.now()-started)/1000)+' с'+(received?' · получено '+received.toLocaleString('ru-RU')+' символов':'');
    progress.classList.remove('ai-error');updateProgress();progress.scrollIntoView({block:'nearest'});const timer=setInterval(updateProgress,1000);
    const controls=[...document.querySelectorAll('#site-ai [name=provider],#site-ai [name=target],#ai-connect,#ai-executable,#ai-status,#ru-save,#ru-edit,#ru-block-mode,#ru-preview,#ru-bar [data-command=create],#ru-bar [data-command=open],#ru-bar [data-command=image],#ru-bar [data-command=export],#ru-tools [data-action=redo]')].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);
    const locked=[...document.querySelectorAll('#canvas,#left-panel,#right-panel,#bottom-panel,#ru-layout')].map(element=>[element,element.inert]);locked.forEach(([element])=>element.inert=true);
    try {
      const answer=await call('aiGenerate',{provider:provider(),task,target,page,html});if(transaction.cancelled) return;
      liveHtml(answer.html);const t=transaction;if(target==='page'){Vvveb.StyleManager.styles={};Vvveb.StyleManager.init(FrameDocument);}t.helper?.remove();const finalHTML=t.root.outerHTML;if(t.helper) FrameDocument.head.append(t.helper);
      if(finalHTML!==t.initialHTML) Vvveb.Undo.addMutation({type:'domTree',ai:true,target:t.root,oldValue:t.oldValue,newValue:capture(t.root,t.helper)});else DesktopEditor.markDirty(t.dirty);
      if(target==='block') {Vvveb.Builder.selectNode(t.current);Vvveb.Builder.loadNodeComponent(t.current);}
      progress.querySelector('span').textContent='Готово. Изменения на странице. «Отменить ИИ» вернёт исходный сайт.';message(answer.summary);
    } catch(error) {
      const cancelled=transaction?.userCancelled;restoreLive();const text=cancelled?'Генерация остановлена. Изменения ИИ отменены.':error.message;
      message(text,!cancelled);progress.querySelector('span').textContent=text;progress.classList.toggle('ai-error',!cancelled);if(!panel.querySelector('[name=task]').value) panel.querySelector('[name=task]').value=task;
    } finally {
      if(transaction?.userCancelled) progress.querySelector('span').textContent='Генерация остановлена. Изменения ИИ отменены.';
      clearInterval(timer);busy=false;transaction=null;controls.forEach(([control,disabled])=>control.disabled=disabled);locked.forEach(([element,inert])=>element.inert=inert);
      panel.querySelector('#ai-generate').disabled=false;panel.querySelector('#ai-stop').hidden=true;progress.querySelector('progress').hidden=true;undoLabel();LayoutEditor.updateMode();renderHistory().catch(()=>{});
      const selected=provider();call('aiStatus',selected).then(result=>{if(provider()===selected) renderAccount(result);}).catch(()=>{});
    }
  }
  async function init() {
    const button=document.createElement('button');button.id='ru-ai-button';button.textContent='ИИ';button.title='ИИ-конструктор сайтов';document.querySelector('#ru-bar').insertBefore(button,document.querySelector('#ru-bar [data-command=help]'));
    panel=document.createElement('aside');panel.id='site-ai';panel.hidden=true;panel.innerHTML='<header><strong>ИИ-конструктор сайтов</strong><button id="ai-close" aria-label="Закрыть">×</button></header><label>Провайдер <select name="provider"><option value="chatgpt">ChatGPT · Codex</option><option value="claude">Claude · Claude Code</option></select></label><div class="ai-buttons"><button id="ai-connect">Подключить</button><button id="ai-status">Проверить вход</button><button id="ai-executable">Выбрать .exe</button></div><p role="status" aria-live="polite">Вход через официальный клиент по подписке. API-ключ не требуется.</p><label>Область задачи <select name="target"><option value="block">Выбранный блок</option><option value="page">Вся страница</option></select></label><label>Что нужно сделать?<textarea name="task" rows="4" maxlength="10000" placeholder="Создай блок услуг с тремя карточками, синими кнопками и адаптацией для телефона"></textarea></label><small>По кнопке отправляется задача и HTML выбранной области выбранному провайдеру. Изменения появляются прямо на странице. «Отменить ИИ» возвращает состояние до генерации.</small><div class="ai-buttons"><button id="ai-generate">Начать генерацию</button><button id="ai-stop" hidden>Остановить и отменить</button></div><details><summary>Плагины и навыки</summary><div id="ai-packs"></div><div class="ai-buttons"><button id="ai-import">Добавить плагин…</button><button id="ai-folder">Папка плагинов</button></div></details><details><summary>Инструкции ИИ</summary><label>Ваши дополнительные правила<textarea name="instructions" rows="4" maxlength="10000" placeholder="Например: фирменный цвет #315bea, тексты краткие, шрифт Arial"></textarea></label><button id="ai-settings">Сохранить настройки</button><details><summary>Основная инструкция конструктора</summary><pre id="ai-base-instructions"></pre></details></details>';document.body.append(panel);
    const account=document.createElement('section');account.id='ai-account';account.setAttribute('aria-label','Аккаунт и лимиты');panel.querySelector('[role=status]').after(account);
    const progress=document.createElement('div');progress.id='ai-progress';progress.hidden=true;progress.setAttribute('aria-live','polite');progress.setAttribute('aria-atomic','true');progress.innerHTML='<progress aria-label="Генерация сайта"></progress><span></span>';panel.querySelector('#ai-generate').parentElement.after(progress);
    const history=document.createElement('details');history.id='ai-history-section';history.innerHTML='<summary id="ai-history-title">История запросов</summary><div id="ai-history"></div>';progress.after(history);
    const access=document.createElement('small');access.textContent='ИИ получает HTML выбранной области и включённые инструкции. Может менять её текст, структуру и оформление. Изменения ИИ отменяются одной кнопкой; запись в файл выполняется кнопкой «Сохранить». Для небольших правок выбирайте блок — это сокращает контекст.';panel.querySelector('#ai-generate').parentElement.after(access);
    panel.querySelector('[name=target]').value='page';
    const codeDetails=document.createElement('details');codeDetails.id='ai-login-code';codeDetails.hidden=true;codeDetails.innerHTML='<summary>Claude показал код входа?</summary><p>Если после входа в браузере Claude просит перенести код, вставьте его сюда. Обычно вход завершается автоматически.</p><input type="password" autocomplete="off" aria-label="Код входа Claude"><button>Передать код</button>';panel.querySelector('#ai-status').parentElement.after(codeDetails);
    const guard=fn=>async()=>{try{await fn();}catch(error){message(error.message,true);}};
    button.onclick=guard(async()=>{panel.hidden=!panel.hidden;if(!panel.hidden) await status();});panel.querySelector('#ai-close').onclick=()=>panel.hidden=true;
    panel.querySelector('#ai-connect').onclick=guard(async()=>{await call('aiLogin',provider());message('Открылся вход в браузере. Завершите его, затем нажмите «Проверить вход».');});
    panel.querySelector('#ai-status').onclick=guard(status);panel.querySelector('[name=provider]').onchange=guard(async()=>{codeDetails.hidden=provider()!=='claude';await status();});
    codeDetails.querySelector('button').onclick=guard(async()=>{const input=codeDetails.querySelector('input');await call('aiLoginCode',input.value);input.value='';message('Код передан официальному клиенту Claude. Дождитесь завершения входа.');});
    panel.querySelector('#ai-executable').onclick=guard(async()=>{await call('aiExecutable',provider());await status();});
    panel.querySelector('#ai-generate').onclick=guard(generate);panel.querySelector('#ai-stop').onclick=guard(cancel);
    panel.querySelector('#ai-settings').onclick=guard(saveSettings);panel.querySelector('#ai-packs').onchange=guard(saveSettings);
    panel.querySelector('#ai-import').onclick=guard(async()=>{const result=await call('aiImportPlugin');if(result){catalog=result;renderPacks();message('Плагин добавлен. Включите нужные навыки.');}});panel.querySelector('#ai-folder').onclick=guard(()=>call('aiRevealPlugins'));
    window.desktop.onAiEvent(event=>{if(event.type==='history'){renderHistory().catch(()=>{});return;}if(event.provider!==provider()) return;if(event.type==='html' && busy){try{liveHtml(event.html,true);}catch(error){cancel().catch(()=>{});}return;}if(event.type==='progress' && busy){progressStage=event.stage;received=event.received || received;return;}if(event.type==='login'){message(event.success?'Вход завершён. Можно создавать сайт.':event.error,!event.success);if(event.success) status().catch(error=>message(error.message,true));}});
    const undo=Vvveb.Undo.undo,redo=Vvveb.Undo.redo,reset=Vvveb.Undo.reset;Vvveb.Undo.undo=function(){if(busy){cancel().catch(error=>message(error.message,true));return;}undo.call(this);undoLabel();};Vvveb.Undo.redo=function(){if(busy) return;redo.call(this);undoLabel();};Vvveb.Undo.reset=function(){reset.call(this);undoLabel();};
    const attachUndo=()=>{window.FrameDocument.body.addEventListener('vvveb.undo.add',undoLabel);window.FrameDocument.body.addEventListener('vvveb.undo.restore',event=>{if(event.detail?.ai){Vvveb.StyleManager.styles={};Vvveb.StyleManager.init(window.FrameDocument);}undoLabel();});};window.addEventListener('Vvveb.iframe.loaded',attachUndo);if(window.FrameDocument?.body) attachUndo();undoLabel();
    catalog=await call('aiCatalog');renderPacks();await renderHistory();
  }
  return {init,sanitize,cancel,get busy(){return busy;}};
})();
