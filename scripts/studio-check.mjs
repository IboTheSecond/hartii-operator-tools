import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const moduleRoot = process.argv[2];
if (!moduleRoot) throw new Error('Pass the path of an existing Playwright installation root.');
const { chromium } = createRequire(resolve(moduleRoot, 'package.json'))('playwright');
const browser = await chromium.launch({ channel:'chrome', headless:true });
const folder = resolve('artifacts/studio');
await mkdir(folder,{recursive:true});
const errors=[]; const results=[];
try {
  for (const [width,height] of [[1440,900],[390,844]]) {
    const context = await browser.newContext({viewport:{width,height},acceptDownloads:true});
    const page = await context.newPage();
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(pathToFileURL(resolve('studio/index.html')).href);
    assert.equal(await page.title(),'Hartii — Operator studio');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
    await page.screenshot({path:resolve(folder,`pass1-${width}.png`),fullPage:true});
    await page.getByRole('tab',{name:/Monitoring/}).click();
    await page.getByRole('button',{name:'Heartbeat stale',exact:true}).click();
    assert.match(await page.locator('#termtext').textContent(),/DEGRADED/);
    await page.getByRole('button',{name:'Move Indexer health monitoring up',exact:true}).click();
    await page.locator('#notes').fill('Browser check: focus on transaction operators.');
    await page.reload();
    assert.equal(await page.locator('#notes').inputValue(),'Browser check: focus on transaction operators.');
    assert.equal(await page.locator('.priority').nth(1).getAttribute('data-key'),'watch');
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Export my decisions',exact:true}).click();
    assert.equal((await download).suggestedFilename(),'hartii-operator-decisions.json');
    await page.getByRole('button',{name:'Reset preferences',exact:true}).click();
    await page.getByRole('button',{name:'Next step →',exact:true}).click();
    assert.match(await page.locator('#step-detail').textContent(),/preflight/);
    await page.screenshot({path:resolve(folder,`pass2-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Switch color theme',exact:true}).click();
    await page.screenshot({path:resolve(folder,`dark-${width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    results.push({width,height,overflow:false,controls:'pass',persistence:'pass',export:'pass'});
    await context.close();
  }
} finally { await browser.close(); }
assert.deepEqual(errors,[]);
await writeFile(resolve(folder,'checks.json'),JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results,errors}));
