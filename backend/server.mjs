import http from 'node:http';
import {Readable} from 'node:stream';
import handler from './worker.mjs';
const port=Number(process.env.PORT||8937),host=process.env.BIND_HOST||'127.0.0.1';
const server=http.createServer(async(req,res)=>{
 try{
  const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
  const response=await handler.fetch(request,process.env);res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"Service request failed."}')}
});
server.listen(port,host,()=>console.log(`Sync API listening on http://${host}:${port}`));
