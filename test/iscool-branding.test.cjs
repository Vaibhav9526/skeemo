'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const raster = async (size) => {
  const image = await loadImage(path.join(root, 'reference/skeemo-logo.png'));
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, size, size);
  return canvas.toBuffer('image/png');
};

test('renderer and main-process builds use the supplied IsCool logo', () => {
  assert.match(read('electron.vite.config.ts'), /'@brand': resolve\(__dirname, 'reference'\)/);
  assert.deepEqual(JSON.parse(read('tsconfig.web.json')).compilerOptions.paths['@brand/*'], ['reference/*']);
  for (const file of ['electron.vite.config.ts', 'tools/copy-main-assets.cjs']) {
    assert.match(read(file), /\['reference\/skeemo-logo\.png', 'out\/main\/logo\.png'\]/);
  }
  assert.match(read('src/main/index.ts'), /icon: join\(__dirname, 'logo\.png'\)/);
});

test('visible logo labels identify IsCool', () => {
  assert.match(read('src/renderer/src/main.tsx'), /img\.alt = 'Skeemo'/);
  for (const file of ['App.tsx', 'components/classroom/ClassroomFocus.tsx', 'components/classroom/OfficeFocus.tsx']) {
    const source = read(`src/renderer/src/${file}`);
    assert.match(source, /src=\{brandLogo\}\s+alt="IsCool"/);
    assert.doesNotMatch(source, /src=\{brandLogo\}\s+alt="Jargon"/);
  }
});

test('README leads with the Skeemo logo and has the main sections', () => {
  const source = read('README.md');
  assert.match(source, /<img src="reference\/skeemo-logo\.png" alt="Skeemo logo"/);
  for (const section of ['What you can do', 'Three rooms', 'Privacy', 'Run it', 'License']) {
    assert.ok(source.includes(`## ${section}`), section);
  }
});

test('packaged PNG and SVG preserve the supplied artwork', async () => {
  assert.ok(fs.readFileSync(path.join(root, 'build/icon.png')).equals(await raster(1024)), 'PNG matches the supplied logo');
  assert.ok(fs.readFileSync(path.join(root, 'build/icon.svg')).equals(fs.readFileSync(path.join(root, 'reference/skeemo-logo.svg'))), 'SVG matches the supplied logo');
});

test('Windows icon includes correctly sized IsCool PNG entries', async () => {
  const ico = fs.readFileSync(path.join(root, 'build/icon.ico'));
  const sizes = [16, 32, 48, 64, 128, 256];
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), sizes.length);
  let offset = 6 + sizes.length * 16;
  for (const [i, size] of sizes.entries()) {
    const at = 6 + i * 16;
    assert.equal(ico[at], size === 256 ? 0 : size);
    assert.equal(ico[at + 1], ico[at]);
    assert.equal(ico.readUInt16LE(at + 4), 1);
    assert.equal(ico.readUInt16LE(at + 6), 32);
    const length = ico.readUInt32LE(at + 8);
    assert.equal(ico.readUInt32LE(at + 12), offset);
    assert.ok(ico.subarray(offset, offset + length).equals(await raster(size)), `${size}px ICO entry matches the supplied logo`);
    offset += length;
  }
  assert.equal(offset, ico.length);
});

test('macOS icon includes IsCool PNG chunks from 128 to 1024 pixels', async () => {
  const icns = fs.readFileSync(path.join(root, 'build/icon.icns'));
  assert.equal(icns.toString('ascii', 0, 4), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  let offset = 8;
  for (const [type, size] of [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
    assert.equal(icns.toString('ascii', offset, offset + 4), type);
    const length = icns.readUInt32BE(offset + 4);
    assert.ok(icns.subarray(offset + 8, offset + length).equals(await raster(size)), `${size}px ICNS chunk matches the supplied logo`);
    offset += length;
  }
  assert.equal(offset, icns.length);
});
