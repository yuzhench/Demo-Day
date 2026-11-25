import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
let password='';for await(const chunk of process.stdin)password+=chunk;password=password.trimEnd();
const errors=[];
async function connect(url){
 const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});let seq=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
 return {send,close:()=>socket.close()};
}
const version=await(await fetch('http://127.0.0.1:9236/json/version')).json(),browser=await connect(version.webSocketDebuggerUrl);
async function page(name){
 const {browserContextId}=await browser.send('Target.createBrowserContext');const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
 const targets=await(await fetch('http://127.0.0.1:9236/json')).json(),c=await connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);
 const run=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const until=async expression=>{for(let n=0;n<100;n++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out: '+expression+' '+JSON.stringify(errors))};
 const field=(id,value)=>run(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)}`),click=id=>run(`document.getElementById(${JSON.stringify(id)}).click()`);
 await c.send('Runtime.enable');await c.send('Network.enable');await c.send('Network.setCacheDisabled',{cacheDisabled:true});await c.send('Page.enable');await c.send('Page.navigate',{url:'http://127.0.0.1:8938/'});await until("document.documentElement.dataset.appReady==='true'");
 await field('visitor-name',name);await field('password',password);await run("document.getElementById('unlock').requestSubmit()");await until("!document.getElementById('workspace').hidden");
 return {...c,run,until,field,click,browserContextId};
}
await mkdir('test-results',{recursive:true});
const a=await page('QA member A'),b=await page('QA member B');
assert.equal(await a.run("document.querySelectorAll('.task-summary').length"),32);
await a.run("document.querySelector('[data-edit=pitch-4]').click()");assert((await a.run("document.getElementById('edit-requirements').innerText")).includes('November 30, 2026'));
await a.field('link-title','Online pitch deck');await a.field('link-url','https://example.com/presentation');await a.click('add-link');
await a.field('edit-notes','Shared note from A');await a.run("document.getElementById('edit-form').requestSubmit()");await a.until("!document.getElementById('editor').open");
await b.click('refresh-team');await b.until("document.getElementById('sync-status').textContent.startsWith('Synced')");await b.run("document.querySelector('[data-edit=pitch-4]').click()");assert.equal(await b.run("document.getElementById('edit-notes').value"),'Shared note from A');assert((await b.run("document.getElementById('resource-list').innerText")).includes('Online pitch deck'));
// A changes the task after B opens it: B must retain unsaved edits and get a conflict.
await a.run("document.querySelector('[data-edit=pitch-4]').click()");await a.field('edit-notes','Newer version from A');await a.run("document.getElementById('edit-form').requestSubmit()");await a.until("!document.getElementById('editor').open");
await b.field('edit-notes','Unsaved competing edit');await b.run("document.getElementById('edit-form').requestSubmit()");await b.until("document.getElementById('edit-error').textContent.includes('changed')");assert.equal(await b.run("document.getElementById('edit-notes').value"),'Unsaved competing edit');await b.click('close-editor');
// Upload in A and download in B through the authenticated API.
await a.run("document.querySelector('[data-edit=pitch-4]').click()");
await writeFile('test-results/qa-deck.pptx','Test attachment bytes, not a real PowerPoint.');
await a.send('DOM.enable');let document=await a.send('DOM.getDocument');let node=await a.send('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#attachment-file'});
await a.send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[process.cwd()+'/test-results/qa-deck.pptx']});await a.until("document.getElementById('upload-status').textContent.includes('Uploaded and attached')");await a.click('close-editor');
await b.click('refresh-team');await b.until("document.getElementById('sync-status').textContent.startsWith('Synced')");await b.run("document.querySelector('[data-edit=pitch-4]').click()");assert((await b.run("document.getElementById('resource-list').innerText")).includes('qa-deck.pptx'));
const downloadDir=process.cwd()+'/test-results/downloads';await mkdir(downloadDir,{recursive:true});await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir,browserContextId:b.browserContextId});await b.run("document.querySelector('[data-download]').click()");
for(let i=0;i<100;i++){try{assert.equal(await readFile(downloadDir+'/qa-deck.pptx','utf8'),'Test attachment bytes, not a real PowerPoint.');break}catch(error){if(i===99)throw error;await new Promise(r=>setTimeout(r,100))}}
await b.run("const f=new File([new Uint8Array(10*1024*1024+1)],'too-large.pptx');const transfer=new DataTransfer();transfer.items.add(f);const input=document.getElementById('attachment-file');input.files=transfer.files;input.dispatchEvent(new Event('change'))");await b.until("document.getElementById('edit-error').textContent.includes('10 MiB')");
await b.click('close-editor');await b.click('show-activity');await b.until("document.getElementById('activity-dialog').open");assert((await b.run("document.getElementById('visits-list').innerText")).includes('QA member A'));assert((await b.run("document.getElementById('activity-list').innerText")).includes('uploaded'));await b.click('close-activity');
await a.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});let shot=await a.send('Page.captureScreenshot',{format:'png'});await writeFile('test-results/shared-desktop.png',Buffer.from(shot.data,'base64'));
await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert(await a.run('document.documentElement.scrollWidth<=390'));await a.run("document.querySelector('[data-edit=pitch-4]').click()");shot=await a.send('Page.captureScreenshot',{format:'png'});await writeFile('test-results/shared-mobile-task.png',Buffer.from(shot.data,'base64'));
assert.deepEqual(errors,[]);a.close();b.close();await browser.send('Target.disposeBrowserContext',{browserContextId:a.browserContextId});await browser.send('Target.disposeBrowserContext',{browserContextId:b.browserContextId});browser.close();
console.log('PASS: isolated users share progress/links, explicit task requirements, stale-edit conflicts preserve drafts, encrypted attachment upload/download, oversize link guidance, activity/sign-ins, mobile layout. Mock GitHub only; no live writes.');
