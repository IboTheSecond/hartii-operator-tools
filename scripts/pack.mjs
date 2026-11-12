import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { guard, guardTarball } from './guard.mjs';
import { canonicalizeTarball,inspectBinModes } from './canonical-tar.mjs';
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run using npm run pack:verify.');
const out=resolve('artifacts/packages'),again=await mkdtemp(join(tmpdir(),'hartii-pack-'));
await mkdir(out,{recursive:true});await guard(resolve('.'));
function npm(args,cwd=resolve('.')){
  const result=spawnSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8',timeout:120000});
  if(result.status!==0)throw new Error('npm packaging/installation gate failed; command exit '+result.status+'.');
  return result.stdout;
}
const first=JSON.parse(npm(['pack','--workspaces','--json','--ignore-scripts','--pack-destination',out]));
npm(['pack','--workspaces','--json','--ignore-scripts','--pack-destination',again]);
const receipts=[];
for(const pkg of first){
  const original=await readFile(join(out,pkg.filename));
  const sourceBinModes=inspectBinModes(original);
  const bytes=canonicalizeTarball(original),second=canonicalizeTarball(await readFile(join(again,pkg.filename)));
  if(!bytes.equals(second))throw new Error('Non-reproducible package: '+pkg.name);
  await writeFile(join(out,pkg.filename),bytes);
  const names=guardTarball(bytes);
  receipts.push({name:pkg.name,version:pkg.version,file:pkg.filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,files:names.length,sourceBinModes});
}
const consumer=await mkdtemp(join(tmpdir(),'hartii-consumer-'));
await writeFile(join(consumer,'package.json'),JSON.stringify({private:true}));
npm(['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',...first.map(p=>join(out,p.filename))],consumer);
for(const name of ['tx','release','watch','replay']){
  const result=spawnSync(process.execPath,[join(consumer,'node_modules','@hartii','quai-'+name,'bin','cli.mjs'),'--help','--json'],{cwd:consumer,encoding:'utf8'});
  if(result.status!==0 || JSON.parse(result.stdout).tool!=='quai-'+name)throw new Error('Installed package entry point failed: '+name);
}
const healthFile=join(consumer,'health.json');
await writeFile(healthFile,JSON.stringify({ok:true,chain:'quai-cyprus1',cursor:999,head:1000,last_run:{ok:true,at:Date.now()}}));
const realCommand=spawnSync(process.execPath,[join(consumer,'node_modules','@hartii','quai-watch','bin','cli.mjs'),'report','--input',healthFile,'--json'],{cwd:consumer,encoding:'utf8'});
if(realCommand.status!==0 || JSON.parse(realCommand.stdout).status!=='healthy')throw new Error('Installed package behavior failed: watch report.');
const pilot=spawnSync(process.execPath,[resolve('scripts/pilot.mjs'),join(consumer,'node_modules','@hartii')],{cwd:resolve('.'),encoding:'utf8',timeout:120000});
if(pilot.status!==0 || JSON.parse(pilot.stdout).checks.length!==7)throw new Error('Installed four-tool protocol pilot failed.');
await writeFile(resolve('artifacts/packages.json'),JSON.stringify({reproducible:true,installedSmoke:true,packages:receipts},null,2)+'\n');
await writeFile(resolve('artifacts/packages/SHA256SUMS'),receipts.map(r=>r.sha256+'  '+r.file).join('\n')+'\n');
console.log(JSON.stringify({reproducible:true,installedSmoke:true,packages:receipts.length}));
