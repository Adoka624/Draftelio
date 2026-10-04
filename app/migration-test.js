'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {migrate}=require('./migration');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-migration-'));
try{
 const profile=path.join(root,'Vvveb-RU-data'),site=path.join(root,'Vvveb-Sites','Мой сайт');
 fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(site,{recursive:true});
 fs.writeFileSync(path.join(site,'index.html'),'Существующий сайт');
 fs.writeFileSync(path.join(profile,'project.json'),JSON.stringify({root:site}));
 fs.writeFileSync(path.join(profile,'projects.json'),JSON.stringify([{root:site},{root:path.join(root,'external')} ]));
 fs.writeFileSync(path.join(profile,'login-marker'),'test-only');
 const result=migrate(root),newSite=path.join(result.sites,'Мой сайт');
 assert.equal(fs.readFileSync(path.join(newSite,'index.html'),'utf8'),'Существующий сайт');
 assert.equal(JSON.parse(fs.readFileSync(path.join(result.profile,'project.json'))).root,newSite);
 assert.equal(JSON.parse(fs.readFileSync(path.join(result.profile,'projects.json')))[1].root,path.join(root,'external'));
 assert.equal(fs.readFileSync(path.join(result.profile,'login-marker'),'utf8'),'test-only');
 assert.equal(fs.existsSync(profile),false);assert.deepEqual(migrate(root),result);
 fs.mkdirSync(site,{recursive:true});fs.writeFileSync(path.join(result.profile,'project.json'),JSON.stringify({root:site}));migrate(root);
 assert.equal(JSON.parse(fs.readFileSync(path.join(result.profile,'project.json'))).root,site);
 fs.writeFileSync(path.join(result.profile,'projects.json'),'{broken');assert.doesNotThrow(()=>migrate(root));
 console.log('OK: перенос проектов и настроек, повторный запуск, внешние проекты, конфликт папок, повреждённый список.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
