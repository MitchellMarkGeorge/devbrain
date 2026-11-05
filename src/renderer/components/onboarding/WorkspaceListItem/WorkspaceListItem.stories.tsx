import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceList, WorkspaceListItem } from './WorkspaceListItem';

const meta = {
  title: 'Onboarding/WorkspaceListItem',
  component: WorkspaceListItem,
  args: {
    name: 'SurveyMonkey',
    color: 'green',
    detail: '~/DevBrain/SurveyMonkey',
    meta: '2 days ago',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 456 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rest: Story = {};

/** Hover (and keyboard focus) fill the row and show the arrow. */
export const Hover: Story = { args: { 'data-highlighted': '' } as object };

/** The Welcome screen's card of recent workspaces. */
export const List: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <WorkspaceList label="Recent workspaces">
      <WorkspaceListItem
        name="SurveyMonkey"
        color="green"
        detail="Last opened 2 days ago"
        meta="Created Mar 2026"
      />
      <WorkspaceListItem
        name="Personal"
        color="blue"
        detail="Last opened Oct 24"
        meta="Created Jan 2026"
      />
      <WorkspaceListItem
        name="Side projects"
        color="indigo"
        detail="Last opened Jun 2"
        meta="Created Apr 2025"
      />
    </WorkspaceList>
  ),
};
