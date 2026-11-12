import { digest, OpsError, requireThat } from './validation.mjs';
const methods = new Set(['quai_chainId','quai_blockNumber','quai_call','quai_estimateGas','quai_gasPrice','quai_getBalance','quai_getTransactionCount','quai_getTransactionByHash','quai_getTransactionReceipt','quai_getCode','quai_getBlockByNumber','quai_getBlockByHash','quai_sendRawTransaction']);
export function safeUrl(input, allowLocalHttp = false) {
  let url; try { url = new URL(input); } catch { throw new OpsError('INPUT','Invalid endpoint URL.'); }
  requireThat(!url.username && !url.password && !url.search && !url.hash, 'INPUT', 'Endpoint URLs must not contain credentials, query parameters or fragments.');
  requireThat(url.protocol === 'https:' || (allowLocalHttp === true && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)), 'INPUT', 'Use HTTPS, or explicitly allow HTTP on a loopback-only development node.');
  return url.href;
}
export async function readResponse(response, maxBytes = 2 * 1024 * 1024) {
  requireThat(response.ok, 'HTTP_ERROR', 'Endpoint returned an unsuccessful HTTP status.');
  const reader = response.body?.getReader();
  requireThat(reader, 'RPC_PROTOCOL', 'Endpoint returned no response body.');
  let size = 0; const chunks = [];
  try {
    for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.length; requireThat(size <= maxBytes, 'RPC_PROTOCOL', 'Endpoint response exceeds the size limit.'); chunks.push(value); }
  } finally { await reader.cancel().catch(()=>{}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new OpsError('RPC_PROTOCOL','Endpoint response is not valid JSON.'); }
}
export function createRpc({ url, allowLocalHttp = false, fetchFn = fetch, timeoutMs = 10000 } = {}) {
  const endpoint = safeUrl(url, allowLocalHttp); let nextId = 0;
  return {
    endpointDigest:digest(endpoint),
    async call(method, params = []) {
      requireThat(methods.has(method), 'INPUT','Unsupported RPC method.');
      const id = ++nextId;
      let body;
      try {
        const response = await fetchFn(endpoint,{method:'POST',headers:{'content-type':'application/json'},redirect:'error',body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(timeoutMs)});
        body = await readResponse(response);
      } catch (e) { if (e instanceof OpsError) throw e; throw new OpsError('RPC_UNAVAILABLE','RPC unavailable or timed out. No automatic retry was attempted.'); }
      requireThat(body && !Array.isArray(body) && body.jsonrpc === '2.0' && body.id === id, 'RPC_PROTOCOL','RPC response identity mismatch.');
      if (body.error) {
        const error = new OpsError('RPC_ERROR','Node rejected the RPC request. Server text is omitted to avoid leaking endpoint details.');
        if (Number.isSafeInteger(body.error.code)) error.rpcCode = body.error.code;
        if (typeof body.error.data === 'string' && /^0x(?:[0-9a-fA-F]{2}){0,4096}$/.test(body.error.data)) error.revertData = body.error.data;
        throw error;
      }
      requireThat(Object.hasOwn(body,'result'), 'RPC_PROTOCOL','RPC response has no result.');
      return body.result;
    }
  };
}
