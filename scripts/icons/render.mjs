// Run by scripts/generate_icons.mts on Electron: draws the app icon at each size asked for, with
// Chromium, and writes the PNGs. Arguments: the logomark SVG, the output folder, then
// <name>:<size>:<tile> for each image, where tile is the share of the canvas the background
// square fills.
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// the dark theme's --background (src/renderer/styles/tokens.css), under the white logomark
const BACKGROUND = '#111111';

const [svgPath, outDir, ...images] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const mark = `data:image/svg+xml;base64,${readFileSync(svgPath).toString('base64')}`;

function page(size, tile) {
  const square = Math.round(size * tile);
  // the macOS icon grid's corner: 185 of an 824 square
  const radius = Math.round(square * 0.225);
  // The mark's viewBox is 40 by 48, its circle 40 across: at 0.7 of the square, the circle spans
  // about 58% of it
  const markHeight = Math.round(square * 0.7);
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${square}px;height:${square}px;border-radius:${radius}px;background:${BACKGROUND};display:grid;place-items:center">
        <img src="${mark}" style="height:${markHeight}px;display:block">
      </div>
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
