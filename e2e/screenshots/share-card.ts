import fs from 'node:fs/promises';
import path from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { REPO_ROOT } from '../support/paths';

/**
 * The website's share image (og:image, website/README.md): the card a link to the site shows in
 * Slack, X, LinkedIn and the like. 1200x630, the size those expect, drawn in the app's dark theme
 * with its tokens, typeface and logomark, beside the task list just captured.
 *
 * It's drawn in a hidden window of the app under test, so it needs no other browser: the page is
 * one self-contained data: URL (tokens, fonts and images inlined), captured with capturePage.
 */

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

const read = (relative: string) => fs.readFile(path.join(REPO_ROOT, relative));
const dataUrl = (bytes: Buffer, type: string) => `data:${type};base64,${bytes.toString('base64')}`;

async function shareCardHtml(screenshotPath: string): Promise<string> {
  const [tokens, logomark, inter400, inter600, screenshot] = await Promise.all([
    read('src/renderer/styles/tokens.css'),
    read('src/renderer/assets/devbrain-logomark.svg'),
    read('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2'),
    read('node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2'),
    fs.readFile(screenshotPath),
  ]);
  const font = (weight: number, bytes: Buffer) =>
    `@font-face { font-family: 'Inter'; font-weight: ${weight};
       src: url(${dataUrl(bytes, 'font/woff2')}) format('woff2'); }`;
  return `<!doctype html>
<html data-theme="dark">
<head>
<meta charset="utf-8">
<style>
${tokens.toString()}
${font(400, inter400)}
${font(600, inter600)}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${SHARE_WIDTH}px; height: ${SHARE_HEIGHT}px; overflow: hidden; }
body {
  background: var(--background);
  color: var(--foreground-strong);
  font-family: 'Inter', sans-serif;
  position: relative;
}
.text { position: absolute; left: 72px; top: 72px; width: 470px; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; }
.brand svg { width: 34px; height: 34px; }
.brand g { fill: var(--foreground-strong); }
h1 { margin-top: 112px; font-size: 54px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em; }
p { margin-top: 24px; font-size: 23px; line-height: 1.4; color: var(--muted-foreground); }
.site { position: absolute; left: 72px; bottom: 64px; font-size: 20px; color: var(--muted-foreground); }
.shot {
  position: absolute; left: 600px; top: 96px; width: 960px;
  border: 1px solid var(--edge); border-radius: 14px; box-shadow: var(--shadow-2xl);
}
</style>
</head>
<body>
  <div class="text">
    <div class="brand">${logomark.toString()}DevBrain</div>
    <h1>The second brain for developers</h1>
    <p>Your tasks, projects, notes and calendar, in one local-first desktop app.</p>
  </div>
  <div class="site">devbrainapp.dev</div>
  <img class="shot" src="${dataUrl(screenshot, 'image/png')}" alt="">
</body>
</html>`;
}

/** Draws the share card in a hidden window of `app` and writes it to `outPath` as a PNG. */
export async function captureShareCard(
  app: ElectronApplication,
  screenshotPath: string,
  outPath: string,
): Promise<void> {
  const html = await shareCardHtml(screenshotPath);
  const png = await app.evaluate(
    async ({ BrowserWindow }, { html, width, height }) => {
      const win = new BrowserWindow({ show: false, width, height, useContentSize: true });
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        // the inlined fonts and the screenshot, decoded before the capture
        await win.webContents.executeJavaScript(
          'Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())])',
        );
        const image = await win.webContents.capturePage();
        // captured at the display's scale (2x here): stored at the size share cards expect
        return image.resize({ width, height, quality: 'best' }).toPNG().toString('base64');
      } finally {
        win.destroy();
      }
    },
    { html, width: SHARE_WIDTH, height: SHARE_HEIGHT },
  );
  await fs.writeFile(outPath, Buffer.from(png, 'base64'));
}
