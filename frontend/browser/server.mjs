import http from 'node:http';
import {readFile} from 'node:fs/promises';
const routes={'/':'browser/fixture.html','/card.js':'../dist/scheduling-manager-card.js'};
http.createServer(async(req,res)=>{
  const file=routes[req.url];if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',req.url==='/card.js'?'text/javascript':'text/html');res.end(await readFile(file));
}).listen(8765,'127.0.0.1');
