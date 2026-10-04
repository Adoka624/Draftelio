const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Ai,cleanEnv,loadPacks,readPack,importPack,validateResult,partialHtml}=require('./ai');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'draftelio-ai-'));let ai;
 try {
  const builtin=path.join(__dirname,'ai-packs'),packs=loadPacks(builtin,path.join(temp,'plugins'));
  assert.equal(packs.length,3);assert.equal(packs.flatMap(p=>p.skills).length,8);assert.ok(packs.every(p=>!p.error));
  assert.ok(packs.find(p=>p.id==='site-core').skills.some(s=>s.id==='accessibility'));
  assert.throws(()=>validateResult({summary:'bad',html:''}));assert.equal(validateResult({summary:'ok',html:'<p>ok</p>'}).html,'<p>ok</p>');
  const streamed=JSON.stringify({summary:'Текст "html" не является полем',html:'<h1 title="Тест">Футбол</h1>\n<p>⚽</p>'});assert.equal(partialHtml(streamed),JSON.parse(streamed).html);assert.equal(partialHtml('{"summary":"Начало'),null);assert.equal(partialHtml('{"html":"<p>Тест\\'),'<p>Тест');assert.equal(partialHtml('{"html":"<p>\\u04'),'<p>');assert.equal(partialHtml('{"html":"\\u042f"}'),'Я');assert.equal(partialHtml('{"html":"\\x00"}'),null);
  const oldKey=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='must-not-pass';assert.equal(cleanEnv('claude',temp).ANTHROPIC_API_KEY,undefined);if(oldKey===undefined) delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;
  const source=path.join(temp,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'SKILL.md'),'# Test skill\nDesign readable websites.');fs.writeFileSync(path.join(source,'plugin.json'),JSON.stringify({id:'test-plugin',name:'Проверка',skills:[{id:'test-skill',name:'Навык',file:'SKILL.md'}],blocks:[]}));
  const destination=path.join(temp,'plugins');fs.mkdirSync(destination);assert.equal(importPack(source,destination,builtin),'test-plugin');assert.equal(loadPacks(builtin,destination).length,4);assert.throws(()=>importPack(source,destination,builtin));
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'plugin.json')));manifest.skills[0].file='../outside.md';fs.writeFileSync(path.join(source,'plugin.json'),JSON.stringify(manifest));assert.throws(()=>readPack(source));
  ai=new Ai(path.join(temp,'runtime'));assert.equal(ai.busy,false);assert.throws(()=>ai.executable('unknown'));
  const protocol=new Ai(path.join(temp,'protocol'));protocol.codex=async()=>{};
  protocol.rpc=async(method,params)=>{
    if(method==='account/read') return {account:{type:'chatgpt',email:'test@example.com',planType:'plus'}};
    if(method==='account/rateLimits/read') return {rateLimits:{primary:{usedPercent:25,windowDurationMins:300,resetsAt:1800000000}}};
    if(method==='account/usage/read') throw new Error('Metric unavailable');
    if(method==='account/login/start'){assert.equal(params.useHostedLoginSuccessPage,false);assert.equal(params.appBrand,undefined);return {authUrl:'https://chatgpt.com/test'};}
    if(method==='thread/start'){assert.equal(params.sandbox,'read-only');assert.equal(params.approvalPolicy,'never');return {thread:{id:'test'}};}
    if(method==='turn/start'){assert.equal(params.effort,'low');assert.deepEqual(params.outputSchema.required,['summary','html']);clearTimeout(protocol.turn.timer);protocol.turn.resolve('{"summary":"ok","html":"<p>ok</p>"}');protocol.turn=null;return {};}
    throw new Error('Unexpected method '+method);
  };
  const info=await protocol.status('chatgpt');assert.equal(info.email,'test@example.com');assert.equal(info.limits.rateLimits.primary.usedPercent,25);assert.equal(info.usage,null);assert.equal(info.connected,true);
  await protocol.login('chatgpt');assert.equal((await protocol.generate('chatgpt','test','test')).html,'<p>ok</p>');assert.equal(protocol.busy,false);
  if(process.argv.includes('--cli')) {for(const provider of ['chatgpt','claude']) {const result=await ai.status(provider);assert.equal(result.connected,false);console.log(provider+': installed='+result.installed+', isolated login='+!result.connected);}}
  console.log('OK: плагины, навыки, проверка путей, ответы HTML, отсутствие API-ключей и изолированные профили.');
 } finally {ai?.cancel();await new Promise(r=>setTimeout(r,500));assert.ok(path.dirname(temp)===path.resolve(os.tmpdir()) && path.basename(temp).startsWith('draftelio-ai-'));try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:300});}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)) throw error;console.log('Windows не разрешила убрать временную папку проверки: '+temp);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
