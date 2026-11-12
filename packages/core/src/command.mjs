import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRpc } from './rpc.mjs';
import { chain, requireThat } from './validation.mjs';
import { ReviewStore, writeJson } from './files.mjs';
export function flagsFor(flags, allowed, required=[]) {
  requireThat(Object.keys(flags).every(k=>['json','help','version',...allowed].includes(k)), 'USAGE','This option is not supported by the selected command. Use --help.');
  for (const name of required) requireThat(typeof flags[name]==='string' && flags[name].length>0,'USAGE','Missing --'+name+'.');
}
export const networkFlags=['rpc','chain-id','allow-local-http'];
export function connect(flags) {
  const chainId=chain(flags['chain-id'] ?? 9);
  requireThat(chainId===9 || flags.rpc,'USAGE','A test-network operation requires an explicit --rpc endpoint.');
  return {chainId,rpc:createRpc({url:flags.rpc ?? 'https://rpc.quai.network/cyprus1',allowLocalHttp:flags['allow-local-http']===true})};
}
export function stateStore(flags) { return new ReviewStore(flags.state ?? join(homedir(),'.hartii-ops')); }
export async function outputFile(flags,result) { if(flags.out) { await writeJson(flags.out,result); return {...result,output:flags.out}; } return result; }
