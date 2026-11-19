import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { REPO_ROOT } from '../support/paths';
import { goTo, search } from '../support/ui';
import { captureShareCard } from './share-card';

/**
 * The website's screenshots of the app (website/README.md): the built app over the showcase
 * workspace (scripts/setup_showcase_workspace.mts), each page in dark and light, written to
 * website/src/assets/screenshots/<page>-<theme>.png, then the share image (share-card.ts) to
 * website/public/og.png. Run with `npm run website:screenshots`.
 */

const OUT_DIR = path.join(REPO_ROOT, 'website/src/assets/screenshots');
// the window's size in CSS pixels, drawn at 2x
const WIDTH = 1440;
const HEIGHT = 900;

/** Clicks a task, note or project by its title in the page's main area. */
async function openByTitle(window: Page, title: string): Promise<void> {
  await window.getByRole('main').getByText(title, { exact: true }).first().click();
}

/** Picks a view in the page toolbar's View switch (List, Board, Cards, …). */
async function chooseView(window: Page, name: string): Promise<void> {
  await window.getByRole('main').getByLabel(name, { exact: true }).click();
}

// Each page starts from wherever the one before it left off, so each opens its own page first
const PAGES: {
  name: string;
  open: (window: Page) => Promise<void>;
  close?: (window: Page) => Promise<void>;
}[] = [
  {
    name: 'home',
    open: async (window) => {
      await goTo(window, 'Home');
      await expect(window.getByRole('main').getByPlaceholder('What needs doing?')).toBeVisible();
    },
  },
  {
    name: 'tasks',
    open: async (window) => {
      await goTo(window, 'Tasks');
      await chooseView(window, 'List');
    },
  },
  {
    name: 'board',
    open: async (window) => {
      await goTo(window, 'Tasks');
      await chooseView(window, 'Board');
      await expect(window).toHaveURL(/view=board/);
    },
    close: (window) => chooseView(window, 'List'),
  },
  {
    name: 'task',
    open: async (window) => {
      await goTo(window, 'Tasks');
      await openByTitle(window, 'Ship proration for mid-cycle plan changes');
      await expect(window.getByRole('main')).toContainText('Subtasks');
    },
  },
  {
    name: 'projects',
    open: async (window) => {
      await goTo(window, 'Projects');
      await chooseView(window, 'Cards');
    },
    close: (window) => chooseView(window, 'List'),
  },
  {
    name: 'project',
    open: async (window) => {
      await goTo(window, 'Projects');
      await openByTitle(window, 'Billing v2');
      await expect(window.getByRole('main').getByRole('heading', { name: 'Name' })).toHaveText(
        'Billing v2',
      );
    },
  },
  {
    name: 'note',
    open: async (window) => {
      await goTo(window, 'Notes');
      await openByTitle(window, 'Proration rules');
      await expect(window.getByRole('main')).toContainText('Credit the unused days');
    },
  },
  { name: 'calendar', open: (window) => goTo(window, 'Calendar') },
  {
    name: 'event',
    open: async (window) => {
      await goTo(window, 'Calendar');
      await openByTitle(window, 'Onboarding usability test');
      await expect(window.getByText('Event note')).toBeVisible();
    },
    close: (window) => window.getByRole('button', { name: 'Close' }).click(),
  },
  {
    name: 'search',
    open: async (window) => {
      await goTo(window, 'Home');
      const results = await search(window, 'proration');
      await expect(results.getByRole('listbox').getByRole('option').first()).toBeVisible();
    },
    close: (window) => window.keyboard.press('Escape'),
  },
  {
    name: 'shortcuts',
    open: async (window) => {
      await goTo(window, 'Home');
      await window.keyboard.press('?');
      await expect(window.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    },
    close: (window) => window.keyboard.press('Escape'),
  },
  {
    name: 'settings',
    open: async (window) => {
      await goTo(window, 'Settings');
      await window
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('link', { name: 'Preferences' })
        .click();
    },
    close: (window) => window.getByRole('button', { name: 'Back to app' }).click(),
  },
  {
    name: 'integrations',
    open: async (window) => {
      await goTo(window, 'Settings');
      await window
        .getByRole('navigation', { name: 'Settings' })
        .getByRole('link', { name: 'Integrations' })
        .click();
    },
    close: (window) => window.getByRole('button', { name: 'Back to app' }).click(),
  },
];

test('website screenshots', async ({ devbrain }) => {
  // the seed's dates and the app's (support/app.ts) in one zone, so "today" is the same day
  process.env.TZ = process.env.E2E_TZ ?? 'UTC';

  // The window's clock, pinned to 10:40 on a weekday of the showcase week (today, or Friday at a
  // weekend), whenever this runs: the calendar's "Up next" card shows the next meeting, the "now"
  // line sits in the morning, and every capture is of the same moment.
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7; // Monday 0 … Sunday 6
  const shown = new Date(now);
  shown.setDate(now.getDate() - Math.max(0, weekday - 4));
  shown.setHours(10, 40, 0, 0);
  // the workspace made just before that moment, so nothing reads as edited "in 7h"
  await devbrain.seed({ dataset: 'showcase', name: 'Acme', now: shown });
  // drawn at 2x, whatever the display it runs on
  const { app, window } = await devbrain.launch({ args: ['--force-device-scale-factor=2'] });
  await window.getByRole('button', { name: /^Acme Last opened/ }).click();
  await expect(window.getByRole('button', { name: 'Workspace: Acme' })).toBeVisible();

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
  for (const page of PAGES) {
    await page.open(window);
    await page.close?.(window);
  }

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
      await page.close?.(window);
    }
  }

  // the site's share image (og:image), beside the dark task list just taken
  await captureShareCard(
    app,
    path.join(OUT_DIR, 'tasks-dark.png'),
    path.join(REPO_ROOT, 'website/public/og.png'),
  );
});
