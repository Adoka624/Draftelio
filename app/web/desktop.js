'use strict';
// Desktop adaptation, 2026. Reuse the existing builder and undo stack.
window.DesktopEditor = (() => {
  let dirty=false,saving=false,editing=true,project,changeVersion=0;
  const status = (message,error=false)=>{document.getElementById('ru-hint').textContent=message;document.getElementById('ru-status').classList.toggle('ru-error',error);};
  const markDirty = value=>{dirty=value;document.getElementById('ru-dirty').textContent=value?'● Есть несохранённые изменения':'✓ Изменения сохранены';window.desktop.dirty(value);};
  async function call(name,...args) {const result=await window.desktop[name](...args);if(!result.ok) throw new Error(result.error);return result.value;}
  function finishText() {
    window.LayoutEditor?.commit();
    if(Vvveb.WysiwygEditor.isActive) {Vvveb.WysiwygEditor.destroy(Vvveb.Builder.texteditEl);Vvveb.Builder.texteditEl=null;document.getElementById('select-box').classList.remove('text-edit');}
  }
  function refreshPages(data,selected) {
    project=data;Vvveb.FileManager.pages={};Vvveb.FileManager.tree.replaceChildren();
    for(const page of data.pages) Vvveb.FileManager.addPage(page.name,page);
    const page=data.pages.find(p=>p.file===selected) || data.pages[0];
    Vvveb.Undo.reset();markDirty(false);
    Vvveb.themeBaseUrl=page.url.slice(0,page.url.lastIndexOf('/')+1);
    window.mediaPath='/site/media/';
    if(Vvveb.MediaModal) {Vvveb.MediaModal.response=[];Vvveb.MediaModal.mediaPath=window.mediaPath;}
    Vvveb.FileManager.loadPage(page.name);
    document.getElementById('ru-project-path').textContent=data.root;
    document.getElementById('ru-project-path').title=data.root;
    document.getElementById('ru-page-name').textContent=page.title;
  }
  async function save() {
    if(window.Workshop?.open) return Workshop.run('save');
    if(window.SiteAi?.busy) {status('Дождитесь завершения ИИ или нажмите «Отменить».');return false;}
    if(saving) return false;
    finishText();
    const data=Vvveb.FileManager.getPageData();
    if(!data) return false;
    saving=true;document.getElementById('ru-save').disabled=true;status('Сохраняю страницу…');
    try {
      const html=Vvveb.Builder.getHtml();
      const version=changeVersion;
      const message=await call('save',{file:data.file,html});
      if(version===changeVersion) {Vvveb.Undo.reset();markDirty(false);} else markDirty(true);
      status(message);return true;
    } catch(error) {markDirty(true);status(error.message,true);return false;}
    finally {saving=false;document.getElementById('ru-save').disabled=false;}
  }
  function setMode(value) {
    finishText();editing=value;
    if(Vvveb.Builder.isPreview===value) Vvveb.Gui.preview();
    document.getElementById('ru-edit').setAttribute('aria-pressed',String(value));
    document.getElementById('ru-preview').setAttribute('aria-pressed',String(!value));
    status(value?'Нажмите на текст и печатайте. Нажмите на изображение, чтобы заменить его.':'Просмотр страницы. Чтобы изменить сайт, нажмите «Редактировать».');
    window.LayoutEditor?.updateMode(value);
  }
  function panel(name) {
    if(window.LayoutEditor?.mode==='text' && name!=='pages') return;
    if(!editing) setMode(true);
    if(name==='settings') {Vvveb.Gui.toggleRightColumn(null);return;}
    const pane={pages:'#pages-tabs',elements:'#components-tabs',blocks:'#components-tabs',sections:'#sections',styles:'#configuration'}[name];
    const tab=document.querySelector('.sidebar a[href="'+pane+'"]');
    if(tab) bootstrap.Tab.getOrCreateInstance(tab).show();
    if(name==='blocks' || name==='elements') bootstrap.Tab.getOrCreateInstance(document.querySelector('#left-panel a[href="'+(name==='blocks'?'#blocks':'#components')+'"]')).show();
    document.querySelectorAll('#ru-tools [data-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.panel===name)));
  }
  async function addImage() {
    if(window.LayoutEditor?.mode==='text') {status('Для изменения изображения переключитесь в режим «Блоки».');return;}
    const relative=await call('importImage');
    if(!relative) return;
    const selected=Vvveb.Builder.selectedEl;
    const current=Vvveb.FileManager.getPageData().file;
    const prefix='../'.repeat(current.split('/').length-1);
    const src=prefix+relative;
    if(selected?.tagName==='IMG') {
      const old=selected.getAttribute('src');selected.setAttribute('src',src);
      Vvveb.Undo.addMutation({type:'attributes',target:selected,attributeName:'src',oldValue:old,newValue:src});
      Vvveb.Builder.loadNodeComponent(selected);
    } else {
      const image=window.FrameDocument.createElement('img');image.src=src;image.alt='Описание изображения';image.style.cssText='max-width:100%;height:auto';
      Vvveb.Builder.frameBody.append(image);
      Vvveb.Undo.addMutation({type:'childList',target:image.parentNode,addedNodes:[image]});
      Vvveb.Builder.selectNode(image);Vvveb.Builder.loadNodeComponent(image);
    }
    if(Vvveb.MediaModal) Vvveb.MediaModal.response=[];
    status('Изображение добавлено. Сохраните страницу.');
  }
  function newPage() {document.getElementById('ru-new-page').showModal();document.getElementById('ru-filename').focus();}
  function help() {
    const el=document.getElementById('ru-help');el.hidden=!el.hidden;
    if(!el.hidden) el.querySelector('button').focus();
  }
  async function run(command) {
    try {
      if(window.Workshop?.open && ['undo','redo','save'].includes(command)) return Workshop.run(command);
      if(window.SiteAi?.busy && !['undo','help','reveal'].includes(command)) {status('ИИ изменяет страницу. «Отменить» остановит генерацию и вернёт исходное состояние.');return;}
      if(saving && ['create','open','newPage','export'].includes(command)) {status('Дождитесь завершения сохранения.');return;}
      if(command==='save') return await save();
      if(command==='edit') return setMode(true);
      if(command==='preview') return setMode(false);
      if(command==='help') return help();
      if(command==='newPage') return newPage();
      if(command==='undo' || command==='redo') {
        if(document.activeElement?.closest('.CodeMirror') && Vvveb.CodeEditor.isActive) return Vvveb.CodeEditor.codemirror[command]();
        return Vvveb.Gui[command]();
      }
      if(command==='image') return await addImage();
      if(command==='open' || command==='create') {finishText();const data=await call(command);if(data) {refreshPages(data);setMode(true);if(window.ProjectHome?.open) ProjectHome.hide();}}
      if(command==='export') {if(dirty && !await save()) return;const folder=await call('export');if(folder) status('Сайт экспортирован: '+folder);}
      if(command==='reveal') await call('reveal');
    } catch(error) {status(error.message,true);}
  }
  async function start() {
    if(!window.desktop) {document.body.textContent='Запустите файл «Draftelio.exe». Этот редактор предназначен для десктопного приложения.';return;}
    Ru.registries();
    Vvveb.NewSection.template=Vvveb.NewSection.template.replace('Blank section','Пустая секция').replace('Add section','Добавить секцию');
    // Editor previews stay local; external assets in website templates are preserved.
    for(const registry of [Vvveb.Blocks._blocks,Vvveb.Sections._sections]) for(const item of Object.values(registry)) if(/^https?:\/\//.test(item.image || '')) item.image='libs/builder/icons/section.svg';
    Coloris({clearLabel:'Очистить',closeLabel:'Закрыть',a11y:{open:'Открыть выбор цвета',close:'Закрыть выбор цвета',clear:'Очистить цвет',marker:'Насыщенность: {s}. Яркость: {v}.',hueSlider:'Оттенок',alphaSlider:'Непрозрачность',input:'Значение цвета',format:'Формат цвета',swatch:'Образец цвета',instruction:'Выбор насыщенности и яркости. Используйте клавиши со стрелками.'}});
    ImageInput.setValue=function(value) {
      const root=this.element[0];if(!root) return;
      root.querySelector('input[type=text]').value=value || '';
      root.querySelector('img').src=value && !['initial','inherit','unset','none'].includes(value)?new URL(value,Vvveb.Builder.iframe.src).href:Vvveb.baseUrl+'icons/image.svg';
    };
    ImageInput.onImageChange=function(event,node,input) {
      const value=this.value;
      input.value=value;
      node.querySelector('img').src=value?new URL(value,Vvveb.Builder.iframe.src).href:Vvveb.baseUrl+'icons/image.svg';
      input.onChange.call(this,event,node,input);
    };
    MediaModal.prototype.save=function() {
      const selected=this.container.querySelector('.files input:checked');
      if(!selected) {status('Выберите изображение в списке.');return;}
      const prefix='../'.repeat(Vvveb.FileManager.getPageData().file.split('/').length-1);
      const src=prefix+'media/'+selected.value.replace(/^\/+/, '');
      if(this.targetThumb) document.querySelector(this.targetThumb).src=new URL(src,Vvveb.Builder.iframe.src).href;
      this.callback?.(src);
      if(this.targetInput) {const input=document.querySelector(this.targetInput);input.value=src;input.dispatchEvent(new Event('change',{bubbles:true}));}
      if(this.isModal) bootstrap.Modal.getOrCreateInstance(this.container).hide();
    };
    MediaModal.prototype.searchByPath=function(dir) {
      const find=items=>{for(const item of items) {if(item.type==='folder') {if(item.path===dir) return item.items;const found=find(item.items);if(found) return found;}}};
      return find(this.response) || [];
    };
    const openMedia=MediaModal.prototype.open;
    MediaModal.prototype.open=async function(...args) {
      try {
        const response=await fetch('scan.php');if(!response.ok) throw new Error('Не удалось загрузить список изображений.');
        this.setResponse([await response.json()]);
        const result=openMedia.apply(this,args);this.goto('');return result;
      } catch(error) {status(error.message,true);}
    };
    // The upstream toggle mixes up its explicit enabled/disabled branch.
    Vvveb.Gui.toggleRightColumn=function(_event,enabled=null) {
      const builder=document.getElementById('vvveb-builder');
      if(enabled===null) enabled=builder.classList.contains('no-right-panel');
      builder.classList.toggle('no-right-panel',!enabled);
      document.getElementById('right-panel').style.display=enabled?'':'none';
      document.body.style.setProperty('--builder-right-panel-width',enabled?'300px':'0px');
      Vvveb.Components.componentPropertiesElement=(enabled?'#right-panel':'#left-panel #properties')+' .component-properties';
      document.querySelectorAll('.component-properties-tab').forEach(el=>el.classList.toggle('d-none',enabled));
      document.querySelector('#ru-tools [data-panel=settings]')?.setAttribute('aria-pressed',String(enabled));
      if(Vvveb.Builder.selectedEl) Vvveb.Builder.loadNodeComponent(Vvveb.Builder.selectedEl);
      return enabled;
    };
    const toast=window.displayToast;window.displayToast=(background,title,message)=>toast(background,Ru.t(title),Ru.t(message));
    const bar=document.createElement('div');bar.id='ru-bar';bar.innerHTML=`<div class="ru-brand">Draftelio</div><button data-command="create" title="Создать новый сайт">Новый сайт</button><button data-command="open" title="Открыть папку существующего сайта (Ctrl + O)">Открыть сайт</button><div id="ru-project"><strong id="ru-page-name"></strong><div id="ru-project-path"></div></div><button id="ru-preview" data-command="preview" aria-pressed="false">Просмотр</button><button id="ru-edit" data-command="edit" aria-pressed="true">Редактировать</button><button data-command="image" title="Заменить выбранное изображение или добавить новое">Изображение</button><button id="ru-save" class="ru-primary" data-command="save" title="Сохранить страницу (Ctrl + S)">Сохранить</button><button data-command="export" title="Скопировать весь сайт в новую папку">Экспорт</button><button data-command="help" title="Как пользоваться">?</button>`;
    document.body.prepend(bar);
    const themeButton=document.createElement('button');themeButton.id='ru-theme';bar.insertBefore(themeButton,bar.querySelector('[data-command=help]'));
    const showTheme=()=>{const dark=document.documentElement.dataset.bsTheme==='dark';themeButton.textContent=dark?'☀ Светлая':'☾ Тёмная';themeButton.title=dark?'Включить светлую тему':'Включить тёмную тему';themeButton.setAttribute('aria-label',themeButton.title);themeButton.setAttribute('aria-pressed',String(dark));};
    showTheme();themeButton.onclick=async()=>{themeButton.disabled=true;try{document.documentElement.dataset.bsTheme=await call('setTheme',document.documentElement.dataset.bsTheme==='dark'?'light':'dark');showTheme();}catch(error){status(error.message,true);}finally{themeButton.disabled=false;}};
    const strip=document.createElement('div');strip.id='ru-status';strip.innerHTML='<span id="ru-hint"></span><span id="ru-dirty"></span>';bar.after(strip);
    const tools=document.createElement('div');tools.id='ru-tools';tools.innerHTML='<button data-panel="pages" aria-pressed="true">Страницы</button><button data-panel="elements" aria-pressed="false">Элементы</button><button data-panel="blocks" aria-pressed="false">Блоки</button><button data-panel="sections" aria-pressed="false">Секции</button><button data-panel="styles" aria-pressed="false">Оформление</button><button data-panel="settings" aria-pressed="false">Настройки элемента</button><span style="flex:1"></span><button data-action="undo" title="Отменить (Ctrl + Z)">↶ Отменить</button><button data-action="redo" title="Повторить (Ctrl + Shift + Z)">↷ Повторить</button><button data-view="sm">Телефон</button><button data-view="md">Планшет</button><button data-view="xxl">Компьютер</button>';
    strip.after(tools);
    const newDialog=document.createElement('dialog');newDialog.id='ru-new-page';newDialog.innerHTML='<form><h2>Новая страница</h2><label for="ru-filename">Имя файла (например, о-нас.html)</label><input id="ru-filename" required value="новая-страница.html" pattern=".+\\.html?" autocomplete="off"><p>Можно указать вложенную папку: услуги/дизайн.html</p><p id="ru-create-error" role="alert"></p><button type="submit">Создать</button><button type="button">Отмена</button></form>';document.body.append(newDialog);
    newDialog.querySelector('button[type=button]').onclick=()=>newDialog.close();
    newDialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();finishText();
      if(dirty && !await save()) return;
      const filename=document.getElementById('ru-filename').value.trim();
      try {refreshPages(await call('newPage',filename),filename);newDialog.close();setMode(true);} catch(error) {document.getElementById('ru-create-error').textContent=error.message;}
    };
    const helpPanel=document.createElement('div');helpPanel.id='ru-help';helpPanel.hidden=true;helpPanel.setAttribute('role','dialog');helpPanel.setAttribute('aria-label','Как пользоваться редактором');helpPanel.innerHTML='<h2>Как изменить сайт</h2><ol><li>Откройте папку сайта кнопкой «Открыть сайт» или создайте новый.</li><li>Нажмите «Текст». Нажмите на надпись и печатайте прямо на странице.</li><li>Нажмите на картинку, затем «Изображение» — выберите файл на компьютере.</li><li>Чтобы добавить блок, откройте слева вкладку «Блоки», раздел «Русские блоки». Перетащите блок на страницу.</li><li>Для цвета, размера и других настроек выберите элемент и откройте панель справа.</li><li>Нажмите «Сохранить» или Ctrl + S. Предыдущая версия останется в .vvveb-backups.</li><li>«Экспорт» копирует весь сайт вместе с изображениями и стилями в новую папку.</li></ol><p>«Блоки» — перемещение элементов с перестройкой страницы. «Новый холст» — размещение по координатам. «Ссылка…» — назначение адреса. ПКМ — действия с отдельным блоком. Ctrl + Z — отменить. Ctrl + Shift + Z — повторить. «Просмотр» скрывает рамки редактора. Внутри редактора скрипты сайта и отправка форм отключены; проверяйте их в браузере после экспорта. Формы входа и подписки — шаблоны, серверная часть не подключена.</p><button class="btn btn-primary">Понятно</button>';document.body.append(helpPanel);helpPanel.querySelector('button').onclick=()=>helpPanel.hidden=true;
    bar.addEventListener('click',event=>{const button=event.target.closest('[data-command]');if(button) run(button.dataset.command);});
    window.desktop.onCommand(run);
    const iframe=document.querySelector('#iframe-wrapper iframe');iframe.setAttribute('sandbox','allow-same-origin');
    project=await call('state');
    const first=project.pages[0];
    window.mediaPath='/site/media/';Vvveb.themeBaseUrl=first.url.slice(0,first.url.lastIndexOf('/')+1);
    Vvveb.Builder.init(first.url,()=>{});
    // Gui.init attaches function references, so desktop actions must exist before it.
    Vvveb.Gui.newPage=newPage;Vvveb.Gui.download=()=>run('export');Vvveb.Gui.save=()=>save();
    Vvveb.Gui.init();Vvveb.FileManager.init();Vvveb.SectionList.init();Vvveb.StyleList.init();Vvveb.TreeList.init();Vvveb.Breadcrumb.init();Vvveb.CssEditor.init();
    Vvveb.FileManager.addPages(project.pages);Vvveb.FileManager.loadPage(first.name);Vvveb.Gui.toggleRightColumn(null,false);
    tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','Инструменты страницы');
    for(const button of tools.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view==='xxl'));
    tools.addEventListener('click',event=>{const button=event.target.closest('button');if(!button) return;if(button.dataset.panel) panel(button.dataset.panel);if(button.dataset.action) run(button.dataset.action);if(button.dataset.view){Vvveb.Gui.viewport.call(button);for(const view of tools.querySelectorAll('[data-view]')) view.setAttribute('aria-pressed',String(view===button));}});
    // One guard for every page-changing caller, including tree clicks and reload.
    const loadPage=Vvveb.FileManager.loadPage;
    Vvveb.FileManager.loadPage=function(name,...args) {
      if(window.SiteAi?.busy) return false;
      finishText();
      if(dirty && !window.confirm('Изменения не сохранены. Перейти на другую страницу без сохранения?')) return false;
      markDirty(false);Vvveb.Undo.reset();
      const page=this.pages[name];Vvveb.themeBaseUrl=page.url.slice(0,page.url.lastIndexOf('/')+1);
      document.getElementById('ru-page-name').textContent=page.title;
      return loadPage.call(this,name,...args);
    };
    Vvveb.Builder.save=async function(data,_url,success,error) {
      try {
        finishText();
        if(data.startTemplateUrl) {const result=await call('newPage',data.file);refreshPages(result,data.file);success?.('Страница создана.');}
        else {const result=await call('save',{file:data.file||Vvveb.FileManager.getPageData().file,html:data.html||this.getHtml()});markDirty(false);Vvveb.Undo.reset();success?.(result);}
      } catch(err) {error?.(err);status(err.message,true);}
    };
    // Finish active text before exports; serialization must not leave a stale editing flag.
    const getHtml=Vvveb.Builder.getHtml;
    Vvveb.Builder.getHtml=function(...args) {finishText();return getHtml.apply(this,args);};
    const setHtml=Vvveb.Builder.setHtml;
    Vvveb.Builder.setHtml=function(...args) {finishText();setHtml.apply(this,args);changeVersion++;markDirty(true);};
    const setCss=Vvveb.StyleManager.setCss;
    Vvveb.StyleManager.setCss=function(...args) {setCss.apply(this,args);changeVersion++;markDirty(true);};
    const textToolbar=document.getElementById('wysiwyg-editor'),selectBox=document.getElementById('select-box'),canvas=document.getElementById('canvas');
    const positionTextToolbar=()=>{
      if(!Vvveb.WysiwygEditor.isActive) return;
      const bounds=canvas.getBoundingClientRect(),box=selectBox.getBoundingClientRect(),gap=8;
      const left=Math.max(gap,bounds.left+gap),right=Math.min(innerWidth-gap,bounds.right-gap),top=Math.max(gap,bounds.top+gap),bottom=Math.min(innerHeight-gap,bounds.bottom-gap);
      textToolbar.style.maxWidth=Math.max(1,right-left)+'px';
      const size=textToolbar.getBoundingClientRect(),above=box.top-size.height-gap;
      textToolbar.style.left=Math.max(left,Math.min(box.left,right-size.width))+'px';
      textToolbar.style.top=Math.max(top,Math.min(above>=top?above:box.bottom+gap,bottom-size.height))+'px';
    };
    new MutationObserver(positionTextToolbar).observe(selectBox,{attributes:true,attributeFilter:['style','class']});
    const toolbarResize=new ResizeObserver(positionTextToolbar);toolbarResize.observe(textToolbar);toolbarResize.observe(canvas);
    const destroy=Vvveb.WysiwygEditor.destroy;
    Vvveb.WysiwygEditor.destroy=function(element) {if(!this.isActive || !element) return;if(this.oldValue===element.innerHTML) {element.removeAttribute('contenteditable');element.removeAttribute('spellcheckker');this.isActive=false;document.getElementById('wysiwyg-editor').style.display='none';return;}return destroy.call(this,element);};
    window.addEventListener('Vvveb.iframe.loaded',()=>{
      const body=Vvveb.Builder.frameBody;
      const changed=()=>{changeVersion++;markDirty(true);};
      body.addEventListener('vvveb.undo.add',changed);body.addEventListener('vvveb.undo.restore',changed);
      body.addEventListener('input',event=>{if(event.target.closest('[contenteditable]')) changed();});
      body.addEventListener('click',event=>{
        if(event.target.closest('a,button,input,form')) event.preventDefault();
        if(!editing || window.LayoutEditor?.mode==='blocks' || Vvveb.WysiwygEditor.isActive || event.target.closest('input,textarea,select,video,audio')) return;
        const text=event.target.closest('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,summary,blockquote,figcaption,td,th,strong,em');
        if(text && !text.querySelector('img,input,textarea,select,section,article,div,ul,ol,details')) text.dispatchEvent(new window.FrameWindow.MouseEvent('dblclick',{bubbles:true,cancelable:true}));
      });
      window.FrameDocument.addEventListener('keydown',event=>{
        if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='s') {event.preventDefault();event.stopImmediatePropagation();save();}
        if(event.key==='Escape') finishText();
      },true);
      status(editing?'Нажмите на текст и печатайте. Для картинок используйте «Изображение».':'Режим просмотра. Для изменений нажмите «Редактировать».');
    });
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s') {event.preventDefault();event.stopImmediatePropagation();save();}if(event.key==='Escape') helpPanel.hidden=true;},true);
    // Gallery uploads use a native picker; files remain inside the selected site.
    const modalInit=MediaModal.prototype.init;
    MediaModal.prototype.init=function(...args) {const result=modalInit.apply(this,args);for(const button of this.container.querySelectorAll('[data-bs-target=".upload-collapse"]')) {button.removeAttribute('data-bs-toggle');button.removeAttribute('data-bs-target');button.onclick=async()=>{await run('image');bootstrap.Modal.getOrCreateInstance(this.container).hide();};}return result;};
    LayoutEditor.init();
    await SiteAi.init();
    await Workshop.init();
    Ru.observe();
    document.getElementById('ru-project-path').textContent=project.root;document.getElementById('ru-page-name').textContent=first.title;
    markDirty(false);setMode(true);
    await InterfaceVariants.init();
    await ProjectHome.init();
    window.DesktopEditorReady=true;
  }
  return {start,run,save,setMode,finishText,markDirty,refreshPages,get dirty(){return dirty;},get project(){return project;}};
})();
document.addEventListener('DOMContentLoaded',()=>DesktopEditor.start().catch(error=>{document.getElementById('ru-hint')?.replaceChildren(document.createTextNode(error.message));console.error(error);}));

