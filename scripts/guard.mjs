import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
export function checkText(text,name) {
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-ant-[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})/.test(text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,''))) throw new Error('Secret-shaped content detected in '+name+'; value omitted.');
}
function allowedName(name) {
  if (/^\.env|^\.npmrc|^\.dev\.vars|^\.credentials|\.(?:key|pem|signed|approval\.json)$/i.test(basename(name)))throw new Error('Protected filename in source/export: '+name);
}
export async function guard(root) {
  async function walk(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      if(dir===root && ['.git','node_modules','artifacts'].includes(entry.name))continue;
      const path=resolve(dir,entry.name),name=relative(root,path).replaceAll('\\','/');allowedName(name);
      if(entry.isSymbolicLink())throw new Error('Unexpected source symlink: '+name);
      if(entry.isDirectory()){await walk(path);continue;}
      const info=await lstat(path);if(!info.isFile() || info.size>4*1024*1024)throw new Error('Unexpected file shape: '+name);
      if(!/\.(?:mjs|js|json|md|html|css|ya?ml)$|(?:^|\/)(?:LICENSE|\.gitignore|\.gitattributes)$|^site\/(?:_headers|robots\.txt)$/.test(name))throw new Error('Unexpected source file type: '+name);
      checkText(await readFile(path,'utf8'),name);
    }
  }
  await walk(root);
}
export function guardTarball(buffer) {
  const tar=gunzipSync(buffer,{maxOutputLength:16*1024*1024});const names=[];
  for(let offset=0;offset+512<=tar.length;) {
    const header=tar.subarray(offset,offset+512);if(header.every(b=>b===0))break;
    const text=(start,len)=>header.subarray(start,start+len).toString('utf8').split('\0')[0];
    const name=text(0,100),prefix=text(345,155),type=text(156,1),sizeText=text(124,12).trim();
    if(prefix || !/^package\/[A-Za-z0-9_./-]+$/.test(name) || name.split('/').includes('..') || !['','0','5'].includes(type) || !/^[0-7]+$/.test(sizeText))throw new Error('Unsafe tar entry; export refused.');
    const size=parseInt(sizeText,8);if(!Number.isSafeInteger(size) || offset+512+size>tar.length)throw new Error('Invalid tar entry size.');
    allowedName(name);checkText(tar.subarray(offset+512,offset+512+size).toString('utf8'),name);names.push(name);
    offset+=512+Math.ceil(size/512)*512;
  }
  if(!names.includes('package/package.json'))throw new Error('Tarball is missing package.json.');
  return names;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {await guard(resolve('.'));console.log('Source guard passed.');}
