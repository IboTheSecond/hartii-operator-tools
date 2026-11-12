import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
const module=await import('../scripts/canonical-tar.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
function entry(name,content,mode,type='0'){
  const h=Buffer.alloc(512);h.write(name);h.write(mode.toString(8).padStart(7,'0')+'\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(Buffer.byteLength(content).toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write('ustar\0',257);h.write('00',263);const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);const data=Buffer.alloc(Math.ceil(Buffer.byteLength(content)/512)*512);data.write(content);return Buffer.concat([h,data]);
}
const archive=mode=>gzipSync(Buffer.concat([entry('package/package.json','{"name":"fixture"}',0o644),entry('package/bin/cli.mjs','#!/usr/bin/env node\nconsole.log("fixture");\n',mode),Buffer.alloc(1024)]),{level:9});
test('operator packages have identical bytes when platform-dependent bin permissions differ',()=>{
  assert.equal(typeof module.canonicalizeTarball,'function');
  assert.notDeepEqual(archive(0o644),archive(0o755));
  const a=module.canonicalizeTarball(archive(0o644)),b=module.canonicalizeTarball(archive(0o755));
  assert.deepEqual(a,b);assert.deepEqual(module.canonicalizeTarball(a),a);
  const tar=gunzipSync(a);assert.equal(tar.subarray(1124,1132).toString('ascii'),'0000755\0');
  assert.ok(tar.includes(Buffer.from('console.log("fixture")')));
});
test('canonicalization refuses non-regular archive entries rather than following links',()=>{
  const archive=gzipSync(Buffer.concat([entry('package/package.json','{}',0o644),entry('package/bin/link','',0o755,'2'),Buffer.alloc(1024)]));
  assert.throws(()=>module.canonicalizeTarball(archive),/Unsafe/);
});
