import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { createWorkspace, goTo } from '../support/ui';

function settingsPage(window: Page) {
  const main = window.getByRole('main');
  const timeFormat = main.getByRole('group', { name: 'Time format' });
  return {
    nav: window.getByRole('navigation', { name: 'Settings' }),
    twentyFourHour: timeFormat.getByRole('button', { name: '24-hour' }),
    twelveHour: timeFormat.getByRole('button', { name: '12-hour' }),
    hideWeekends: main.getByRole('switch', { name: 'Hide weekends' }),
  };
}

test('Settings: time format and Hide weekends stick across a relaunch', async ({ devbrain }) => {
  let { window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');

  await goTo(window, 'Settings');
  let page = settingsPage(window);
  await page.nav.getByRole('link', { name: 'Preferences' }).click();
  await page.twentyFourHour.click();
  await expect(page.twentyFourHour).toHaveAttribute('aria-pressed', 'true');

  await page.nav.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.hideWeekends).not.toBeChecked();
  await page.hideWeekends.click();
  await expect(page.hideWeekends).toBeChecked();

  // relaunch: the app reopens on the Calendar settings, its last page
  ({ window } = await devbrain.relaunch());
  page = settingsPage(window);
  await expect(window).toHaveURL(/\/settings\/calendar$/);
  await expect(page.hideWeekends).toBeChecked();
  await page.nav.getByRole('link', { name: 'Preferences' }).click();
  await expect(page.twentyFourHour).toHaveAttribute('aria-pressed', 'true');
  await expect(page.twelveHour).toHaveAttribute('aria-pressed', 'false');

  // the week view shows Monday to Friday
  await window.getByRole('button', { name: 'Back to app' }).click();
  await goTo(window, 'Calendar');
  const main = window.getByRole('main');
  const days = main.getByRole('columnheader');
  await expect(days).toHaveCount(5);
  await expect(days.first()).toHaveText(/^Mon/);
  await expect(days.last()).toHaveText(/^Fri/);

  await devbrain.quit();
  const { settings } = devbrain.state.settings();
  expect(settings.general.timeFormat).toBe('24');
  expect(settings.calendar.hideWeekends).toBe(true);
});
