import { describe, expect, it } from 'vitest';
import { TaskPriority, type AppSettings } from '@common/types';
import { importSummaryText } from '@renderer/features/settings/components/DataStorageSettings';
import { settingsSearchSchema } from '@renderer/features/settings/api/search';
import { withSetting } from '@renderer/features/settings/hooks/use-set-setting';

// The settings page's search param, its optimistic write, and the import summary's words.

const SETTINGS: AppSettings = {
  theme: 'system',
  devBrainPath: '/brain',
  general: {
    defaultLandingPage: 'home',
    launchOnStartup: false,
    openToLastPage: true,
    confirmBeforeDeleting: true,
    confirmBeforeArchiving: false,
    timeFormat: '12',
  },
  tasks: {
    defaultSort: 'priority',
    defaultPriority: TaskPriority.LOW,
    defaultDueDate: 'today',
    defaultView: 'list',
    showCompletedTasks: true,
  },
  calendar: {
    defaultEventDuration: '30m',
    firstDayOfWeek: 'monday',
    defaultView: 'week',
    hideWeekends: false,
  },
};

describe('settingsSearchSchema', () => {
  it('reads the tab, snake case, and drops a bad one', () => {
    expect(settingsSearchSchema.parse({ tab: 'data_storage' })).toEqual({ tab: 'data_storage' });
    expect(settingsSearchSchema.parse({ tab: 'dataStorage' })).toEqual({ tab: undefined });
  });
});

describe('withSetting', () => {
  it('replaces the one value at the path, leaving the rest', () => {
    const next = withSetting(SETTINGS, { path: 'settings.calendar.hideWeekends', value: true });
    expect(next.calendar).toEqual({ ...SETTINGS.calendar, hideWeekends: true });
    expect(next.general).toBe(SETTINGS.general);
    expect(SETTINGS.calendar.hideWeekends).toBe(false);
    expect(withSetting(SETTINGS, { path: 'settings.theme', value: 'dark' }).theme).toBe('dark');
  });
});

describe('importSummaryText', () => {
  it('counts what was created and left out, row by row', () => {
    const text = importSummaryText(
      'tasks',
      {
        created: 42,
        skipped: [{ row: 31, title: 'Ship', message: 'Already in the workspace' }],
        errors: [{ row: 12, title: null, message: 'No title' }],
        warnings: [],
      },
      'Work',
    );
    expect(text.title).toBe('Imported 42 tasks');
    expect(text.description).toBe('Into Work. 2 rows were skipped.');
    expect(text.lines).toEqual([
      { where: 'Row 12', message: 'No title' },
      { where: 'Row 31', message: 'Already in the workspace' },
    ]);
  });

  it('names a note import’s files', () => {
    const text = importSummaryText(
      'notes',
      {
        created: 1,
        skipped: [],
        errors: [],
        warnings: [{ file: 'retro.md', title: 'Retro', message: 'No project named “Q4”' }],
      },
      'Work',
    );
    expect(text.title).toBe('Imported 1 note');
    expect(text.description).toBe('Into Work. 1 file imported without something, listed below.');
    expect(text.lines).toEqual([{ where: 'retro.md', message: 'No project named “Q4”' }]);
  });
});
