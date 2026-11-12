import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@hartii/ops-core';
import { getAddress } from 'quais';

const from = getAddress('0x00112233445566778899aabbccddeeff00112233');
const to = getAddress('0x002233445566778899aabbccddeeff0011223344');
const intent = { from, to, value: '1000000000000000000', maxFee: '25000000000000000000' };
test('intent validates exact wei, canonical checksum, account ledger and Cyprus-1', () => {
  assert.equal(typeof core.normalizeIntent, 'function');
  const normalized = core.normalizeIntent({ ...intent, to: to.toLowerCase() });
  assert.equal(normalized.to, to);
  assert.equal(normalized.value, intent.value);
  assert.equal(normalized.data, '0x');
  for (const bad of [null, 1.5, 1, '-1', '1e18', '01', true]) assert.throws(() => core.normalizeIntent({ ...intent, value: bad }));
  for (const bad of ['0x0000000000000000000000000000000000000000', '0x008233445566778899aabbccddeeff0011223344', '0x012233445566778899aabbccddeeff0011223344']) assert.throws(() => core.normalizeIntent({ ...intent, to: bad }));
  assert.throws(() => core.normalizeIntent({ ...intent, chainId: 9 }), /Unknown/);
  assert.throws(() => core.normalizeIntent({ ...intent, data: '0x123' }), /hex/);
  assert.throws(() => core.normalizeIntent({ ...intent, maxFee: '0' }), /positive/);
});
test('RPC refuses remote HTTP, embedded credentials, mismatched IDs and injected method names', async () => {
  assert.equal(typeof core.createRpc, 'function');
  assert.throws(() => core.createRpc({ url: 'http://example.com', allowLocalHttp: true }));
  assert.throws(() => core.createRpc({ url: 'https://user:password@example.com' }));
  assert.throws(() => core.createRpc({ url: 'https://example.com?api_key=private' }));
  let calls = 0;
  const rpc = core.createRpc({ url: 'https://example.com', fetchFn: async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    return Response.json({ jsonrpc: '2.0', id: payload.id + 1, result: '0x9' });
  }});
  await assert.rejects(rpc.call('quai_chainId'), /identity/);
  await assert.rejects(rpc.call('personal_unlockAccount'), /Unsupported/);
  assert.equal(calls, 1);
});
test('RPC timeout and node errors are bounded and redact server text', async () => {
  const rpc = core.createRpc({ url: 'https://example.com', fetchFn: async (_url, opts) => Response.json({ jsonrpc: '2.0', id: JSON.parse(opts.body).id, error: { code: -32000, message: 'credential=NEVER_PRINT_THIS' } }) });
  await assert.rejects(rpc.call('quai_call', [{}]), e => e.code === 'RPC_ERROR' && !e.message.includes('NEVER_PRINT_THIS'));
});
test('receipt classification never coerces missing, boolean or malformed statuses into success', () => {
  assert.equal(typeof core.receiptStatus, 'function');
  for (const status of [null, undefined, '', false, true, '0x2', 2, '01']) assert.equal(core.receiptStatus({ status }), 'unknown');
  for (const status of [0, '0', '0x0']) assert.equal(core.receiptStatus({ status }), 'reverted');
  for (const status of [1, '1', '0x1']) assert.equal(core.receiptStatus({ status }), 'confirmed');
});
