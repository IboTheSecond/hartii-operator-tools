import { flagsFor,networkFlags,connect,readJson,writeJson,bytes,digest,address,hash,uint,hex,assertChain,receiptStatus,rpcTransaction,requireThat,OpsError,outputFile } from '@hartii/ops-core';

function callFields(tx) {
  requireThat(tx && uint(String(tx.type),'transaction type')===0n,'UNSUPPORTED','Only internal Quai account calls can be replayed. Contract creation, ETX and Qi are unsupported.');
  requireThat(tx.to,'UNSUPPORTED','Contract-creation replay is unsupported.');
  const data=bytes(tx.input??tx.data??'0x');
  if(tx.input!==undefined && tx.data!==undefined)requireThat(bytes(tx.input)===bytes(tx.data),'INPUT','Transaction calldata aliases disagree.');
  return rpcTransaction({from:address(tx.from),to:address(tx.to),value:uint(String(tx.value)).toString(),data,gasLimit:uint(String(tx.gas??tx.gasLimit)).toString(),gasPrice:uint(String(tx.gasPrice)).toString(),accessList:tx.accessList??[]});
}
function bundleDigest(bundle) {const {bundleSha256,...payload}=bundle;return digest(payload);}
export async function execute(command,flags) {
  if(command==='capture') {
    flagsFor(flags,[...networkFlags,'hash','out'],['hash','out']);
    const {rpc,chainId}=connect(flags);const txHash=hash(flags.hash);await assertChain(rpc,chainId);
    const [tx,receipt]=await Promise.all([rpc.call('quai_getTransactionByHash',[txHash]),rpc.call('quai_getTransactionReceipt',[txHash])]);
    requireThat(tx && receipt && hash(tx.hash)===txHash && hash(receipt.transactionHash??receipt.hash)===txHash,'RECEIPT','A matching mined transaction and receipt are required.');
    requireThat(receiptStatus(receipt)!=='unknown','RECEIPT','Receipt has no canonical final status.');
    const call=callFields(tx),blockNumber=uint(String(receipt.blockNumber),'block number');
    requireThat(blockNumber>0n,'UNSUPPORTED','Genesis transactions cannot use parent-block replay.');
    requireThat(uint(String(tx.blockNumber))===blockNumber && hash(tx.blockHash)===hash(receipt.blockHash),'RECEIPT','Transaction and receipt blocks differ.');
    if(tx.chainId!==undefined)requireThat(uint(String(tx.chainId))===BigInt(chainId),'WRONG_CHAIN','Transaction chain differs from selected chain.');
    const block=await rpc.call('quai_getBlockByNumber',[hex(blockNumber),false]);
    requireThat(block && hash(block.hash)===hash(receipt.blockHash),'REORG','Captured block is not canonical.');
    const bundle={schema:1,chainId,transactionHash:txHash,transaction:tx,receipt,call,blockNumber:hex(blockNumber),blockHash:hash(block.hash),parentHash:hash(block.parentHash),blockTimestamp:uint(String(block.woHeader?.timestamp),'woHeader timestamp').toString(),capturedAt:new Date().toISOString()};
    bundle.bundleSha256=bundleDigest(bundle);await writeJson(flags.out,bundle);
    return {status:'captured',hash:txHash,blockNumber:bundle.blockNumber,output:flags.out,bundleSha256:bundle.bundleSha256,warning:'Public calldata can contain application data. Review before sharing.'};
  }
  if(command!=='run')throw new OpsError('USAGE','Unknown replay command. Use --help.');
  flagsFor(flags,[...networkFlags,'input','out'],['input']);
  const bundle=await readJson(flags.input);const {rpc,chainId}=connect(flags);
  requireThat(bundle.schema===1 && bundle.chainId===chainId && bundle.bundleSha256===bundleDigest(bundle),'INPUT','Capture schema, chain or integrity check failed.');
  requireThat(digest(callFields(bundle.transaction))===digest(bundle.call),'INPUT','Captured call fields do not match the transaction.');
  const number=uint(bundle.blockNumber);requireThat(number>0n,'INPUT','Invalid captured block.');
  await assertChain(rpc,chainId);
  const stateBlock=hex(number-1n);
  const [current,parent]=await Promise.all([rpc.call('quai_getBlockByNumber',[bundle.blockNumber,false]),rpc.call('quai_getBlockByNumber',[stateBlock,false])]);
  requireThat(current && parent && hash(current.hash)===hash(bundle.blockHash) && hash(parent.hash)===hash(bundle.parentHash) && hash(current.parentHash)===hash(bundle.parentHash),'REORG','Captured block or parent is no longer canonical.');
  const result={transactionHash:hash(bundle.transactionHash),originalStatus:receiptStatus(bundle.receipt),stateBlock,exactReplay:false,limitation:'Parent-block state approximation. Same-block transaction ordering is not reproduced. Requires archive state.',status:'returned'};
  try {result.returnData=bytes(await rpc.call('quai_call',[bundle.call,stateBlock]),'call return data');}
  catch(e) {if(e.code!=='RPC_ERROR' || (e.rpcCode!==3 && e.revertData===undefined))throw e;result.ok=false;result.status='reverted';result.revertData=e.revertData??null;}
  const after=await rpc.call('quai_getBlockByNumber',[bundle.blockNumber,false]);
  requireThat(after && hash(after.hash)===hash(bundle.blockHash),'REORG','Canonical block changed during replay.');
  return outputFile(flags,result);
}
