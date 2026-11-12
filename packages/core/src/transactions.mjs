import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { QuaiTransaction } from 'quais';
import { normalizeIntent, transactionTerms, rpcTransaction, assertChain, digest, uint, hex, bytes, hash, receiptStatus, requireThat, OpsError } from './validation.mjs';

const GAS_CAP=5000000n;
async function preflight(rpc, intent, chainId) {
  await assertChain(rpc,chainId);
  const callTx=rpcTransaction(intent);
  const [simulation,estimate,gasPrice,nonce,balance,block]=await Promise.all([
    rpc.call('quai_call',[callTx,'latest']), rpc.call('quai_estimateGas',[callTx]), rpc.call('quai_gasPrice'),
    rpc.call('quai_getTransactionCount',[intent.from,'pending']), rpc.call('quai_getBalance',[intent.from,'latest']), rpc.call('quai_blockNumber')
  ]);
  bytes(simulation,'call result');
  const gas=uint(estimate,'gas estimate'); const price=uint(gasPrice,'gas price');
  requireThat(gas>0n && gas<=GAS_CAP && price>0n,'FEE_LIMIT','Invalid gas estimate or price, or gas exceeds the 5,000,000 unit safety cap.');
  const pendingNonce=uint(nonce,'nonce'); requireThat(pendingNonce<=BigInt(Number.MAX_SAFE_INTEGER),'INPUT','Nonce exceeds SDK safe integer range.');
  return {gas,price,nonce:Number(pendingNonce),balance:uint(balance,'balance'),block:uint(block,'block').toString(),simulation};
}
const reviewPayload = r => ({version:r.version,id:r.id,chainId:r.chainId,endpointDigest:r.endpointDigest,createdAt:r.createdAt,expiresAt:r.expiresAt,transaction:r.transaction,maxFee:r.maxFee,estimate:r.estimate});
function checkBalance(balance,tx,budget) {
  const fee=BigInt(tx.gasLimit)*BigInt(tx.gasPrice);
  requireThat(fee<=BigInt(budget),'FEE_LIMIT','Signed maximum fee exceeds the intent fee budget. Nothing was sent.');
  requireThat(balance>=BigInt(tx.value)+fee,'INSUFFICIENT_FUNDS','Balance cannot cover the value and full signed gas ceiling. Nothing was sent.');
}
export async function prepareTransaction({intent,rpc,store,chainId=9,now=Date.now()}) {
  const normalized=normalizeIntent(intent);
  const live=await preflight(rpc,normalized,chainId);
  const gasLimit=(live.gas*130n+99n)/100n;
  requireThat(gasLimit<=GAS_CAP,'FEE_LIMIT','Buffered gas exceeds the safety cap.');
  const transaction=transactionTerms({...normalized,type:0,chainId:String(chainId),nonce:live.nonce,gasLimit:gasLimit.toString(),gasPrice:live.price.toString()});
  checkBalance(live.balance,transaction,normalized.maxFee);
  const review={version:1,id:randomUUID(),chainId:Number(chainId),endpointDigest:rpc.endpointDigest,createdAt:now,expiresAt:now+300000,transaction,maxFee:normalized.maxFee,estimate:live.gas.toString(),block:live.block,status:'prepared'};
  requireThat(!(await store.pending(review)),'PENDING','This account has an unresolved earlier send. Reconcile its receipt first.');
  review.reviewDigest=digest(reviewPayload(review));
  const token=randomBytes(32).toString('hex'); review.tokenDigest=digest(token);
  const approvalFile=await store.create(review,token);
  return {id:review.id,status:review.status,transaction,expiresAt:review.expiresAt,approvalFile,maxFeeWei:(gasLimit*live.price).toString(),callResult:live.simulation,warning:'Preflight is not a guarantee of future execution. External signing is required.'};
}
export async function submitTransaction({rpc,store,reviewId,raw,approval,confirm,now=Date.now()}) {
  const start=performance.now();
  const readClock=typeof now==='function'?now:()=>Math.floor(now+performance.now()-start);
  requireThat(confirm===true,'CONFIRM_REQUIRED','Explicit confirm:true is required. Nothing was sent.');
  const review=await store.read(reviewId);
  requireThat(review.status==='prepared','CONSUMED','This review was already consumed. Reconcile its signed hash; do not repeat it.');
  requireThat(approval?.reviewId===review.id && typeof approval?.reviewToken==='string' && approval.reviewToken.length<=128,'APPROVAL','Approval does not match this review.');
  requireThat(digest(reviewPayload(review))===review.reviewDigest && approval.reviewDigest===review.reviewDigest,'TERMS_CHANGED','Stored review terms changed. Prepare a fresh review.');
  const actual=Buffer.from(digest(approval.reviewToken),'hex'),expected=Buffer.from(review.tokenDigest,'hex');
  requireThat(actual.length===expected.length && timingSafeEqual(actual,expected),'APPROVAL','Approval token is invalid.');
  const checkExpiry=()=>{const time=readClock();requireThat(Number.isSafeInteger(time) && time>=review.createdAt && time<review.expiresAt,'EXPIRED','Review expired or clock moved backwards. Prepare a fresh review.');return time;};
  checkExpiry();
  requireThat(review.endpointDigest===rpc.endpointDigest,'TERMS_CHANGED','RPC endpoint differs from the reviewed endpoint.');
  let signed; try { signed=QuaiTransaction.from(bytes(raw,'signed transaction')); } catch { throw new OpsError('SIGNATURE','Cannot decode a signed internal Quai transaction.'); }
  requireThat(signed.signature && signed.from,'SIGNATURE','A recoverable external signature is required.');
  requireThat(digest(transactionTerms(signed))===digest(review.transaction),'TERMS_CHANGED','Signed transaction differs from the reviewed terms. Nothing was sent.');
  const signedHash=hash(signed.hash);
  return store.withLock(review,async()=>{
    const current=await store.read(reviewId);
    requireThat(current.status==='prepared','CONSUMED','Review already consumed.');
    requireThat(!(await store.pending(review)),'PENDING','Account has an unresolved earlier send.');
    const live=await preflight(rpc,review.transaction,review.chainId);
    requireThat(live.nonce===review.transaction.nonce,'NONCE_CHANGED','Pending nonce changed. Prepare and sign a fresh review.');
    const originalPrice=BigInt(review.transaction.gasPrice),originalEstimate=BigInt(review.estimate);
    requireThat(live.price*100n<=originalPrice*120n && live.price*100n>=originalPrice*80n && live.gas*100n<=originalEstimate*120n && live.gas<=BigInt(review.transaction.gasLimit),'GAS_CHANGED','Gas estimate or price moved beyond the review limits. Prepare a fresh review.');
    checkBalance(live.balance,review.transaction,review.maxFee);
    await assertChain(rpc,review.chainId);
    const checkedAt=checkExpiry();
    // Persist a one-use claim and an unresolved account reservation BEFORE touching broadcast.
    // A crash here deliberately refuses future sends until an operator reconciles the evidence.
    await store.claim(review.id,{hash:signedHash,at:checkedAt});
    await store.reserve(review,signedHash);
    review.status='broadcasting'; review.hash=signedHash; await store.update(review);
    try {checkExpiry();}catch(e){review.status='refused-expired';await store.update(review);await store.release(review);throw e;}
    let status='submitted';
    try { const returned=await rpc.call('quai_sendRawTransaction',[raw]); if (hash(returned)!==signedHash) status='unknown'; }
    catch { status='unknown'; }
    review.status=status; await store.update(review);
    return {ok:status!=='unknown',reviewId:review.id,status,hash:signedHash,final:false,next:'Read the receipt for this hash. Never rebroadcast automatically.'};
  });
}
export async function inspectTransaction(rpc,txHash,chainId=9) {
  txHash=hash(txHash); await assertChain(rpc,chainId);
  const [tx,receipt]=await Promise.all([rpc.call('quai_getTransactionByHash',[txHash]),rpc.call('quai_getTransactionReceipt',[txHash])]);
  if (tx) requireThat(hash(tx.hash)===txHash,'RPC_PROTOCOL','Node returned a different transaction identity.');
  if (receipt) requireThat(hash(receipt.transactionHash ?? receipt.hash)===txHash,'RPC_PROTOCOL','Node returned a different receipt identity.');
  return {hash:txHash,transaction:tx,receipt,status:receiptStatus(receipt),final:receiptStatus(receipt)!=='unknown'};
}
export async function reconcileReview({rpc,store,reviewId}) {
  const review=await store.read(reviewId);
  requireThat(review.hash,'INPUT','This review has no locally recorded signed hash.');
  return store.withLock(review,async()=>{
    const result=await inspectTransaction(rpc,review.hash,review.chainId);
    if (result.final) {
      const receipt=result.receipt;
      requireThat(typeof receipt.from==='string' && typeof receipt.to==='string' && receipt.from.toLowerCase()===review.transaction.from.toLowerCase() && receipt.to.toLowerCase()===review.transaction.to.toLowerCase(),'RECEIPT','Receipt sender or destination differs from the reviewed transaction.');
      const block=await rpc.call('quai_getBlockByNumber',[hex(uint(String(receipt.blockNumber),'receipt block')),false]);
      requireThat(block && hash(block.hash)===hash(receipt.blockHash),'RECEIPT','Receipt block is not canonical. Keep the account reservation.');
      review.status=result.status; review.receipt=receipt; await store.update(review); await store.release(review);
    }
    return {reviewId,...result};
  });
}
