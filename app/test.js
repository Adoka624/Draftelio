'use strict';
// Run: node test.js. No framework or additional packages required.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {contained,listPages,savePage,importImage,exportProject,mediaTree,startServer}=require('./project');
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-test-'));
  const root=path.join(temp,'сайт');fs.mkdirSync(root);
  let server;
  try {
    savePage(root,'index.html','<!DOCTYPE html><html lang="ru"><body>Первый текст</body></html>',true);
    assert.equal(listPages(root)[0].file,'index.html');
    savePage(root,'index.html','<!DOCTYPE html><html lang="ru"><body>Новый текст</body></html>');
    assert.equal(fs.readdirSync(path.join(root,'.draftelio-backups')).length,1);
    assert.match(fs.readFileSync(path.join(root,'.draftelio-backups',fs.readdirSync(path.join(root,'.draftelio-backups'))[0]),'utf8'),/Первый текст/);
    for(const bad of ['../outside.html','..\\outside.html','C:\\outside.html','index.php','CON.html','a./x.html','.secret/x.html']) assert.throws(()=>savePage(root,bad,'hello'));
    for(const value of ['',null,3]) assert.throws(()=>savePage(root,'index.html',value));
    assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/Новый текст/);
    assert.throws(()=>savePage(root,'index.html','overwrite',true));
    savePage(root,'услуги/дизайн.html','<html><body>Дизайн</body></html>',true);
    assert.equal(listPages(root).length,2);
    assert.ok(listPages(root).some(p=>p.url.includes('%D0')));
    assert.equal(contained(root,'услуги/дизайн.html'),path.join(root,'услуги','дизайн.html'));
    const source=path.join(temp,'фото.png');fs.writeFileSync(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUqkAAAAASUVORK5CYII=','base64'));
    const image=importImage(root,source);assert.ok(fs.existsSync(path.join(root,image)));
    const second=importImage(root,source);assert.notEqual(image,second);
    assert.equal(mediaTree(root).items.length,2);
    const badImage=path.join(temp,'bad.svg');fs.writeFileSync(badImage,'<svg/>');assert.throws(()=>importImage(root,badImage));
    assert.throws(()=>exportProject(root,path.join(root,'export')));
    const destination=path.join(temp,'экспорт');exportProject(root,destination);
    assert.ok(fs.existsSync(path.join(destination,image)));
    assert.ok(fs.existsSync(path.join(destination,'услуги','дизайн.html')));
    assert.ok(!fs.existsSync(path.join(destination,'.draftelio-backups')));
    assert.throws(()=>exportProject(root,destination));
    // Symlinks/junctions may need privileges on Windows; a directory junction does not.
    const outside=path.join(temp,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.html'),'secret');
    fs.symlinkSync(outside,path.join(root,'linked'),'junction');
    assert.throws(()=>contained(root,'linked/secret.html'));
    assert.ok(!listPages(root).some(p=>p.file.includes('linked')));
    server=await startServer(path.join(__dirname,'web'),()=>root);
    const origin='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(origin+'/site/index.html')).status,200);
    assert.equal((await fetch(origin+'/site/услуги/дизайн.html')).status,200);
    assert.equal((await fetch(origin+'/site/linked/secret.html')).status,404);
    assert.equal((await fetch(origin+'/site/.draftelio-backups/index.html')).status,404);
    assert.equal((await fetch(origin+'/app/editor.html')).status,200);
    assert.match((await fetch(origin+'/site/index.html')).headers.get('content-security-policy'),/script-src 'none'/);
    assert.equal((await fetch(origin+'/app/scan.php')).status,200);
    assert.equal((await fetch(origin+'/site/index.html',{method:'POST',body:'overwrite'})).status,405);
    assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/Новый текст/);
    const http=require('node:http');
    const badHost=await new Promise((resolve,reject)=>{http.get(origin+'/site/index.html',{headers:{Host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});
    assert.equal(badHost,403);
    fs.rmSync(path.join(root,'.draftelio-backups'),{recursive:true,force:true});
    fs.symlinkSync(outside,path.join(root,'.draftelio-backups'),'junction');
    assert.throws(()=>savePage(root,'index.html','must not overwrite'));
    assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/Новый текст/);
    console.log('OK: сохранение, резервные копии, русские пути, изображения, экспорт, защита путей и сервер.');
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
