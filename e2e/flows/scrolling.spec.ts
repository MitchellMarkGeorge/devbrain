import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { goTo } from '../support/ui';

// Every page has one scroller (docs/design-system/components/Page.md): a list page's list, or a
// Home or document page's PageContent (data-slot="page-scroll"), never the page around them. The
// window is made short, so the seeded pages overflow it.

/** What scrolls in the page's card: each element in it that overflows and scrolls. */
function scrollers(window: Page) {
  return window.getByRole('main').evaluate((main) =>
    Array.from(main.querySelectorAll<HTMLElement>('*'))
      .filter((element) => {
        const { overflowY } = getComputedStyle(element);
        const scrolls = overflowY === 'auto' || overflowY === 'scroll';
        return scrolls && element.scrollHeight > element.clientHeight + 1;
      })
      .map((element) => ({
        slot: element.dataset.slot ?? element.getAttribute('role') ?? '',
        top: Math.round(element.scrollTop),
      })),
  );
}

/** Scrolls the page's one scroller to `top`, as the wheel would. */
async function scrollTo(window: Page, top: number) {
  await window.getByRole('main').evaluate((main, top) => {
    const scroller = Array.from(main.querySelectorAll<HTMLElement>('*')).find(
      (element) =>
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight + 1,
    )!;
    scroller.scrollTop = top;
  }, top);
}

function resize(app: ElectronApplication, width: number, height: number) {
  return app.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()[0].setContentSize(width, height);
    },
    [width, height],
  );
}

test('Pages: one scroller each, at the top on a new page and restored on Back', async ({
  devbrain,
}) => {
  await devbrain.seed();
  const { app, window } = await devbrain.launch();
  await window.getByRole('button', { name: /^Seeded Last opened/ }).click();
  await expect(window.getByRole('button', { name: 'Workspace: Seeded' })).toBeVisible();
  await resize(app, 1100, 420);

  // Home, taller than the window, scrolls in its PageContent
  await goTo(window, 'Home');
  await expect(window.getByRole('main').getByPlaceholder('What needs doing?')).toBeVisible();
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'page-scroll', top: 0 }]);
  // in a tall window nothing scrolls, the column is centred down the page, and no scrollbar is left
  await resize(app, 1100, 1400);
  await expect.poll(() => scrollers(window)).toEqual([]);
  const home = window.locator('[data-slot="page-scroll"]');
  const gap = await home.evaluate((scroller) => {
    const heading = scroller.querySelector('h1')!.getBoundingClientRect();
    const area = scroller.getBoundingClientRect();
    return { above: heading.top - area.top, height: area.height };
  });
  expect(gap.above).toBeGreaterThan(gap.height / 4);
  // the area's only child is its viewport: the scrollbar went with the overflow
  await expect(home.locator('xpath=..').locator('> *')).toHaveCount(1);
  await resize(app, 1100, 420);

  // the task list scrolls itself under the toolbar, which stays put; the page holds no scroller
  await goTo(window, 'Tasks');
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 0 }]);
  const display = window.getByRole('main').getByRole('button', { name: /^Display/ });
  const toolbarTop = (await display.boundingBox())!.y;
  await scrollTo(window, 300);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 300 }]);
  expect((await display.boundingBox())!.y).toBe(toolbarTop);
  await expect(window.locator('[data-slot="page-scroll"]')).toHaveCount(0);

  // a settings page scrolls in its PageContent: the next page starts at its top, Back restores it
  await goTo(window, 'Settings');
  const settings = window.getByRole('navigation', { name: 'Settings' });
  await settings.getByRole('link', { name: 'Preferences' }).click();
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'page-scroll', top: 0 }]);
  await scrollTo(window, 120);
  await settings.getByRole('link', { name: 'Tasks' }).click();
  await expect(window).toHaveURL(/\/settings\/tasks$/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'page-scroll', top: 0 }]);
  await window.goBack();
  await expect(window).toHaveURL(/\/settings\/preferences$/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'page-scroll', top: 120 }]);
  await window.getByRole('button', { name: 'Back to app' }).click();

  // a project's Overview scrolls in its tab, under the tabs; another project's starts at the top,
  // and Back comes back to where it was
  await goTo(window, 'Projects');
  const projects = window.getByRole('main').getByRole('row');
  await projects.nth(1).click();
  const overview = window.getByTestId('project-overview');
  await expect(overview).toBeVisible();
  await expect.poll(() => scrollers(window)).toEqual([{ slot: '', top: 0 }]);
  const tabs = window.getByRole('main').getByRole('tablist', { name: 'Project' });
  const tabsTop = (await tabs.boundingBox())!.y;
  await scrollTo(window, 200);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: '', top: 200 }]);
  expect((await tabs.boundingBox())!.y).toBe(tabsTop);
  await goTo(window, 'Projects');
  await projects.nth(2).click();
  await expect(overview).toBeVisible();
  await expect.poll(() => scrollers(window)).toEqual([{ slot: '', top: 0 }]);
  await window.goBack();
  await window.goBack();
  await expect(overview).toBeVisible();
  await expect.poll(() => scrollers(window)).toEqual([{ slot: '', top: 200 }]);
});
