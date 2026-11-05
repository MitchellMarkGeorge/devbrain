import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DateRange as DayRange } from 'react-day-picker';
import { ArrowRight, Calendar, Clock, Plus } from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Button } from '../../ui/Button';
import { DatePicker } from '../../ui/DatePicker';
import { DateRangePicker, type DateRangeEnd } from '../../ui/DateRangePicker';
import { DetailSection } from '../../detail/DetailSection';
import { DocumentPage } from '../../shell/DocumentPage';
import { EntityPill } from '../../entities/EntityPill';
import { Icon } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { PropertyRow, TASK_ADD_ITEMS } from '../../detail/PropertyRow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskList } from '../../lists/TaskList';
import { TaskNoteCard } from '../../detail/TaskNoteCard';
import { PKCE_DESCRIPTION, PKCE_SUBTASKS } from '../TaskDetail/data';
import { AppWindow, DetailTopBar } from '../TaskDetail/frame';

const meta = {
  title: 'Screens/Pickers',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Figma's today: Monday, June 22 2026
const TODAY = new Date(2026, 5, 22);
const TITLE = 'Implement OAuth2 PKCE flow';

/** A date pill held open over its picker. */
function OpenPill({ pill, children }: { pill: ReactNode; children: ReactNode }) {
  return (
    <Popover open modal={false}>
      <PopoverTrigger render={pill as React.ReactElement} />
      <PopoverContent size="auto" style={{ overflow: 'hidden' }}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Figma's task page ("Task detail"), with `dates` in place of its date pills. */
function TaskPage({ dates }: { dates: ReactNode }) {
  return (
    <AppWindow active="Tasks">
      <DocumentPage
        style={{ flex: 1 }}
        header={
          <DetailTopBar
            items={[
              { label: 'Tasks', href: '#' },
              { label: TITLE, icon: <StatusIcon status="in-progress" /> },
            ]}
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <Heading level={1} variant="document">
            {TITLE}
          </Heading>
          <PropertyRow
            properties={
              <>
                <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>
                  In progress
                </EntityPill>
                <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
                {dates}
                <EntityPill type="project" color="blue">
                  Auth Overhaul
                </EntityPill>
              </>
            }
            addItems={TASK_ADD_ITEMS.filter((i) =>
              ['parent', 'event', 'pull-request'].includes(i.key),
            )}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PKCE_DESCRIPTION.map((p) => (
              <p key={p} style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>
                {p}
              </p>
            ))}
          </div>
          <DetailSection
            spacing="page"
            title="Subtasks"
            glyph={<ProgressRing value={3} total={PKCE_SUBTASKS.length} size={12} />}
            count={`3/${PKCE_SUBTASKS.length}`}
            action={
              <Button size="xs" icon={Plus}>
                Add
              </Button>
            }
          >
            <TaskList tasks={PKCE_SUBTASKS} selectionBar={false} style={{ marginLeft: -36 }} />
          </DetailSection>
          <DetailSection spacing="page" title="Task note">
            <TaskNoteCard
              title={TITLE}
              project="Auth Overhaul"
              projectColor="blue"
              tasksSummary="2 tasks · 1 in progress"
              updated="2h ago"
            />
          </DetailSection>
        </div>
      </DocumentPage>
    </AppWindow>
  );
}

const TIMES = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM'];

function TimeSelect() {
  return (
    <Select defaultValue="10:30 AM">
      <SelectTrigger aria-label="Time">
        <Icon icon={Clock} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIMES.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Figma "Task detail – due date picker" (7175:28012): the due pill's picker, Jun 24 chosen. */
export const DueDatePicker: Story = {
  name: 'Task detail – due date picker',
  render: function Render() {
    const [due, setDue] = useState<Date | undefined>(new Date(2026, 5, 24));
    return (
      <TaskPage
        dates={
          <>
            <OpenPill pill={<EntityPill glyph={Calendar}>Jun 24</EntityPill>}>
              <DatePicker
                today={TODAY}
                value={due}
                onChange={setDue}
                time={<TimeSelect />}
                onAddStart={() => undefined}
                onClear={() => setDue(undefined)}
              />
            </OpenPill>
            <EntityPill glyph={Plus}>Start date</EntityPill>
          </>
        }
      />
    );
  },
};

/**
 * Figma "Task detail – start & due range picker" (7175:28582): Jun 22 → Jul 1, the due field
 * active, opened from the start pill.
 */
export const RangePicker: Story = {
  name: 'Task detail – start & due range picker',
  render: function Render() {
    const [range, setRange] = useState<DayRange | undefined>({
      from: new Date(2026, 5, 22),
      to: new Date(2026, 6, 1),
    });
    const [active, setActive] = useState<DateRangeEnd>('due');
    return (
      <TaskPage
        dates={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <OpenPill pill={<EntityPill glyph={Calendar}>Jun 22</EntityPill>}>
              <DateRangePicker
                today={TODAY}
                value={range}
                onChange={setRange}
                active={active}
                onActiveChange={setActive}
                onClear={() => setRange(undefined)}
              />
            </OpenPill>
            <Icon icon={ArrowRight} size={14} style={{ color: 'var(--muted-foreground)' }} />
            <EntityPill glyph={Calendar}>Jul 1</EntityPill>
          </span>
        }
      />
    );
  },
};
