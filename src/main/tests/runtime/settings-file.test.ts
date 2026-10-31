import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DevBrain, openDevBrain } from '@main/core';
import { getDefaults } from '@main/core/settings/defaults';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import { openFileSettingsStore } from './__mocks__/file-store';

// A settings.json written before a setting was added still opens, and gains that setting's
// default.

let tmpDir: string;
let rootPath: string;
let devBrain: DevBrain | null = null;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-settings-file-'));
  rootPath = path.join(tmpDir, 'brain');
});

afterEach(async () => {
  await devBrain?.close();
  devBrain = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const readSettingsFile = async () =>
  JSON.parse(await fs.readFile(path.join(rootPath, 'settings.json'), 'utf8'));

describe('a settings.json written before calendar.showWeekends', () => {
  beforeEach(async () => {
    const file = getDefaults(rootPath);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { showWeekends, ...calendar } = file.settings.calendar;
    const old = {
      ...file,
      settings: { ...file.settings, calendar: { ...calendar, defaultView: 'month' } },
    };
    await fs.mkdir(rootPath, { recursive: true });
    await fs.writeFile(path.join(rootPath, 'settings.json'), JSON.stringify(old), 'utf8');
    await fs.writeFile(path.join(rootPath, 'workspaces.json'), JSON.stringify({}), 'utf8');
  });

  it('opens, reads showWeekends as its default, and keeps the other settings', async () => {
    devBrain = await openDevBrain({
      settingsStore: openFileSettingsStore,
      path: rootPath,
      workspace: WORKSPACE_OPTIONS,
    });

    expect(devBrain.settings.get('settings.calendar')).toEqual({
      ...getDefaults(rootPath).settings.calendar,
      defaultView: 'month',
      showWeekends: true,
    });
    // written into the file, so the next start reads it there
    expect((await readSettingsFile()).settings.calendar.showWeekends).toBe(true);
  });

  it('keeps a change made after opening at the next open', async () => {
    devBrain = await openDevBrain({
      settingsStore: openFileSettingsStore,
      path: rootPath,
      workspace: WORKSPACE_OPTIONS,
    });
    devBrain.settings.set('settings.calendar.showWeekends', false);
    await devBrain.close();

    devBrain = await openDevBrain({
      settingsStore: openFileSettingsStore,
      path: rootPath,
      workspace: WORKSPACE_OPTIONS,
    });
    expect(devBrain.settings.get('settings.calendar.showWeekends')).toBe(false);
  });
});
