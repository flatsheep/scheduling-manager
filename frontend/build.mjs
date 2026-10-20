import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['src/card.ts'],bundle:true,format:'esm',target:'es2022',outfile:'../dist/scheduling-manager-card.js'});
// A byte-identical compatibility module for existing installed resources.
await copyFile('../dist/scheduling-manager-card.js','../dist/heating-schedule-manager-card.js');
