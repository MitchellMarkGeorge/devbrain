import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appSettingsSchema, settingsFileSchema, type SettingsFile } from '@common/types';
import { openDevBrain, type DevBrain } from '@main/core';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import { openElectronSettingsStore } from '../../runtime/settings-store';

// A settings.json written before a setting was added, opened by this version through the app's own
// electron-store, which fills in defaults only at the top level: the setting reads as its default,
// and the file gets it.

let tmpDir: string;
let rootPath: string;
let devBrain: DevBrain | null = null;

const open = (createIfMissing: boolean) =>
  openDevBrain({
    settingsStore: openElectronSettingsStore,
    path: rootPath,
    createIfMissing,
    workspace: WORKSPACE_OPTIONS,
  });

const settingsFile = () => path.join(rootPath, 'settings.json');
const readFile = async () => JSON.parse(await fs.readFile(settingsFile(), 'utf8'));

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-settings-'));
  rootPath = path.join(tmpDir, 'brain');
});

afterEach(async () => {
  await devBrain?.close();
  devBrain = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// a DevBrain folder whose settings.json is what `edit` makes of the one this version writes
async function folderWithOldFile(edit: (file: SettingsFile) => unknown): Promise<void> {
  await fs.rm(rootPath, { recursive: true, force: true });
  await (await open(true)).close();
  await fs.writeFile(settingsFile(), JSON.stringify(edit(await readFile())));
}

// `record` without `key`
function without<T extends object, K extends keyof T>(record: T, key: K): Omit<T, K> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

describe('an old settings file', () => {
  it('opens, reading settings added since as their defaults and keeping the values it has', async () => {
    // no calendar.hideWeekends, no tasks group, no state, and a setting the user changed
    await folderWithOldFile(({ settings }) => ({
      settings: {
        ...without(settings, 'tasks'),
        calendar: { ...without(settings.calendar, 'hideWeekends'), firstDayOfWeek: 'sunday' },
      },
    }));

    devBrain = await open(false);

    expect(devBrain.settings.get('settings.calendar')).toEqual({
      defaultEventDuration: '15m',
      defaultView: 'week',
      firstDayOfWeek: 'sunday',
      hideWeekends: false,
    });
    expect(devBrain.settings.get('settings.tasks.showCompletedTasks')).toBe(true);
    expect(devBrain.settings.get('state.lastWorkspaceId')).toBeNull();
    expect(appSettingsSchema.safeParse(devBrain.settings.get('settings')).success).toBe(true);

    // and the file now has every key, so the next open reads it whole
    const written = await readFile();
    expect(settingsFileSchema.safeParse(written).success).toBe(true);
    expect(written.settings.calendar).toMatchObject({
      hideWeekends: false,
      firstDayOfWeek: 'sunday',
    });
  });

  it('keeps a value the user set for a newer setting', async () => {
    const first = await open(true);
    first.settings.set('settings.calendar.hideWeekends', true);
    await first.close();

    devBrain = await open(false);
    expect(devBrain.settings.get('settings.calendar.hideWeekends')).toBe(true);
  });

  it('is still refused with no settings object, or with a wrong value', async () => {
    await folderWithOldFile((file) => without(file, 'settings'));
    await expect(open(false)).rejects.toThrow('Invalid settings.json file');

    await folderWithOldFile((file) => ({
      ...file,
      settings: { ...file.settings, theme: 'purple' },
    }));
    await expect(open(false)).rejects.toThrow('Invalid settings.json file');
  });
});
