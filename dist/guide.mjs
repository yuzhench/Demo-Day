const $=id=>document.getElementById(id);
let mode='unknown';
const messages={unknown:['Sharing status not verified','Check the save indicator on the task board. Do not assume progress, uploads or activity are shared.'],local:['Browser-local mode · sharing is not enabled','The website and task instructions are online. Checkmarks, owners, target dates and notes are saved only in your own browser. Team synchronization, file uploads, shared links and sign-in history are not enabled.'],shared:['Team collaboration is available','Sign in with your name and the team password. Task updates, files, document links and activity are shared through GitHub. Wait for the save confirmation before closing your task.'],progress:{unknown:'Check the board’s save indicator',local:'Available · this browser only',shared:'Available · shared with the team'},feature:{unknown:'Not verified',local:'Not enabled',shared:'Available · sign-in required'},section:{unknown:'Sharing status could not be verified. These instructions apply only when team sharing is enabled.',local:'Not enabled in the current workspace. Instructions below are for shared mode.',shared:'Available. Sign in on the board to use these features.'}};
function render(){
 $('mode-title').textContent=messages[mode][0];
 $('mode-description').textContent=messages[mode][1];
 document.querySelector('.guide-mode').dataset.mode=mode;
 for(const item of document.querySelectorAll('[data-mode-cell]'))item.textContent=item.dataset.modeCell==='progress'?messages.progress[mode]:messages.feature[mode];
 for(const item of document.querySelectorAll('[data-feature-status]'))item.textContent=messages.section[mode];
}
render();
try{
 const response=await fetch('sync-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error();
 const config=await response.json();if(typeof config.apiUrl!=='string')throw new Error();
 if(config.apiUrl){
  const url=new URL(config.apiUrl);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error();
  const health=await fetch(url.origin+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!health.ok||!(await health.json()).ready)throw new Error();
  mode='shared';
 }else mode='local';
}catch{mode='unknown'}
render();document.documentElement.dataset.guideReady='true';
