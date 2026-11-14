import { useSuspenseQuery } from '@tanstack/react-query';
import { TaskPriority, type AppSettings } from '@common/types';
import { PRIORITY_LABELS, SettingsGroup, SettingsRow, SettingsSection } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { SettingSelect, SettingSwitch, SettingToggle, type Option } from './controls';
import { useSetSetting } from '../hooks/use-set-setting';

// Settings › Tasks and › Calendar (Figma `7158:10842`, `7158:11133`): each row writes its one
// setting through `settings.set`, optimistically.

type Tasks = AppSettings['tasks'];
type CalendarSettings = AppSettings['calendar'];

const SORTS: readonly Option<Tasks['defaultSort']>[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'status', label: 'Status' },
];
const PRIORITIES: readonly Option<`${TaskPriority}`>[] = [
  TaskPriority.HIGH,
  TaskPriority.MEDIUM,
  TaskPriority.LOW,
].map((priority) => ({ value: `${priority}` as const, label: PRIORITY_LABELS[priority] }));
const DUE_DATES: readonly Option<Tasks['defaultDueDate']>[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'nextWeek', label: 'Next week' },
];
const VIEWS: readonly Option<Tasks['defaultView']>[] = [
  { value: 'list', label: 'List' },
  { value: 'group', label: 'Grouped' },
  { value: 'board', label: 'Board' },
];

export function TasksSettings() {
  const tasks = useSuspenseQuery(trpc.settings.get.queryOptions()).data.tasks;
  const set = useSetSetting();
  return (
    <>
      <SettingsSection title="Defaults">
        <SettingsGroup>
          <SettingsRow
            label="Default sort"
            description="How task lists are ordered."
            control={
              <SettingSelect
                label="Default sort"
                value={tasks.defaultSort}
                options={SORTS}
                onChange={(value) => void set({ path: 'settings.tasks.defaultSort', value })}
              />
            }
          />
          <SettingsRow
            label="Default priority"
            description="Given to new tasks."
            control={
              <SettingSelect
                label="Default priority"
                value={`${tasks.defaultPriority}`}
                options={PRIORITIES}
                onChange={(value) =>
                  void set({
                    path: 'settings.tasks.defaultPriority',
                    value: Number(value) as TaskPriority,
                  })
                }
              />
            }
          />
          <SettingsRow
            label="Default due date"
            description="Given to new tasks."
            control={
              <SettingSelect
                label="Default due date"
                value={tasks.defaultDueDate}
                options={DUE_DATES}
                onChange={(value) => void set({ path: 'settings.tasks.defaultDueDate', value })}
              />
            }
          />
          <SettingsRow
            label="Default view"
            description="How task lists open."
            control={
              <SettingSelect
                label="Default view"
                value={tasks.defaultView}
                options={VIEWS}
                onChange={(value) => void set({ path: 'settings.tasks.defaultView', value })}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="General">
        <SettingsGroup>
          <SettingsRow
            label="Show completed tasks"
            description="Keep finished tasks in lists."
            control={
              <SettingSwitch
                label="Show completed tasks"
                checked={tasks.showCompletedTasks}
                onChange={(value) => void set({ path: 'settings.tasks.showCompletedTasks', value })}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  );
}

const WEEK_STARTS: readonly Option<CalendarSettings['firstDayOfWeek']>[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
];
const EVENT_LENGTHS: readonly Option<CalendarSettings['defaultEventDuration']>[] = [
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hour' },
];
const CALENDAR_VIEWS: readonly Option<CalendarSettings['defaultView']>[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function CalendarSettingsSection() {
  const calendar = useSuspenseQuery(trpc.settings.get.queryOptions()).data.calendar;
  const set = useSetSetting();
  return (
    <>
      <SettingsSection title="Time">
        <SettingsGroup>
          <SettingsRow
            label="Week starts on"
            description="The first day of the week in calendars."
            control={
              <SettingToggle
                label="Week starts on"
                value={calendar.firstDayOfWeek}
                options={WEEK_STARTS}
                onChange={(value) => void set({ path: 'settings.calendar.firstDayOfWeek', value })}
              />
            }
          />
          <SettingsRow
            label="Default event length"
            description="Given to new events."
            control={
              <SettingSelect
                label="Default event length"
                value={calendar.defaultEventDuration}
                options={EVENT_LENGTHS}
                onChange={(value) =>
                  void set({ path: 'settings.calendar.defaultEventDuration', value })
                }
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="Display">
        <SettingsGroup>
          <SettingsRow
            label="Default view"
            description="How the calendar opens."
            control={
              <SettingSelect
                label="Default calendar view"
                value={calendar.defaultView}
                options={CALENDAR_VIEWS}
                onChange={(value) => void set({ path: 'settings.calendar.defaultView', value })}
              />
            }
          />
          <SettingsRow
            label="Hide weekends"
            description="Show Monday to Friday only in the week and month views."
            control={
              <SettingSwitch
                label="Hide weekends"
                checked={calendar.hideWeekends}
                onChange={(value) => void set({ path: 'settings.calendar.hideWeekends', value })}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  );
}
