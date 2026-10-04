'use strict';
// Desktop layout controls reuse the builder selection, serialization and undo stack.
window.LayoutEditor=(()=>{
  let mode='text',scope=null,drag=null,menu,bar,linkDialog,geometry,resizeHandle,scopeOverlay;
  const animations=new Set();
  function stopAnimations(){for(const animation of animations) animation.cancel();animations.clear();}
  const builder=()=>Vvveb.Builder;
  const doc=()=>window.FrameDocument;
  const selected=()=>builder().selectedEl;
  const boardOf=node=>node?.parentElement?.closest('[data-ru-canvas]');
  const hint=text=>document.getElementById('ru-hint').textContent=text;
  const editable=node=>node?.nodeType===1 && !['HTML','BODY','SCRIPT','STYLE','LINK','META'].includes(node.tagName) && (!scope || scope===node || scope.contains(node));
  const attr=(node,name,value)=>{const old=node.getAttribute(name);if(value===null) node.removeAttribute(name);else node.setAttribute(name,value);return {type:'attributes',target:node,attributeName:name,oldValue:old,newValue:node.getAttribute(name)};};
  const styleChange=(node,change)=>{const old=node.getAttribute('style');change(node.style);return {type:'attributes',target:node,attributeName:'style',oldValue:old,newValue:node.getAttribute('style')};};
  function tree(node) {
    const items=[];
    const walk=n=>{if(n.nodeType===1) {items.push({node:n,attributes:[...n.attributes].map(a=>[a.name,a.value]),children:[...n.childNodes]});for(const child of n.childNodes) walk(child);}else items.push({node:n,value:n.nodeValue});};
    walk(node);return items;
  }
  function record(items) {items=items.filter(m=>m.type!=='attributes' || m.oldValue!==m.newValue);if(items.length) Vvveb.Undo.addMutation(items.length===1?items[0]:{type:'group',mutations:items});refresh();}
  function select(node) {if(!editable(node)) return;builder().selectNode(node);builder().loadNodeComponent(node);refresh();}
  function updateMode(editing=!builder().isPreview) {
    document.body.dataset.ruMode=editing?mode:'preview';
    for(const button of document.querySelectorAll('[data-layout-mode]')) button.setAttribute('aria-pressed',String(editing && button.dataset.layoutMode===mode));
    bar.hidden=!editing;menu.hidden=true;
    for(const control of bar.querySelectorAll('select,[data-layout-action]:not([data-layout-action=link])')) control.disabled=mode!=='blocks';
    for(const control of menu.querySelectorAll('[data-context]')) control.disabled=mode!=='blocks' && !['link','exit'].includes(control.dataset.context);
    for(const control of document.querySelectorAll('#ru-tools [data-panel]:not([data-panel=pages]),#ru-bar [data-command=image]')) control.disabled=mode==='text';
    hint(!editing?'Просмотр. Ссылки внутри страницы отключены; адрес проверяйте кнопкой «Ссылка».':mode==='text'?'Режим «Текст»: нажмите на надпись. Для перемещения переключитесь на «Блоки».':'Режим «Блоки»: тяните любой элемент. Страница перестраивается до отпускания мыши. ПКМ — действия с блоком.');
    refresh();
  }
  function setMode(value) {cancel();DesktopEditor.finishText();mode=value;DesktopEditor.setMode(true);}
  function refresh() {
    if(!bar) return;
    if(scope && !scope.isConnected) scope=null;
    document.getElementById('ru-scope').textContent=scope?'Блок: '+(scope.id || scope.tagName.toLowerCase()):'Вся страница';
    document.getElementById('ru-scope-exit').hidden=!scope;
    scopeOverlay.hidden=!scope || builder().isPreview;
    if(scope && !builder().isPreview) {
      const frame=builder().iframe.getBoundingClientRect(),r=scope.getBoundingClientRect(),box=scopeOverlay.firstElementChild;
      Object.assign(scopeOverlay.style,{left:frame.left+'px',top:frame.top+'px',width:frame.width+'px',height:frame.height+'px'});
      Object.assign(box.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    }
    const node=selected(),valid=editable(node),free=valid && !!boardOf(node);
    geometry.hidden=!valid || mode!=='blocks' || builder().isPreview;
    resizeHandle.hidden=geometry.hidden;
    if(valid) {
      const r=node.getBoundingClientRect();
      for(const [key,value] of Object.entries({x:parseFloat(node.style.left)||0,y:parseFloat(node.style.top)||0,width:r.width,height:r.height})) {
        const input=geometry.querySelector('[name='+key+']');if(document.activeElement!==input) input.value=Math.round(value);
        input.disabled=false;
      }
      geometry.querySelector('small').textContent=free?'Свободное размещение · сетка 8 px (Shift — без привязки)':'Обычная вёрстка · X и Y сдвигают элемент от исходного места';
      const frame=builder().iframe.getBoundingClientRect();
      resizeHandle.style.left=frame.left+r.right-7+'px';resizeHandle.style.top=frame.top+r.bottom-7+'px';
      document.getElementById('ru-placement').value=node.hasAttribute('data-ru-canvas')?'free':'flow';
    }
  }
  function enterScope(node) {if(!editable(node)) return;scope=node;setMode('blocks');select(node);hint('Редактируется только этот блок. «Вся страница» снимает ограничение.');}
  function leaveScope() {scope=null;refresh();}
  function validUrl(value) {
    value=value.trim();if(!value || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Укажите адрес ссылки.');
    if(/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(https?:|mailto:|tel:)/i.test(value)) throw new Error('Используйте https://, http://, mailto:, tel:, #якорь или относительный адрес страницы.');
    if(/^(?:[a-z\d-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(value)) value='https://'+value;
    return value;
  }
  let linkTarget,linkRange;
  function openLink() {
    cancel();linkTarget=builder().texteditEl || selected();
    if(!editable(linkTarget)) {hint('Сначала выберите надпись или изображение.');return;}
    const selection=window.FrameWindow.getSelection();linkRange=null;
    if(selection.rangeCount && !selection.isCollapsed && linkTarget.contains(selection.anchorNode) && linkTarget.contains(selection.focusNode)) linkRange=selection.getRangeAt(0).cloneRange();
    const anchor=linkTarget.closest('a') || linkTarget.querySelector('a');
    linkDialog.querySelector('[name=url]').value=anchor?.getAttribute('href') || '';
    linkDialog.querySelector('[name=blank]').checked=anchor?.target==='_blank';
    linkDialog.querySelector('[role=alert]').textContent='';linkDialog.showModal();linkDialog.querySelector('[name=url]').focus();
  }
  function applyLink(remove=false) {
    const target=linkTarget;if(!target?.isConnected) {linkDialog.close();return;}
    let url;try {if(!remove) url=validUrl(linkDialog.querySelector('[name=url]').value);} catch(error) {linkDialog.querySelector('[role=alert]').textContent=error.message;return;}
    DesktopEditor.finishText();
    const owner=target.closest('a')?.parentElement || (target.matches('img,button')?target.parentElement:target);
    // Keep node identities so earlier text and move mutations still undo correctly.
    const old=tree(owner);
    const existing=target.closest('a');let anchor=existing;
    if(remove) {for(const a of existing?[existing]:[...target.querySelectorAll('a')]) a.replaceWith(...a.childNodes);}
    else {
      if(!anchor) {
        anchor=doc().createElement('a');
        if(linkRange && !linkRange.collapsed) {
          const contents=linkRange.extractContents();for(const a of contents.querySelectorAll('a')) a.replaceWith(...a.childNodes);
          anchor.append(contents);linkRange.insertNode(anchor);
        } else if(target.tagName==='IMG') {target.replaceWith(anchor);anchor.append(target);}
        else if(target.tagName==='BUTTON') {anchor.innerHTML=target.innerHTML;anchor.setAttribute('style',target.getAttribute('style')||'');anchor.className=target.className;target.replaceWith(anchor);}
        else {for(const a of target.querySelectorAll('a')) a.replaceWith(...a.childNodes);anchor.append(...target.childNodes);target.append(anchor);}
      }
      anchor.setAttribute('href',url);
      if(linkDialog.querySelector('[name=blank]').checked) {anchor.target='_blank';anchor.rel='noopener noreferrer';}
      else {anchor.removeAttribute('target');anchor.removeAttribute('rel');}
    }
    record([{type:'domTree',target:owner,oldValue:old,newValue:tree(owner)}]);
    linkDialog.close();select(remove?owner:anchor || target);hint(remove?'Ссылка удалена.':'Адрес ссылки назначен. Сохраните страницу.');
  }
  function freeLayout(node=selected()) {
    if(mode!=='blocks') return;
    cancel();DesktopEditor.finishText();if(!editable(node) || !node.matches('section,div,article,header,footer,main,nav')) {hint('Для свободного размещения выберите контейнер: секцию или блок.');return;}
    if(node.hasAttribute('data-ru-canvas')) return;
    const base=node.getBoundingClientRect(),children=[...node.children].filter(n=>!n.matches('script,style'));
    const positions=children.map(n=>({n,r:n.getBoundingClientRect()}));
    const changes=[attr(node,'data-ru-canvas',''),styleChange(node,s=>{s.position='relative';s.height=Math.max(200,Math.ceil(base.height))+'px';s.display='block';})];
    for(const {n,r} of positions) changes.push(styleChange(n,s=>{s.position='absolute';s.left=Math.round(r.left-base.left-node.clientLeft)+'px';s.top=Math.round(r.top-base.top-node.clientTop)+'px';s.width=Math.max(1,Math.round(r.width))+'px';s.height=Math.max(1,Math.round(r.height))+'px';s.margin='0';s.boxSizing='border-box';}));
    record(changes);setMode('blocks');select(node);hint('Свободный холст: перемещайте и меняйте размеры его элементов. Для телефона создавайте отдельную адаптацию в стилях.');
  }
  function flowLayout(node=selected()) {
    if(mode!=='blocks') return;
    if(!node?.hasAttribute('data-ru-canvas')) return;
    const changes=[attr(node,'data-ru-canvas',null),styleChange(node,s=>{s.removeProperty('height');s.removeProperty('position');})];
    for(const child of node.children) changes.push(styleChange(child,s=>{for(const key of ['position','left','top','width','height','margin','box-sizing']) s.removeProperty(key);}));
    record(changes);hint('Элементы снова идут по порядку в обычной вёрстке. Ctrl + Z возвращает холст.');
  }
  function addCanvas(width=1200,height=600) {
    if(mode!=='blocks') return;
    DesktopEditor.finishText();const parent=scope || doc().querySelector('main') || doc().body;
    if(!parent.matches('body,div,section,article,main,header,footer,nav')) {hint('Для добавления холста выберите контейнер или выйдите из редактирования отдельной надписи.');return;}
    const node=doc().createElement('section');node.setAttribute('data-ru-canvas','');node.setAttribute('aria-label','Свободный холст');
    node.style.cssText=`position:relative;width:100%;max-width:${width}px;height:${height}px;margin:24px auto;background:#f4f6fb;box-sizing:border-box`;
    parent.append(node);record([{type:'childList',target:parent,addedNodes:[node]}]);setMode('blocks');select(node);return node;
  }
  function addElement(kind) {
    if(mode!=='blocks') return;
    DesktopEditor.finishText();let parent=selected();parent=parent?.hasAttribute('data-ru-canvas')?parent:boardOf(parent) || scope || doc().querySelector('main') || doc().body;
    if(scope && !scope.contains(parent)) parent=scope;
    if(!parent.matches('body,div,section,article,main,header,footer,nav')) {hint('Выберите контейнер или нажмите «Вся страница», чтобы добавить элемент.');return;}
    const node=doc().createElement(kind==='text'?'p':kind==='button'?'a':'div');
    node.textContent={text:'Новая надпись',button:'Перейти',box:'Новый блок'}[kind];
    node.style.cssText=kind==='button'?'display:inline-block;padding:12px 20px;background:#315bea;color:white;border-radius:8px;text-decoration:none':kind==='box'?'background:#e0e8ff;padding:20px;min-height:100px':'font-size:24px;margin:0';
    if(kind==='button') node.setAttribute('href','#');
    if(parent.hasAttribute('data-ru-canvas')) {node.style.position='absolute';node.style.left='32px';node.style.top='32px';node.style.width=kind==='box'?'240px':'200px';node.style.boxSizing='border-box';}
    parent.append(node);record([{type:'childList',target:parent,addedNodes:[node]}]);setMode('blocks');select(node);return node;
  }
  function begin(node,event,resize=false) {
    if(mode!=='blocks' || builder().isPreview || !editable(node)) return;
    DesktopEditor.finishText();select(node);
    const board=boardOf(node),r=node.getBoundingClientRect();
    drag={node,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,resize,board,oldParent:node.parentNode,oldNextSibling:node.nextSibling,oldStyle:node.getAttribute('style'),left:parseFloat(node.style.left)||r.left-(board?.getBoundingClientRect().left||0),top:parseFloat(node.style.top)||r.top-(board?.getBoundingClientRect().top||0),width:r.width,height:r.height,started:false};
    drag.zones=dropZones(node);
  }
  function dropZones(node) {
    const win=window.FrameWindow,structural=node.matches('section,article,header,footer,main,nav');
    // ponytail: freeze slots for one gesture; recapture on the next drag if content changes.
    return [...doc().querySelectorAll('body,main,section,article,div,nav,header,footer')].filter(parent=>!node.contains(parent) && (!scope || scope===parent || scope.contains(parent)) && (!structural || parent.matches('body,main,[data-ru-canvas]') || parent===node.parentElement || parent===scope)).map(parent=>{
      const r=parent.getBoundingClientRect(),css=win.getComputedStyle(parent),horizontal=css.display.includes('flex') && css.flexDirection.startsWith('row');
      const children=[...parent.children].filter(child=>!child.matches('script,style,link,meta'));
      const centers=children.map(child=>{const rect=child.getBoundingClientRect();return horizontal?rect.left+rect.width/2+win.scrollX:rect.top+rect.height/2+win.scrollY;});
      const boundaries=parent===node.parentElement?centers.slice(1).map((center,i)=>(centers[i]+center)/2):centers;
      let depth=0;for(let p=parent;p;p=p.parentElement) depth++;
      return {parent,left:r.left+win.scrollX,right:r.right+win.scrollX,top:r.top+win.scrollY,bottom:r.bottom+win.scrollY,horizontal,boundaries,depth};
    }).sort((a,b)=>b.depth-a.depth);
  }
  function place(d,parent,next) {
    if(next===d.node || (d.node.parentNode===parent && d.node.nextElementSibling===next)) return;
    const nodes=new Set([...d.node.parentElement.children,...parent.children]),before=new Map([...nodes].map(node=>[node,node.getBoundingClientRect()]));
    for(const node of nodes) {node._ruLayoutAnimation?.cancel();delete node._ruLayoutAnimation;}
    parent.insertBefore(d.node,next);
    if(!window.FrameWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) for(const node of nodes) {
      const old=before.get(node),r=node.getBoundingClientRect(),x=old.left-r.left,y=old.top-r.top;
      if((x || y) && r.width && r.height) {const animation=node._ruLayoutAnimation=node.animate([{translate:x+'px '+y+'px'},{translate:'0px 0px'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});animations.add(animation);animation.onfinish=animation.oncancel=()=>animations.delete(animation);}
    }
  }
  function flowMove(d,snap) {
    const x=d.x+window.FrameWindow.scrollX,y=d.y+window.FrameWindow.scrollY;
    const zone=d.zones.find(z=>z.parent.isConnected && x>=z.left && x<=z.right && y>=z.top && y<=z.bottom);if(!zone) return;
    const parent=zone.parent;
    if(parent.hasAttribute('data-ru-canvas')) {
      const r=parent.getBoundingClientRect();place(d,parent,null);d.node.style.position='absolute';d.node.style.left=snap(d.x-r.left)+'px';d.node.style.top=snap(d.y-r.top)+'px';d.node.style.width=Math.round(d.width)+'px';d.node.style.margin='0';d.board=parent;d.left=parseFloat(d.node.style.left);d.top=parseFloat(d.node.style.top);d.startX=d.x;d.startY=d.y;return;
    }
    const position=zone.horizontal?x:y;let index=zone.boundaries.filter(boundary=>position>boundary).length;
    if(d.drop?.zone===zone && index!==d.drop.index) {const boundary=zone.boundaries[index>d.drop.index?d.drop.index:d.drop.index-1];if(Math.abs(position-boundary)<8) index=d.drop.index;}
    d.drop={zone,index};
    const children=[...parent.children].filter(child=>child!==d.node && !child.matches('script,style,link,meta'));
    place(d,parent,children[index] || null);
  }
  function cancel() {stopAnimations();if(!drag) return;const d=drag;drag=null;delete document.body.dataset.ruDragging;d.node.removeAttribute('data-ru-dragging');if(d.oldStyle===null) d.node.removeAttribute('style');else d.node.setAttribute('style',d.oldStyle);if(d.oldNextSibling?.parentNode===d.oldParent) d.oldParent.insertBefore(d.node,d.oldNextSibling);else d.oldParent.append(d.node);refresh();}
  function finish() {
    if(!drag) return;const d=drag;drag=null;delete document.body.dataset.ruDragging;d.node.removeAttribute('data-ru-dragging');
    stopAnimations();
    if(!d.started) return;
    const changes=[];
    if(d.oldParent!==d.node.parentNode || d.oldNextSibling!==d.node.nextSibling) changes.push({type:'move',target:d.node,oldParent:d.oldParent,oldNextSibling:d.oldNextSibling,newParent:d.node.parentNode,newNextSibling:d.node.nextSibling});
    changes.push({type:'attributes',target:d.node,attributeName:'style',oldValue:d.oldStyle,newValue:d.node.getAttribute('style')});record(changes);select(d.node);hint('Расположение изменено. Ctrl + Z отменяет всё перемещение.');
  }
  function move(event) {
    if(!drag) return;const d=drag;d.x=event.clientX;d.y=event.clientY;
    if(!d.started && Math.hypot(d.x-d.startX,d.y-d.startY)<5) return;
    d.started=true;d.node.setAttribute('data-ru-dragging','');document.body.dataset.ruDragging='true';
    const snap=v=>Math.round(v/(event.shiftKey?1:8))*(event.shiftKey?1:8);
    if(d.resize) {d.node.style.width=Math.max(16,snap(d.width+d.x-d.startX))+'px';d.node.style.height=Math.max(16,snap(d.height+d.y-d.startY))+'px';d.node.style.boxSizing='border-box';}
    else if(d.board) {
      if(d.node.parentElement!==d.board || window.FrameWindow.getComputedStyle(d.node).position!=='absolute') {
        d.board.append(d.node);d.node.style.position='absolute';d.node.style.width=Math.round(d.width)+'px';d.node.style.margin='0';
      }
      d.node.style.left=Math.max(0,Math.min(d.board.clientWidth-16,snap(d.left+d.x-d.startX)))+'px';
      d.node.style.top=Math.max(0,Math.min(d.board.clientHeight-16,snap(d.top+d.y-d.startY)))+'px';
    } else {
      flowMove(d,snap);
    }
    // Pointer capture stays in the iframe; scrolling follows the pointer near its edges.
    if(!d.board && !d.resize) {const h=window.FrameWindow.innerHeight;if(d.y<35) window.FrameWindow.scrollBy(0,-16);else if(d.y>h-35) window.FrameWindow.scrollBy(0,16);}
    builder().selectNode(d.node);refresh();
  }
  function attach() {
    cancel();scope=null;const body=doc().body;
    doc().getElementById('ru-layout-helpers')?.remove();
    const style=doc().createElement('style');style.id='ru-layout-helpers';style.className='vvvebjs-editor-helpers';style.textContent='html,*{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0}[data-ru-dragging]{outline:4px solid #f59e0b!important;outline-offset:-3px!important;box-shadow:inset 0 0 0 9999px #ffb02026,0 0 0 4px #f59e0b44!important;opacity:.9!important;cursor:grabbing!important}';doc().head.append(style);
    body.addEventListener('vvveb.undo.restore',()=>{stopAnimations();if(!doc().getElementById('ru-layout-helpers')) doc().head.append(style);refresh();});
    body.addEventListener('pointerdown',event=>{
      if(event.button!==0 || mode!=='blocks' || builder().isPreview) return;
      const target=event.target.closest('a,button,img,p,h1,h2,h3,h4,h5,h6,li,summary,blockquote,figure,video,input,textarea,select,div,section,article,nav,header,footer,main');
      event.preventDefault();event.stopImmediatePropagation();menu.hidden=true;
      if(!editable(target)) {hint('Выбран отдельный блок. Нажмите «Вся страница», чтобы работать с другими.');return;}
      begin(target,event);body.setPointerCapture(event.pointerId);
    },true);
    body.addEventListener('pointermove',event=>{if(drag) {event.preventDefault();event.stopImmediatePropagation();move(event);}},true);
    body.addEventListener('pointerup',event=>{if(drag) {event.preventDefault();event.stopImmediatePropagation();finish();}if(body.hasPointerCapture(event.pointerId)) body.releasePointerCapture(event.pointerId);},true);
    body.addEventListener('pointercancel',cancel,true);
    body.addEventListener('click',event=>{if(builder().isPreview) return;if(mode==='blocks' || (scope && !scope.contains(event.target))) {event.preventDefault();event.stopImmediatePropagation();}},true);
    body.addEventListener('dblclick',event=>{const text=event.target.closest('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,summary,blockquote,figcaption,td,th,strong,em');if(mode==='blocks' || (scope && !scope.contains(event.target)) || (mode==='text' && (!text || text.querySelector('img,input,textarea,select,section,article,div,ul,ol,details')))) {event.preventDefault();event.stopImmediatePropagation();}},true);
    body.addEventListener('dragstart',event=>{if(mode==='blocks') event.preventDefault();},true);
    body.addEventListener('contextmenu',event=>{
      if(builder().isPreview) return;event.preventDefault();event.stopImmediatePropagation();DesktopEditor.finishText();
      const target=event.target.closest('a,button,img,p,h1,h2,h3,h4,h5,h6,li,summary,div,section,article,nav,header,footer,main');if(!editable(target) || (mode==='text' && !target.matches('a,button,p,h1,h2,h3,h4,h5,h6,li,summary'))) return;select(target);
      const frame=builder().iframe.getBoundingClientRect();menu.hidden=false;menu.style.left=Math.min(innerWidth-menu.offsetWidth-8,frame.left+event.clientX)+'px';menu.style.top=Math.min(innerHeight-menu.offsetHeight-8,frame.top+event.clientY)+'px';menu.querySelector('button').focus();
    },true);
    doc().addEventListener('keydown',key,true);window.FrameWindow.addEventListener('scroll',refresh);updateMode();
  }
  function key(event) {
    if(mode==='text' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='e') {event.preventDefault();event.stopImmediatePropagation();return;}
    if(drag && (event.key==='Escape' || ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='z'))) {event.preventDefault();event.stopImmediatePropagation();cancel();hint('Перемещение отменено.');return;}
    if(event.key==='Escape') {menu.hidden=true;if(!linkDialog.open) leaveScope();}
  }
  function init() {
    const textButton=document.getElementById('ru-edit');textButton.textContent='Текст';textButton.dataset.layoutMode='text';
    textButton.addEventListener('click',()=>setMode('text'));
    const blocks=document.createElement('button');blocks.id='ru-block-mode';blocks.textContent='Блоки';blocks.dataset.layoutMode='blocks';blocks.onclick=()=>setMode('blocks');textButton.after(blocks);
    bar=document.createElement('div');bar.id='ru-layout';bar.innerHTML='<span id="ru-scope">Вся страница</span><button id="ru-scope-exit" hidden>Вся страница</button><label>Размещение <select id="ru-placement"><option value="flow">По порядку</option><option value="free">Свободное в блоке</option></select></label><button data-layout-action="canvas">Новый холст</button><button data-layout-action="text">+ Надпись</button><button data-layout-action="button">+ Ссылка-кнопка</button><button data-layout-action="box">+ Блок</button><button data-layout-action="link">Ссылка…</button><span class="ru-layout-help">ПКМ — действия · тяните элемент в режиме «Блоки»</span>';document.body.append(bar);
    scopeOverlay=document.createElement('div');scopeOverlay.id='ru-scope-overlay';scopeOverlay.hidden=true;scopeOverlay.innerHTML='<div><span>Редактируется этот блок</span></div>';document.body.append(scopeOverlay);
    document.getElementById('ru-scope-exit').onclick=leaveScope;
    document.getElementById('ru-placement').onchange=event=>event.target.value==='free'?freeLayout():flowLayout();
    const canvasDialog=document.createElement('dialog');canvasDialog.id='ru-canvas-dialog';canvasDialog.innerHTML='<form><h2>Новый свободный холст</h2><label>Ширина, px <input name="width" type="number" min="200" max="4000" value="1200" required></label><label>Высота, px <input name="height" type="number" min="100" max="10000" value="600" required></label><p>Элементы размещаются по координатам внутри холста. Холст сужается до ширины экрана; позиции элементов фиксированы.</p><button type="submit">Создать</button><button type="button">Отмена</button></form>';document.body.append(canvasDialog);canvasDialog.querySelector('[type=button]').onclick=()=>canvasDialog.close();canvasDialog.querySelector('form').onsubmit=event=>{event.preventDefault();addCanvas(Number(canvasDialog.querySelector('[name=width]').value),Number(canvasDialog.querySelector('[name=height]').value));canvasDialog.close();};
    bar.onclick=event=>{const action=event.target.closest('[data-layout-action]')?.dataset.layoutAction;if(action==='canvas') canvasDialog.showModal();else if(action==='link') openLink();else if(action) addElement(action);};
    geometry=document.createElement('form');geometry.id='ru-geometry';geometry.innerHTML='<strong>Размер и положение</strong><div>'+['x','y','width','height'].map((key,i)=>`<label>${['X','Y','Ширина','Высота'][i]}<input name="${key}" type="number" min="${i<2?-10000:16}" max="10000" step="1"></label>`).join('')+'</div><small></small>';document.body.append(geometry);
    geometry.onsubmit=event=>event.preventDefault();geometry.onchange=event=>{const node=selected();if(mode!=='blocks' || window.SiteAi?.busy || !editable(node)) return;const input=event.target;if(!input.checkValidity() || input.value==='') return;const name={x:'left',y:'top',width:'width',height:'height'}[input.name];if(!name) return;record([styleChange(node,s=>{if((name==='left'||name==='top') && window.FrameWindow.getComputedStyle(node).position==='static') s.position='relative';s[name]=Number(input.value)+'px';s.boxSizing='border-box';})]);builder().selectNode(node);};
    resizeHandle=document.createElement('button');resizeHandle.id='ru-resize-handle';resizeHandle.title='Потяните, чтобы изменить размер';resizeHandle.setAttribute('aria-label','Изменить размер выбранного элемента');document.body.append(resizeHandle);
    resizeHandle.onpointerdown=event=>{event.preventDefault();const frame=builder().iframe.getBoundingClientRect();begin(selected(),{clientX:event.clientX-frame.left,clientY:event.clientY-frame.top},true);resizeHandle.setPointerCapture(event.pointerId);};
    resizeHandle.onpointermove=event=>{if(!drag) return;const frame=builder().iframe.getBoundingClientRect();move({clientX:event.clientX-frame.left,clientY:event.clientY-frame.top,shiftKey:event.shiftKey});};resizeHandle.onpointerup=finish;resizeHandle.onpointercancel=cancel;
    linkDialog=document.createElement('dialog');linkDialog.id='ru-link-dialog';linkDialog.innerHTML='<form><h2>Ссылка</h2><label>Адрес <input name="url" placeholder="https://example.ru, #контакты или о-нас.html" autocomplete="off"></label><label><input name="blank" type="checkbox"> Открывать в новой вкладке</label><p role="alert"></p><button type="submit">Применить</button><button type="button" data-remove>Удалить ссылку</button><button type="button" data-cancel>Отмена</button></form>';document.body.append(linkDialog);
    linkDialog.querySelector('form').onsubmit=event=>{event.preventDefault();applyLink();};linkDialog.querySelector('[data-remove]').onclick=()=>applyLink(true);linkDialog.querySelector('[data-cancel]').onclick=()=>linkDialog.close();
    const linkButton=document.getElementById('link-btn');linkButton.addEventListener('mousedown',event=>event.preventDefault(),true);linkButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openLink();},true);
    menu=document.createElement('div');menu.id='ru-context';menu.hidden=true;menu.setAttribute('role','menu');menu.innerHTML=[['scope','Редактировать только этот блок'],['parent','Выбрать родительский блок'],['link','Назначить ссылку…'],['free','Свободное размещение в блоке'],['duplicate','Дублировать'],['delete','Удалить'],['exit','Вся страница']].map(([action,label])=>`<button role="menuitem" data-context="${action}">${label}</button>`).join('');document.body.append(menu);
    menu.onclick=event=>{const action=event.target.closest('[data-context]')?.dataset.context,node=selected();menu.hidden=true;if(action==='scope') enterScope(node);if(action==='exit') leaveScope();if(action==='parent') select(node?.parentElement);if(action==='link') openLink();if(action==='free') freeLayout(node);if(action==='duplicate' && editable(node)) {const clone=node.cloneNode(true);clone.removeAttribute('id');node.after(clone);record([{type:'childList',target:clone.parentNode,addedNodes:[clone],nextSibling:clone.nextSibling}]);select(clone);}if(action==='delete' && editable(node)) {const parent=node.parentNode,nextSibling=node.nextSibling;node.remove();record([{type:'childList',target:parent,removedNodes:[node],nextSibling}]);builder().selectNode(false);}};
    document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)) menu.hidden=true;});document.addEventListener('keydown',key,true);
    window.addEventListener('Vvveb.iframe.loaded',attach);window.addEventListener('Vvveb.Builder.selectNode',refresh);window.addEventListener('resize',refresh);
    // The selection handle also moves real nodes, including containers fully covered by children.
    const moveHandle=document.getElementById('drag-btn');
    moveHandle.addEventListener('mousedown',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
    moveHandle.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
    moveHandle.onpointerdown=event=>{event.preventDefault();const frame=builder().iframe.getBoundingClientRect();begin(selected(),{clientX:event.clientX-frame.left,clientY:event.clientY-frame.top});moveHandle.setPointerCapture(event.pointerId);};
    moveHandle.onpointermove=event=>{if(!drag) return;const frame=builder().iframe.getBoundingClientRect();move({clientX:event.clientX-frame.left,clientY:event.clientY-frame.top,shiftKey:event.shiftKey});};moveHandle.onpointerup=finish;moveHandle.onpointercancel=cancel;
    const selectNode=builder().selectNode;
    builder().selectNode=function(node,...args) {if(scope && node && node!==scope && !scope.contains(node)) return false;return selectNode.call(this,node,...args);};
    const blockTools='#drag-btn,#up-btn,#down-btn,#clone-btn,#delete-btn,#edit-code-btn,#save-reusable-btn,#parent-btn,#add-section-btn,[data-drag-type],#properties,#configuration,#sections-list,#right-panel,[data-command=image],[data-panel]:not([data-panel=pages]),#code-editor-btn,#vvveb-code-editor';
    const guardBlockTools=event=>{if(mode==='text' && event.target.closest(blockTools)){event.preventDefault();event.stopImmediatePropagation();hint('Для изменения блоков переключитесь в режим «Блоки».');}};
    for(const event of ['pointerdown','mousedown','click','change','input']) document.addEventListener(event,guardBlockTools,true);
    for(const name of ['moveNodeUp','moveNodeDown','cloneNode']) {const original=builder()[name];builder()[name]=function(...args){if(mode!=='blocks') return;return original.apply(this,args);};}
    const toggleEditor=Vvveb.Gui.toggleEditor;Vvveb.Gui.toggleEditor=function(...args){if(mode==='text') return;return toggleEditor.apply(this,args);};
    const getHtml=builder().getHtml;
    builder().getHtml=function(...args) {finish();const helper=doc().getElementById('ru-layout-helpers');helper?.remove();try{return getHtml.apply(this,args);}finally{if(helper) doc().head.append(helper);}};
    if(window.FrameDocument?.body) attach();updateMode();
  }
  return {init,setMode,updateMode,openLink,freeLayout,flowLayout,addCanvas,addElement,enterScope,leaveScope,cancel,commit:finish,captureTree:tree,get mode(){return mode;},get scope(){return scope;},get dragging(){return !!drag;}};
})();
