import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import {
  createTask,
  createWorkspace,
  goTo,
  search,
  switchWorkspace,
  workspaceButton,
} from '../support/ui';

// Every page has one scroller (docs/design-system/components/Page.md): a list page's list, or a
// Home or document page's PageContent (data-slot="page-scroll"), never the page around them. The
// router keeps where each page scrolled by its path: a page starts at its top the first time it is
// shown, and is where it was left however it is gone back to (Back, the sidebar, a search result),
// with its view and filters. A sheet opened over a page leaves
// it where it is. The window is made short, so the seeded pages overflow it.

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

/** Picks a layout in the page toolbar's Display (List, Board), and closes it again. */
async function chooseView(window: Page, name: string) {
  const display = window.getByRole('main').getByRole('button', { name: /^Display/ });
  await display.click();
  await window
    .getByRole('group', { name: 'Layout' })
    .getByRole('button', { name, exact: true })
    .click();
  await display.click();
}

/** Groups the list from the page toolbar's Display (a grouping, or None), and closes it again. */
async function groupBy(window: Page, name: string) {
  const display = window.getByRole('main').getByRole('button', { name: /^Display/ });
  await display.click();
  await window.getByRole('combobox', { name: 'Group by' }).click();
  await window.getByRole('option', { name, exact: true }).click();
  await display.click();
}

/** Scrolls the page's one scroller to `top`, and waits for the router to hear it (by its event). */
async function scrollAndSettle(window: Page, top: number) {
  await scrollTo(window, top);
  await window.waitForTimeout(300);
}

function resize(app: ElectronApplication, width: number, height: number) {
  return app.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()[0].setContentSize(width, height);
    },
    [width, height],
  );
}

test('Pages: one scroller each, at the top when first shown, where it was left when gone back to, kept for a sheet', async ({
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
  // the next list starts at its top, not where the last one was; Back comes back to it
  await goTo(window, 'Notes');
  await expect(window).toHaveURL(/\/notes/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 0 }]);
  await window.goBack();
  await expect(window).toHaveURL(/\/tasks/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 300 }]);
  // the sidebar agrees with Back: a section gone back to from it is where it was left...
  await goTo(window, 'Notes');
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 0 }]);
  await goTo(window, 'Tasks');
  await expect(window).toHaveURL(/\/tasks$/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 300 }]);
  // ...with its view as it was left
  await chooseView(window, 'Board');
  await expect(window).toHaveURL(/\/tasks\?view=board$/);
  await goTo(window, 'Home');
  await goTo(window, 'Tasks');
  await expect(window).toHaveURL(/\/tasks\?view=board$/);
  await chooseView(window, 'List');
  // the grouped list's scroller is where the plain list's is, and never takes its place
  await scrollAndSettle(window, 300);
  await groupBy(window, 'Project');
  await expect(window).toHaveURL(/view=group/);
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 0 }]);
  await groupBy(window, 'None');
  await expect.poll(() => scrollers(window)).toEqual([{ slot: 'grid', top: 300 }]);

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

  // a task page scrolled down stays where it is when its note opens in the sheet beside it, and
  // when Back closes the sheet
  await createTask(window, { title: 'A long task' });
  const results = await search(window, 'A long task');
  await results
    .getByRole('listbox')
    .getByRole('option', { name: /A long task/ })
    .click();
  await expect(window).toHaveURL(/\/tasks\/tsk_/);
  const description = window.getByRole('main').getByRole('textbox', { name: 'Description' });
  await description.click();
  for (let line = 1; line <= 30; line++) await window.keyboard.type(`Line ${line}\n`);
  // the last of the page, where Add a task note is
  await scrollTo(window, 100_000);
  const [{ top }] = await scrollers(window);
  expect(top).toBeGreaterThan(0);
  await window.getByRole('main').getByRole('button', { name: 'Add a task note' }).click();
  await expect(window).toHaveURL(/\?note=/);
  // the slot gives way to the note's card, which moves the page a little; it isn't thrown to the top
  const pageTop = async () => (await scrollers(window))[0]?.top ?? 0;
  await expect.poll(pageTop).toBeGreaterThan(top - 40);
  // Back restores the page as it was when the sheet opened
  await window.goBack();
  await expect(window).not.toHaveURL(/\?note=/);
  await expect.poll(pageTop).toBeGreaterThan(top - 40);

  // a detail page is a place too: opened again from search, it is where it was left
  const taskPage = window.url();
  await goTo(window, 'Tasks');
  await expect(window).toHaveURL(/\/tasks(\?|$)/);
  const again = await search(window, 'A long task');
  await again
    .getByRole('listbox')
    .getByRole('option', { name: /A long task/ })
    .click();
  await expect(window).toHaveURL(taskPage);
  await expect.poll(pageTop).toBeGreaterThan(top - 40);

  // another workspace and back: a section's view is as it was left. (Its place is too when its
  // content is there as the router restores it; a workspace opened again loads it afresh, so it
  // isn't checked here.)
  await goTo(window, 'Tasks');
  await chooseView(window, 'Board');
  await workspaceButton(window).click();
  await window.getByRole('menuitem', { name: 'New workspace…' }).click();
  await createWorkspace(window, 'Other');
  await switchWorkspace(window, 'Seeded');
  await expect(window).toHaveURL(/\/tasks/);
  await goTo(window, 'Home');
  await expect(window).toHaveURL(/\/home/);
  await goTo(window, 'Tasks');
  await expect(window).toHaveURL(/\/tasks\?view=board$/);
});
