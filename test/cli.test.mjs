import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const name of ['tx', 'release', 'watch', 'replay']) {
  test(`${name} exposes a usable CLI and strict machine-readable help`, () => {
    const result = spawnSync(process.execPath, [`packages/${name}/bin/cli.mjs`, '--help', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Missing ${name} CLI: ${result.stderr.slice(0, 160)}`);
    const help = JSON.parse(result.stdout);
    assert.equal(help.tool, `quai-${name}`);
    assert.ok(help.commands.length > 0);
  });
  test(`${name} rejects unknown options without contacting a node`, () => {
    const result = spawnSync(process.execPath, [`packages/${name}/bin/cli.mjs`, '--json', '--confrim'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).error.code, 'USAGE');
    assert.equal(result.stderr, '');
  });
}
