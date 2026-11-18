/**
 * A proposal for the Upcoming page: an agenda of the next 14 days, a day per heading, mixing
 * meetings, tasks due, tasks starting and project deadlines. Overdue leads; an empty day is one
 * line. Built from the list components (`GroupHeading`, `TaskRow`, `EventRow`) plus mock-only
 * pieces (UpcomingPage.module.css). Nothing in the app uses it.
 *
 * The story's `now` is Monday 22 June 2026, 9:48 AM.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CalendarArrowUp, CalendarDays, CircleAlert, Flag, Folder } from 'lucide-react';
import type { TaskId } from '@common/ids';
import { TaskPriority, TaskStatus } from '@common/types';
import { GroupHeading } from '../../lists/GroupHeading';
import { TaskRow, type TaskRowData } from '../../lists/TaskRow';
import { EventRow, type EventRowData } from '../../lists/EventRow';
import { sampleLinear, sampleProject, sampleTask } from '../../lists/TaskRow/fixtures';
import { PageContent } from '../../shell/Page';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { storyDate } from '../../lib/story-dates';
import { cssColor, type Swatch } from '../../types';
import styles from './UpcomingPage.module.css';

const AUTH = sampleProject('Auth Overhaul', 'blue');
const GATEWAY = sampleProject('API Gateway v2', 'amber');
const UI = sampleProject('User Interface Revamp', 'indigo');

function event(
  title: string,
  day: number,
  hour: number,
  minute = 0,
  color = 'green',
): EventRowData {
  return {
    title,
    startAt: storyDate(day, hour, minute),
    endAt: storyDate(day, hour, minute + 30),
    allDay: false,
    recurrenceRule: null,
    meetingUrl: null,
    color,
  };
}

const OVERDUE: TaskRowData[] = [
  sampleTask({
    id: 'tsk_refresh' as TaskId,
    title: 'Refactor token refresh logic',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-4),
    external: sampleLinear('ENG-131'),
    project: AUTH,
  }),
  sampleTask({
    id: 'tsk_audit' as TaskId,
    title: 'Audit token storage',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-118'),
    project: AUTH,
  }),
];

interface Day {
  label: string;
  subtitle?: string;
  events?: EventRowData[];
  due?: TaskRowData[];
  starting?: TaskRowData[];
  deadline?: { title: string; color: Swatch; open: number; done: number; total: number };
}

const DAYS: Day[] = [
  {
    label: 'Tomorrow',
    subtitle: 'Tue 23 Jun',
    events: [
      event('Mitchell / Jesse 1:1', 1, 10, 30),
      event('Architecture sync', 1, 14, 0, 'blue'),
    ],
    due: [
      sampleTask({
        id: 'tsk_pkce' as TaskId,
        title: 'Implement OAuth2 PKCE flow',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: storyDate(1),
        external: sampleLinear('ENG-124'),
        subtaskProgress: { completed: 3, total: 4 },
        project: AUTH,
      }),
      sampleTask({
        id: 'tsk_mobile' as TaskId,
        title: 'Mobile fallback',
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(1),
        external: sampleLinear('ENG-128'),
        project: AUTH,
      }),
    ],
    starting: [
      sampleTask({
        id: 'tsk_guide' as TaskId,
        title: 'Write PKCE migration guide',
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(8),
        project: AUTH,
      }),
    ],
  },
  {
    label: 'Wednesday',
    subtitle: '24 Jun',
    due: [
      sampleTask({
        id: 'tsk_ratelimit' as TaskId,
        title: 'Rate-limit dashboard',
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(2),
        external: sampleLinear('ENG-140'),
        project: GATEWAY,
      }),
    ],
  },
  { label: 'Thursday', subtitle: '25 Jun' },
  {
    label: 'Friday',
    subtitle: '26 Jun',
    events: [event('Sprint Review', 4, 15, 0)],
    deadline: { title: 'API Gateway v2', color: 'amber', open: 8, done: 14, total: 22 },
    due: [
      sampleTask({
        id: 'tsk_routes' as TaskId,
        title: 'Migrate legacy routes to v2',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: storyDate(4),
        external: sampleLinear('ENG-133'),
        project: GATEWAY,
      }),
    ],
  },
  { label: 'Weekend', subtitle: '27–28 Jun' },
  {
    label: 'Next week',
    subtitle: '29 Jun – 5 Jul',
    due: [
      sampleTask({
        id: 'tsk_tokens' as TaskId,
        title: 'Design tokens for dark mode',
        priority: TaskPriority.LOW,
        dueDate: storyDate(8),
        project: UI,
      }),
      sampleTask({
        id: 'tsk_onboarding' as TaskId,
        title: 'Onboarding empty states',
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(10),
        project: UI,
      }),
      sampleTask({
        id: 'tsk_loadtest' as TaskId,
        title: 'Load test the gateway',
        priority: TaskPriority.HIGH,
        dueDate: storyDate(11),
        external: sampleLinear('ENG-151'),
        project: GATEWAY,
      }),
    ],
  },
];

function DeadlineRow({ deadline }: { deadline: NonNullable<Day['deadline']> }) {
  const atRisk = deadline.open > 5;
  return (
    <div
      className={styles.deadline}
      style={{ '--deadline-color': cssColor(deadline.color) } as CSSProperties}
    >
      <span className={styles.deadlineIcon}>
        <Icon icon={Folder} size={16} />
      </span>
      <span>
        <span className={styles.deadlineTitle}>{deadline.title}</span>{' '}
        <span className={styles.deadlineDue}>is due</span>
      </span>
      <span className={styles.deadlineMeta} data-risk={atRisk ? '' : undefined}>
        {deadline.open} open tasks
        <span className={styles.progress} aria-hidden>
          <span style={{ width: `${(deadline.done / deadline.total) * 100}%` }} />
        </span>
        {deadline.done}/{deadline.total}
      </span>
    </div>
  );
}

function DaySection({ day, dragging }: { day: Day; dragging?: 'from' | 'to' }) {
  const count = (day.due?.length ?? 0) + (day.events?.length ?? 0) + (day.deadline ? 1 : 0);
  if (count === 0 && !day.starting) {
    return (
      <div className={styles.emptyDay} data-drop={dragging === 'to' ? '' : undefined}>
        <Icon icon={CalendarDays} size={14} />
        <strong>{day.label}</strong> {day.subtitle} · Nothing due
      </div>
    );
  }
  return (
    <section className={styles.day}>
      <GroupHeading
        label={day.label}
        subtitle={day.subtitle}
        icon={CalendarDays}
        count={(day.due?.length ?? 0) + (day.starting?.length ?? 0)}
        onAddTask={() => {}}
        className={dragging === 'to' ? styles.dropTarget : undefined}
      />
      {day.deadline && <DeadlineRow deadline={day.deadline} />}
      {day.events?.map((e) => (
        <EventRow key={e.title} event={e} />
      ))}
      {day.due?.map((task, i) => (
        <div key={task.id} className={dragging === 'from' && i === 1 ? styles.dragging : undefined}>
          <TaskRow task={task} />
        </div>
      ))}
      {day.starting && (
        <>
          <div className={styles.subLabel}>Starting</div>
          {day.starting.map((task) => (
            <div key={task.id} className={styles.starting}>
              <TaskRow task={task} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export interface UpcomingContentProps {
  /** show "Mobile fallback" mid-drag from Tomorrow onto Wednesday */
  dragging?: boolean;
  /** nothing overdue */
  caughtUp?: boolean;
}

