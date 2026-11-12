import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { guard } from './guard.mjs';
await guard(resolve('.'));
const root=JSON.parse(await readFile('package.json','utf8'));
for(const folder of await readdir('packages')){
  const pkg=JSON.parse(await readFile('packages/'+folder+'/package.json','utf8'));
  if(pkg.version!==root.version)throw new Error('Package version mismatch: '+pkg.name);
}
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['.git','node_modules','artifacts'].includes(entry.name))continue;
    const file=dir+'/'+entry.name;
    if(entry.isDirectory())await walk(file);
    else if(/\.(?:mjs|js)$/.test(file)){
      const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)throw new Error('Syntax check failed: '+file);
    }else if(file.endsWith('.html')){
      const text=await readFile(file,'utf8');for(const match of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Script(match[1]);
    }
  }
}
await walk('.');console.log('Source guard, syntax and package version checks passed.');
