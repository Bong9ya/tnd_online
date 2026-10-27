'use strict';
// Optional local preview; the single-file HTML also works without a server.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=__dirname,files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/core.js':'core.js','/app.js':'app.js','/TND_Seller_Workspace.html':'TND_Seller_Workspace.html'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function start(port=Number(process.env.PORT||4173)){
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=files[pathname];
    if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
    try{const body=await fs.readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);}
    catch(_){res.writeHead(500);res.end('Unable to read file');}
  });
  return server.listen(port,'127.0.0.1');
}
module.exports=start;
if(require.main===module){const server=start();server.on('listening',()=>console.log('TND local: http://127.0.0.1:'+server.address().port));server.on('error',error=>{console.error('미리보기 서버를 시작하지 못했습니다: '+error.message);process.exitCode=1;});}
