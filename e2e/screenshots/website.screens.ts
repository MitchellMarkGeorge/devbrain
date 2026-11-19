import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { REPO_ROOT } from '../support/paths';
import { goTo } from '../support/ui';

/**
 * The website's screenshots of the app (website/README.md): the built app over the showcase
 * workspace (scripts/setup_showcase_workspace.mts), each page in dark and light, written to
 * website/src/assets/screenshots/<page>-<theme>.png. Run with `npm run website:screenshots`.
 */

const OUT_DIR = path.join(REPO_ROOT, 'website/src/assets/screenshots');
// the window's size in CSS pixels, drawn at 2x
const WIDTH = 1440;
const HEIGHT = 900;

const PAGES: { name: string; open: (window: Page) => Promise<void> }[] = [
  {
    name: 'tasks',
    open: async (window) => {
      await goTo(window, 'Tasks');
      await window.getByRole('main').getByLabel('List', { exact: true }).click();
    },
  },
  {
    name: 'board',
    open: async (window) => {
      await goTo(window, 'Tasks');
      await window.getByRole('main').getByLabel('Board', { exact: true }).click();
      await expect(window).toHaveURL(/view=board/);
    },
  },
  {
    name: 'project',
    open: async (window) => {
      await goTo(window, 'Projects');
      await window.getByRole('main').getByText('Billing v2', { exact: true }).first().click();
      await expect(window.getByRole('main').getByRole('heading', { name: 'Name' })).toHaveText(
        'Billing v2',
      );
    },
  },
  {
    name: 'note',
    open: async (window) => {
      await goTo(window, 'Notes');
      await window.getByRole('main').getByText('Proration rules', { exact: true }).first().click();
      await expect(window.getByRole('main')).toContainText('Credit the unused days');
    },
  },
  { name: 'calendar', open: (window) => goTo(window, 'Calendar') },
];

test('website screenshots', async ({ devbrain }) => {
  // the seed's dates and the app's (support/app.ts) in one zone, so "today" is the same day
  process.env.TZ = process.env.E2E_TZ ?? 'UTC';
  await devbrain.seed({ dataset: 'showcase', name: 'Acme' });
  // drawn at 2x, whatever the display it runs on
  const { app, window } = await devbrain.launch({ args: ['--force-device-scale-factor=2'] });
  await window.getByRole('button', { name: /^Acme Last opened/ }).click();
  await expect(window.getByRole('button', { name: 'Workspace: Acme' })).toBeVisible();

  // The window's clock, pinned to 10:40 on a weekday of the showcase week (today, or Friday at a
  // weekend), whenever this runs: the calendar's "Up next" card shows the next meeting, the "now"
  // line sits in the morning, and every capture is of the same moment.
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7; // Monday 0 … Sunday 6
  const shown = new Date(now);
  shown.setDate(now.getDate() - Math.max(0, weekday - 4));
  shown.setHours(10, 40, 0, 0);
  await window.context().clock.setFixedTime(shown);
  await window.reload();
  await expect(window.getByRole('button', { name: 'Workspace: Acme' })).toBeVisible();

  await app.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()[0].setContentSize(width, height);
    },
    [WIDTH, HEIGHT],
  );

  // every page once first, so the sidebar's Recents are the same in every capture
  for (const page of PAGES) await page.open(window);

  for (const theme of ['dark', 'light'] as const) {
    // as the theme setting does: main sets the system's theme, the page pins its own
    // (src/main/runtime/theme.ts, src/renderer/app/theme.tsx)
    await app.evaluate(({ nativeTheme }, source) => {
      nativeTheme.themeSource = source;
    }, theme);
    await window.evaluate((name) => {
      document.documentElement.dataset.theme = name;
    }, theme);
    for (const page of PAGES) {
      await page.open(window);
      // the pointer out of the way, so nothing shows a hover
      await window.mouse.move(WIDTH - 1, HEIGHT - 1);
      // fonts, and any list or calendar that draws after its data arrives
      await window.evaluate(() => document.fonts.ready);
      await window.waitForTimeout(800);
      await window.screenshot({ path: path.join(OUT_DIR, `${page.name}-${theme}.png`) });
    }
  }
});
