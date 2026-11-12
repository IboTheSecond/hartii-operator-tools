import { createHash } from 'node:crypto';
import { getAddress, accessListify } from 'quais';

export class OpsError extends Error {
  constructor(code, message) { super(message); this.name = 'OpsError'; this.code = code; }
}
export function requireThat(condition, code, message) { if (!condition) throw new OpsError(code, message); }
export function uint(value, label = 'value') {
  requireThat(typeof value === 'string' && /^(0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value) && value.length <= 80, 'INPUT', label + ' must be an exact nonnegative integer string.');
  const result = BigInt(value);
  requireThat(result < (1n << 256n), 'INPUT', label + ' exceeds uint256.');
  return result;
}
export const hex = n => '0x' + BigInt(n).toString(16);
export function bytes(value, label = 'data', maxBytes = 131072) {
  requireThat(typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value) && value.length <= maxBytes * 2 + 2, 'INPUT', label + ' must be bounded, even-length hex bytes.');
  return value.toLowerCase();
}
export function hash(value) { requireThat(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value), 'INPUT', 'Expected a 32-byte hash.'); return value.toLowerCase(); }
export function address(value) {
  requireThat(typeof value === 'string' && /^0x00[0-7][0-9a-fA-F]{37}$/.test(value) && !/^0x0{40}$/i.test(value), 'ADDRESS', 'Expected a nonzero Cyprus-1 Quai account address; Qi and other zones are unsupported.');
  try { return getAddress(value); } catch { throw new OpsError('ADDRESS', 'Address checksum is invalid.'); }
}
export function chain(value = 9) { requireThat(['9','15000'].includes(String(value)), 'INPUT', 'Supported chain IDs are 9 and 15000, Cyprus-1 only.'); return Number(value); }
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function normalizeAccessList(value = []) {
  requireThat(Array.isArray(value) && value.length <= 100, 'INPUT', 'Access list must be an array of at most 100 entries.');
  try {
    return accessListify(value).map(entry => ({ address: address(entry.address), storageKeys: entry.storageKeys.map(hash) }));
  } catch { throw new OpsError('INPUT', 'Invalid access list; account addresses must be supported and checksummed.'); }
}
export function normalizeIntent(value) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'INPUT', 'Expected a transaction intent object.');
  const fields = ['from','to','value','maxFee','data','accessList'];
  requireThat(Object.keys(value).every(k=>fields.includes(k)), 'INPUT', 'Unknown transaction intent field.');
  const amount = uint(value.value, 'value'); const budget = uint(value.maxFee, 'maxFee');
  requireThat(budget > 0n, 'INPUT', 'Maximum fee must be positive.');
  return { from: address(value.from), to: address(value.to), value:amount.toString(), maxFee:budget.toString(), data:bytes(value.data ?? '0x'), accessList:normalizeAccessList(value.accessList) };
}
export function transactionTerms(tx) {
  const nonce = uint(String(tx.nonce), 'nonce');
  requireThat(nonce <= BigInt(Number.MAX_SAFE_INTEGER), 'INPUT', 'Nonce exceeds SDK safe integer range.');
  requireThat(tx.type === 0 || tx.type === '0', 'INPUT', 'Only internal Quai account transactions (type 0) are supported.');
  return { type:0, from:address(tx.from), to:address(tx.to), chainId:String(chain(tx.chainId)), nonce:Number(nonce), value:uint(String(tx.value),'value').toString(), data:bytes(tx.data), gasLimit:uint(String(tx.gasLimit),'gasLimit').toString(), gasPrice:uint(String(tx.gasPrice),'gasPrice').toString(), accessList:normalizeAccessList(tx.accessList ?? []) };
}
export function rpcTransaction(tx) {
  const out = { from:address(tx.from), to:address(tx.to), value:hex(uint(String(tx.value))), data:bytes(tx.data ?? '0x') };
  for (const field of ['gasPrice','nonce']) if (tx[field] !== undefined) out[field] = hex(uint(String(tx[field]),field));
  if (tx.gasLimit !== undefined) out.gas = hex(uint(String(tx.gasLimit),'gasLimit'));
  if (tx.accessList !== undefined) out.accessList = normalizeAccessList(tx.accessList);
  return out;
}
export function receiptStatus(receipt) {
  if ([0, '0', '0x0'].includes(receipt?.status)) return 'reverted';
  if ([1, '1', '0x1'].includes(receipt?.status)) return 'confirmed';
  return 'unknown';
}
export async function assertChain(rpc, expected) {
  const actual = uint(await rpc.call('quai_chainId'), 'RPC chain ID');
  requireThat(actual === BigInt(chain(expected)), 'WRONG_CHAIN', 'RPC chain differs from the selected chain. Nothing was sent.');
}
