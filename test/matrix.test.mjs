import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function receipts({mismatch=false,count=4}={}){
  const root=await mkdtemp(join(tmpdir(),'hartii-matrix-'));
  for(let i=0;i<count;i++){const dir=join(root,'environment-'+i);await mkdir(dir);await writeFile(join(dir,'packages.json'),JSON.stringify({reproducible:true,installedSmoke:true,packages:['ops-core','quai-tx','quai-release','quai-watch','quai-replay'].map(name=>({name:'@hartii/'+name,version:'0.1.0-beta.1',sha256:(mismatch&&i===3&&name==='quai-tx'?'b':'a').repeat(64)}))}));}
  return root;
}
test('matrix gate verifies all four independent platform receipts and rejects differing package bytes',async()=>{
  const good=spawnSync(process.execPath,['scripts/compare-packages.mjs',await receipts()],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).environments,4);
  const bad=spawnSync(process.execPath,['scripts/compare-packages.mjs',await receipts({mismatch:true})],{encoding:'utf8'});
  assert.equal(bad.status,1);assert.match(bad.stderr,/differ/);
  const missing=spawnSync(process.execPath,['scripts/compare-packages.mjs',await receipts({count:3})],{encoding:'utf8'});
  assert.equal(missing.status,1);assert.match(missing.stderr,/four/);
});
