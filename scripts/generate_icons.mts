import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

/**
 * Generates the app icons electron-builder packages (buildResources, build/) from the DevBrain
 * logomark (src/renderer/assets/devbrain-logomark.svg): `npm run icons`.
 *
 * - build/icon.png: 1024 px, for Linux (and the source electron-builder falls back to);
 * - build/icon.icns: macOS, 16 to 1024 px;
 * - build/icon.ico: Windows, 16 to 256 px.
 *
 * The mark is drawn flat, in one light neutral, on a dark rounded square with a hairline rim
 * (scripts/icons/render.mjs), on the macOS icon grid (824 of 1024 px, with room for the shadow macOS adds); the Windows sizes fill more of the
 * canvas, as Windows icons do. Chromium draws them (scripts/icons/render.mjs, on Electron), so
 * nothing needs installing; on Linux without a display it runs under xvfb-run.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = path.join(REPO_ROOT, 'src/renderer/assets/devbrain-logomark.svg');
const OUT = path.join(REPO_ROOT, 'build');
const MAC_TILE = 824 / 1024;
const WINDOWS_TILE = 0.94;

// ICNS types holding PNGs, by pixel size (the @2x types share sizes with the 1x ones)
const ICNS_TYPES: [string, number][] = [
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic13', 256], // 128@2x
  ['ic08', 256],
  ['ic14', 512], // 256@2x
  ['ic09', 512],
  ['ic10', 1024], // 512@2x
];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'devbrain-icons-'));
try {
  const macSizes = [...new Set([16, ...ICNS_TYPES.map(([, size]) => size)])];
  const images = [
    ...macSizes.map((size) => `mac-${size}:${size}:${MAC_TILE}`),
    ...ICO_SIZES.map((size) => `win-${size}:${size}:${WINDOWS_TILE}`),
  ];
  render(images);
  const png = (name: string) => readFileSync(path.join(tempDir, `${name}.png`));

  writeFileSync(path.join(OUT, 'icon.png'), png('mac-1024'));
  writeFileSync(
    path.join(OUT, 'icon.icns'),
    icns(ICNS_TYPES.map(([type, size]) => [type, png(`mac-${size}`)])),
  );
  writeFileSync(
    path.join(OUT, 'icon.ico'),
    ico(ICO_SIZES.map((size) => [size, png(`win-${size}`)])),
  );
  console.log(`Wrote icon.png, icon.icns and icon.ico to ${path.relative(REPO_ROOT, OUT)}/`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function render(images: string[]) {
  const script = fileURLToPath(new URL('icons/render.mjs', import.meta.url));
  let command = electronPath as unknown as string;
  let args = [script, SOURCE, tempDir, ...images];
  // Chromium refuses to run as root without --no-sandbox (containers)
  if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    args = ['-a', command, ...args];
    command = 'xvfb-run';
  }
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`drawing the icons failed (${result.status})`);
}

// An ICNS file: its header, then each image as a type, its length with the 8 header bytes, and
// its PNG
function icns(entries: [string, Buffer][]): Buffer {
  const chunks = entries.map(([type, data]) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

// An ICO file of PNGs: a 6-byte header, a 16-byte directory entry per image, then the images
function ico(entries: [number, Buffer][]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const directory = entries.map(([size, data]) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...directory, ...entries.map(([, data]) => data)]);
}
