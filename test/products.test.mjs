import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { getAddress } from 'quais';

const from=getAddress('0x00112233445566778899aabbccddeeff00112233');
const to=getAddress('0x002233445566778899aabbccddeeff0011223344');
const txHash='0x'+'01'.repeat(32),blockHash='0x'+'02'.repeat(32),parentHash='0x'+'03'.repeat(32);
async function cli(tool,args) {
  const child=spawn(process.execPath,[resolve('packages',tool,'bin/cli.mjs'),...args,'--json'],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
  assert.equal(stderr,'');
  return {code,result:JSON.parse(stdout)};
}
async function file(value, filename='input.json') {
  const dir=await mkdtemp(join(tmpdir(),'hartii-products-'));const path=join(dir,filename);await writeFile(path,JSON.stringify(value));return path;
}
function healthy(now=Date.now()) {return {ok:true,chain:'quai-cyprus1',cursor:995,head:1000,lag:5,last_run:{at:now,age_ms:0,ok:true},now};}
test('watch accepts the real Worker/D1 health schema and returns actionable reasons', async()=>{
  let r=await cli('watch',['report','--input',await file(healthy())]);
  assert.equal(r.code,0,JSON.stringify(r.result));assert.equal(r.result.status,'healthy');
  r=await cli('watch',['report','--input',await file({...healthy(),last_run:{at:Date.now()-900000,age_ms:0,ok:true}})]);
  assert.equal(r.code,2);assert.ok(r.result.reasons.includes('heartbeat_stale'));
  r=await cli('watch',['report','--input',await file({...healthy(),cursor:700,lag:0})]);
  assert.equal(r.code,2);assert.ok(r.result.reasons.includes('cursor_lag'));
  r=await cli('watch',['report','--input',await file({...healthy(),last_run:null})]);
  assert.equal(r.code,2);assert.ok(r.result.reasons.includes('heartbeat_missing'));
});
test('watch never accepts future timestamps, missing values or a false successful flag',async()=>{
  for(const payload of [{...healthy(),last_run:{at:Date.now()+1000000,ok:true}}, {...healthy(),cursor:null}, {...healthy(),ok:'true'}, {...healthy(),last_run:{at:Date.now(),ok:false}}]){
    const r=await cli('watch',['report','--input',await file(payload)]);assert.notEqual(r.code,0,JSON.stringify(payload));
  }
});
test('release fingerprints real artifacts and rejects unresolved runtime references',async()=>{
  const r=await cli('release',['artifact','--artifact',await file({contractName:'Example',deployedBytecode:'0x60006000'})]);
  assert.equal(r.code,0,JSON.stringify(r.result));assert.match(r.result.runtimeSha256,/^[0-9a-f]{64}$/);
  for(const artifact of [{deployedBytecode:'0x'}, {deployedBytecode:'0x__$UNLINKED$__'}, {deployedBytecode:'0x6000',immutableReferences:{'1':[{start:1,length:32}]}}]){
    assert.equal((await cli('release',['artifact','--artifact',await file(artifact)])).code,1);
  }
});
async function rpcFixture(t) {
  const calls=[];const state={code:'0x60006000',receiptStatus:'0x1',reorg:false,revert:false};
  const server=createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;
    const {id,method,params=[]}=JSON.parse(body);calls.push([method,params]);
    let result;
    if(method==='quai_chainId')result='0x9';
    else if(method==='quai_getTransactionReceipt')result={transactionHash:txHash,status:state.receiptStatus,contractAddress:to,blockNumber:'0x64',blockHash,from,to:null};
    else if(method==='quai_getCode'){assert.equal(params[0],to);result=state.code;}
    else if(method==='quai_getTransactionByHash')result={hash:txHash,from,to,value:'0x0',input:'0x1234',gas:'0x186a0',gasPrice:'0x3b9aca00',nonce:'0x0',type:'0x0',chainId:'0x9',blockNumber:'0x64',blockHash,accessList:[]};
    else if(method==='quai_getBlockByNumber')result={hash:params[0]==='0x63'?parentHash:(state.reorg?parentHash:blockHash),parentHash,number:params[0],woHeader:{timestamp:'0x6553f100'}};
    else if(method==='quai_call'){
      assert.equal(params[0].from,from);assert.equal(params[0].to,to);assert.equal(params[1],'0x63');
      if(state.revert){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id,error:{code:3,message:'execution reverted',data:'0x08c379a0'}}));return;}
      result='0x';
    }else throw new Error('Unexpected method '+method);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const network=['--rpc',`http://127.0.0.1:${server.address().port}`,'--allow-local-http'];
  return {state,calls,network};
}
test('release verifies deployment identity, final receipt, runtime bytes and records evidence',async t=>{
  const f=await rpcFixture(t);const artifact=await file({contractName:'Example',deployedBytecode:'0x60006000'});
  const manifest=await file({chainId:9,address:to,transactionHash:txHash,artifact});
  let r=await cli('release',['verify','--manifest',manifest,...f.network]);
  assert.equal(r.code,0,JSON.stringify(r.result));assert.equal(r.result.status,'verified');assert.equal(r.result.verification,'exact-runtime-bytecode');
  f.state.code='0x6001';r=await cli('release',['verify','--manifest',manifest,...f.network]);assert.notEqual(r.code,0);
  f.state.code='0x60006000';f.state.receiptStatus='0x0';r=await cli('release',['verify','--manifest',manifest,...f.network]);assert.notEqual(r.code,0);
  assert.ok(!f.calls.some(([method])=>method==='quai_sendRawTransaction'));
});
test('replay captures real block shape, uses parent state, and refuses a reorg',async t=>{
  const f=await rpcFixture(t);const folder=await mkdtemp(join(tmpdir(),'hartii-capture-'));const out=join(folder,'capture.json');
  const captured=await cli('replay',['capture','--hash',txHash,'--out',out,...f.network]);
  assert.equal(captured.code,0,JSON.stringify(captured.result));
  const bundle=JSON.parse(await readFile(out,'utf8'));assert.equal(bundle.blockTimestamp,'1700000000');
  let r=await cli('replay',['run','--input',out,...f.network]);
  assert.equal(r.code,0,JSON.stringify(r.result));assert.equal(r.result.stateBlock,'0x63');assert.equal(r.result.exactReplay,false);
  f.state.revert=true;r=await cli('replay',['run','--input',out,...f.network]);assert.equal(r.code,2);assert.equal(r.result.status,'reverted');
  f.state.reorg=true;r=await cli('replay',['run','--input',out,...f.network]);assert.equal(r.code,1);assert.equal(r.result.error.code,'REORG');
  assert.ok(!f.calls.some(([method])=>method==='quai_sendRawTransaction'));
});
