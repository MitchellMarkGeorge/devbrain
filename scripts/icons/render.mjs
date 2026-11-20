// Run by scripts/generate_icons.mts on Electron: draws the app icon at each size asked for, with
// Chromium, and writes the PNGs. Arguments: the logomark SVG, the output folder, then
// <name>:<size>:<tile> for each image, where tile is the share of the canvas the background
// square fills.
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [svgPath, outDir, ...images] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
// the logomark's paths, to be filled with chrome instead of flat white
const markPaths = readFileSync(svgPath, 'utf8')
  .match(/<g[^>]*>([\s\S]*)<\/g>/)[1]
  .trim();

// The icon, drawn on a 48-unit tile. The mark is polished chrome: a fill that reflects a soft,
// even light, gently bevelled edges from a light above, and a
// contact shadow. It sits on a dark tile with a faint cool glow behind it, a soft light from
// above and a hairline rim. The mark's viewBox is 40 by 48: 0.7 of the
// tile high, its circle spans about 58% of it.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">
  <defs>
    <clipPath id="tile"><rect width="48" height="48" rx="10.8"/></clipPath>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
      <stop stop-color="#202226"/>
      <stop offset="1" stop-color="#111214"/>
    </linearGradient>
    <radialGradient id="glow" cx="24" cy="25" r="20" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7fa6ff" stop-opacity="0.08"/>
      <stop offset="0.5" stop-color="#5470c8" stop-opacity="0.025"/>
      <stop offset="1" stop-color="#5b7fd6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gloss" cx="24" cy="-6" r="30" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.2"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="0.8" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
    <linearGradient id="chrome" x1="8" y1="4" x2="32" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f4f5f7"/>
      <stop offset="0.3" stop-color="#dcdfe3"/>
      <stop offset="0.5" stop-color="#b4b7bc"/>
      <stop offset="0.7" stop-color="#cfcecb"/>
      <stop offset="1" stop-color="#c4c2be"/>
    </linearGradient>
    <filter id="metal" x="-4" y="-4" width="48" height="58" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <!-- contact shadow -->
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/>
      <feOffset dy="2" result="blur"/>
      <feColorMatrix in="blur" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" result="shadow"/>
      <!-- bevel: a light from above glancing off the rounded edges -->
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.55" result="bump"/>
      <feSpecularLighting in="bump" surfaceScale="1.4" specularConstant="0.5" specularExponent="40" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="250" elevation="32"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <!-- shade the lower edges -->
      <feOffset in="SourceAlpha" dy="-0.6" result="up"/>
      <feComposite in="SourceAlpha" in2="up" operator="out" result="lowerEdge"/>
      <feGaussianBlur in="lowerEdge" stdDeviation="0.3"/>
      <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"/>
      <feComposite in2="SourceAlpha" operator="in" result="edgeShade"/>
      <feComposite in="specIn" in2="SourceGraphic" operator="arithmetic" k2="0.25" k3="1" result="lit"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="lit"/>
        <feMergeNode in="edgeShade"/>
      </feMerge>
    </filter>
    <filter id="inner" x="0" y="-3" width="48" height="54" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="alpha"/>
      <feOffset dy="-2"/><feGaussianBlur stdDeviation="1.5"/>
      <feComposite in2="alpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"/>
      <feBlend in2="SourceGraphic"/>
    </filter>
  </defs>
  <g filter="url(#inner)">
    <g clip-path="url(#tile)">
      <rect width="48" height="48" fill="url(#base)"/>
      <rect width="48" height="48" fill="url(#glow)"/>
      <svg x="10" y="7.2" width="28" height="33.6" viewBox="0 0 40 48" overflow="visible">
        <g fill="url(#chrome)" filter="url(#metal)">${markPaths}</g>
      </svg>
      <rect width="48" height="48" fill="url(#gloss)"/>
    </g>
  </g>
  <rect x="0.4" y="0.4" width="47.2" height="47.2" rx="10.4" fill="none" stroke="url(#rim)" stroke-width="0.5"/>
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
