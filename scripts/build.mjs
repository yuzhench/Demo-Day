import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {deriveKey,encrypt,newSalt} from '../crypto.mjs';
// Password arrives through stdin; never put it in arguments, source or Git.
let password=''; for await (const chunk of process.stdin) password+=chunk; password=password.trimEnd();
if(!password) throw new Error('Provide the site password through stdin.');
const data=JSON.parse(await readFile(process.argv[2] || '../.private/tasks.json','utf8'));
if(data.tasks.length!==32) throw new Error('Expected all 32 source tasks.');
let salt;
try { salt=JSON.parse(await readFile('dist/payload.json','utf8')).salt; } catch (error) { if(error.code!=='ENOENT') throw error; }
salt ||= newSalt(); const key=await deriveKey(password,salt);
const payload={version:1,salt,...await encrypt(data,key)};
await mkdir('dist',{recursive:true});
for(const f of ['index.html','styles.css','app.mjs','crypto.mjs','sync.mjs','sync-config.json']) await copyFile(f,`dist/${f}`);
await writeFile('dist/payload.json',JSON.stringify(payload));
await writeFile('dist/.nojekyll','');
console.log(`Built encrypted site: ${data.tasks.length} tasks. No plaintext task data in dist.`);
