import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar, SidebarHeader, SidebarWorkspace } from '../Sidebar';
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

/** Open from the sidebar's workspace row, which shows pressed while it is open. */
export const Open: Story = {
  render: (args) => (
    <div style={{ height: 320, display: 'flex' }}>
      <Sidebar
        header={
          <SidebarHeader>
            <SidebarWorkspace name="SurveyMonkey" color="green" defaultOpen>
              <WorkspaceSwitcher {...args} />
            </SidebarWorkspace>
          </SidebarHeader>
        }
      ></Sidebar>
    </div>
  ),
};
