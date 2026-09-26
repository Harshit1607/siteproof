#!/usr/bin/env node
// Stable full-page screenshots at 390px and 1440px, and pixel comparison between two captures.
//   node screenshot.mjs capture <baseUrl> --pages /,/about --out dir [--hide "#clock,.carousel"]
//   node screenshot.mjs compare <beforeDir> <afterDir> --out diffDir
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const WIDTHS = [390, 1440];
export const shotName = (path, width) => `${path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/[^a-z0-9._-]+/gi, '_')}@${width}.png`;

export async function capture(baseUrl, pages, outDir, { hideSelectors = [] } = {}) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const files = [];
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      for (const path of pages) {
        const page = await ctx.newPage();
        await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle', timeout: 60000 });
        await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}${hideSelectors.length ? `${hideSelectors.join(',')}{visibility:hidden!important}` : ''}` });
        // Scroll through so lazy images load, then wait for fonts and every image.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); }
          window.scrollTo(0, 0);
          await document.fonts.ready;
          await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
        });
        await page.waitForLoadState('networkidle');
        const file = join(outDir, shotName(path, width));
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        files.push(file);
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return files;
}

// Pad to a common size; pixels outside either image count as different.
function pad(png, w, h) {
  if (png.width === w && png.height === h) return png.data;
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out.data;
}

export function diffImages(beforeFile, afterFile, diffFile) {
  const a = PNG.sync.read(readFileSync(beforeFile));
  const b = PNG.sync.read(readFileSync(afterFile));
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(pad(a, w, h), pad(b, w, h), diff.data, w, h, { threshold: 0.1 });
  if (diffFile) writeFileSync(diffFile, PNG.sync.write(diff));
  return n / (w * h);
}

export function compare(beforeDir, afterDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  return readdirSync(beforeDir).filter(f => f.endsWith('.png')).map(name => {
    const after = join(afterDir, name);
    if (!existsSync(after)) return { name, ratio: 1, missing: true };
    const diff = join(outDir, name);
    return { name, ratio: diffImages(join(beforeDir, name), after, diff), before: join(beforeDir, name), after, diff };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { pages: { type: 'string' }, out: { type: 'string' }, hide: { type: 'string' } } });
  const [cmd, a, b] = positionals;
  if (cmd === 'capture' && a && values.out) {
    const files = await capture(a, (values.pages ?? '/').split(','), values.out, { hideSelectors: values.hide ? values.hide.split(',') : [] });
    console.log(JSON.stringify(files, null, 2));
  } else if (cmd === 'compare' && a && b && values.out) {
    console.log(JSON.stringify(compare(a, b, values.out), null, 2));
  } else {
    console.error('usage: screenshot.mjs capture <url> --pages /,/about --out dir [--hide sel,sel] | compare <beforeDir> <afterDir> --out dir');
    process.exit(64);
  }
}
