import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
test('a local protocol pilot exercises all four CLI workflows without a live node or funded key',async()=>{
  const child=spawn(process.execPath,['scripts/pilot.mjs'],{stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
  assert.equal(code,0,err.slice(0,250));const result=JSON.parse(out);
  assert.equal(result.mode,'local-protocol-fixture');assert.equal(result.liveNetwork,false);
  assert.equal(result.broadcastCount,1);assert.equal(result.checks.length,7);assert.ok(result.checks.every(x=>x.passed));
});
