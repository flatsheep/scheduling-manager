import {build} from 'esbuild';
import {copyFile, mkdir, readFile} from 'node:fs/promises';
const component='../custom_components/heating_schedule_manager';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const registration=await readFile(`${component}/frontend.py`,'utf8');
if(!registration.includes(`CARD_VERSION = "${version}"`))throw new Error('Bundled card and frontend registration versions differ');
await build({entryPoints:['src/card.ts'],bundle:true,format:'esm',target:'es2022',outfile:'../dist/scheduling-manager-card.js'});
// A byte-identical compatibility module for existing installed resources.
await copyFile('../dist/scheduling-manager-card.js','../dist/heating-schedule-manager-card.js');
// HACS installs only the integration directory: ship the complete application there.
await mkdir(`${component}/www`,{recursive:true});
await copyFile('../dist/scheduling-manager-card.js',`${component}/www/scheduling-manager-card.js`);
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await copyFile(`../${name}`,`${component}/${name}`);
