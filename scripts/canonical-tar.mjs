import { gunzipSync,gzipSync } from 'node:zlib';
import { guardTarball } from './guard.mjs';
function entries(tar){
  const result=[];
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);if(header.every(b=>b===0))break;
    const field=(start,length)=>header.subarray(start,start+length).toString('ascii').split('\0')[0];
    const size=parseInt(field(124,12).trim(),8);result.push({header,name:field(0,100),type:field(156,1),mode:parseInt(field(100,8).trim(),8)});
    offset+=512+Math.ceil(size/512)*512;
  }
  return result;
}
export function inspectBinModes(buffer){guardTarball(buffer);return entries(gunzipSync(buffer)).filter(e=>e.name.startsWith('package/bin/')).map(({name,mode})=>({name,mode:mode.toString(8)}));}
export function canonicalizeTarball(buffer){
  guardTarball(buffer);
  const tar=gunzipSync(buffer,{maxOutputLength:16*1024*1024});
  for(const {header,name,type}of entries(tar)){
    const mode=type==='5'||name.startsWith('package/bin/')?0o755:0o644;
    header.write(mode.toString(8).padStart(7,'0')+'\0',100,8,'ascii');
    header.fill(32,148,156);const sum=header.reduce((a,b)=>a+b,0);
    header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
  }
  const result=gzipSync(tar,{level:9});result.writeUInt32LE(0,4);result[9]=255;
  guardTarball(result);return result;
}
