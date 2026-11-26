// Run by scripts/generate_icons.mts on Electron: draws the app icon at each size asked for, with
// Chromium, and writes the PNGs. Arguments: the logomark SVG, the output folder, then
// <name>:<size>:<tile> for each image, where tile is the share of the canvas the background
// square fills.
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [svgPath, outDir, ...images] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
// the logomark's paths, to be filled with the icon's own neutral instead of white
const markPaths = readFileSync(svgPath, 'utf8')
  .match(/<g[^>]*>([\s\S]*)<\/g>/)[1]
  .trim();

// The icon, drawn on a 48-unit tile, flat: the mark in one light neutral (neutral-200) on a
// rounded square in the app's dark ground (#111111), with no gradient, light, rim or shadow. The
// mark is square (viewBox 40 by 40) and spans 26 of the tile's 48 units.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">
  <rect width="48" height="48" rx="10.8" fill="#111111"/>
  <svg x="11" y="11" width="26" height="26" viewBox="0 0 40 40">
    <g fill="#e5e5e5">${markPaths}</g>
  </svg>
</svg>`;

function page(size, tileShare) {
  const square = Math.round(size * tileShare);
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${square}px;height:${square}px">${tile}</div>
    </div></body></html>`;
}

app.disableHardwareAcceleration();
// each window is closed once drawn: that is not the end
app.on('window-all-closed', () => {});
app
  .whenReady()
  .then(async () => {
    for (const image of images) {
      const [name, sizeText, tileText] = image.split(':');
      const size = Number(sizeText);
      const win = new BrowserWindow({
        show: false,
        width: size,
        height: size,
        useContentSize: true,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: { offscreen: true },
      });
      await win.loadURL(
        `data:text/html;base64,${Buffer.from(page(size, Number(tileText))).toString('base64')}`,
      );
      const captured = await win.webContents.capturePage();
      const png =
        captured.getSize().width === size
          ? captured
          : captured.resize({ width: size, height: size, quality: 'best' });
      writeFileSync(path.join(outDir, `${name}.png`), png.toPNG());
      win.destroy();
    }
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
