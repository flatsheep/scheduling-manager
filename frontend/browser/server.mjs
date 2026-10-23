import http from 'node:http';
import {readFile} from 'node:fs/promises';
const routes={'/':'browser/fixture.html','/card.js':'../dist/scheduling-manager-card.js','/loader-fixture':'browser/loader.html','/loader.js':'../custom_components/scheduling_manager/www/scheduling-manager-loader.js','/scheduling-manager-card.js':'../dist/scheduling-manager-card.js'};
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const file=routes[pathname];if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(file));
}).listen(8765,'127.0.0.1');
