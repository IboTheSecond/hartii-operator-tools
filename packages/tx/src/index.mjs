import { flagsFor,networkFlags,connect,stateStore,readJson,readText,prepareTransaction,submitTransaction,inspectTransaction,reconcileReview,OpsError } from '@hartii/ops-core';
export async function execute(command,flags) {
  if(command==='prepare') {
    flagsFor(flags,[...networkFlags,'state','intent'],['intent']);
    return prepareTransaction({intent:await readJson(flags.intent),...connect(flags),store:stateStore(flags)});
  }
  if(command==='send') {
    flagsFor(flags,[...networkFlags,'state','review','approval-file','signed-file','confirm'],['review','approval-file','signed-file']);
    return submitTransaction({ ...connect(flags),store:stateStore(flags),reviewId:flags.review,approval:await readJson(flags['approval-file']),raw:(await readText(flags['signed-file'],262146)).trim(),confirm:flags.confirm===true });
  }
  if(command==='inspect' || command==='receipt') {
    flagsFor(flags,[...networkFlags,'hash','state','review'],flags.review?['review']:['hash']);
    const ctx=connect(flags);
    if(flags.review) return reconcileReview({...ctx,store:stateStore(flags),reviewId:flags.review});
    return inspectTransaction(ctx.rpc,flags.hash,ctx.chainId);
  }
  if(command==='status') {
    flagsFor(flags,['state','review'],['review']);
    const review=await stateStore(flags).read(flags.review);
    const {tokenDigest,...safe}=review;
    return safe;
  }
  throw new OpsError('USAGE','Unknown transaction command. Use --help.');
}
