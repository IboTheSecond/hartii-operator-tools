import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const read = (path) => readFile(resolve(path), 'utf8');
const tools = ['tx', 'release', 'watch', 'replay'];

test('public site page loads nothing from the network and links only to approved places', async () => {
  const html = await read('site/index.html');
  assert.doesNotMatch(html, /<script[^>]*\ssrc\s*=/i, 'no external script');
  assert.doesNotMatch(html, /<link[^>]*\shref\s*=[^>]*stylesheet/i, 'no external stylesheet');
  assert.doesNotMatch(html, /<link[^>]*rel\s*=\s*["']?(?:preload|prefetch|preconnect|dns-prefetch|modulepreload)/i);
  assert.doesNotMatch(html, /<(?:img|iframe|video|audio|source|embed|object)[^>]*\ssrc\s*=\s*["']?https?:/i);
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i, 'no CSS resource from another host');
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /http:\/\//i, 'no plain http address');
  for (const banned of ['fetch(', 'XMLHttpRequest', 'import(', 'WebSocket', 'sendBeacon', 'EventSource']) {
    assert.equal(html.includes(banned), false, 'must not contain ' + banned);
  }
  const allowedHosts = new Set(['github.com', 'hartiilabs.com', 'ops.hartii.org']);
  const allowedGithub = ['/IboTheSecond/hartii-operator-tools', '/dominant-strategies/quais.js', '/dominant-strategies/quai-docs'];
  const hrefs = [...html.matchAll(/<a\s[^>]*href\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
  assert.ok(hrefs.length >= 6, 'expected the page to carry links');
  for (const href of hrefs) {
    if (href.startsWith('#')) continue;
    assert.doesNotMatch(href, /^(?:mailto|javascript|data):/i, href);
    const url = new URL(href);
    assert.equal(url.protocol, 'https:', href);
    assert.ok(allowedHosts.has(url.hostname), 'host not allowed: ' + href);
    if (url.hostname === 'github.com') assert.ok(allowedGithub.some((p) => url.pathname === p || url.pathname.startsWith(p + '/')), 'github path not allowed: ' + href);
  }
  // every in-page link target exists
  for (const href of hrefs.filter((h) => h.startsWith('#') && h.length > 1)) {
    assert.ok(html.includes('id="' + href.slice(1) + '"'), 'missing anchor target ' + href);
  }
});

test('public site keeps the sample-data label and states that nothing is sent', async () => {
  const html = await read('site/index.html');
  assert.match(html, /SAMPLE DATA/);
  assert.match(html, /Nothing is sent/);
  assert.match(html, /<title>Hartii Operator Tools<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
  assert.match(html, /0\.1\.0-beta\.1/);
});

test('public site copy has no business, private or absolute-claim wording', async () => {
  const html = (await read('site/index.html')).toLowerCase();
  for (const word of ['paid pilot', 'revenue', 'customer', 'pricing', 'your priorities', 'your direction', 'export my decision', 'guarantee', 'c:/users', 'mailto:']) {
    assert.equal(html.includes(word), false, 'page must not contain "' + word + '"');
  }
  // no "@" except CSS at-rules: an at sign followed by a word is an at-rule, anything else (an address) is refused
  assert.doesNotMatch(html.replace(/@(?:media|keyframes|font-face|supports|container|layer)\b/g, ''), /@/, 'no email address or at sign');
});

test('every command and flag shown on the page exists in the matching CLI', async () => {
  const html = await read('site/index.html');
  const decoded = html.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  const home = await mkdtemp(join(tmpdir(), 'site-test-home-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const run = (tool, args) => {
    const result = spawnSync(process.execPath, [resolve('packages', tool, 'bin', 'cli.mjs'), ...args], { encoding: 'utf8', env, timeout: 30000 });
    return JSON.parse(result.stdout);
  };
  try {
    const real = {};
    for (const tool of tools) real[tool] = new Set(run(tool, ['--help']).commands.map((c) => c.split(' ')[0]));
    const shown = [...decoded.matchAll(/quai-(tx|release|watch|replay) ([a-z]+)([^'"`\n]*)/g)]
      .map((m) => ({ tool: m[1], sub: m[2], rest: m[3].split('</')[0] }));
    assert.ok(shown.length >= 12, 'expected the page to show real commands, found ' + shown.length);
    const seen = new Set();
    for (const { tool, sub, rest } of shown) {
      assert.ok(real[tool].has(sub), `quai-${tool} has no "${sub}" command`);
      const flags = [...rest.matchAll(/(?:^|\s)(--[a-z][a-z-]*)/g)].map((m) => m[1]);
      const key = tool + ' ' + sub + ' ' + flags.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      const booleans = new Set(['--json', '--confirm', '--allow-local-http', '--help', '--version']);
      const args = [sub];
      for (const f of new Set(flags)) args.push(...(booleans.has(f) ? [f] : [f, 'x']));
      const out = run(tool, args);
      const message = out?.error?.message ?? '';
      assert.doesNotMatch(message, /Unknown or repeated option|not supported by the selected command|Unknown .* command/, `quai-${tool} ${args.join(' ')}: ${message}`);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('public docs carry no private path, vault reference or business plan', async () => {
  for (const file of ['AGENTS.md', 'README.md']) {
    const text = await read(file);
    assert.equal(/C:[\\/]Users/i.test(text), false, file + ' has a local path');
    assert.equal(/vault/i.test(text), false, file + ' mentions a vault');
    assert.equal(/paid pilot/i.test(text), false, file + ' mentions a paid pilot');
  }
});

test('site headers carry the strict content security policy', async () => {
  const headers = await read('site/_headers');
  const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  assert.ok(headers.includes('Content-Security-Policy: ' + csp), 'CSP line missing or different');
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(await read('site/robots.txt'), /User-agent: \*\s+Allow: \//);
});
