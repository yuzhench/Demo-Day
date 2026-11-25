const $=id=>document.getElementById(id);
let language=new URL(location.href).searchParams.get('lang');
if(!['en','zh'].includes(language)){try{language=localStorage.getItem('demo-day-guide-language')}catch{}}
if(!['en','zh'].includes(language))language=navigator.language.toLowerCase().startsWith('zh')?'zh':'en';
let mode='unknown';
const messages={
 en:{unknown:['Sharing status not verified','Check the save indicator on the task board. Do not assume progress, uploads or activity are shared.'],local:['Browser-local mode · sharing is not enabled','The website and task instructions are online. Checkmarks, owners, target dates and notes are saved only in your own browser. Team synchronization, file uploads, shared links and sign-in history are not enabled.'],shared:['Team sharing is configured','Sign in on the board, then wait for a successful save confirmation. Shared progress, attachments and activity require the service to be available; this configuration check does not verify a successful save.'],progress:{unknown:'Check the board’s save indicator',local:'Available · this browser only',shared:'Configured · confirm each save'},feature:{unknown:'Not verified',local:'Not enabled',shared:'Configured · sign-in required'},section:{unknown:'Sharing status could not be verified. These instructions apply only when team sharing is enabled.',local:'Not enabled in the current workspace. Instructions below are for shared mode.',shared:'Shared mode is configured. Sign in on the board to use these features.'}},
 zh:{unknown:['尚未核实共享状态','请查看任务看板的保存提示。不能据此认定进度、上传或操作记录已经共享。'],local:['浏览器本地模式 · 尚未开启团队共享','网站和任务说明已经上线。勾选、负责人、内部日期和备注只保存在自己的浏览器里；团队同步、文件上传、共享链接和登录记录尚未开启。'],shared:['已配置团队共享','在看板登录后，请等待明确的保存成功提示。共享进度、附件和记录需要服务正常运行；本页检查配置不等于验证保存成功。'],progress:{unknown:'以看板保存提示为准',local:'已提供 · 仅当前浏览器',shared:'已配置 · 每次保存需确认'},feature:{unknown:'未核实',local:'尚未开启',shared:'已配置 · 需要登录'},section:{unknown:'共享状态未能核实。以下说明仅适用于团队共享已开启的情况。',local:'当前网站尚未开启此功能。下方说明为开启团队共享后的用法。',shared:'已配置团队共享。请先在看板登录后使用这些功能。'}}
};
function render(){
 document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=language==='zh'?'使用说明 · Demo Day':'How to use · Demo Day';
 for(const item of document.querySelectorAll('[data-lang]'))item.hidden=item.dataset.lang!==language;
 $('lang-en').setAttribute('aria-pressed',String(language==='en'));$('lang-zh').setAttribute('aria-pressed',String(language==='zh'));
 const m=messages[language];$('mode-title').textContent=m[mode][0];$('mode-description').textContent=m[mode][1];document.querySelector('.guide-mode').dataset.mode=mode;
 for(const item of document.querySelectorAll('[data-mode-cell]'))item.textContent=item.dataset.modeCell==='progress'?m.progress[mode]:m.feature[mode];
 for(const item of document.querySelectorAll('[data-feature-status]'))item.textContent=m.section[mode];
}
for(const lang of ['en','zh'])$('lang-'+lang).addEventListener('click',()=>{language=lang;try{localStorage.setItem('demo-day-guide-language',lang)}catch{}const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);render()});
render();
try{const response=await fetch('sync-config.json',{cache:'no-store'});if(!response.ok)throw new Error();const config=await response.json();if(typeof config.apiUrl!=='string')throw new Error();if(config.apiUrl){const url=new URL(config.apiUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error()}mode=config.apiUrl?'shared':'local'}catch{mode='unknown'}
render();document.documentElement.dataset.guideReady='true';
