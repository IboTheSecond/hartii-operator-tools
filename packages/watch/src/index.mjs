import { flagsFor,readJson,readResponse,safeUrl,requireThat,OpsError,outputFile } from '@hartii/ops-core';
export function evaluateHealth(body,{now=Date.now(),maxAgeSecs=600,maxLag=100}={}) {
  requireThat(Number.isSafeInteger(maxAgeSecs) && maxAgeSecs>0 && maxAgeSecs<=86400 && Number.isSafeInteger(maxLag) && maxLag>=0,'INPUT','Invalid freshness or lag threshold.');
  const reasons=[];
  if(!body || typeof body!=='object' || Array.isArray(body))throw new OpsError('INPUT','Expected an indexer health object.');
  if(body.chain!=='quai-cyprus1')reasons.push('chain_unknown');
  if(body.ok!==true)reasons.push('endpoint_unhealthy');
  const last=body.last_run;
  let ageMs=null,lag=null;
  if(!last) reasons.push('heartbeat_missing');
  else {
    if(last.ok!==true)reasons.push('last_run_failed');
    if(!Number.isSafeInteger(last.at) || last.at<0 || last.at>now+5000)reasons.push('heartbeat_time_invalid');
    else {ageMs=Math.max(0,now-last.at);if(ageMs>=maxAgeSecs*1000)reasons.push('heartbeat_stale');}
  }
  if(!Number.isSafeInteger(body.cursor) || !Number.isSafeInteger(body.head) || body.cursor<0 || body.head<body.cursor)reasons.push('cursor_unknown');
  else {lag=body.head-body.cursor;if(lag>maxLag)reasons.push('cursor_lag');}
  return {ok:reasons.length===0,status:reasons.length?'degraded':'healthy',reasons,ageMs,lag,thresholds:{maxAgeSecs,maxLag},observedAt:now,headSource:'Last indexer run; not an independent current-chain head.'};
}
export async function execute(command,flags) {
  const common=['max-age-secs','max-lag','out'];
  let body;
  if(command==='report') {flagsFor(flags,[...common,'input'],['input']);body=await readJson(flags.input);}
  else if(command==='check') {
    flagsFor(flags,[...common,'url','allow-local-http'],['url']);
    const url=safeUrl(flags.url,flags['allow-local-http']===true);
    try { body=await readResponse(await fetch(url,{method:'GET',headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)})); }
    catch(e) {if(e instanceof OpsError)throw e;throw new OpsError('HTTP_ERROR','Health endpoint unavailable or timed out.');}
  }else throw new OpsError('USAGE','Unknown monitoring command. Use --help.');
  const number=(key,fallback)=>{const text=flags[key];requireThat(text===undefined || /^(0|[1-9][0-9]*)$/.test(text),'INPUT','Threshold must be a nonnegative integer.');return text===undefined?fallback:Number(text);};
  return outputFile(flags,evaluateHealth(body,{maxAgeSecs:number('max-age-secs',600),maxLag:number('max-lag',100)}));
}
