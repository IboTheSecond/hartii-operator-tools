import { readdir,readFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const expected=['@hartii/ops-core','@hartii/quai-tx','@hartii/quai-release','@hartii/quai-watch','@hartii/quai-replay'].sort();
try{
  if(!process.argv[2])throw new Error('Pass the downloaded matrix receipt directory.');
  const root=resolve(process.argv[2]),dirs=(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory());
  if(dirs.length!==4)throw new Error('Expected exactly four platform/environment receipts.');
  let baseline;
  for(const dir of dirs){
    const receipt=JSON.parse(await readFile(join(root,dir.name,'packages.json'),'utf8'));
    if(receipt.reproducible!==true || receipt.installedSmoke!==true || !Array.isArray(receipt.packages) || receipt.packages.length!==5)throw new Error('Incomplete package gate evidence.');
    const packages=[...receipt.packages].sort((a,b)=>a.name.localeCompare(b.name));
    if(JSON.stringify(packages.map(p=>p.name))!==JSON.stringify(expected) || packages.some(p=>!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(p.version)||!(/^[a-f0-9]{64}$/).test(p.sha256)))throw new Error('Invalid package identity or checksum.');
    const identity=JSON.stringify(packages.map(({name,version,sha256})=>({name,version,sha256})));
    if(baseline && baseline!==identity)throw new Error('Package bytes differ between platform environments.');
    baseline=identity;
  }
  console.log(JSON.stringify({crossPlatformIdentical:true,environments:4,packages:5}));
}catch(e){console.error(e.message);process.exitCode=1;}
