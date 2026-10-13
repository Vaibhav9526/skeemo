'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..');

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const directory = entries.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...directory, ...entries.map(({ data }) => data)]);
}

function buildIcns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

async function main() {
  const image = await loadImage(path.join(root, 'reference/logo.png'));
  if (image.width !== image.height) throw new Error('The app logo must be square.');
  const raster = (size) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, size, size);
    return canvas.toBuffer('image/png');
  };
  const outputs = [
    ['icon.svg', await fs.readFile(path.join(root, 'reference/logo.svg'))],
    ['icon.png', raster(1024)],
    ['icon.ico', buildIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, data: raster(size) })))],
    ['icon.icns', buildIcns([['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, size]) => ({ type, data: raster(size) })))],
  ];
  for (const [name, data] of outputs) {
    await fs.writeFile(path.join(root, 'build', name), data);
    console.log(`[brand-assets] reference/logo → build/${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
