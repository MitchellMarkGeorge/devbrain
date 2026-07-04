import { describe, it, expect } from 'vitest';
import { settingsFileSchema, appStateSchema, appSettingsSchema } from '../../settings/schema';
import type { SettingsFile } from '../../settings/types';
import { TaskPriority } from '../../tasks/types';

const validSettings: SettingsFile = {
  settings: {
    theme: 'dark',
    devBrainPath: '/home/user/.devbrain',
    general: {
      defaultLandingPage: 'home',
      launchOnStartup: false,
      openToLastPage: true,
      confirmBeforeDeleting: true,
      confirmBeforeArchiving: true,
      timeFormat: '12',
    },
    tasks: {
      defaultSort: 'priority',
      defaultPriority: TaskPriority.LOW,
      defaultDueDate: 'today',
      defaultView: 'list',
      showCompletedTasks: false,
    },
    calendar: {
      timezone: 'America/Toronto',
      defaultEventDuration: '30m',
      firstDayOfWeek: 'monday',
      defaultView: 'week',
    },
  },
  state: {
    lastWorkspaceId: null,
    lastPage: null,
  },
};

// Helper to mutate settings cleanly
const withSettings = (overrides: Partial<typeof validSettings.settings>) => ({
  ...validSettings,
  settings: { ...validSettings.settings, ...overrides },
});
const withGeneral = (overrides: Partial<typeof validSettings.settings.general>) =>
  withSettings({ general: { ...validSettings.settings.general, ...overrides } });
const withTasks = (overrides: Partial<typeof validSettings.settings.tasks>) =>
  withSettings({ tasks: { ...validSettings.settings.tasks, ...overrides } });
const withCalendar = (overrides: Partial<typeof validSettings.settings.calendar>) =>
  withSettings({ calendar: { ...validSettings.settings.calendar, ...overrides } });

describe('settingsFileSchema', () => {
  it('accepts a fully valid settings file', () => {
    expect(settingsFileSchema.safeParse(validSettings).success).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(settingsFileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects when state is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { state, ...noState } = validSettings;
    expect(settingsFileSchema.safeParse(noState).success).toBe(false);
  });

  it('rejects when settings is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { settings, ...noSettings } = validSettings;
    expect(settingsFileSchema.safeParse(noSettings).success).toBe(false);
  });
});

describe('appSettingsSchema — top-level fields', () => {
  it('accepts dark as the theme', () => {
    expect(appSettingsSchema.safeParse(validSettings.settings).success).toBe(true);
  });

  it('rejects unknown theme values', () => {
    expect(appSettingsSchema.safeParse({ ...validSettings.settings, theme: 'light' }).success).toBe(
      false,
    );
  });

  it('rejects a numeric theme value', () => {
    expect(appSettingsSchema.safeParse({ ...validSettings.settings, theme: 1 }).success).toBe(
      false,
    );
  });

  it('accepts any non-empty string for devBrainPath', () => {
    expect(
      appSettingsSchema.safeParse({ ...validSettings.settings, devBrainPath: '/some/path' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing general block', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { general, ...noGeneral } = validSettings.settings;
    expect(appSettingsSchema.safeParse(noGeneral).success).toBe(false);
  });

  it('rejects a missing tasks block', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tasks, ...noTasks } = validSettings.settings;
    expect(appSettingsSchema.safeParse(noTasks).success).toBe(false);
  });

  it('rejects a missing calendar block', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { calendar, ...noCalendar } = validSettings.settings;
    expect(appSettingsSchema.safeParse(noCalendar).success).toBe(false);
  });
});

