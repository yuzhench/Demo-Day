import {deriveKey,encrypt,decrypt} from './crypto.mjs';
const $=id=>document.getElementById(id);
const STORAGE='demo-day-2026-progress-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusNames={todo:'To do',doing:'In progress',blocked:'Blocked',done:'Done'};
let payload,data,key,state={},category='all',onlyRequired=false,editing=null,saveQueue=Promise.resolve(),toastTimer;
const toast=message=>{$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200)};
const current=t=>({status:'todo',owner:'',date:'',notes:'',...state[t.id]});
const initials=name=>name.split(' ').map(p=>p[0]).slice(0,2).join('');
function validState(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid progress file.');
  const clean={};
  for(const task of data.tasks){
    if(!Object.hasOwn(value,task.id))continue;
    const s=value[task.id];
    if(!s||!Object.hasOwn(statusNames,s.status)||typeof s.owner!=='string'||(s.owner&&!data.people.some(p=>p.name===s.owner))||typeof s.date!=='string'||(s.date&&!/^\d{4}-\d{2}-\d{2}$/.test(s.date))||typeof s.notes!=='string'||s.notes.length>4000)throw new Error('Invalid task fields.');
    clean[task.id]={status:s.status,owner:s.owner,date:s.date,notes:s.notes};
  }
  return clean;
}
function save(){
  const snapshot=structuredClone(state),saveKey=key,salt=payload.salt;
  const pending=saveQueue.then(async()=>{const sealed=await encrypt(snapshot,saveKey);localStorage.setItem(STORAGE,JSON.stringify({version:1,project:'harvard-demo-2026',salt,...sealed}))});
  saveQueue=pending.catch(()=>{});
  return pending;
}
function render(){
  const done=data.tasks.filter(t=>current(t).status==='done').length;
  const required=data.tasks.filter(t=>t.required),reqDone=required.filter(t=>current(t).status==='done').length;
  $('progress-number').textContent=`${Math.round(done/data.tasks.length*100)}%`;
  $('progress-text').textContent=`${done} of ${data.tasks.length} done`;
  $('progress').max=data.tasks.length;$('progress').value=done;$('progress').setAttribute('aria-label',`${done} of ${data.tasks.length} tasks complete`);
  $('required-number').textContent=`${reqDone} / ${required.length}`;
  const q=$('search').value.toLowerCase(),status=$('status-filter').value,owner=$('owner-filter').value;
  const shown=data.tasks.filter(t=>{const s=current(t);return(category==='all'||t.category===category)&&(!onlyRequired||t.required)&&(status==='all'||s.status===status)&&(owner==='all'||s.owner===owner)&&`${t.title} ${t.detail} ${s.notes} ${s.owner}`.toLowerCase().includes(q)});
  $('result-count').textContent=shown.length;
  $('list-title').textContent=category==='all'?'All tasks':data.categories.find(c=>c.id===category).title;
  $('list-subtitle').textContent=category==='all'?'A clear path from preparation to presentation.':data.categories.find(c=>c.id===category).description;
  $('navigation').innerHTML=[{id:'all',title:'Overview',icon:'◫'},...data.categories].map(c=>`<button data-category="${c.id}" class="${category===c.id?'active':''}" ${category===c.id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${c.icon}</span>${esc(c.nav||c.title)}<small>${data.tasks.filter(t=>(c.id==='all'||t.category===c.id)&&current(t).status!=='done').length}</small></button>`).join('');
  $('task-list').innerHTML=data.categories.map(c=>{const tasks=shown.filter(t=>t.category===c.id);if(!tasks.length)return '';return `<section class="task-group"><h3 class="group-heading">${esc(c.title)}<span>${tasks.length} tasks</span></h3>${tasks.map(t=>{
    const s=current(t),date=s.date||(t.due==='ASAP'?'ASAP':t.due||'');
    const dateLabel=date==='ASAP'?'ASAP':date?new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    return `<div class="task-row ${s.status==='done'?'done':''}"><input type="checkbox" class="task-check" data-check="${t.id}" aria-label="Mark ${esc(t.title)} complete" ${s.status==='done'?'checked':''}><button class="task-open" data-edit="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${t.required?'<span class="tag required">Organizer</span>':''}<span class="tag ${s.status}">${statusNames[s.status]}</span><span class="owner-dot">${s.owner?esc(initials(s.owner)):'–'}</span><span>${esc(s.owner||t.group+' · unassigned')}</span>${dateLabel?`<span class="task-date ${date==='ASAP'?'urgent':''}">${esc(dateLabel)}${s.date?' · internal':''}</span>`:''}</span></button></div>`;
  }).join('')}</section>`}).join('');
  $('empty').hidden=shown.length>0;
}
function setup(){
  $('project-description').textContent=data.description;
  $('rsvp').href=data.eventUrl;$('contact').href=`mailto:${data.contact}`;
  $('team').innerHTML=data.people.filter(p=>p.role==='Design'||p.role==='Technology').map(p=>`<div class="team-person"><span class="avatar">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>${esc(p.role)}</small></div></div>`).join('');
  const opts=data.people.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  $('owner-filter').innerHTML='<option value="all">All owners</option><option value="">Unassigned</option>'+opts;
  $('edit-owner').innerHTML='<option value="">Unassigned</option>'+opts;
  $('sources').innerHTML=data.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a>`).join('');
  const now=new Date();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const days=Math.round((Date.parse('2026-12-09')-Date.parse(today))/86400000);
  $('days').textContent=Math.max(0,days);$('days-label').textContent=days<0?'EVENT COMPLETE':days===0?'DEMO DAY IS TODAY':'DAYS TO DEMO DAY';
  render();
}
$('unlock').addEventListener('submit',async event=>{
  event.preventDefault();$('unlock-button').disabled=true;$('unlock-button').textContent='Opening…';$('login-error').textContent='';
  try{
    if(!crypto.subtle)throw new Error('Secure browser context required. Use HTTPS or localhost.');
    if(!payload){const response=await fetch('payload.json',{cache:'no-store'});if(!response.ok)throw new Error('Could not load workspace. Please reload.');payload=await response.json()}
    let candidate,opened;
    try{candidate=await deriveKey($('password').value,payload.salt);opened=await decrypt(payload,candidate)}catch{throw new Error('Incorrect password. Please try again.')}
    key=candidate;data=opened;state={};
    try{const raw=localStorage.getItem(STORAGE);if(raw){const stored=JSON.parse(raw);const oldKey=stored.salt===payload.salt?key:await deriveKey($('password').value,stored.salt);state=validState(await decrypt(stored,oldKey))}}catch{toast('Saved progress could not be read. Export any recoverable backup before making changes.')}
    $('password').value='';setup();$('gate').hidden=true;$('workspace').hidden=false;$('search').focus();
  }catch(error){$('login-error').textContent=error.message}
  finally{$('unlock-button').disabled=false;$('unlock-button').textContent='Open workspace'}
});
$('navigation').addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(b){category=b.dataset.category;render()}});
for(const id of ['search','status-filter','owner-filter'])$(id).addEventListener(id==='search'?'input':'change',render);
$('required-filter').addEventListener('click',()=>{onlyRequired=!onlyRequired;$('required-filter').setAttribute('aria-pressed',onlyRequired);render()});
$('task-list').addEventListener('change',async event=>{
  const id=event.target.dataset.check;if(!id)return;const task=data.tasks.find(t=>t.id===id),before=current(task);
  state[id]={...before,status:event.target.checked?'done':'todo'};render();
  try{await save()}catch{toast('Could not save to this browser. Export progress to keep these changes.')}
});
$('task-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-edit]');if(!button)return;
  editing=data.tasks.find(t=>t.id===button.dataset.edit);const s=current(editing);
  $('edit-category').textContent=data.categories.find(c=>c.id===editing.category).title;$('edit-title').textContent=editing.title;$('edit-detail').textContent=editing.detail;
  $('edit-status').value=s.status;$('edit-owner').value=s.owner;$('edit-date').value=s.date;$('edit-notes').value=s.notes;
  $('edit-source').textContent=`${editing.required?'Organizer requirement · Acceptance/invitation email':'Internal preparation · Notion checklist'}${editing.due?' · Source deadline: '+editing.due:''}. Internal target dates do not change organizer deadlines.`;
  $('editor').showModal();
});
$('close-editor').addEventListener('click',()=>$('editor').close());
$('edit-form').addEventListener('submit',async event=>{
  event.preventDefault();state[editing.id]={status:$('edit-status').value,owner:$('edit-owner').value,date:$('edit-date').value,notes:$('edit-notes').value};render();
  try{await save();toast('Task saved on this browser.')}catch{toast('Browser storage unavailable. Export progress to keep these changes.')}
  $('editor').close();
});
const lock=async()=>{await saveQueue;key=null;data=null;state={};location.reload()};
$('lock').addEventListener('click',lock);$('lock-top').addEventListener('click',lock);
$('export').addEventListener('click',async()=>{
  try{const sealed={version:1,project:'harvard-demo-2026',salt:payload.salt,...await encrypt(state,key)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(sealed)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`demo-day-progress-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Encrypted progress exported.')}catch{toast('Export failed. Please try again.')}
});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>2000000)throw new Error('File is too large.');
    const imported=JSON.parse(await file.text());if(imported.version!==1||imported.project!=='harvard-demo-2026')throw new Error('Not a progress file for this workspace.');
    let importKey=key;if(imported.salt!==payload.salt){const password=prompt('This export comes from an earlier workspace version. Enter its password to import.');if(password===null)return;importKey=await deriveKey(password,imported.salt)}
    let clean;try{clean=validState(await decrypt(imported,importKey))}catch{throw new Error('Unable to decrypt or validate this progress file.')}
    if(!confirm('Replace this browser’s progress with the imported file? Export current progress first if you need a backup.'))return;
    state=clean;render();try{await save();toast('Progress imported and saved.')}catch{toast('Imported in memory. Browser storage failed; keep your export as backup.')}
  }catch(error){toast(error.message)}finally{event.target.value=''}
});
// Never overwrite edits silently when another tab changes this browser’s copy.
window.addEventListener('storage',event=>{if(event.key===STORAGE&&key)toast('Progress changed in another tab. Lock and reopen to load it before editing.')});

document.documentElement.dataset.appReady='true';
