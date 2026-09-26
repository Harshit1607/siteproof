// Writes a large, unoptimised hero PNG (a known Speed defect). Deterministic noise.
import { existsSync, writeFileSync } from 'node:fs';
const out = new URL('./public/hero.png', import.meta.url);
if (!existsSync(out)) {
  const { PNG } = await import('pngjs'); // resolved from the siteproof repo root; only needed on first build
  const png = new PNG({ width: 1600, height: 900 });
  let s = 42;
  for (let i = 0; i < png.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = (i / 4) % 1600, y = Math.floor(i / 4 / 1600);
    // Smooth gradient + low-amplitude grain: a photo-like image PNG can't compress (multi-MB) but lossy formats can.
    png.data[i] = 40 + x / 8 + (s & 15); png.data[i + 1] = 60 + y / 5 + ((s >> 4) & 15); png.data[i + 2] = 160 + (x + y) / 30 + ((s >> 8) & 15); png.data[i + 3] = 255;
  }
  writeFileSync(out, PNG.sync.write(png));
}
