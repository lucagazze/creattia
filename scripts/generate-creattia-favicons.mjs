import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'public/images/creattia/avatar-nobg.webp');
const outputDir = path.join(root, 'public/images/creattia');

const variants = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['favicon-48x48.png', 48],
  ['favicon-96x96.png', 96],
  ['apple-touch-icon.png', 180],
  ['mstile-150x150.png', 150],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
  ['moki-favicon-96.png', 96],
  ['moki-full-favicon-32.png', 32],
  ['moki-full-favicon-48.png', 48],
  ['moki-full-favicon-96.png', 96],
  ['moki-apple-touch.png', 180],
  ['moki-full-apple-touch.png', 180],
];

await fs.mkdir(outputDir, { recursive: true });

const pngs = await Promise.all(variants.map(async ([filename, size]) => {
  const buffer = await sharp(source)
    .ensureAlpha()
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  await fs.writeFile(path.join(outputDir, filename), buffer);
  return { filename, size, buffer };
}));

const icoImages = pngs.filter(({ size }) => [16, 32, 48].includes(size));
const headerSize = 6;
const directorySize = icoImages.length * 16;
let offset = headerSize + directorySize;
const directory = Buffer.alloc(directorySize);

icoImages.forEach(({ size, buffer }, index) => {
  const entryOffset = index * 16;
  directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
  directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  directory.writeUInt8(0, entryOffset + 2);
  directory.writeUInt8(0, entryOffset + 3);
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(buffer.length, entryOffset + 8);
  directory.writeUInt32LE(offset, entryOffset + 12);
  offset += buffer.length;
});

const ico = Buffer.concat([
  Buffer.from([0, 0, 1, 0, icoImages.length, 0]),
  directory,
  ...icoImages.map(({ buffer }) => buffer),
]);

await fs.writeFile(path.join(outputDir, 'favicon.ico'), ico);
console.log(`Generated ${variants.length + 1} Creattia favicon assets from ${source}`);
