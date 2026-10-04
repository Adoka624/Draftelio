'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),{spawn}=require('node:child_process');
const {contained}=require('./project');
const schema={type:'object',properties:{summary:{type:'string'},html:{type:'string'}},required:['summary','html'],additionalProperties:false};
const limit=2*1024*1024;
function partialHtml(text) {
  const match=/"html"\s*:\s*"/.exec(text);if(!match) return null;let value='';
  for(let i=match.index+match[0].length;i<text.length;i++) {
    const char=text[i];if(char==='"') return value;
    if(char!=='\\'){value+=char;continue;}
    const escape=text[++i];if(escape===undefined) break;
    if(escape==='u'){const hex=text.slice(i+1,i+5);if(hex.length<4) break;if(!/^[\da-f]{4}$/i.test(hex)) return null;value+=String.fromCharCode(parseInt(hex,16));i+=4;}
    else {const decoded={'"':'"','\\':'\\','/':'/',n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[escape];if(decoded===undefined) return null;value+=decoded;}
  }
  return value;
}
function cleanEnv(provider,root) {
  const env={...process.env};
  for(const name of Object.keys(env)) if(/^(?:OPENAI_|CODEX_API_|ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_|AWS_|AZURE_|GOOGLE_)/i.test(name)) delete env[name];
  delete env.ELECTRON_RUN_AS_NODE;
  if(provider==='chatgpt') env.CODEX_HOME=path.join(root,'codex');else env.CLAUDE_CONFIG_DIR=path.join(root,'claude');
  return env;
}
function locate(provider) {
  const dirs=(process.env.PATH||'').split(path.delimiter),name=provider==='chatgpt'?'codex.exe':'claude.exe';
  for(const dir of dirs) if(fs.existsSync(path.join(dir,name))) return path.join(dir,name);
  if(provider==='claude') {
    for(const candidate of [path.join(process.env.USERPROFILE||'','.local','bin','claude.exe'),path.join(process.env.APPDATA||'','npm','node_modules','@anthropic-ai','claude-code','bin','claude.exe')]) if(fs.existsSync(candidate)) return candidate;
  } else {
    const dir=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','bin');
    if(fs.existsSync(dir)) for(const item of fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>fs.statSync(path.join(dir,b.name)).mtimeMs-fs.statSync(path.join(dir,a.name)).mtimeMs)) {const file=path.join(dir,item.name,name);if(fs.existsSync(file)) return file;}
  }
  return null;
}
class Ai {
  constructor(root,emit=()=>{}) {this.root=root;this.emit=emit;this.pending=new Map();this.seq=0;this.paths={};this.jobs=new Set();this.busy=false;
    fs.mkdirSync(path.join(root,'codex'),{recursive:true});fs.mkdirSync(path.join(root,'claude'),{recursive:true});fs.mkdirSync(path.join(root,'requests'),{recursive:true});
    fs.writeFileSync(path.join(root,'codex','config.toml'),'forced_login_method = "chatgpt"\ncli_auth_credentials_store = "file"\nweb_search = "disabled"\nproject_doc_max_bytes = 0\n[features]\nshell_tool = false\nunified_exec = false\napply_patch_freeform = false\n');
  }
  executable(provider) {if(!['chatgpt','claude'].includes(provider)) throw new Error('Неизвестный провайдер ИИ.');return this.paths[provider] || locate(provider);}
  setExecutable(provider,file) {this.executable(provider);if(typeof file!=='string' || !path.isAbsolute(file) || path.extname(file).toLowerCase()!=='.exe' || !fs.statSync(file).isFile()) throw new Error('Выберите официальный исполняемый файл .exe.');this.paths[provider]=file;if(provider==='chatgpt') this.stopCodex();}
  start(provider,args,cwd=this.root) {const executable=this.executable(provider);if(!executable) throw new Error(provider==='chatgpt'?'Установите Codex CLI или выберите codex.exe.':'Установите Claude Code или выберите claude.exe.');const child=spawn(executable,args,{cwd,env:cleanEnv(provider,this.root),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});this.jobs.add(child);child.on('close',()=>this.jobs.delete(child));return child;}
  async codex() {
    if(this.server && !this.server.killed) return this.ready;
    const child=this.server=this.start('chatgpt',['app-server','--stdio']);
    readline.createInterface({input:child.stdout}).on('line',line=>{
      if(Buffer.byteLength(line)>limit) {this.stopCodex();return;}
      let msg;try{msg=JSON.parse(line);}catch{return;}
      if(msg.id!==undefined && !msg.method) {const item=this.pending.get(msg.id);if(item){clearTimeout(item.timer);this.pending.delete(msg.id);msg.error?item.reject(new Error(msg.error.message)):item.resolve(msg.result);}}
      else if(msg.id!==undefined && msg.method) child.stdin.write(JSON.stringify({id:msg.id,error:{code:-32601,message:'Инструменты отключены. Возвращайте только HTML.'}})+'\n');
      else if(msg.method==='account/login/completed') this.emit({type:'login',provider:'chatgpt',success:msg.params.success,error:msg.params.success?'': 'Вход не завершён. Попробуйте снова.'});
      else if(msg.method==='thread/tokenUsage/updated' && this.turn) this.lastUsage=msg.params.tokenUsage?.total;
      else if(msg.method==='item/started' && this.turn) {const type=msg.params.item.type;this.emit({type:'progress',provider:'chatgpt',stage:type==='agentMessage'?'Создаю HTML сайта…':type==='reasoning'?'Продумываю структуру сайта…':'Обрабатываю задачу…'});}
      else if(msg.method==='item/agentMessage/delta' && this.turn) {this.turn.stream=(this.turn.stream || '')+(msg.params.delta || '');this.turn.received=this.turn.stream.length;if(Buffer.byteLength(this.turn.stream)>limit){this.stopCodex();return;}if(Date.now()-(this.turn.lastProgress || 0)>500){this.turn.lastProgress=Date.now();this.emit({type:'progress',provider:'chatgpt',stage:'Создаю HTML сайта…',received:this.turn.received});const html=partialHtml(this.turn.stream);if(html) this.emit({type:'html',provider:'chatgpt',html});}}
      else if(msg.method==='turn/completed' && this.turn) {const turn=this.turn;this.turn=null;clearTimeout(turn.timer);if(msg.params.turn.status==='completed') turn.resolve(turn.text);else turn.reject(new Error(msg.params.turn.error?.message || 'Запрос остановлен.'));}
      else if(msg.method==='item/completed' && this.turn && msg.params.item.type==='agentMessage') this.turn.text=msg.params.item.text || this.turn.text;
    });
    child.stderr.resume();child.on('error',error=>{if(this.server===child) this.fail(error);});child.on('close',()=>{if(this.server===child) {this.server=null;this.fail(new Error('Codex завершил соединение. Подключитесь снова.'));}});
    this.ready=this.rpc('initialize',{clientInfo:{name:'draftelio_site_builder',title:'Draftelio',version:'1.1.0'}}).then(()=>child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n'));
    return this.ready;
  }
  rpc(method,params={}) {const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Сервис ИИ не ответил. Попробуйте снова.'));},30000);this.pending.set(id,{resolve,reject,timer});this.server.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});}
  fail(error) {for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();if(this.turn){clearTimeout(this.turn.timer);this.turn.reject(error);this.turn=null;}}
  stopCodex() {const child=this.server;this.server=null;child?.kill();this.fail(new Error('Соединение остановлено.'));}
  collect(provider,args,input='',timeout=30000) {
    return new Promise((resolve,reject)=>{const child=this.start(provider,args);let out='',err='',settled=false;
      const end=(error,value)=>{if(settled) return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const timer=setTimeout(()=>{child.kill();end(new Error('Время ожидания истекло. Попробуйте запрос короче.'));},timeout);
      child.stdout.on('data',data=>{out+=data;if(Buffer.byteLength(out)>limit){child.kill();end(new Error('Ответ ИИ слишком большой.'));}});child.stderr.on('data',data=>{if(err.length<4000) err+=data;});
      child.on('error',error=>end(error));child.on('close',code=>{if(code) end(new Error(/login|auth|credential/i.test(err+out)?'Войдите в аккаунт с подпиской.':'Запрос не выполнен. Проверьте вход, доступность модели и лимиты подписки.'));else end(null,out);});child.stdin.end(input);
    });
  }
  async status(provider,details=true) {
    const installed=!!this.executable(provider);if(!installed) return {installed:false,connected:false};
    if(provider==='chatgpt') {
      await this.codex();const {account}=await this.rpc('account/read',{refreshToken:false}),connected=account?.type==='chatgpt';
      const result={installed,connected,plan:connected?account.planType:null,email:connected?account.email:null,name:null};
      if(connected && details) {const [limits,usage]=await Promise.allSettled([this.rpc('account/rateLimits/read'),this.rpc('account/usage/read')]);result.limits=limits.status==='fulfilled'?limits.value:null;result.usage=usage.status==='fulfilled'?usage.value:null;}
      return result;
    }
    let account;try{account=JSON.parse(await this.collect('claude',['auth','status','--json']));}catch{return {installed,connected:false};}
    const connected=account.loggedIn===true && account.authMethod==='claude.ai';
    return {installed,connected,plan:connected?account.subscriptionType || null:null,email:connected?account.email || null:null,name:connected?account.name || null:null};
  }
  async login(provider) {
    if(provider==='chatgpt') {await this.codex();const result=await this.rpc('account/login/start',{type:'chatgpt',useHostedLoginSuccessPage:false});return {url:result.authUrl};}
    if(this.claudeLogin && !this.claudeLogin.killed) return {pending:true};
    const child=this.claudeLogin=this.start('claude',['auth','login','--claudeai']);child.stdout.resume();child.stderr.resume();
    const timer=setTimeout(()=>child.kill(),5*60*1000);child.on('error',()=>this.emit({type:'login',provider:'claude',success:false,error:'Не удалось запустить вход Claude.'}));child.on('close',code=>{clearTimeout(timer);this.claudeLogin=null;this.emit({type:'login',provider:'claude',success:code===0,error:code===0?'':'Вход не завершён. Попробуйте снова.'});});return {pending:true};
  }
  async generate(provider,prompt,instructions) {
    if(this.busy) throw new Error('Дождитесь завершения текущего запроса или остановите его.');
    this.busy=true;
    this.lastUsage=null;
    try {
      const status=await this.status(provider,false);if(!status.connected) throw new Error('Войдите в аккаунт с подпиской кнопкой «Подключить». API-ключи не используются.');
      if(provider==='claude') {
        const result=JSON.parse(await this.collect('claude',['-p','--output-format','json','--json-schema',JSON.stringify(schema),'--tools','','--restricted','--safe-mode','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--permission-mode','dontAsk','--no-session-persistence','--system-prompt',instructions],prompt,8*60*1000));
        if(result.is_error) throw new Error('Claude не завершил запрос. Проверьте лимиты подписки.');return validateResult(result.structured_output || JSON.parse(result.result));
      }
      await this.codex();const result=await this.rpc('thread/start',{cwd:path.join(this.root,'requests'),approvalPolicy:'never',sandbox:'read-only',ephemeral:true,baseInstructions:instructions});
      const answer=new Promise((resolve,reject)=>{this.turn={text:'',resolve,reject,timer:setTimeout(()=>{this.stopCodex();},8*60*1000)};});
      try {await this.rpc('turn/start',{threadId:result.thread.id,input:[{type:'text',text:prompt}],effort:'low',outputSchema:schema});}catch(error){this.fail(error);}
      return {...validateResult(JSON.parse(await answer)),tokenUsage:this.lastUsage || null};
    } finally {this.busy=false;}
  }
  cancel() {this.stopCodex();for(const job of this.jobs) job.kill();}
  loginCode(code) {if(!this.claudeLogin || typeof code!=='string' || !code.trim() || code.length>2000 || /[\r\n]/.test(code)) throw new Error('Нет ожидающего входа Claude или код некорректен.');this.claudeLogin.stdin.write(code.trim()+'\n');}
}
function validateResult(value) {if(!value || typeof value.summary!=='string' || typeof value.html!=='string' || !value.html.trim() || Buffer.byteLength(value.html)>limit) throw new Error('ИИ вернул некорректный HTML. Изменения не применены.');return {summary:value.summary.slice(0,4000),html:value.html};}
function loadPacks(builtin,userRoot) {
  const packs=[];
  for(const root of [builtin,userRoot]) if(fs.existsSync(root)) for(const e of fs.readdirSync(root,{withFileTypes:true})) {
    if(!e.isDirectory() || e.isSymbolicLink()) continue;
    try{packs.push(readPack(path.join(root,e.name)));}catch(error){packs.push({id:e.name,name:e.name,error:error.message,skills:[],blocks:[]});}
  }
  return packs;
}
function readPack(root) {
  const read=file=>{const full=contained(root,file);if(fs.statSync(full).size>200000) throw new Error('Файл пакета больше 200 КБ.');return fs.readFileSync(full,'utf8');};
  const manifest=JSON.parse(read('plugin.json'));
  if(!/^[a-z][a-z0-9-]{1,60}$/.test(manifest.id) || typeof manifest.name!=='string' || !Array.isArray(manifest.skills) || manifest.skills.length>30 || (manifest.blocks?.length||0)>30) throw new Error('Некорректный манифест плагина.');
  const skills=manifest.skills.map(s=>{if(!/^[a-z][a-z0-9-]{1,60}$/.test(s.id) || typeof s.name!=='string') throw new Error('Некорректный навык.');return {...s,instructions:read(s.file)};});
  const blocks=(manifest.blocks||[]).map(b=>{if(typeof b.name!=='string' || typeof b.html!=='string' || b.html.length>100000) throw new Error('Некорректный блок.');return {name:b.name,html:b.html};});
  return {id:manifest.id,name:manifest.name.slice(0,120),description:String(manifest.description||'').slice(0,500),instructions:manifest.instructions?read(manifest.instructions):'',skills,blocks,root};
}
function importPack(source,destination,builtin) {
  const pack=readPack(source);if(loadPacks(builtin,destination).some(p=>p.id===pack.id)) throw new Error('Плагин с таким идентификатором уже установлен.');
  const manifest=JSON.parse(fs.readFileSync(contained(source,'plugin.json'),'utf8'));const target=contained(destination,pack.id);fs.mkdirSync(target,{recursive:true});
  const files=new Set(['plugin.json',manifest.instructions,...manifest.skills.map(s=>s.file)].filter(Boolean));
  for(const file of files){const dest=contained(target,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(contained(source,file),dest,fs.constants.COPYFILE_EXCL);}
  return pack.id;
}
module.exports={Ai,schema,cleanEnv,locate,validateResult,loadPacks,readPack,importPack,partialHtml};
