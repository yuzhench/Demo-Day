const $=id=>document.getElementById(id);
let mode='unknown';
const messages={unknown:['Sharing status not verified','Check the save indicator on the task board. Do not assume progress, uploads or activity are shared.'],local:['Browser-local mode · sharing is not enabled','The website and task instructions are online. Checkmarks, owners, target dates and notes are saved only in your own browser. Team synchronization, file uploads, shared links and sign-in history are not enabled.'],shared:['Team sharing is configured','Sign in on the board, then wait for a successful save confirmation. Shared progress, attachments and activity require the service to be available; this configuration check does not verify a successful save.'],progress:{unknown:'Check the board’s save indicator',local:'Available · this browser only',shared:'Configured · confirm each save'},feature:{unknown:'Not verified',local:'Not enabled',shared:'Configured · sign-in required'},section:{unknown:'Sharing status could not be verified. These instructions apply only when team sharing is enabled.',local:'Not enabled in the current workspace. Instructions below are for shared mode.',shared:'Shared mode is configured. Sign in on the board to use these features.'}};
function render(){
 $('mode-title').textContent=messages[mode][0];
 $('mode-description').textContent=messages[mode][1];
 document.querySelector('.guide-mode').dataset.mode=mode;
 for(const item of document.querySelectorAll('[data-mode-cell]'))item.textContent=item.dataset.modeCell==='progress'?messages.progress[mode]:messages.feature[mode];
 for(const item of document.querySelectorAll('[data-feature-status]'))item.textContent=messages.section[mode];
}
render();
try{const response=await fetch('sync-config.json',{cache:'no-store'});if(!response.ok)throw new Error();const config=await response.json();if(typeof config.apiUrl!=='string')throw new Error();if(config.apiUrl){const url=new URL(config.apiUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error()}mode=config.apiUrl?'shared':'local'}catch{mode='unknown'}
render();document.documentElement.dataset.guideReady='true';
