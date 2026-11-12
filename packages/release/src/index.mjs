import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { flagsFor,networkFlags,connect,readJson,readText,bytes,digest,address,hash,uint,assertChain,receiptStatus,requireThat,OpsError,outputFile } from '@hartii/ops-core';
const populated=value=>value && typeof value==='object' && Object.values(value).some(v=>Array.isArray(v)?v.length>0:typeof v==='object'?populated(v):true);
export async function readArtifact(path) {
  const text=await readText(path);let artifact;try{artifact=JSON.parse(text);}catch{throw new OpsError('INPUT','Artifact is not valid JSON.');}
  const compiled=artifact.deployedBytecode;
  requireThat(!populated(artifact.immutableReferences) && !populated(compiled?.immutableReferences) && !populated(artifact.deployedLinkReferences) && !populated(compiled?.linkReferences),'ARTIFACT','Resolve library and immutable references into a final runtime artifact first.');
  const runtime=bytes(typeof compiled==='string'?compiled:compiled?.object,'runtime bytecode',1048576);
  requireThat(runtime!=='0x','ARTIFACT','Artifact has no deployed runtime bytecode.');
  return {contractName:typeof artifact.contractName==='string'?artifact.contractName.slice(0,120):null,artifactSha256:digest(text),runtimeSha256:createHash('sha256').update(Buffer.from(runtime.slice(2),'hex')).digest('hex'),runtime,runtimeBytes:(runtime.length-2)/2};
}
export async function execute(command,flags) {
  if(command==='artifact') {
    flagsFor(flags,['artifact','out'],['artifact']);
    const {runtime,...metadata}=await readArtifact(flags.artifact);return outputFile(flags,metadata);
  }
  if(command!=='verify')throw new OpsError('USAGE','Unknown release command. Use --help.');
  flagsFor(flags,[...networkFlags,'manifest','out'],['manifest']);
  const manifest=await readJson(flags.manifest);
  requireThat(manifest && Object.keys(manifest).every(k=>['chainId','address','transactionHash','artifact'].includes(k)),'INPUT','Invalid release manifest fields.');
  const ctx=connect(flags);
  requireThat(manifest.chainId===ctx.chainId,'WRONG_CHAIN','Manifest chain differs from selected chain.');
  const contractAddress=address(manifest.address),txHash=hash(manifest.transactionHash);
  requireThat(typeof manifest.artifact==='string','INPUT','Manifest needs an artifact path.');
  const artifact=await readArtifact(resolve(dirname(resolve(flags.manifest)),manifest.artifact));
  await assertChain(ctx.rpc,ctx.chainId);
  const receipt=await ctx.rpc.call('quai_getTransactionReceipt',[txHash]);
  requireThat(receipt && hash(receipt.transactionHash??receipt.hash)===txHash,'RECEIPT','Missing deployment receipt or transaction identity mismatch.');
  requireThat(receiptStatus(receipt)==='confirmed','RECEIPT','Deployment is not proven successful by a status-1 receipt.');
  requireThat(address(receipt.contractAddress)===contractAddress && receipt.to===null,'RECEIPT','Receipt does not identify the expected contract creation.');
  const blockNumber='0x'+uint(String(receipt.blockNumber),'receipt block').toString(16),blockHash=hash(receipt.blockHash);
  const block=await ctx.rpc.call('quai_getBlockByNumber',[blockNumber,false]);
  requireThat(block && hash(block.hash)===blockHash,'REORG','Deployment block is no longer canonical.');
  const actual=bytes(await ctx.rpc.call('quai_getCode',[contractAddress,blockNumber]),'deployed runtime',1048576);
  requireThat(actual===artifact.runtime,'CODE_MISMATCH','Runtime bytecode at the deployment block differs from the artifact.');
  const after=await ctx.rpc.call('quai_getBlockByNumber',[blockNumber,false]);
  requireThat(after && hash(after.hash)===blockHash,'REORG','Canonical deployment block changed during verification.');
  const {runtime,...metadata}=artifact;
  return outputFile(flags,{status:'verified',verification:'exact-runtime-bytecode',chainId:ctx.chainId,address:contractAddress,transactionHash:txHash,blockNumber,blockHash,...metadata,observedAt:new Date().toISOString(),scope:'Runtime at the deployment block; no explorer source publication, proxy implementation validation or security audit.'});
}
