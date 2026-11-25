// Runtime secrets: GITHUB_TOKEN, PASSWORD_SHA256, SESSION_SECRET, DATA_KEY, DATA_SALT.
// This handler works in a Cloudflare Worker or with the included Node adapter.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REPOSITORY = 'yuzhench/Demo-Day';
const BRANCH = 'team-data';
const STATE_PATH = 'shared/state.json';
const ALLOWED_ORIGIN = 'https://yuzhench.github.io';
const TASKS = new Set(['design:4','pitch:7','demo:6','website:6','logistics:9'].flatMap(x=>{const [name,n]=x.split(':');return Array.from({length:Number(n)},(_,i)=>`${name}-${i+1}`)}));
const STATUSES = new Set(['todo','doing','blocked','done']);
const encoder = new TextEncoder(),decoder = new TextDecoder();
const attempts = new Map();
class Fault extends Error { constructor(status,message){super(message);this.status=status} }
const fail=(status,message)=>{throw new Fault(status,message)};
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function base64(value){let result='';for(let offset=0;offset<value.length;offset+=0x6000)result+=btoa(String.fromCharCode(...value.subarray(offset,offset+0x6000)));return result}
const json=value=>JSON.stringify(value);
const clone=value=>structuredClone(value);
const empty=()=>({version:2,tasks:{},activity:[],visits:[]});
const blankTask=()=>({status:'todo',owner:'',date:'',notes:'',links:[],files:[],revision:0});
function text(value,max=4000){if(typeof value!=='string'||value.length>max)fail(400,'Invalid text field.');return value.trim()}
function taskID(value){if(!TASKS.has(value))fail(404,'Unknown task.');return value}
function link(value){
  const label=text(value?.label,160),url=text(value?.url,2048);let parsed;try{parsed=new URL(url)}catch{fail(400,'Use a complete HTTPS link.')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||!label)fail(400,'Use a named HTTPS link without embedded credentials.');
  return {label,url:parsed.href};
}
function fields(value){
  if(!value||!STATUSES.has(value.status))fail(400,'Invalid task status.');
  const owner=text(value.owner,100),date=text(value.date,10),notes=text(value.notes);
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))fail(400,'Invalid target date.');
  if(!Array.isArray(value.links)||value.links.length>30)fail(400,'Use at most 30 links per task.');
  return {status:value.status,owner,date,notes,links:value.links.map(link)};
}
async function body(request,limit){
  if(Number(request.headers.get('content-length'))>limit)fail(413,'File too large. Add an online document or storage link instead.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();fail(413,'File too large. Add a PowerPoint, OneDrive, Drive or Canva link instead.')}chunks.push(value)}
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result;
}
async function bodyJSON(request){try{return JSON.parse(decoder.decode(await body(request,128*1024)))}catch(e){if(e instanceof Fault)throw e;fail(400,'Invalid JSON.')}}
async function dataKey(env){return crypto.subtle.importKey('raw',bytes(env.DATA_KEY),'AES-GCM',false,['encrypt','decrypt'])}
async function seal(raw,env){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await dataKey(env),raw));const result=new Uint8Array(12+encrypted.length);result.set(iv);result.set(encrypted,12);return result}
async function open(raw,env){return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(0,12)},await dataKey(env),raw.slice(12)))}
async function sealState(state,env){return encoder.encode(json({version:2,salt:env.DATA_SALT,encrypted:base64(await seal(encoder.encode(json(state)),env))}))}
async function openState(raw,env){const envelope=JSON.parse(decoder.decode(raw));if(envelope.version!==2||envelope.salt!==env.DATA_SALT)fail(503,'Shared data encryption configuration does not match.');const state=JSON.parse(decoder.decode(await open(bytes(envelope.encrypted),env)));if(state.version!==2||!state.tasks||!Array.isArray(state.activity)||!Array.isArray(state.visits))fail(503,'Shared state is invalid.');return state}
async function hmac(env){return crypto.subtle.importKey('raw',bytes(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function issue(actor,env){const payload=base64(encoder.encode(json({actor,expires:Date.now()+12*3600000,nonce:crypto.randomUUID()})));const signature=base64(new Uint8Array(await crypto.subtle.sign('HMAC',await hmac(env),encoder.encode(payload))));return `${payload}.${signature}`}
async function identity(request,env){try{const [payload,signature,...extra]=(request.headers.get('authorization')||'').replace(/^Bearer /,'').split('.');if(extra.length||!payload||!signature)throw 0;if(!await crypto.subtle.verify('HMAC',await hmac(env),bytes(signature),encoder.encode(payload)))throw 0;const session=JSON.parse(decoder.decode(bytes(payload)));if(session.expires<Date.now()||typeof session.actor!=='string'||!session.actor.trim())throw 0;return session.actor}catch{fail(401,'Session expired. Lock and sign in again.')}}
function limited(request){const ip=request.headers.get('cf-connecting-ip')||'local';const now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);let value=attempts.get(ip);if(!value){if(attempts.size>2000)attempts.clear();value={count:0,until:now+15*60000};attempts.set(ip,value)}if(++value.count>15)fail(429,'Too many sign-in attempts. Try again in 15 minutes.');return ip}
async function passwordOK(password,env){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password)))).map(x=>x.toString(16).padStart(2,'0')).join('');if(!/^[a-f0-9]{64}$/.test(env.PASSWORD_SHA256))fail(503,'Password configuration is invalid.');let diff=0;for(let i=0;i<64;i++)diff|=digest.charCodeAt(i)^env.PASSWORD_SHA256.charCodeAt(i);return diff===0}
export function createHandler(fetcher=fetch){
  async function github(env,path,options={}){
    let response;try{response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`,{...options,headers:{'Authorization':`Bearer ${env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'Demo-Day-Team-Workspace',...options.headers}})}catch{fail(502,'GitHub could not be reached. Refresh to check the latest saved state before retrying.');}
    if(response.status===401||response.status===403)fail(503,'GitHub write access is unavailable or rate-limited. Contact the workspace owner.');return response;
  }
  async function readState(env){
    const response=await github(env,`contents/${STATE_PATH}?ref=${BRANCH}`);
    if(response.status===404){const branch=await github(env,`branches/${BRANCH}`);if(!branch.ok)fail(503,'The shared-data branch is not configured.');return {state:empty(),sha:null}}
    if(!response.ok)fail(502,'Could not read shared progress from GitHub.');const data=await response.json();if(!data.content||!data.sha)fail(503,'Shared state is too large or unavailable.');return {state:await openState(bytes(data.content.replace(/\s/g,'')),env),sha:data.sha};
  }
  async function mutate(env,operation){
    for(let i=0;i<4;i++){
      const {state,sha}=await readState(env),result=operation(state);if(result?.noWrite)return result.value;
      state.activity=state.activity.slice(-200);state.visits=state.visits.slice(-200);
      const content=await sealState(state,env);if(content.length>900000)fail(413,'Shared records are full. Contact the workspace owner.');
      const response=await github(env,`contents/${STATE_PATH}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:json({message:'Update encrypted team workspace',branch:BRANCH,content:base64(content),...(sha?{sha}:{})})});
      if(response.ok)return result;if(response.status===409||response.status===422)continue;fail(502,'GitHub did not confirm the save. Refresh before retrying.');
    }
    fail(409,'Other updates are in progress. Refresh and try again.');
  }
  function record(state,event){state.activity.push({id:crypto.randomUUID(),at:new Date().toISOString(),...event})}
  return {async fetch(request,env){
    const origin=request.headers.get('origin'),allowed=env.ALLOWED_ORIGIN||ALLOWED_ORIGIN;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin===allowed){headers['Access-Control-Allow-Origin']=allowed;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}
    const respond=(value,status=200)=>new Response(json(value),{status,headers});
    try{
      if(origin&&origin!==allowed)fail(403,'This origin is not allowed.');
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      const url=new URL(request.url),path=url.pathname.replace(/^\/api/,'');
      if(path==='/health'){
        const configured=['GITHUB_TOKEN','PASSWORD_SHA256','SESSION_SECRET','DATA_KEY','DATA_SALT'].every(k=>!!env[k]);
        if(!configured)return respond({ready:false,maxFileBytes:MAX_FILE_BYTES},503);
        await readState(env);
        return respond({ready:true,maxFileBytes:MAX_FILE_BYTES});
      }
      if(!['GITHUB_TOKEN','PASSWORD_SHA256','SESSION_SECRET','DATA_KEY','DATA_SALT'].every(k=>env[k]))fail(503,'Shared workspace is not configured yet.');
      if(path==='/auth'&&request.method==='POST'){
        const ip=limited(request),input=await bodyJSON(request),actor=text(input.name,80),password=text(input.password,200);
        if(actor.length<2)fail(400,'Enter your name.');if(!await passwordOK(password,env))fail(401,'Incorrect workspace password.');
        const visit={id:crypto.randomUUID(),actor,at:new Date().toISOString()};
        await mutate(env,state=>{state.visits.push(visit);return true});attempts.delete(ip);
        return respond({token:await issue(actor,env),actor,maxFileBytes:MAX_FILE_BYTES,identity:'self-reported'});
      }
      const actor=await identity(request,env);
      if(path==='/state'&&request.method==='GET')return respond((await readState(env)).state);
      const taskMatch=path.match(/^\/tasks\/([a-z]+-\d+)$/);
      if(taskMatch&&request.method==='POST'){
        const id=taskID(taskMatch[1]),input=await bodyJSON(request),update=fields(input.fields);
        if(!Number.isSafeInteger(input.revision)||input.revision<0)fail(400,'Missing task revision.');
        const result=await mutate(env,state=>{
          const before=state.tasks[id]||blankTask();if(before.revision!==input.revision)fail(409,'This task changed since you opened it. Reload the task before saving; your edits have not been overwritten.');
          const next={...before,...update,revision:before.revision+1,updatedAt:new Date().toISOString(),updatedBy:actor};state.tasks[id]=next;record(state,{actor,taskId:id,type:next.status==='done'&&before.status!=='done'?'completed':'updated'});return next;
        });return respond(result);
      }
      if(path==='/files'&&request.method==='POST'){
        const id=taskID(url.searchParams.get('task')),name=text(url.searchParams.get('name'),180),type=text(url.searchParams.get('type')||'application/octet-stream',120);
        if(!name||/[\x00-\x1f\\/]/.test(name))fail(400,'Use a filename without path separators.');
        const content=await body(request,MAX_FILE_BYTES);if(!content.length)fail(400,'The selected file is empty.');
        const current=(await readState(env)).state.tasks[id]||blankTask();if(current.files.length>=30)fail(413,'This task already has 30 attachments. Use a folder link for additional files.');
        const fileId=crypto.randomUUID(),storagePath=`shared/files/${fileId}.bin`,encrypted=await seal(content,env);
        const uploaded=await github(env,`contents/${storagePath}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:json({message:'Add encrypted team attachment',branch:BRANCH,content:base64(encrypted)})});
        if(!uploaded.ok)fail(502,'GitHub did not confirm the file upload. Try again.');
        const file={id:fileId,name,type,size:content.length,uploadedAt:new Date().toISOString(),uploadedBy:actor};
        const next=await mutate(env,state=>{const before=state.tasks[id]||blankTask();if(before.files.length>=30)fail(409,'Attachment capacity changed; the file was stored but is not attached. Contact the workspace owner.');const after={...before,files:[...before.files,file],revision:before.revision+1,updatedAt:file.uploadedAt,updatedBy:actor};state.tasks[id]=after;record(state,{actor,taskId:id,type:'uploaded',name});return after});
        return respond({task:next,file},201);
      }
      const fileMatch=path.match(/^\/files\/([a-f0-9-]{36})$/);
      if(fileMatch&&request.method==='GET'){
        const id=fileMatch[1],state=(await readState(env)).state;
        const file=Object.values(state.tasks).flatMap(t=>t.files||[]).find(f=>f.id===id);if(!file)fail(404,'Attachment not found.');
        const response=await github(env,`contents/shared/files/${id}.bin?ref=${BRANCH}`,{headers:{'Accept':'application/vnd.github.raw+json'}});
        if(!response.ok)fail(502,'Unable to download the attachment from GitHub.');
        const plaintext=await open(new Uint8Array(await response.arrayBuffer()),env);
        return new Response(plaintext,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`}});
      }
      fail(404,'Route not found.');
    }catch(error){return respond({error:error instanceof Fault?error.message:'Unexpected service error. Contact the workspace owner.'},error instanceof Fault?error.status:500)}
  }};
}
export default createHandler();
