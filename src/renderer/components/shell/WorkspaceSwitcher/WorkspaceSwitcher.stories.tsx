import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceButton } from './WorkspaceButton';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const meta = {
  title: 'Shell/WorkspaceSwitcher',
  component: WorkspaceSwitcher,
  parameters: { layout: 'fullscreen' },
  args: {
    current: 'surveymonkey',
    workspaces: [
      { id: 'surveymonkey', name: 'SurveyMonkey', color: 'green' },
      { id: 'personal', name: 'Personal', color: 'blue' },
      { id: 'side-projects', name: 'Side projects', color: 'indigo' },
    ],
  },
} satisfies Meta<typeof WorkspaceSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open from the title bar's workspace button, which shows pressed while it is open. */
export const Open: Story = {
  render: (args) => (
    <div
      style={{
        height: 320,
        width: 'var(--sidebar-width)',
        padding: 8,
        background: 'var(--sidebar)',
      }}
    >
      <WorkspaceButton name="SurveyMonkey" color="green" defaultOpen>
        <WorkspaceSwitcher {...args} />
      </WorkspaceButton>
    </div>
  ),
};
