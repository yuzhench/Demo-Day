import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
let password='';for await(const c of process.stdin)password+=c;password=password.trimEnd();
if(!password)throw new Error('Password required via stdin');
const targets=await(await fetch('http://127.0.0.1:9236/json')).json();
const target=targets.find(t=>t.type==='page');const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
let seq=0;const pending=new Map();const errors=[];
socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true})};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value}
async function until(expression){for(let i=0;i<100;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out: '+expression)}
const field=(id,value)=>run(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)}`);
const click=id=>run(`document.getElementById(${JSON.stringify(id)}).click()`);
const login=async value=>{await field('password',value);await run("document.getElementById('unlock').requestSubmit()")};
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:8936/'});await until("!!document.getElementById('unlock')");
await run('localStorage.clear()');await mkdir('test-results',{recursive:true});
await login('incorrect-test-password');await until("document.getElementById('login-error').textContent.includes('Incorrect')");
assert.equal(await run("document.getElementById('workspace').hidden"),true);
await login(password);await until("!document.getElementById('workspace').hidden");
assert.equal(await run("document.querySelectorAll('.task-row').length"),32);
assert.equal(await run("document.getElementById('required-number').textContent"),'0 / 7');
await click('required-filter');assert.equal(await run("document.querySelectorAll('.task-row').length"),7);await click('required-filter');
const testOwner=await run("document.getElementById('edit-owner').options[1].value");
await run("document.querySelector('[data-edit=design-1]').click()");await field('edit-owner',testOwner);await field('edit-status','doing');await field('edit-date','2026-11-27');await field('edit-notes','Browser test note <script> — 中文');
await run("document.getElementById('edit-form').requestSubmit()");await until("!document.getElementById('editor').open");
const encrypted=await run("localStorage.getItem('demo-day-2026-progress-v1')");assert(encrypted);assert(!encrypted.includes(testOwner));assert(!encrypted.includes('Browser test'));
await send('Page.reload');await until("!!document.getElementById('unlock')");await login(password);await until("!document.getElementById('workspace').hidden");
await run("document.querySelector('[data-edit=design-1]').click()");assert.equal(await run("document.getElementById('edit-owner').value"),testOwner);assert.equal(await run("document.getElementById('edit-notes').value"),'Browser test note <script> — 中文');await click('close-editor');
await run("document.querySelector('[data-check=design-2]').click()");await until("document.getElementById('required-number').textContent==='1 / 7'");
await field('search','rehearsal');await run("document.getElementById('search').dispatchEvent(new Event('input'))");assert.equal(await run("document.querySelectorAll('.task-row').length"),1);
await field('search','unfindable-string');await run("document.getElementById('search').dispatchEvent(new Event('input'))");assert.equal(await run("document.getElementById('empty').hidden"),false);
await field('search','');await run("document.getElementById('search').dispatchEvent(new Event('input'))");
await field('owner-filter',testOwner);await run("document.getElementById('owner-filter').dispatchEvent(new Event('change'))");assert.equal(await run("document.querySelectorAll('.task-row').length"),1);await field('owner-filter','all');await run("document.getElementById('owner-filter').dispatchEvent(new Event('change'))");
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:process.cwd()+'/test-results'});await click('export');
// Re-import an encrypted copy after changing the task.
const backup=await run("localStorage.getItem('demo-day-2026-progress-v1')");await writeFile('test-results/import.json',backup);
await run("document.querySelector('[data-check=design-2]').click()");await until("document.getElementById('required-number').textContent==='0 / 7'");
await send('DOM.enable');const doc=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#import-file'});
await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[process.cwd()+'/test-results/import.json']});await until("document.getElementById('required-number').textContent==='1 / 7'");
// Clean preview state before screenshots and handoff.
await run('localStorage.clear()');await click('lock-top');await until("!!document.getElementById('unlock')");
assert.equal(await run("document.getElementById('workspace').hidden"),true);await login(password);await until("!document.getElementById('workspace').hidden");
assert.equal(await run("document.getElementById('progress-number').textContent"),'0%');
let shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('test-results/desktop.png',Buffer.from(shot.data,'base64'));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await run('document.documentElement.scrollWidth<=390'),true);
shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('test-results/mobile.png',Buffer.from(shot.data,'base64'));
await click('lock-top');await until("!!document.getElementById('unlock')");assert.equal(await run('document.documentElement.scrollWidth<=390'),true);
assert.deepEqual(errors,[]);socket.close();console.log('PASS: wrong/correct password, 32 tasks, 7 requirements, filters, edit, encrypted persistence, reload, export/import, lock, mobile layout, no browser exceptions.');
