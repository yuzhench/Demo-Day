export class SyncError extends Error{constructor(message,status){super(message);this.status=status}}
export class TeamSync{
 constructor(url){this.url=url.replace(/\/$/,'');if(!/^https:\/\//.test(this.url)&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(this.url))throw new Error('Sync endpoint must use HTTPS.');this.token=null;this.actor=null}
 async request(path,options={}){
  let response;try{response=await fetch(this.url+'/api'+path,{cache:'no-store',...options,headers:{...(this.token?{Authorization:`Bearer ${this.token}`}:{}) ,...options.headers}})}catch{throw new SyncError('Cannot reach team sync. Your changes were not confirmed; keep this task open and try again.',0)}
  if(!response.ok){let value;try{value=await response.json()}catch{}throw new SyncError(value?.error||'Team sync is unavailable.',response.status)}return response;
 }
 async login(name,password){const response=await this.request('/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password})});const result=await response.json();this.token=result.token;this.actor=result.actor;this.maxFileBytes=result.maxFileBytes;return result}
 async load(){return(await this.request('/state')).json()}
 async update(id,revision,fields){return(await this.request(`/tasks/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,fields})})).json()}
 async upload(id,file){if(file.size>this.maxFileBytes)throw new SyncError('This file exceeds the 10 MiB site upload limit. Add a PowerPoint, OneDrive, Drive or Canva link instead.',413);return(await this.request(`/files?task=${encodeURIComponent(id)}&name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type||'application/octet-stream')}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})).json()}
 async download(id){return(await this.request(`/files/${id}`)).blob()}
 logout(){this.token=null;this.actor=null}
}
export function checkedLink(label,value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!label.trim())throw new Error('Add a title and a complete HTTPS link.');return {label:label.trim(),url:url.href}}
