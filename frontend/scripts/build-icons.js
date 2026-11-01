// Converts brand/icon-driver.svg and brand/icon-provider.svg into the PNG icons each app needs.
// Run from frontend/: npm install, then npm run icons.
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const APPS = [
  { app: 'driver', svg: 'brand/icon-driver.svg', bg: '#FFB400' },
  { app: 'provider', svg: 'brand/icon-provider.svg', bg: '#111111' },
];

function rasterise(svg, size) {
  return sharp(svg, { density: 288 }).resize(size, size).png().toBuffer();
}

for (const { app, svg, bg } of APPS) {
  const svgBuf = await readFile(path.join(publicDir, svg));
  const outDir = path.join(publicDir, app, 'icons');
  await mkdir(outDir, { recursive: true });

  // Standard icons (rounded corners stay transparent).
  await sharp(await rasterise(svgBuf, 192)).toFile(path.join(outDir, 'icon-192.png'));
  await sharp(await rasterise(svgBuf, 512)).toFile(path.join(outDir, 'icon-512.png'));

  // Maskable: full-bleed background colour with the artwork inside the central 80% safe zone.
  const inner = await rasterise(svgBuf, 410);
  await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png()
    .toFile(path.join(outDir, 'icon-maskable-512.png'));

  // iOS home screen: no transparency (iOS would paint transparent corners black).
  await sharp(await rasterise(svgBuf, 180)).flatten({ background: bg }).png().toFile(path.join(outDir, 'apple-touch-icon-180.png'));

  console.log(`[icons] ${app}: icon-192, icon-512, icon-maskable-512, apple-touch-icon-180`);
}
