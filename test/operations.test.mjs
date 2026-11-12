import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddress, Wallet, keccak256, toUtf8Bytes, QuaiTransaction } from 'quais';
import * as core from '@hartii/ops-core';

const to = getAddress('0x002233445566778899aabbccddeeff0011223344');
// Public, disposable test-only derivation. No funded key or keystore is used.
let wallet;
for (let i = 0; i < 20000; i++) {
  const candidate = new Wallet(keccak256(toUtf8Bytes('hartii operator disposable fixture ' + i)));
  if (/^0x00[0-7]/i.test(candidate.address)) { wallet = candidate; break; }
}
assert.ok(wallet, 'test fixture must be a Cyprus-1 Quai account');
const from = wallet.address;
const intent = { from, to, value: '1000000000000000000', maxFee: '25000000000000000000' };
const fixedNow = 1800000000000;
function nodeFixture() {
  const calls = []; const state = { chain: '0x9', nonce: '0x0', estimate: '0x5208', price: '0x3b9aca00', balance: '0x56bc75e2d63100000', ambiguous: false, sent: 0 };
  const rpc = { endpointDigest: 'fixture-rpc', async call(method, params = []) {
    calls.push([method, params]);
    if (method === 'quai_chainId') return state.chain;
    if (method === 'quai_getTransactionCount') return state.nonce;
    if (method === 'quai_gasPrice') return state.price;
    if (method === 'quai_estimateGas') { assert.equal(params[0].from, getAddress(params[0].from)); return state.estimate; }
    if (method === 'quai_getBalance') return state.balance;
    if (method === 'quai_call') { assert.equal(params[0].from, getAddress(params[0].from)); return '0x'; }
    if (method === 'quai_blockNumber') return '0x64';
    if (method === 'quai_sendRawTransaction') { state.sent++; if (state.ambiguous) throw new Error('Connection reset'); return QuaiTransaction.from(params[0]).hash; }
    throw new Error('Unexpected method ' + method);
  }};
  return { state, calls, rpc };
}
async function setup() {
  const fixture = nodeFixture();
  const dir = await mkdtemp(join(tmpdir(), 'hartii-ops-'));
  const store = new core.ReviewStore(dir);
  const review = await core.prepareTransaction({ intent, rpc: fixture.rpc, store, chainId: 9, now: fixedNow });
  const raw = await wallet.signTransaction(review.transaction);
  return { ...fixture, store, review, raw, dir };
}
test('prepare gives a persisted, exact unsigned transaction, fee ceiling and one-use approval', async () => {
  assert.equal(typeof core.prepareTransaction, 'function');
  const f = await setup();
  assert.equal(f.review.transaction.from, from);
  assert.equal(f.review.transaction.chainId, '9');
  assert.equal(f.review.transaction.gasLimit, '27300');
  assert.equal(f.review.transaction.gasPrice, '1000000000');
  assert.equal(f.review.transaction.value, intent.value);
  assert.equal(f.state.sent, 0);
  assert.equal((await f.store.read(f.review.id)).status, 'prepared');
  const approval = JSON.parse(await readFile(f.review.approvalFile, 'utf8'));
  assert.equal(approval.reviewId, f.review.id);
  assert.ok(approval.reviewToken.length >= 32);
  assert.ok(!JSON.stringify(f.review).includes(approval.reviewToken));
});
test('review rejects insufficient funds, wrong chain, fee budget and simulated revert', async () => {
  for (const [field, value, code] of [['balance','0x0','INSUFFICIENT_FUNDS'], ['chain','0x3a98','WRONG_CHAIN'], ['price','0x1000000000000000000000','FEE_LIMIT']]) {
    const f = nodeFixture(); f.state[field] = value;
    await assert.rejects(core.prepareTransaction({ intent, rpc: f.rpc, store: new core.ReviewStore(await mkdtemp(join(tmpdir(),'hartii-reject-'))), chainId: 9, now: fixedNow }), e => e.code === code);
    assert.equal(f.state.sent, 0);
  }
  const f = nodeFixture(); const call = f.rpc.call;
  f.rpc.call = async (m,p) => { if (m === 'quai_call') throw Object.assign(new Error('revert'), { code:'RPC_ERROR' }); return call(m,p); };
  await assert.rejects(core.prepareTransaction({ intent, rpc:f.rpc, store:{}, chainId:9, now:fixedNow }));
});
test('a send needs confirm AND the original approval and exact signed terms', async () => {
  const f = await setup();
  const approval = JSON.parse(await readFile(f.review.approvalFile,'utf8'));
  const options = { rpc:f.rpc, store:f.store, reviewId:f.review.id, raw:f.raw, approval, confirm:true, now:fixedNow+1000 };
  await assert.rejects(core.submitTransaction({ ...options, confirm:false }), e => e.code === 'CONFIRM_REQUIRED');
  await assert.rejects(core.submitTransaction({ ...options, approval:{...approval,reviewToken:'bad'} }), e => e.code === 'APPROVAL');
  const wrong = await wallet.signTransaction({ ...f.review.transaction, value:'2' });
  await assert.rejects(core.submitTransaction({ ...options, raw:wrong }), e => e.code === 'TERMS_CHANGED');
  assert.equal(f.state.sent,0);
});
test('expiry, nonce, endpoint, gas drift, gas requirement and balance changes refuse before broadcast', async () => {
  for (const mutate of [
    f => { f.now = fixedNow + 300001; },
    f => { f.state.nonce = '0x1'; },
    f => { f.rpc.endpointDigest = 'switched-endpoint'; },
    f => { f.state.price = '0x77359400'; },
    f => { f.state.estimate = '0xffff'; },
    f => { f.state.balance = '0x0'; },
  ]) {
    const f=await setup(); mutate(f);
    const approval=JSON.parse(await readFile(f.review.approvalFile,'utf8'));
    await assert.rejects(core.submitTransaction({rpc:f.rpc,store:f.store,reviewId:f.review.id,raw:f.raw,approval,confirm:true,now:f.now??fixedNow+1000}));
    assert.equal(f.state.sent,0);
  }
});
test('broadcast ambiguity preserves the locally signed hash and permanently consumes the review', async () => {
  const f=await setup(); f.state.ambiguous=true;
  const approval=JSON.parse(await readFile(f.review.approvalFile,'utf8'));
  const options={rpc:f.rpc,store:f.store,reviewId:f.review.id,raw:f.raw,approval,confirm:true,now:fixedNow+1000};
  const result=await core.submitTransaction(options);
  assert.equal(result.status,'unknown');
  assert.match(result.hash,/^0x[0-9a-f]{64}$/i);
  assert.equal((await f.store.read(f.review.id)).status,'unknown');
  await assert.rejects(core.submitTransaction(options));
  assert.equal(f.state.sent,1);
});
test('concurrent approval attempts can broadcast at most once', async () => {
  const f=await setup();
  const approval=JSON.parse(await readFile(f.review.approvalFile,'utf8'));
  const options={rpc:f.rpc,store:f.store,reviewId:f.review.id,raw:f.raw,approval,confirm:true,now:fixedNow+1000};
  const results=await Promise.allSettled([core.submitTransaction(options),core.submitTransaction(options)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(f.state.sent,1);
});
test('review expiring during preflight is refused immediately before broadcast',async()=>{
  const f=await setup();const approval=JSON.parse(await readFile(f.review.approvalFile,'utf8'));
  f.calls.length=0;
  let clock=fixedNow+299999;const call=f.rpc.call;
  f.rpc.call=async(m,p)=>{const result=await call(m,p);if(m==='quai_blockNumber')clock=fixedNow+300001;return result;};
  await assert.rejects(core.submitTransaction({rpc:f.rpc,store:f.store,reviewId:f.review.id,raw:f.raw,approval,confirm:true,now:()=>clock}),e=>e.code==='EXPIRED');
  assert.ok(f.calls.some(([method])=>method==='quai_estimateGas'),'Preflight must have run before the expiry refusal.');
  assert.equal(f.state.sent,0);
});
test('an unresolved send blocks subsequent reviews until a matching canonical final receipt is reconciled',async()=>{
  const f=await setup();const approval=JSON.parse(await readFile(f.review.approvalFile,'utf8'));
  const sent=await core.submitTransaction({rpc:f.rpc,store:f.store,reviewId:f.review.id,raw:f.raw,approval,confirm:true,now:fixedNow+1000});
  assert.equal(sent.status,'submitted');
  await assert.rejects(core.prepareTransaction({intent,rpc:f.rpc,store:f.store,chainId:9,now:fixedNow+2000}),e=>e.code==='PENDING');
  const oldCall=f.rpc.call;let wrong=true;const blockHash='0x'+'04'.repeat(32);
  f.rpc.call=async(m,p)=>{
    if(m==='quai_getTransactionByHash')return {hash:sent.hash,from,to};
    if(m==='quai_getTransactionReceipt')return {transactionHash:sent.hash,from:wrong?to:from,to,status:'0x1',blockNumber:'0x64',blockHash};
    if(m==='quai_getBlockByNumber')return {hash:blockHash,number:'0x64',woHeader:{timestamp:'0x6553f100'}};
    return oldCall(m,p);
  };
  await assert.rejects(core.reconcileReview({rpc:f.rpc,store:f.store,reviewId:f.review.id}),e=>e.code==='RECEIPT');
  wrong=false;
  const result=await core.reconcileReview({rpc:f.rpc,store:f.store,reviewId:f.review.id});
  assert.equal(result.status,'confirmed');assert.equal(await f.store.pending(await f.store.read(f.review.id)),null);
});
