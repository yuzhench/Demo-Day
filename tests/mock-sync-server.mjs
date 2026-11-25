import http from 'node:http';
import {Readable} from 'node:stream';
import {fixture} from './sync-fixture.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
// Local QA only: ephemeral mocked GitHub, no production writes or credentials.
const f=fixture();
let password='';for await(const chunk of process.stdin)password+=chunk;password=password.trimEnd();if(!password)throw new Error('QA password required on stdin');
f.env.PASSWORD_SHA256=createHash('sha256').update(password).digest('hex');
f.env.ALLOWED_ORIGIN='http://127.0.0.1:8938';
http.createServer(async(req,res)=>{
 const request=new Request('http://127.0.0.1:8937'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
 const response=await f.handler.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
}).listen(8937,'127.0.0.1',()=>console.log('Ephemeral QA sync backend listening on localhost:8937'));
const assets={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.mjs':'app.mjs','/crypto.mjs':'crypto.mjs','/sync.mjs':'sync.mjs','/payload.json':'payload.json'};
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/sync-config.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"apiUrl":"http://127.0.0.1:8937"}');return}
 if(!assets[path]){res.writeHead(404);res.end();return}
 let value=await readFile(new URL('../dist/'+assets[path],import.meta.url));
 if(assets[path]==='index.html')value=Buffer.from(value.toString().replace("connect-src 'self'","connect-src 'self' http://127.0.0.1:8937"));
 const extension=assets[path].split('.').at(-1);res.writeHead(200,{'Content-Type':({html:'text/html',mjs:'text/javascript',css:'text/css',json:'application/json'})[extension],'Cache-Control':'no-store'});res.end(value);
}).listen(8938,'127.0.0.1',()=>console.log('Isolated QA frontend listening on localhost:8938'));
