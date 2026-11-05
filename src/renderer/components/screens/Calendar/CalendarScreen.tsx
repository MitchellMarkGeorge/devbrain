import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Calendar } from '../../ui/Calendar';
import { CalendarAgenda, CalendarAgendaItem } from '../../calendar/CalendarAgenda';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { AppFrame, PageHeader, Spacer } from './AppFrame';
import { NOW } from './data';

/**
 * The calendar page around a grid: the header (title, calendar filter, view switch, date stepper,
 * New Event) and the right panel (month picker, today's and tomorrow's agenda).
 */
export function CalendarScreen({
  view,
  children,
}: {
  view: 'month' | 'week' | 'day';
  children: ReactNode;
}) {
  return (
    <AppFrame page="Calendar">
      <PageHeader title="June 2026">
        <Button variant="outline" icon={ListFilter} value="All calendars">
          Filter
        </Button>
        <Spacer />
        <ToggleGroup
          aria-label="View"
          style={{ alignSelf: 'center' }}
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
      </PageHeader>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
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
          <CalendarAgenda title="Today">
            <CalendarAgendaItem title="Sprint Planning" time="9:00 AM" color="green" />
            <CalendarAgendaItem title="Daily Standup" time="9:30 AM" color="green" />
            <CalendarAgendaItem title="Mitchell / Jesse 1:1" time="10:30 AM" color="green" />
            <CalendarAgendaItem title="Design Review" time="1:00 PM" color="blue" />
            <CalendarAgendaItem
              title="Write PKCE migration guide"
              time="Due"
              status="not-started"
            />
            <CalendarAgendaItem title="Retrospective" time="4:00 PM" color="amber" />
          </CalendarAgenda>
          <CalendarAgenda title="Tomorrow">
            <CalendarAgendaItem title="AWS Incubator Course" time="All day" color="amber" />
            <CalendarAgendaItem title="Daily Standup" time="9:30 AM" color="green" />
            <CalendarAgendaItem title="Auth Overhaul Design Review" time="2:00 PM" color="blue" />
          </CalendarAgenda>
        </aside>
      </div>
    </AppFrame>
  );
}
