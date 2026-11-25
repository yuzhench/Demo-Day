import {createHash,randomBytes} from 'node:crypto';
import {createHandler} from '../backend/worker.mjs';
export function fixture(){
 const files=new Map();let failures=0;
 const response=(body,status=200)=>Response.json(body,{status});
 async function github(url,options={}){
  const path=new URL(url).pathname.replace('/repos/yuzhench/Demo-Day/','');
  if(!options.headers.Authorization?.startsWith('Bearer test-token'))return response({},403);
  if(path==='branches/team-data')return response({name:'team-data'});
  if(!path.startsWith('contents/'))return response({},404);
  const name=path.slice(9);
  if(options.method==='PUT'){
   if(failures){failures--;return response({},409)}
   const body=JSON.parse(options.body),before=files.get(name);if(body.branch!=='team-data')return response({},400);
   if(before?body.sha!==before.sha:!!body.sha)return response({},409);
   const raw=Buffer.from(body.content,'base64'),sha=createHash('sha1').update(raw).digest('hex');files.set(name,{raw,sha});return response({content:{sha}},before?200:201);
  }
  const stored=files.get(name);if(!stored)return response({},404);
  if(options.headers.Accept==='application/vnd.github.raw+json')return new Response(stored.raw);
  return response({sha:stored.sha,content:stored.raw.toString('base64'),encoding:'base64'});
 }
 const env={GITHUB_TOKEN:'test-token',PASSWORD_SHA256:createHash('sha256').update('test-password').digest('hex'),SESSION_SECRET:randomBytes(32).toString('base64'),DATA_KEY:randomBytes(32).toString('base64'),DATA_SALT:randomBytes(16).toString('base64'),ALLOWED_ORIGIN:'http://127.0.0.1:8936'};
 return {handler:createHandler(github),env,files,conflictOnce(){failures++}};
}
