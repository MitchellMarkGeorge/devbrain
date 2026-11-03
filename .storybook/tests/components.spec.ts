import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const index = JSON.parse(
  readFileSync(new URL('../../storybook-static/index.json', import.meta.url), 'utf8'),
) as { entries: Record<string, { id: string; type: string; name: string }> };
const stories = Object.values(index.entries).filter(
  (entry) => entry.type === 'story' && entry.name === 'Default',
);
for (const story of stories) {
  test(`renders ${story.id}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await expect(page.locator('#storybook-root > *').first()).toBeVisible();
    await expect(page.locator('.sb-errordisplay')).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
for (const theme of ['dark', 'light']) {
  test(`workspace accessibility in ${theme}`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=examples-workspace--default&viewMode=story&globals=theme:${theme}`,
    );
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
test('task selection, status shortcuts, responsive sidebar, and sheet in a browser', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=planning-tasklist--default&viewMode=story');
  const firstRow = page.getByRole('row').first();
  await firstRow.focus();
  await page.keyboard.press('x');
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('s');
  await page.keyboard.press('3');
  await expect(firstRow.getByRole('img', { name: 'completed', exact: true })).toBeVisible();
  await page.goto('/iframe.html?id=navigation-sidebar--default&viewMode=story');
  await page.setViewportSize({ width: 980, height: 720 });
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/iframe.html?id=overlays-sheet--default&viewMode=story');
  await page.getByRole('button', { name: 'Open Details' }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