describe('appSettingsSchema — general block', () => {
  it('accepts all valid defaultLandingPage values', () => {
    const pages = ['home', 'tasks', 'notes', 'projects', 'calendar'] as const;
    for (const page of pages) {
      expect(
        appSettingsSchema.safeParse(withGeneral({ defaultLandingPage: page }).settings).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown defaultLandingPage value', () => {
    expect(
      appSettingsSchema.safeParse(
        withGeneral({ defaultLandingPage: 'dashboard' as never }).settings,
      ).success,
    ).toBe(false);
  });

  it('accepts 12 as timeFormat', () => {
    expect(appSettingsSchema.safeParse(withGeneral({ timeFormat: '12' }).settings).success).toBe(
      true,
    );
  });

  it('accepts 24 as timeFormat', () => {
    expect(appSettingsSchema.safeParse(withGeneral({ timeFormat: '24' }).settings).success).toBe(
      true,
    );
  });

  it('rejects an unknown timeFormat value', () => {
    expect(
      appSettingsSchema.safeParse(withGeneral({ timeFormat: '6' as never }).settings).success,
    ).toBe(false);
  });

  it('rejects a non-boolean for launchOnStartup', () => {
    expect(
      appSettingsSchema.safeParse(withGeneral({ launchOnStartup: 1 as never }).settings).success,
    ).toBe(false);
  });

  it('rejects a non-boolean for openToLastPage', () => {
    expect(
      appSettingsSchema.safeParse(withGeneral({ openToLastPage: 'yes' as never }).settings).success,
    ).toBe(false);
  });

  it('rejects a non-boolean for confirmBeforeDeleting', () => {
    expect(
      appSettingsSchema.safeParse(withGeneral({ confirmBeforeDeleting: null as never }).settings)
        .success,
    ).toBe(false);
  });

  it('rejects a non-boolean for confirmBeforeArchiving', () => {
    expect(
      appSettingsSchema.safeParse(withGeneral({ confirmBeforeArchiving: null as never }).settings)
        .success,
    ).toBe(false);
  });
});

describe('appSettingsSchema — tasks block', () => {
  it('accepts all valid defaultSort values', () => {
    const sorts = ['priority', 'dueDate', 'status'] as const;
    for (const sort of sorts) {
      expect(appSettingsSchema.safeParse(withTasks({ defaultSort: sort }).settings).success).toBe(
        true,
      );
    }
  });

  it('rejects an unknown defaultSort value', () => {
    expect(
      appSettingsSchema.safeParse(withTasks({ defaultSort: 'name' as never }).settings).success,
    ).toBe(false);
  });

  it('accepts all TaskPriority values', () => {
    for (const priority of [TaskPriority.HIGH, TaskPriority.LOW, TaskPriority.MEDIUM]) {
      expect(
        appSettingsSchema.safeParse(withTasks({ defaultPriority: priority }).settings).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown defaultPriority value', () => {
    expect(
      appSettingsSchema.safeParse(withTasks({ defaultPriority: 'urgent' as never }).settings)
        .success,
    ).toBe(false);
  });

  it('accepts all valid defaultDueDate values', () => {
    const dates = ['today', 'tommorow', 'nextWeek'] as const;
    for (const date of dates) {
      expect(
        appSettingsSchema.safeParse(withTasks({ defaultDueDate: date }).settings).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown defaultDueDate value', () => {
    expect(
      appSettingsSchema.safeParse(withTasks({ defaultDueDate: 'yesterday' as never }).settings)
        .success,
    ).toBe(false);
  });

  it('accepts all valid tasks defaultView values', () => {
    const views = ['list', 'group', 'board'] as const;
    for (const view of views) {
      expect(appSettingsSchema.safeParse(withTasks({ defaultView: view }).settings).success).toBe(
        true,
      );
    }
  });

  it('rejects an unknown tasks defaultView value', () => {
    expect(
      appSettingsSchema.safeParse(withTasks({ defaultView: 'kanban' as never }).settings).success,
    ).toBe(false);
  });

  it('rejects a non-boolean for showCompletedTasks', () => {
    expect(
      appSettingsSchema.safeParse(withTasks({ showCompletedTasks: 'true' as never }).settings)
        .success,
    ).toBe(false);
  });
});

describe('appSettingsSchema — calendar block', () => {
  it('accepts all valid defaultEventDuration values', () => {
    const durations = ['15m', '30m', '1h'] as const;
    for (const d of durations) {
      expect(
        appSettingsSchema.safeParse(withCalendar({ defaultEventDuration: d }).settings).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown defaultEventDuration value', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ defaultEventDuration: '2h' as never }).settings)
        .success,
    ).toBe(false);
  });

  it('accepts monday as firstDayOfWeek', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ firstDayOfWeek: 'monday' }).settings).success,
    ).toBe(true);
  });

  it('accepts sunday as firstDayOfWeek', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ firstDayOfWeek: 'sunday' }).settings).success,
    ).toBe(true);
  });

  it('rejects an unknown firstDayOfWeek value', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ firstDayOfWeek: 'saturday' as never }).settings)
        .success,
    ).toBe(false);
  });

  it('accepts all valid calendar defaultView values', () => {
    const views = ['month', 'week', 'day'] as const;
    for (const view of views) {
      expect(
        appSettingsSchema.safeParse(withCalendar({ defaultView: view }).settings).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown calendar defaultView value', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ defaultView: 'agenda' as never }).settings)
        .success,
    ).toBe(false);
  });

  it('accepts any non-empty string for timezone', () => {
    expect(
      appSettingsSchema.safeParse(withCalendar({ timezone: 'Europe/London' }).settings).success,
    ).toBe(true);
  });
});

describe('appStateSchema', () => {
  it('accepts null lastWorkspaceId and lastPage', () => {
    expect(appStateSchema.safeParse({ lastWorkspaceId: null, lastPage: null }).success).toBe(true);
  });

  it('accepts string values', () => {
    expect(
      appStateSchema.safeParse({ lastWorkspaceId: 'wsp_abc', lastPage: '/tasks' }).success,
    ).toBe(true);
  });

  it('rejects missing lastPage', () => {
    expect(appStateSchema.safeParse({ lastWorkspaceId: null }).success).toBe(false);
  });

  it('rejects missing lastWorkspaceId', () => {
    expect(appStateSchema.safeParse({ lastPage: null }).success).toBe(false);
  });

  it('rejects a number for lastWorkspaceId', () => {
    expect(appStateSchema.safeParse({ lastWorkspaceId: 42, lastPage: null }).success).toBe(false);
  });

  it('rejects a number for lastPage', () => {
    expect(appStateSchema.safeParse({ lastWorkspaceId: null, lastPage: 42 }).success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(appStateSchema.safeParse({}).success).toBe(false);
  });
});
