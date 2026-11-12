import { open, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OpsError, requireThat, digest } from './validation.mjs';

function allowedPath(file) {
  const name = basename(file);
  requireThat(!/^(?:\.env|\.npmrc|\.dev\.vars|\.credentials)|\.(?:pem|key|env)$/i.test(name), 'FILE','Protected credential filenames are not valid inputs.');
}
export async function readText(file, maxBytes = 2*1024*1024) {
  allowedPath(file);
  let handle;
  try {
    const info = await lstat(file);
    requireThat(info.isFile() && !info.isSymbolicLink() && info.size <= maxBytes,'FILE','Input must be a bounded regular file, not a symbolic link.');
    handle = await open(file,'r');
    const current = await handle.stat();
    requireThat(current.ino === info.ino && current.dev === info.dev && current.size <= maxBytes,'FILE','Input file changed while opening.');
    const buffer = Buffer.alloc(maxBytes+1);
    const {bytesRead} = await handle.read(buffer,0,buffer.length,0);
    requireThat(bytesRead <= maxBytes,'FILE','Input exceeds size limit.');
    return buffer.subarray(0,bytesRead).toString('utf8');
  } catch (e) { if (e instanceof OpsError) throw e; throw new OpsError('FILE','Could not read the selected input file.'); }
  finally { await handle?.close(); }
}
export async function readJson(file) { try { return JSON.parse(await readText(file)); } catch (e) { if (e instanceof OpsError) throw e; throw new OpsError('FILE','Input is not valid JSON.'); } }
export async function writeJson(file, value, exclusive = true) {
  allowedPath(file);
  let handle;
  try {
    handle = await open(file,exclusive?'wx':'w',0o600);
    await handle.writeFile(JSON.stringify(value,null,2)+'\n'); await handle.sync();
  } catch { throw new OpsError('FILE','Could not write output; existing files are never overwritten by export commands.'); }
  finally { await handle?.close(); }
}
async function directory(dir) {
  await mkdir(dir,{recursive:true,mode:0o700});
  const stat = await lstat(dir);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink(),'FILE','State directory must not be a symbolic link.');
}
export class ReviewStore {
  constructor(root) { this.root = resolve(root); }
  async init() { await directory(this.root); for (const name of ['reviews','approvals','claims','locks','accounts']) await directory(join(this.root,name)); }
  file(area,id) { requireThat(/^[a-zA-Z0-9-]{1,128}$/.test(id),'INPUT','Invalid local review identifier.'); return join(this.root,area,id+'.json'); }
  async create(review, token) {
    await this.init();
    await writeJson(this.file('reviews',review.id),review);
    const approvalFile=this.file('approvals',review.id);
    await writeJson(approvalFile,{reviewId:review.id,reviewToken:token,reviewDigest:review.reviewDigest});
    return approvalFile;
  }
  async read(id) { await this.init(); return readJson(this.file('reviews',id)); }
  async update(review) {
    const file = this.file('reviews',review.id); const temp = file+'.'+randomUUID()+'.tmp';
    await writeJson(temp,review);
    await rename(temp,file);
  }
  async claim(id, evidence) { await writeJson(this.file('claims',id),evidence); }
  accountId(review) { return digest(review.chainId+':'+review.transaction.from.toLowerCase()); }
  async pending(review) {
    const file=this.file('accounts',this.accountId(review));
    try { await lstat(file); } catch(e) { if(e.code==='ENOENT')return null; throw e; }
    return readJson(file);
  }
  async reserve(review,hash) { await writeJson(this.file('accounts',this.accountId(review)),{reviewId:review.id,hash,status:'unresolved'}); }
  async release(review) { const pending=await this.pending(review); if (pending?.reviewId===review.id) await unlink(this.file('accounts',this.accountId(review))); }
  async withLock(review,fn) {
    await this.init(); const file=this.file('locks',this.accountId(review));
    let handle; try { handle=await open(file,'wx',0o600); } catch { throw new OpsError('BUSY','Account is locked by another operation. A stale lock requires manual review.'); }
    try { await handle.writeFile(JSON.stringify({pid:process.pid,reviewId:review.id})); await handle.sync(); return await fn(); }
    finally { await handle.close(); await unlink(file); }
  }
}
