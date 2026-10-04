'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);
const skip = new Set(['node_modules', '.git', '.draftelio-backups']);
const mime = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.mp4':'video/mp4', '.mp3':'audio/mpeg'};

function contained(root, filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\0') || filename.includes(':') || /[<>"|?*]/.test(filename)) throw new Error('Недопустимое имя файла.');
  const target = path.resolve(root, filename);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Файл должен находиться внутри папки сайта.');
  let current = root;
  for (const part of relative.split(path.sep)) {
    if (!part || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error('Недопустимое имя файла Windows.');
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Ссылки на внешние файлы не поддерживаются.');
  }
  return target;
}

function listPages(root) {
  const pages = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'ru'))) {
      if (entry.name.startsWith('.') || skip.has(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.html?$/i.test(entry.name)) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        pages.push({name:'page-' + pages.length, title:relative, file:relative, url:'/site/' + relative.split('/').map(encodeURIComponent).join('/')});
        if (pages.length > 1000) throw new Error('В папке больше 1000 HTML-страниц. Выберите папку отдельного сайта.');
      }
    }
  }
  visit(root);
  pages.sort((a,b)=>(a.file==='index.html'?-1:b.file==='index.html'?1:0));
  return pages;
}

function savePage(root, relative, html, create = false) {
  const file = contained(root, relative);
  if (!/\.html?$/i.test(file) || relative.split(/[\\/]/).some(p=>p.startsWith('.'))) throw new Error('Сохранять можно только HTML-страницы.');
  if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html)>20*1024*1024) throw new Error('Страница пустая или больше 20 МБ.');
  if (create && fs.existsSync(file)) throw new Error('Такая страница уже существует.');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if (fs.existsSync(file)) {
    const backup = contained(root,path.join('.draftelio-backups',relative));
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    fs.copyFileSync(file,backup + '.' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.bak');
  }
  const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp,html,{encoding:'utf8',flag:'wx'});
    fs.renameSync(temp,file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return relative;
}

function importImage(root, source) {
  const ext = path.extname(source).toLowerCase();
  if (!imageExtensions.has(ext)) throw new Error('Выберите изображение PNG, JPG, WebP, GIF, AVIF или BMP.');
  if (fs.statSync(source).size > 30*1024*1024) throw new Error('Изображение больше 30 МБ.');
  const relative = 'media/' + path.basename(source,ext).replace(/[^\p{L}\p{N}_-]/gu,'_') + '-' + crypto.randomBytes(4).toString('hex') + ext;
  const target = contained(root,relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  return relative;
}

function exportProject(root, destination) {
  const rel = path.relative(root,destination);
  if (!rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))) throw new Error('Выберите папку вне текущего сайта.');
  if (fs.existsSync(destination)) throw new Error('Папка экспорта уже существует.');
  fs.cpSync(root,destination,{recursive:true,errorOnExist:true,force:false,filter:source=>{
    const relative = path.relative(root,source);
    return !fs.lstatSync(source).isSymbolicLink() && !relative.split(path.sep).some(p=>p.startsWith('.') || skip.has(p));
  }});
  return destination;
}

function mediaTree(root) {
  const media = contained(root,'media');
  const walk = (dir, relative='') => ({name:path.basename(dir),type:'folder',path:relative,items:fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.isSymbolicLink() && !e.name.startsWith('.')).map(e=>e.isDirectory()?walk(path.join(dir,e.name),relative+'/'+e.name):{name:e.name,type:'file',path:relative+'/'+e.name,size:fs.statSync(path.join(dir,e.name)).size}):[]});
  return walk(media);
}

function startServer(webRoot, getProject) {
  const server = http.createServer((req,res)=>{
    try {
      if(req.headers.host!=='127.0.0.1:'+server.address().port) {res.writeHead(403);return res.end('Доступ запрещён.');}
      if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405); return res.end('Только чтение.');}
      const url = new URL(req.url,'http://localhost');
      if (url.pathname === '/app/scan.php') {res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify(mediaTree(getProject())));}
      const isApp = url.pathname.startsWith('/app/');
      let relative = decodeURIComponent(url.pathname.slice(isApp ? 5 : url.pathname.startsWith('/site/') ? 6 : 1));
      if (!relative) relative='index.html';
      if (relative.split(/[\\/]/).some(p=>p.startsWith('.'))) throw new Error('Закрытая папка.');
      const file = contained(isApp?webRoot:getProject(),relative);
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('Файл не найден.');
      const ext = path.extname(file).toLowerCase();
      if (['.php','.exe','.bat','.cmd','.ps1'].includes(ext)) throw new Error('Тип файла не поддерживается.');
      res.setHeader('Content-Type',mime[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',isApp ? "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'" : "script-src 'none'; object-src 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'self'");
      if (req.method==='HEAD') return res.end();
      fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('Файл не найден или доступ запрещён.');}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server));});
}

module.exports = {contained,listPages,savePage,importImage,exportProject,mediaTree,startServer};
