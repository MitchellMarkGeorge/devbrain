import { test, expect } from '../support/fixtures';
import { createWorkspace, goTo } from '../support/ui';

test("a note's contents: listed in the margin, a click jumps to the heading", async ({
  devbrain,
}) => {
  const { app, window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');
  // wide enough for the margin to hold the contents
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900);
  });

  await goTo(window, 'Notes');
  const main = window.getByRole('main');
  await main.getByRole('button', { name: 'New Note' }).first().click();
  await expect(main.getByRole('heading', { name: 'Title' })).toBeFocused();
  await window.keyboard.press('Enter');
  for (const section of ['Context', 'Design', 'Rollout']) {
    await window.keyboard.type(`## ${section}`);
    await window.keyboard.press('Enter');
    for (let line = 0; line < 8; line++) {
      await window.keyboard.type(`Line ${line} about ${section.toLowerCase()}.`);
      await window.keyboard.press('Enter');
    }
  }

  const contents = window.getByRole('navigation', { name: 'Contents' });
  await expect(contents.getByRole('button')).toHaveText(['Context', 'Design', 'Rollout']);

  await contents.getByRole('button', { name: 'Design' }).click();
  await expect(contents.getByRole('button', { name: 'Design' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await contents.getByRole('button', { name: 'Context' }).click();
  await expect(main.getByRole('heading', { name: 'Context' })).toBeInViewport();
  await expect(contents.getByRole('button', { name: 'Context' })).toHaveAttribute(
    'aria-current',
    'location',
  );
});
