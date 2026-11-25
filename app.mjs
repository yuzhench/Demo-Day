import {deriveKey,encrypt,decrypt} from './crypto.mjs';
import {TeamSync,checkedLink} from './sync.mjs';
const $=id=>document.getElementById(id);
const STORAGE='demo-day-2026-progress-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusNames={todo:'To do',doing:'In progress',blocked:'Blocked',done:'Done'};
let payload,data,key,state={},category='all',onlyRequired=false,editing=null,saveQueue=Promise.resolve(),toastTimer;
let sync=null,shared={activity:[],visits:[]},editingRevision=0,draftLinks=[],refreshTimer,busy=false;
const stamp=value=>value?new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'';
const toast=message=>{$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200)};
const current=t=>({status:'todo',owner:'',date:'',notes:'',links:[],files:[],revision:0,...state[t.id]});
const initials=name=>name.split(' ').map(p=>p[0]).slice(0,2).join('');
function validState(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid progress file.');
  const clean={};
  for(const task of data.tasks){
    if(!Object.hasOwn(value,task.id))continue;
    const s=value[task.id];
    if(!s||!Object.hasOwn(statusNames,s.status)||typeof s.owner!=='string'||s.owner.length>100||typeof s.date!=='string'||(s.date&&!/^\d{4}-\d{2}-\d{2}$/.test(s.date))||typeof s.notes!=='string'||s.notes.length>4000)throw new Error('Invalid task fields.');
    clean[task.id]={status:s.status,owner:s.owner,date:s.date,notes:s.notes,links:Array.isArray(s.links)?s.links.map(v=>checkedLink(v.label,v.url)):[],files:Array.isArray(s.files)?s.files:[],revision:Number.isInteger(s.revision)?s.revision:0,updatedAt:s.updatedAt||'',updatedBy:s.updatedBy||''};
  }
  return clean;
}
function save(){
  const snapshot=structuredClone(state),saveKey=key,salt=payload.salt;
  const pending=saveQueue.then(async()=>{const sealed=await encrypt(snapshot,saveKey);localStorage.setItem(sync?STORAGE+'-shared-cache':STORAGE,JSON.stringify({version:1,project:'harvard-demo-2026',salt,...sealed}))});
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
  const shown=data.tasks.filter(t=>{const s=current(t);return(category==='all'||t.category===category)&&(!onlyRequired||t.required)&&(status==='all'||s.status===status)&&(owner==='all'||s.owner===owner)&&`${t.title} ${t.detail} ${t.summary||''} ${t.deadlineLabel||''} ${s.notes} ${s.owner}`.toLowerCase().includes(q)});
  $('result-count').textContent=shown.length;
  $('list-title').textContent=category==='all'?'All tasks':data.categories.find(c=>c.id===category).title;
  $('list-subtitle').textContent=category==='all'?'A clear path from preparation to presentation.':data.categories.find(c=>c.id===category).description;
  $('navigation').innerHTML=[{id:'all',title:'Overview',icon:'◫'},...data.categories].map(c=>`<button data-category="${c.id}" class="${category===c.id?'active':''}" ${category===c.id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${c.icon}</span>${esc(c.nav||c.title)}<small>${data.tasks.filter(t=>(c.id==='all'||t.category===c.id)&&current(t).status!=='done').length}</small></button>`).join('');
  $('task-list').innerHTML=data.categories.map(c=>{const tasks=shown.filter(t=>t.category===c.id);if(!tasks.length)return '';return `<section class="task-group"><h3 class="group-heading">${esc(c.title)}<span>${tasks.length} tasks</span></h3>${tasks.map(t=>{
    const s=current(t),date=s.date||(t.due==='ASAP'?'ASAP':t.due||'');
    const dateLabel=date==='ASAP'?'ASAP':date?new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    return `<div class="task-row ${s.status==='done'?'done':''}"><input type="checkbox" class="task-check" data-check="${t.id}" aria-label="Mark ${esc(t.title)} complete" ${s.status==='done'?'checked':''}><button class="task-open" data-edit="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-summary">${esc(t.summary||t.detail)}</span><span class="task-deadline"><b>Deadline:</b> ${esc(t.deadlineLabel||'Internal deadline not assigned.')}</span><span class="task-meta">${t.required?'<span class="tag required">Organizer</span>':''}<span class="tag ${s.status}">${statusNames[s.status]}</span><span class="owner-dot">${s.owner?esc(initials(s.owner)):'–'}</span><span>${esc(s.owner||t.group+' · unassigned')}</span>${dateLabel?`<span class="task-date ${date==='ASAP'?'urgent':''}">${esc(dateLabel)}${s.date?' · internal':''}</span>`:''}</span>${s.updatedAt?`<span class="task-update">${esc(s.updatedBy)} · ${esc(stamp(s.updatedAt))}${s.files.length||s.links.length?` · ${s.files.length} files, ${s.links.length} links`:''}</span>`:''}</button></div>`;
  }).join('')}</section>`}).join('');
  $('empty').hidden=shown.length>0;
}
function syncStatus(message){$('sync-status').textContent=message}
async function refreshShared(silent=false){
  if(!sync)return;syncStatus('Refreshing…');
  try{shared=await sync.load();state=validState(shared.tasks);render();syncStatus(`Synced · ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`);await save().catch(()=>{});if(!silent)toast('Latest team progress loaded.');if($('activity-dialog').open)renderActivity()}
  catch(error){syncStatus('Sync unavailable');if(!silent)toast(error.message);throw error}
}
async function persistTask(task,next,revision){
  if(sync){syncStatus('Saving to GitHub…');const saved=await sync.update(task.id,revision,{status:next.status,owner:next.owner,date:next.date,notes:next.notes,links:next.links||[]});state[task.id]=saved;syncStatus('Saved to GitHub');render();await save().catch(()=>{});return saved}
  state[task.id]=next;render();await save();return next;
}
function renderResources(){
 const task=current(editing);
 $('resource-list').innerHTML=[...task.files.map(f=>`<div class="resource-item"><button type="button" data-download="${esc(f.id)}">${esc(f.name)}</button><small>${(f.size/1024/1024).toFixed(2)} MiB · ${esc(f.uploadedBy)} · ${esc(stamp(f.uploadedAt))}</small></div>`),...draftLinks.map((l,i)=>`<div class="resource-item"><a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a><button type="button" class="quiet remove-link" data-remove-link="${i}">Remove link</button><small>${esc(l.url)}</small></div>`)].join('')||'<p class="fine">No files or links yet.</p>';
}
function fillEditor(){
 const s=current(editing);if(s.owner&&!Array.from($('edit-owner').options).some(o=>o.value===s.owner))$('edit-owner').add(new Option(s.owner,s.owner));editingRevision=s.revision;draftLinks=structuredClone(s.links||[]);
 $('edit-status').value=s.status;$('edit-owner').value=s.owner;$('edit-date').value=s.date;$('edit-notes').value=s.notes;
 $('edit-error').textContent='';$('reload-task').hidden=true;$('link-title').value='';$('link-url').value='';$('upload-status').textContent='';renderResources();
}
function renderActivity(){
 const title=id=>data.tasks.find(t=>t.id===id)?.title||id;
 $('activity-list').innerHTML=[...shared.activity].reverse().map(a=>`<div class="activity-item"><b>${esc(a.actor)}</b> ${esc(a.type)} ${esc(title(a.taskId))}${a.name?` · ${esc(a.name)}`:''}<small>${esc(stamp(a.at))}</small></div>`).join('')||'<p>No shared updates recorded yet.</p>';
 $('visits-list').innerHTML=[...shared.visits].reverse().map(v=>`<div class="activity-item"><b>${esc(v.actor)}</b><small>${esc(stamp(v.at))} · self-reported name</small></div>`).join('')||'<p>No sign-ins recorded yet.</p>';
}
function setup(){
  $('project-description').textContent=data.description;
  $('rsvp').href=data.eventUrl;$('contact').href=`mailto:${data.contact}`;
  $('team').innerHTML=data.people.filter(p=>p.role==='Design'||p.role==='Technology').map(p=>`<div class="team-person"><span class="avatar">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>${esc(p.role)}</small></div></div>`).join('');
  const owners=[...new Set([...data.people.map(p=>p.name),...Object.values(state).map(s=>s.owner).filter(Boolean)])];
  const opts=owners.map(name=>({name})).map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
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
    if(sync){await sync.login($('visitor-name').value,$('password').value);shared=await sync.load();state=validState(shared.tasks);syncStatus('Synced with GitHub');$('refresh-team').hidden=false;$('show-activity').hidden=false;$('resource-panel').hidden=false;$('import').hidden=true;$('legacy-export').hidden=!localStorage.getItem(STORAGE);$('storage-description').textContent='Progress, attachments and links are shared through GitHub. Updates and sign-ins record the name supplied by the visitor. Notion is not updated. Earlier browser-only progress stays on this device and is not automatically merged.';clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!document.hidden&&!$('editor').open&&!busy)refreshShared(true).catch(()=>{})},60000);}
    $('password').value='';setup();$('gate').hidden=true;$('workspace').hidden=false;$('search').focus();
  }catch(error){$('login-error').textContent=error.message}
  finally{$('unlock-button').disabled=false;$('unlock-button').textContent='Open workspace'}
});
$('navigation').addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(b){category=b.dataset.category;render()}});
for(const id of ['search','status-filter','owner-filter'])$(id).addEventListener(id==='search'?'input':'change',render);
$('required-filter').addEventListener('click',()=>{onlyRequired=!onlyRequired;$('required-filter').setAttribute('aria-pressed',onlyRequired);render()});
$('task-list').addEventListener('change',async event=>{
 const id=event.target.dataset.check;if(!id)return;
 if(busy){render();return}busy=true;
 const task=data.tasks.find(t=>t.id===id),before=current(task),next={...before,status:event.target.checked?'done':'todo'};
 try{await persistTask(task,next,before.revision);toast(sync?'Saved to GitHub.':'Task saved on this browser.')}catch(error){render();syncStatus(sync?'Save not confirmed':'Browser save failed');toast(error.message);if(sync&&error.status===409)await refreshShared(true).catch(()=>{})}finally{busy=false}
});
$('task-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-edit]');if(!button)return;
  editing=data.tasks.find(t=>t.id===button.dataset.edit);const s=current(editing);
  $('edit-category').textContent=data.categories.find(c=>c.id===editing.category).title;$('edit-title').textContent=editing.title;$('edit-detail').textContent=editing.detail;
  $('edit-requirements').innerHTML=`<dl><dt>Deadline</dt><dd>${esc(editing.deadlineLabel||'Internal deadline not assigned.')}</dd><dt>Deliverables</dt><dd><ul>${(editing.deliverables||[editing.detail]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul></dd><dt>Completion guidance</dt><dd><ul>${(editing.completionChecks||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul></dd></dl><p class="fine">Completion guidance includes internal checks. Only organizer-labeled requirements and expressly cited event details come from the organizer.</p>`;
  fillEditor();
  $('edit-source').textContent=`${editing.required?'Organizer requirement · Acceptance/invitation email':'Internal preparation · Notion checklist'}${editing.due?' · Source deadline: '+editing.due:''}. Internal target dates do not change organizer deadlines.`;
  $('editor').showModal();
});
$('close-editor').addEventListener('click',()=>$('editor').close());
$('edit-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;$('save-task').disabled=true;$('edit-error').textContent='';
 const next={...current(editing),status:$('edit-status').value,owner:$('edit-owner').value,date:$('edit-date').value,notes:$('edit-notes').value,links:draftLinks};
 try{await persistTask(editing,next,editingRevision);toast(sync?'Task saved to GitHub.':'Task saved on this browser.');$('editor').close()}
 catch(error){$('edit-error').textContent=error.message;$('reload-task').hidden=error.status!==409;syncStatus(sync?'Save not confirmed':'Browser save failed')}
 finally{busy=false;$('save-task').disabled=false}
});
$('reload-task').addEventListener('click',async()=>{if(!confirm('Reload this task and discard the unsaved fields in this form?'))return;try{await refreshShared(true);fillEditor()}catch(error){$('edit-error').textContent=error.message}});
$('add-link').addEventListener('click',()=>{try{if(draftLinks.length>=30)throw new Error('Use at most 30 links per task.');draftLinks.push(checkedLink($('link-title').value,$('link-url').value));$('link-title').value='';$('link-url').value='';$('edit-error').textContent='';renderResources()}catch(error){$('edit-error').textContent=error.message}});
$('resource-list').addEventListener('click',async event=>{
 const remove=event.target.closest('[data-remove-link]');if(remove){draftLinks.splice(Number(remove.dataset.removeLink),1);renderResources();return}
 const download=event.target.closest('[data-download]');if(!download||!sync)return;
 download.disabled=true;try{const file=current(editing).files.find(f=>f.id===download.dataset.download),blob=await sync.download(file.id),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(error){$('edit-error').textContent=error.message}finally{download.disabled=false}
});
$('upload-file').addEventListener('click',()=>$('attachment-file').click());
$('attachment-file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file||!sync)return;
 if(file.size>sync.maxFileBytes){$('edit-error').textContent='This file exceeds the 10 MiB site upload limit. Add a PowerPoint, OneDrive, Drive or Canva link instead. GitHub’s ordinary repository hard limit is 100 MiB, but this site uses a lower transfer limit.';event.target.value='';$('link-url').focus();return}
 if(busy){event.target.value='';return}busy=true;$('save-task').disabled=true;$('upload-file').disabled=true;$('close-editor').disabled=true;$('upload-status').textContent='Uploading and attaching…';$('edit-error').textContent='';
 try{const beforeRevision=editingRevision,result=await sync.upload(editing.id,file);state[editing.id]=result.task;render();renderResources();
  if(result.task.revision===beforeRevision+1)editingRevision=result.task.revision;else{$('edit-error').textContent='The file is attached, but someone also changed this task. Reload the shared task before saving your other edits.';$('reload-task').hidden=false}
  $('upload-status').textContent='Uploaded and attached to the shared task.';syncStatus('Attachment saved to GitHub');await save().catch(()=>{});
 }catch(error){$('upload-status').textContent='Upload not confirmed';$('edit-error').textContent=error.message}
 finally{event.target.value='';busy=false;$('save-task').disabled=false;$('upload-file').disabled=false;$('close-editor').disabled=false}
});
$('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
$('refresh-team').addEventListener('click',()=>refreshShared().catch(()=>{}));
$('show-activity').addEventListener('click',async()=>{try{await refreshShared(true);renderActivity();$('activity-dialog').showModal()}catch{}});
$('close-activity').addEventListener('click',()=>$('activity-dialog').close());
$('legacy-export').addEventListener('click',()=>{const raw=localStorage.getItem(STORAGE);if(!raw)return;const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='demo-day-earlier-local-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
const lock=async()=>{if(busy){toast('Wait for the current save or upload to finish.');return}await saveQueue;sync?.logout();clearInterval(refreshTimer);key=null;data=null;state={};location.reload()};
$('lock').addEventListener('click',lock);$('lock-top').addEventListener('click',lock);
$('export').addEventListener('click',async()=>{
  try{const sealed={version:1,project:'harvard-demo-2026',salt:payload.salt,...await encrypt(state,key)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(sealed)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`demo-day-progress-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Encrypted progress exported.')}catch{toast('Export failed. Please try again.')}
});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;if(sync){toast('Imports cannot overwrite shared team progress.');return}
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

try{const response=await fetch('sync-config.json',{cache:'no-store'});if(!response.ok)throw new Error('Workspace configuration could not be loaded. Please reload.');const config=await response.json();if(config.apiUrl){sync=new TeamSync(config.apiUrl);$('name-field').hidden=false;$('visitor-name').required=true}document.documentElement.dataset.appReady='true';$('unlock-button').disabled=false}catch(error){$('login-error').textContent=error.message;$('unlock-button').disabled=true}
