import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './sync-fixture.mjs';
import {MAX_FILE_BYTES} from '../backend/worker.mjs';
import {checkedLink} from '../sync.mjs';
function client(f){let token;return {async call(path,{body,method='GET',headers={}}={}){return f.handler.fetch(new Request('https://sync.example/api'+path,{method,headers:{Origin:f.env.ALLOWED_ORIGIN,...(token?{Authorization:`Bearer ${token}`}:{}) ,...headers},...(body!==undefined?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})}),f.env)},async login(name='Team member'){const r=await this.call('/auth',{method:'POST',body:{name,password:'test-password'}});assert.equal(r.status,200);token=(await r.json()).token;return token}}}
const fields=(notes='')=>({status:'doing',owner:'Team member',date:'2026-11-30',notes,links:[{label:'Presentation',url:'https://example.com/deck'}]});
test('rejects wrong password, unauthenticated writes, forged sessions, foreign origins and invalid links',async()=>{
 const f=fixture(),c=client(f);
 assert.equal((await c.call('/state')).status,401);
 assert.equal((await c.call('/auth',{method:'POST',body:{name:'Person',password:'wrong'}})).status,401);
 assert.equal((await c.call('/state',{headers:{Authorization:'Bearer fake.fake'}})).status,401);
 assert.equal((await c.call('/health',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.throws(()=>checkedLink('Bad','javascript:alert(1)'));assert.throws(()=>checkedLink('Bad','https://user:secret@example.com'));
 await c.login();assert.equal((await c.call('/tasks/design-1',{method:'POST',body:{revision:0,fields:{...fields(),links:[{label:'Bad',url:'javascript:alert(1)'}]}}})).status,400);
 assert.equal(f.files.size,1);
});
test('two users share records, stale same-task edits fail, GitHub conflicts retry, data remains encrypted',async()=>{
 const f=fixture(),a=client(f),b=client(f);await a.login('First member');await b.login('Second member');
 f.conflictOnce();let r=await a.call('/tasks/design-1',{method:'POST',body:{revision:0,fields:fields('Confidential notes')}});assert.equal(r.status,200);assert.equal((await r.json()).revision,1);
 let state=await(await b.call('/state')).json();assert.equal(state.tasks['design-1'].notes,'Confidential notes');assert.equal(state.tasks['design-1'].updatedBy,'First member');assert.equal(state.visits.length,2);
 r=await b.call('/tasks/design-1',{method:'POST',body:{revision:0,fields:fields('Stale edit')}});assert.equal(r.status,409);
 r=await b.call('/tasks/design-2',{method:'POST',body:{revision:0,fields:{...fields(),status:'done'}}});assert.equal(r.status,200);
 state=await(await a.call('/state')).json();assert.equal(state.tasks['design-1'].notes,'Confidential notes');assert.equal(state.tasks['design-2'].status,'done');assert.equal(state.activity.at(-1).type,'completed');
 for(const {raw}of f.files.values()){assert(!raw.includes('Confidential notes'));assert(!raw.includes('First member'));assert(!raw.includes('Presentation'))}
});
test('uploads encrypt files, record uploader, download original bytes and reject oversized uploads',async()=>{
 const f=fixture(),a=client(f),b=client(f);await a.login('Uploader');await b.login('Reader');
 const input=new TextEncoder().encode('Private slide content. 中文');
 let r=await a.call('/files?task=pitch-4&name=deck.pptx&type=application%2Foctet-stream',{method:'POST',body:input});assert.equal(r.status,201);
 const {file,task}=await r.json();assert.equal(file.uploadedBy,'Uploader');assert.equal(task.files.length,1);
 r=await b.call('/files/'+file.id);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),input);assert(r.headers.get('content-disposition').includes('attachment'));
 const stored=f.files.get('shared/files/'+file.id+'.bin').raw;assert(!stored.includes('Private slide content'));assert.equal(stored.length,input.length+28);
 r=await a.call('/files?task=pitch-4&name=huge.pptx',{method:'POST',body:'x',headers:{'Content-Length':String(MAX_FILE_BYTES+1)}});assert.equal(r.status,413);assert((await r.json()).error.includes('link'));
 r=await a.call('/files?task=pitch-4&name=..%2Fsecrets',{method:'POST',body:'x'});assert.equal(r.status,400);
 assert.equal((await b.call('/files/00000000-0000-0000-0000-000000000000')).status,404);
});