export function UpcomingContent({ dragging, caughtUp }: UpcomingContentProps): ReactNode {
  return (
    <PageContent layout="list">
      <div className={styles.toolbar}>
        <span>
          <strong>Next 14 days</strong> · 7 tasks due · 4 meetings · 1 project deadline
        </span>
        <span className={styles.spacer} />
        {!caughtUp && (
          <Button variant="ghost" size="sm" icon={CalendarArrowUp}>
            Move overdue to today
          </Button>
        )}
      </div>
      <div className={styles.days}>
        {!caughtUp && (
          <section className={styles.day}>
            <GroupHeading
              label="Overdue"
              icon={CircleAlert}
              color="var(--status-overdue)"
              count={OVERDUE.length}
            />
            {OVERDUE.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </section>
        )}
        {DAYS.map((day) => (
          <DaySection
            key={day.label}
            day={day}
            dragging={
              dragging
                ? day.label === 'Tomorrow'
                  ? 'from'
                  : day.label === 'Wednesday'
                    ? 'to'
                    : undefined
                : undefined
            }
          />
        ))}
        <div className={styles.emptyDay}>
          <Icon icon={Flag} size={14} />
          <strong>Later</strong> 12 tasks due after 5 Jul
        </div>
      </div>
    </PageContent>
  );
}
