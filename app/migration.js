'use strict';
const fs=require('node:fs'),path=require('node:path');
function migrate(documentsRoot){
 const profile=path.join(documentsRoot,'Draftelio-data'),sites=path.join(documentsRoot,'Draftelio-Sites');
 const oldProfile=path.join(documentsRoot,'Vvveb-RU-data'),oldSites=path.join(documentsRoot,'Vvveb-Sites');
 if(fs.existsSync(oldProfile) && !fs.existsSync(profile)) fs.renameSync(oldProfile,profile);
 if(fs.existsSync(oldSites) && !fs.existsSync(sites)) fs.renameSync(oldSites,sites);
 // Never redirect an existing old folder when both generations contain projects.
 if(!fs.existsSync(oldSites)) for(const name of ['project.json','projects.json']){
  const file=path.join(profile,name);if(!fs.existsSync(file)) continue;
  let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
  const remap=row=>{if(row && typeof row.root==='string'){
   const relative=path.relative(oldSites,row.root);
   if(!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep)) row.root=path.join(sites,relative);
  }};
  if(Array.isArray(data)) data.forEach(remap);else remap(data);
  fs.writeFileSync(file+'.migration.tmp',JSON.stringify(data),'utf8');fs.renameSync(file+'.migration.tmp',file);
 }
 return {profile,sites};
}
module.exports={migrate};
