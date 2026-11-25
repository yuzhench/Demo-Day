import {readFile,writeFile} from 'node:fs/promises';
const input=process.argv[2];if(!input)throw new Error('Supply the deployed HTTPS API origin, or --disable.');
let origin='';if(input!=='--disable'){const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Use an HTTPS origin only, without credentials or a path.');origin=url.origin}
const configuration=JSON.stringify({apiUrl:origin})+'\n';
for(const file of ['sync-config.json','dist/sync-config.json'])await writeFile(file,configuration);
for(const file of ['index.html','dist/index.html','guide.html','dist/guide.html']){const source=await readFile(file,'utf8');await writeFile(file,source.replace(/connect-src [^;]+;/,`connect-src 'self'${origin?' '+origin:''};`))}
console.log(origin?'Team sync endpoint configured. Verify backend access before pushing.':'Team sync disabled; browser-local mode remains available.');
