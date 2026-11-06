import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appSettingsSchema } from '@common/types';
import { openDevBrain, type DevBrain } from '@main/core';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import { openFileSettingsStore } from './__mocks__/file-store';

// A settings.json written before a setting was added, opened by this version: the setting reads
// as its default, and the file gets it.

let tmpDir: string;
let rootPath: string;
let devBrain: DevBrain | null = null;

const open = (createIfMissing: boolean) =>
  openDevBrain({
    settingsStore: openFileSettingsStore,
    path: rootPath,
    createIfMissing,
    workspace: WORKSPACE_OPTIONS,
  });

const settingsFile = () => path.join(rootPath, 'settings.json');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-settings-'));
  rootPath = path.join(tmpDir, 'brain');
});

afterEach(async () => {
  await devBrain?.close();
  devBrain = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('an old settings file', () => {
  it('reads settings added since as their defaults, keeping the values it has', async () => {
    await (await open(true)).close();
    // the file as an older version wrote it: no calendar.hideWeekends, no state.lastWorkspaceId,
    // and a setting the user changed
    const file = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    delete file.settings.calendar.hideWeekends;
    delete file.state.lastWorkspaceId;
    file.settings.calendar.firstDayOfWeek = 'sunday';
    await fs.writeFile(settingsFile(), JSON.stringify(file));

    devBrain = await open(false);

    expect(devBrain.settings.get('settings.calendar')).toEqual({
      defaultEventDuration: '15m',
      defaultView: 'week',
      firstDayOfWeek: 'sunday',
      hideWeekends: false,
    });
    expect(devBrain.settings.get('state.lastWorkspaceId')).toBeNull();
    // every setting reads as the schema says
    expect(appSettingsSchema.safeParse(devBrain.settings.get('settings')).success).toBe(true);
    // and the file now has them
    const written = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
    expect(written.settings.calendar.hideWeekends).toBe(false);
    expect(written.state).toHaveProperty('lastWorkspaceId', null);
  });

  it('keeps a value the user set for a new setting', async () => {
    const first = await open(true);
    first.settings.set('settings.calendar.hideWeekends', true);
    await first.close();

    devBrain = await open(false);
    expect(devBrain.settings.get('settings.calendar.hideWeekends')).toBe(true);
  });
});
