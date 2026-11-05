import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleCheck, FileText, Folder } from 'lucide-react';
import { ProviderTile } from '../../entities/ProviderTile';
import { QuickStartCard, QuickStartTiles } from './QuickStartCard';

const meta = {
  title: 'Home/First run/QuickStartCard',
  component: QuickStartCard,
  args: { icon: CircleCheck, title: 'New task', description: 'Track something you need to do.' },
  decorators: [
    (Story) => (
      <div style={{ width: 191 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickStartCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The first-run Home's four cards. */
export const QuickStart: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      <QuickStartCard
        icon={CircleCheck}
        title="New task"
        description="Track something you need to do."
      />
      <QuickStartCard
        icon={FileText}
        title="New note"
        description="A doc, meeting notes or a quick thought."
      />
      <QuickStartCard
        icon={Folder}
        title="New project"
        description="Group tasks and notes toward a goal."
      />
      <QuickStartCard
        icon={
          <QuickStartTiles>
            <ProviderTile provider="linear" />
            <ProviderTile provider="google-calendar" />
          </QuickStartTiles>
        }
        title="Bring in your work"
        description="Connect Linear and Google Calendar."
      />
    </div>
  ),
};
