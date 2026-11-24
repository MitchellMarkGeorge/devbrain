import fs from 'node:fs';
import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { createWorkspace, goTo } from '../support/ui';

// A note is the user's file: opening it changes nothing on disk, and an edit rewrites only the
// block that changed (docs/editor.md, "What a save changes").
test('note file: opening leaves it as it is, an edit rewrites only its block', async ({
  devbrain,
}) => {
  let { window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');

  // a note, with a first line to find in its file
  await goTo(window, 'Notes');
  let main = window.getByRole('main');
  await main.getByRole('button', { name: 'New Note' }).first().click();
  await expect(window).toHaveURL(/\/notes\/nte_/);
  const noteId = /\/notes\/(nte_[^/?]+)/.exec(window.url())![1];
  await main.getByRole('textbox', { name: 'Note' }).click();
  await window.keyboard.type('Placeholder body.');
  await goTo(window, 'Notes');
  const workspaceId = workspaceIdOf(window)!;
  await devbrain.quit();

  // its file, rewritten the way another app would write it: `*` bullets, `__bold__`, an
  // underlined heading, a heading straight above its list, three blank lines
  const [{ filePath }] = devbrain.state.query<{ filePath: string }>(
    workspaceId,
    'SELECT file_path AS filePath FROM notes WHERE id = ?',
    noteId,
  );
  const written = [
    'Plans',
    '=====',
    '### Today',
    '* one',
    '* __two__',
    '',
    '',
    '',
    'Last _paragraph_ here',
    '',
  ].join('\n');
  const file = fs.readFileSync(filePath, 'utf8');
  expect(file).toContain('Placeholder body.');
  const stored = file.replace(/Placeholder body\.\n?$/, written);
  fs.writeFileSync(filePath, stored);

  // opened, and left: the file is as it was
  ({ window } = await devbrain.launch());
  main = window.getByRole('main');
  await goTo(window, 'Notes');
  await main.getByRole('grid', { name: 'Notes' }).getByRole('row').first().click();
  const body = main.getByRole('textbox', { name: 'Note' });
  await expect(body.getByRole('heading', { name: 'Plans' })).toBeVisible();
  await goTo(window, 'Notes');
  expect(fs.readFileSync(filePath, 'utf8')).toBe(stored);

  // edited at the end of its last paragraph: only that line changes, and keeps its `_`
  await main.getByRole('grid', { name: 'Notes' }).getByRole('row').first().click();
  await body.getByText('here').click();
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(', edited');
  await goTo(window, 'Notes');
  await expect(main.getByRole('grid', { name: 'Notes' })).toBeVisible();
  await devbrain.quit();
  expect(fs.readFileSync(filePath, 'utf8')).toBe(
    stored.replace('Last _paragraph_ here', 'Last _paragraph_ here, edited'),
  );
});
