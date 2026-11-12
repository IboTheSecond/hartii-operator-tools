import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp,readFile,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { Wallet,QuaiTransaction,keccak256,toUtf8Bytes,getAddress } from 'quais';
import assert from 'node:assert/strict';

// This server never forwards RPC. All identities and balances are disposable fixtures.
const installedRoot=process.argv[2];
const temp=await mkdtemp(join(tmpdir(),'hartii-protocol-pilot-'));
const state=join(temp,'state'),to=getAddress('0x002233445566778899aabbccddeeff0011223344');
let wallet;
for(let i=0;i<20000;i++){const w=new Wallet(keccak256(toUtf8Bytes('hartii local pilot public test only '+i)));if(/^0x00[0-7]/i.test(w.address)){wallet=w;break;}}
assert.ok(wallet,'Could not derive fixture account');
const blockHash='0x'+'02'.repeat(32),parentHash='0x'+'03'.repeat(32),deploymentHash='0x'+'07'.repeat(32);
let signed,txHash,broadcastCount=0;
const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.method==='GET' && req.url==='/health'){res.end(JSON.stringify({ok:true,chain:'quai-cyprus1',cursor:100,head:100,last_run:{ok:true,at:Date.now()}}));return;}
  let id;
  try{
    let text='';for await(const part of req){text+=part;assert.ok(text.length<300000);}
    const payload=JSON.parse(text);id=payload.id;const {method,params=[]}=payload;
    let result;
    if(method==='quai_chainId')result='0x9';
    else if(method==='quai_gasPrice')result='0x3b9aca00';
    else if(method==='quai_estimateGas'){assert.equal(params[0].from,wallet.address);assert.equal(params[0].to,to);result='0x5208';}
    else if(method==='quai_getTransactionCount')result=txHash?'0x1':'0x0';
    else if(method==='quai_getBalance')result='0x56bc75e2d63100000';
    else if(method==='quai_blockNumber')result='0x64';
    else if(method==='quai_call'){assert.equal(params[0].from,wallet.address);assert.equal(params[0].to,to);result='0x';}
    else if(method==='quai_sendRawTransaction'){signed=QuaiTransaction.from(params[0]);assert.equal(signed.from,wallet.address);broadcastCount++;txHash=signed.hash;result=txHash;}
    else if(method==='quai_getTransactionByHash')result=params[0]===txHash?{hash:txHash,from:wallet.address,to,value:'0xde0b6b3a7640000',input:'0x',gas:'0x6aa4',gasPrice:'0x3b9aca00',nonce:'0x0',type:'0x0',chainId:'0x9',blockNumber:'0x64',blockHash,accessList:[]}:null;
    else if(method==='quai_getTransactionReceipt')result={transactionHash:params[0],from:wallet.address,to:params[0]===deploymentHash?null:to,contractAddress:params[0]===deploymentHash?to:null,status:'0x1',blockNumber:'0x64',blockHash,gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'};
    else if(method==='quai_getBlockByNumber')result={number:params[0],hash:params[0]==='0x63'?parentHash:blockHash,parentHash,woHeader:{timestamp:'0x6553f100'}};
    else if(method==='quai_getCode'){assert.equal(params[0],to);result='0x60006000';}
    else throw new Error('Unexpected RPC method');
    res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
  }catch{res.end(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32000,message:'Fixture rejected request'}}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const network=['--rpc',url,'--allow-local-http'];const checks=[];
async function run(tool,args,name){
  const bin=installedRoot?join(installedRoot,'quai-'+tool,'bin','cli.mjs'):resolve('packages',tool,'bin','cli.mjs');
  const child=spawn(process.execPath,[bin,...args,'--json'],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  const result=JSON.parse(stdout);assert.equal(code,0,name+' failed: '+(result.error?.code??result.status));assert.equal(stderr,'');checks.push({name,passed:true});return result;
}
let result;
try{
  const intent=join(temp,'intent.json');await writeFile(intent,JSON.stringify({from:wallet.address,to,value:'1000000000000000000',maxFee:'25000000000000000000'}));
  const review=await run('tx',['prepare','--intent',intent,'--state',state,...network],'transaction review');
  const signedFile=join(temp,'transaction.signed');await writeFile(signedFile,await wallet.signTransaction(review.transaction),{mode:0o600});
  const sent=await run('tx',['send','--review',review.id,'--approval-file',review.approvalFile,'--signed-file',signedFile,'--confirm','--state',state,...network],'explicit approved submission');
  assert.equal(sent.status,'submitted');
  const receipt=await run('tx',['receipt','--review',review.id,'--state',state,...network],'receipt reconciliation');assert.equal(receipt.status,'confirmed');
  const artifact=join(temp,'Contract.json'),manifest=join(temp,'release.json');await writeFile(artifact,JSON.stringify({contractName:'LocalFixture',deployedBytecode:'0x60006000'}));await writeFile(manifest,JSON.stringify({chainId:9,address:to,transactionHash:deploymentHash,artifact:'Contract.json'}));
  const release=await run('release',['verify','--manifest',manifest,...network],'release runtime verification');assert.equal(release.status,'verified');
  const watch=await run('watch',['check','--url',url+'/health','--allow-local-http'],'indexer health check');assert.equal(watch.status,'healthy');
  const capture=join(temp,'capture.json');await run('replay',['capture','--hash',txHash,'--out',capture,...network],'capture transaction evidence');
  const replay=await run('replay',['run','--input',capture,...network],'historical call replay');assert.equal(replay.exactReplay,false);
  assert.equal(broadcastCount,1);
  result={mode:'local-protocol-fixture',liveNetwork:false,packages:installedRoot?'installed-tarballs':'workspace',broadcastCount,checks,limitations:'Simulated RPC, disposable signer, no live network, no external team pilot, no revenue evidence.'};
}finally{await new Promise(resolve=>server.close(resolve));}
await mkdir(resolve('artifacts'),{recursive:true});await writeFile(resolve('artifacts/pilot.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
