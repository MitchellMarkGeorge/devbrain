import type { Meta, StoryObj } from '@storybook/react-vite';
import { RotateCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ColourBar } from '../../ui/ColourBar';
import { ProviderTile } from '../../entities/ProviderTile';
import { StatusIcon } from '../../entities/StatusIcon';
import {
  HomeAgendaDivider,
  HomeAgendaEmpty,
  HomeAgendaNotice,
  HomeAgendaRow,
  HomeAgendaSection,
} from './HomeAgenda';

const meta = {
  title: 'Home/HomeAgenda',
  component: HomeAgendaSection,
  decorators: [
    (Story) => (
      <div style={{ width: 247 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeAgendaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home's right column under the mini calendar. */
export const RightColumn: Story = {
  args: { title: 'Later today' },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <HomeAgendaSection title="Later today" aside="3 meetings">
        <HomeAgendaRow
          time="10:30"
          glyph={<ColourBar color="green" />}
          title="Mitchell / Jesse 1:1"
        />
        <HomeAgendaRow time="1:00" glyph={<ColourBar color="blue" />} title="Design Review" />
        <HomeAgendaRow time="4:00" glyph={<ColourBar color="amber" />} title="Retrospective" />
      </HomeAgendaSection>
      <HomeAgendaDivider />
      <HomeAgendaSection title="Tomorrow">
        <HomeAgendaRow time="9:30" glyph={<ColourBar color="green" />} title="Daily Standup" />
        <HomeAgendaRow
          time="Due"
          glyph={<StatusIcon status="in-progress" size={12} />}
          title="Benchmark inference latency"
        />
      </HomeAgendaSection>
      <HomeAgendaDivider />
      <HomeAgendaSection title="Later this week" days>
        <HomeAgendaRow
          time="Wed 24"
          glyph={<StatusIcon status="in-progress" size={12} />}
          title="PKCE flow due"
          more="+1"
        />
        <HomeAgendaRow
          time="Thu 25"
          glyph={<ColourBar color="pink" />}
          title="ML Platform Review"
          more="+1"
        />
        <HomeAgendaRow time="Weekend" title="Nothing planned" empty />
      </HomeAgendaSection>
      <HomeAgendaDivider />
      <HomeAgendaSection title="Today" aside="No meetings">
        <HomeAgendaEmpty>Nothing scheduled and nothing due.</HomeAgendaEmpty>
      </HomeAgendaSection>
      <HomeAgendaDivider />
      <HomeAgendaNotice
        icon={<ProviderTile provider="google-calendar" size={20} />}
        title="Google Calendar paused"
        description="Sign in again to keep today’s meetings up to date."
        action={
          <Button size="sm" icon={RotateCw}>
            Reconnect
          </Button>
        }
      />
    </div>
  ),
};
