import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files=(await readdir('test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'test/'+f);
if(!files.length)throw new Error('No test files found.');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exitCode=result.status??1;
