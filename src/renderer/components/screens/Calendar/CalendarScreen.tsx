import type { ReactNode } from 'react';
import { TaskStatus } from '@common/types';
import { ChevronLeft, ChevronRight, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Calendar } from '../../ui/Calendar';
import {
  CalendarAgenda,
  CalendarAgendaItem,
  type AgendaEventData,
} from '../../calendar/CalendarAgenda';
import { CalendarUpNext } from '../../calendar/CalendarUpNext';
import { storyDate } from '../../lib/story-dates';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { PageToolbar } from '../../shell/Page';
import { ScreenFrame } from '../Shell/AppFrame';
import { NOW } from './data';

// an hour-long event on the story's day, or `day` days after it
function agendaEvent(
  title: string,
  day: number,
  hour: number,
  minute: number,
  color: string,
): AgendaEventData {
  return {
    title,
    startAt: storyDate(day, hour, minute),
    endAt: storyDate(day, hour + 1, minute),
    allDay: false,
    color,
  };
}

/**
 * The calendar page around a grid: the header (title, calendar filter, view switch, date stepper,
 * New Event) and the right panel (month picker, the meeting up next, today's and tomorrow's
 * agenda).
 */
export function CalendarScreen({
  view,
  children,
}: {
  view: 'month' | 'week' | 'day';
  children: ReactNode;
}) {
  return (
    <ScreenFrame page="Calendar" title="Calendar">
      {/* as the page draws it: the month and the filter, then the view, ‹ Today › and New Event */}
      <PageToolbar
        start={
          <>
            <h1
              style={{
                margin: 0,
                color: 'var(--foreground-strong)',
                font: 'var(--font-weight-semibold) var(--text-2xl) / var(--text-2xl-leading) var(--font-sans)',
              }}
            >
              June 2026
            </h1>
            <Button variant="outline" icon={ListFilter} value="All calendars">
              Filter
            </Button>
          </>
        }
        end={
          <>
            <ToggleGroup
              aria-label="View"
              value={view}
              items={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
                { value: 'day', label: 'Day' },
              ]}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <Button variant="ghost" size="icon" icon={ChevronLeft} aria-label="Previous week" />
              <Button variant="outline">Today</Button>
              <Button variant="ghost" size="icon" icon={ChevronRight} aria-label="Next week" />
            </div>
            <Button variant="outline" icon={Plus}>
              New Event
            </Button>
          </>
        }
      />
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        <aside
          style={{
            width: 256,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            padding: '16px 16px 16px 17px',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <Calendar today={NOW} defaultMonth={NOW} />
          <CalendarUpNext
            event={{
              ...agendaEvent('Sprint Planning', 0, 9, 0, 'green'),
              meetingUrl: 'https://meet.example.com/sprint',
            }}
            onOpen={() => {}}
            onJoin={() => {}}
          />
          <CalendarAgenda title="Today">
            <CalendarAgendaItem event={agendaEvent('Daily Standup', 0, 9, 30, 'green')} />
            <CalendarAgendaItem event={agendaEvent('Mitchell / Jesse 1:1', 0, 10, 30, 'green')} />
            <CalendarAgendaItem event={agendaEvent('Design Review', 0, 13, 0, 'blue')} />
            <CalendarAgendaItem
              task={{
                title: 'Write PKCE migration guide',
                status: TaskStatus.NOT_STARTED,
                dueDate: storyDate(0),
              }}
            />
            <CalendarAgendaItem event={agendaEvent('Retrospective', 0, 16, 0, 'amber')} />
          </CalendarAgenda>
          <CalendarAgenda title="Tomorrow">
            <CalendarAgendaItem
              event={{
                title: 'AWS Incubator Course',
                startAt: storyDate(1),
                endAt: storyDate(2),
                allDay: true,
                color: 'amber',
              }}
            />
            <CalendarAgendaItem event={agendaEvent('Daily Standup', 1, 9, 30, 'green')} />
            <CalendarAgendaItem
              event={agendaEvent('Auth Overhaul Design Review', 1, 14, 0, 'blue')}
            />
          </CalendarAgenda>
        </aside>
      </div>
    </ScreenFrame>
  );
}
