'use strict';
window.InterfaceVariants=(()=>{
 let active=null,returnFocus=null;
 const groups=[];
 const design=async value=>{const response=await window.desktop.design(value);if(!response.ok) throw new Error(response.error);return response.value;};
 const close=()=>{for(const {trigger,content} of groups){content.hidden=true;trigger.setAttribute('aria-expanded','false');}active=null;};
 function paletteDrag(){
  const panel=document.getElementById('left-panel');let drag=null;
  const cancel=()=>{if(!drag) return;drag.ghost.remove();if(panel.hasPointerCapture(drag.id)) panel.releasePointerCapture(drag.id);drag=null;};
  const destination=event=>{
   const frame=Vvveb.Builder.iframe.getBoundingClientRect();if(event.clientX<frame.left || event.clientX>frame.right || event.clientY<frame.top || event.clientY>frame.bottom) return null;
   const hit=FrameDocument.elementFromPoint(event.clientX-frame.left,event.clientY-frame.top);if(!hit || (LayoutEditor.scope && !LayoutEditor.scope.contains(hit))) return null;
   const node=hit.closest('section,article,div,main,header,footer,nav,p,h1,h2,h3,h4,h5,h6,a,button,li,img') || FrameDocument.body;
   if(node.matches('section,article,div,main,header,footer,nav,body')) return {parent:node,next:null};
   const r=node.getBoundingClientRect();return {parent:node.parentElement,next:event.clientY-frame.top<r.top+r.height/2?node:node.nextSibling};
  };
  panel.addEventListener('pointerdown',event=>{
   const card=event.target.closest('li[data-type][data-drag-type]');if(!card || event.button!==0 || LayoutEditor.mode!=='blocks' || SiteAi.busy) return;
   event.preventDefault();event.stopImmediatePropagation();DesktopEditor.finishText();
   const registry=card.dataset.dragType==='block'?Vvveb.Blocks:card.dataset.dragType==='section'?Vvveb.Sections:Vvveb.Components,component=registry.get(card.dataset.type);if(!component) return;
   const ghost=document.createElement('div');ghost.id='v-palette-drag';ghost.textContent=component.name;ghost.hidden=true;document.body.append(ghost);drag={id:event.pointerId,component,ghost,x:event.clientX,y:event.clientY,moved:false};panel.setPointerCapture(event.pointerId);
  },true);
  panel.addEventListener('mousedown',event=>{if(event.target.closest('li[data-type][data-drag-type]')){event.preventDefault();event.stopImmediatePropagation();}},true);
  panel.addEventListener('pointermove',event=>{if(!drag) return;event.preventDefault();event.stopImmediatePropagation();drag.moved ||= Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6;if(!drag.moved) return;drag.ghost.hidden=false;drag.ghost.style.left=event.clientX+14+'px';drag.ghost.style.top=event.clientY-20+'px';drag.ghost.dataset.valid=String(!!destination(event));});
  panel.addEventListener('pointerup',event=>{
   if(!drag) return;event.preventDefault();event.stopImmediatePropagation();const target=drag.moved?destination(event):null,component=drag.component;cancel();if(!target) return;
   const template=FrameDocument.createElement('template');template.innerHTML=SiteAi.sanitize(component.html.replaceAll('RANDOM_ID',String(Math.floor(Math.random()*100000))),'block');const nodes=[...template.content.childNodes];if(!nodes.length) return;target.parent.insertBefore(template.content,target.next);
   Vvveb.Undo.addMutation({type:'childList',target:target.parent,addedNodes:nodes,nextSibling:target.next});const node=nodes.find(n=>n.nodeType===1);if(node){Vvveb.Builder.selectNode(node);Vvveb.Builder.loadNodeComponent(node);}document.getElementById('ru-hint').textContent='Элемент добавлен. «Отменить» вернёт исходную страницу.';
   if(node?.tagName==='IMG') DesktopEditor.run('image');
  });
  panel.addEventListener('pointercancel',cancel);document.addEventListener('keydown',event=>{if(event.key==='Escape') cancel();});
 }
 function position(group){
  const r=group.trigger.getBoundingClientRect(),n=group.content;
  const dock=group.trigger.closest('#ru-tools'),up=!!dock && dock.getBoundingClientRect().top>innerHeight/2;
  n.classList.toggle('v-sheet-up',up);
  const edge=up?dock.getBoundingClientRect().top:r.bottom;
  n.style.maxHeight=Math.max(120,up?edge-12:innerHeight-edge-40)+'px';
  n.style.left=Math.max(10,Math.min(r.left,innerWidth-n.offsetWidth-10))+'px';
  n.style.top=Math.max(10,up?edge-n.offsetHeight+1:edge-1)+'px';
 }
 function group(parent,id,label,nodes){
  const box=document.createElement('div');box.className='v-group';
  const trigger=document.createElement('button');trigger.type='button';trigger.id=id;trigger.textContent=label+' ▾';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id+'-content');
  const content=document.createElement('section');content.id=id+'-content';content.className='v-sheet';content.hidden=true;content.setAttribute('aria-label',label);
  const title=document.createElement('strong');title.className='v-sheet-title';title.textContent=label;content.append(title,...nodes.filter(Boolean));box.append(trigger,content);parent.append(box);
  const item={trigger,content};groups.push(item);trigger.onclick=()=>{const open=content.hidden;close();if(open){content.hidden=false;trigger.setAttribute('aria-expanded','true');active=item;returnFocus=trigger;position(item);content.querySelector('button:not(:disabled),select:not(:disabled)')?.focus();}};
  return item;
 }
 async function init(){
  const bar=document.getElementById('ru-bar'),tools=document.getElementById('ru-tools'),layout=document.getElementById('ru-layout');
  document.documentElement.dataset.design='bloom';
  const files=group(bar,'v-file','Сайт',[bar.querySelector('[data-command=create]'),bar.querySelector('[data-command=open]'),bar.querySelector('[data-command=export]')]);bar.querySelector('.ru-brand').after(files.trigger.parentElement);
  const modes=document.createElement('div');modes.className='v-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Режим редактора');modes.append(...['ru-preview','ru-edit','ru-block-mode'].map(id=>document.getElementById(id)));document.getElementById('ru-project').after(modes);
  group(bar,'v-preferences','Вид',[document.getElementById('ru-theme'),bar.querySelector('[data-command=help]')]);
  bar.querySelector('[data-command=help]').textContent='Помощь';
  document.getElementById('ru-theme').addEventListener('click',close);
  const pages=tools.querySelector('[data-panel=pages]');pages.textContent='Страницы';pages.title='Открыть страницы и структуру';
  group(tools,'v-add','Добавить',[...tools.querySelectorAll('[data-panel=elements],[data-panel=blocks],[data-panel=sections]'),bar.querySelector('[data-command=image]')]);
  group(tools,'v-properties','Оформление',[...tools.querySelectorAll('[data-panel=styles],[data-panel=settings]')]);
  const history=document.createElement('div');history.className='v-history';history.setAttribute('aria-label','История изменений');history.append(...tools.querySelectorAll('[data-action]'));tools.append(history);
  group(tools,'v-device','Экран',[...tools.querySelectorAll('[data-view]')]);
  const workshop=document.getElementById('ru-workshop');tools.append(workshop);
  const placement=group(layout,'v-placement','Размещение',[...layout.children]);tools.append(layout);
  tools.querySelector('span')?.remove();
  // Keep existing controls inside their delegated roots so editor actions remain intact.
  for(const side of ['left','right']){
   const panel=document.getElementById(side+'-panel'),button=document.createElement('button');button.type='button';button.className='v-close-panel';button.textContent='×';button.setAttribute('aria-label','Закрыть '+(side==='left'?'навигацию':'свойства'));button.onclick=()=>{document.body.removeAttribute('data-v-'+side);if(side==='right') Vvveb.Gui.toggleRightColumn(null,false);pages.setAttribute('aria-expanded','false');returnFocus?.focus();};panel.prepend(button);
  }
  pages.setAttribute('aria-controls','left-panel');pages.setAttribute('aria-expanded','false');
  tools.addEventListener('click',event=>{
   const node=event.target.closest('button');if(!node) return;
   if(node.dataset.command && !SiteAi.busy && !node.disabled){DesktopEditor.run(node.dataset.command);close();}
   if(node.dataset.panel && !node.disabled && !(LayoutEditor.mode==='text' && node.dataset.panel!=='pages')){
    if(node.dataset.panel==='settings'){document.body.toggleAttribute('data-v-right',!document.getElementById('vvveb-builder').classList.contains('no-right-panel'));}
    else{const was=document.body.hasAttribute('data-v-left');document.body.toggleAttribute('data-v-left',node!==pages || !was);pages.setAttribute('aria-expanded',String(document.body.hasAttribute('data-v-left')));}
    returnFocus=node===pages?pages:document.getElementById(node.dataset.panel==='styles' || node.dataset.panel==='settings'?'v-properties':'v-add');close();
   }
   if(node.dataset.view){document.getElementById('v-device').textContent=node.textContent+' ▾';close();}
  });
  bar.addEventListener('click',event=>{if(event.target.closest('[data-command]')) close();});
  document.addEventListener('pointerdown',event=>{if(active && !active.trigger.parentElement.contains(event.target)) close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !document.querySelector('dialog[open]')){if(active){const trigger=active.trigger;close();trigger.focus();}else{document.body.removeAttribute('data-v-left');document.body.removeAttribute('data-v-right');Vvveb.Gui.toggleRightColumn(null,false);pages.setAttribute('aria-expanded','false');returnFocus?.focus();}}});
  // An iframe receives its own events; close sheets when editing the page.
  const attach=()=>{window.FrameDocument?.addEventListener('pointerdown',close);};attach();document.querySelector('#iframe-wrapper iframe').addEventListener('load',attach);
  const observer=new MutationObserver(()=>{if(document.body.dataset.ruMode==='text'){document.body.removeAttribute('data-v-right');}if(document.body.dataset.ruMode==='preview'){close();document.body.removeAttribute('data-v-left');document.body.removeAttribute('data-v-right');}});observer.observe(document.body,{attributes:true,attributeFilter:['data-ru-mode']});
  window.addEventListener('resize',()=>{if(active) position(active);});
  placement.content.classList.add('v-placement-sheet');document.getElementById('v-device').textContent='Компьютер ▾';
  paletteDrag();
  const replace=document.createElement('button');replace.id='ru-replace-image';replace.type='button';replace.textContent='Выбрать фото';replace.title='Выбрать или заменить фотографию';replace.hidden=true;document.getElementById('select-actions').append(replace);replace.onclick=event=>{event.preventDefault();event.stopPropagation();DesktopEditor.run('image');};
  const showReplace=()=>{replace.hidden=LayoutEditor.mode!=='blocks' || Vvveb.Builder.isPreview || Vvveb.Builder.selectedEl?.tagName!=='IMG';};window.addEventListener('Vvveb.Builder.selectNode',showReplace);
  new MutationObserver(showReplace).observe(document.body,{attributes:true,attributeFilter:['data-ru-mode']});
  const imageDocuments=new WeakSet();
  const imageDoubleClick=()=>{const doc=window.FrameDocument;if(!doc || imageDocuments.has(doc)) return;imageDocuments.add(doc);let down=null,last=null;
   doc.addEventListener('pointerdown',event=>{down=event.target.tagName==='IMG'?{node:event.target,x:event.clientX,y:event.clientY}:null;},true);
   doc.addEventListener('pointerup',event=>{const hit=down;down=null;if(!hit || doc.elementFromPoint(event.clientX,event.clientY)!==hit.node || Math.hypot(event.clientX-hit.x,event.clientY-hit.y)>6 || LayoutEditor.mode!=='blocks' || Vvveb.Builder.isPreview || SiteAi.busy || (LayoutEditor.scope && !LayoutEditor.scope.contains(hit.node))) return;const now=Date.now();if(last?.node===hit.node && now-last.time<450){last=null;setTimeout(()=>{if(hit.node.isConnected && !SiteAi.busy){Vvveb.Builder.selectNode(hit.node);DesktopEditor.run('image');}},0);}else last={node:hit.node,time:now};},true);
  };
  imageDoubleClick();window.addEventListener('Vvveb.iframe.loaded',imageDoubleClick);
 }
 return {init,close};
})();
