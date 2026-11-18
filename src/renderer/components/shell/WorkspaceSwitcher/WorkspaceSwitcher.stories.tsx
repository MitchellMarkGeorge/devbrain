import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarItem } from '../Sidebar';
import { WorkspaceButton } from './WorkspaceButton';
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from './WorkspaceSwitcher';

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

/** The sidebar's top, as the app draws it: the switcher in its header, the pages under it. */
function InSidebar({
  name,
  open,
  ...args
}: WorkspaceSwitcherProps & { name: string; open?: boolean }) {
  const current = args.workspaces.find((workspace) => workspace.id === args.current);
  return (
    <div style={{ height: 360 }}>
      <Sidebar
        header={
          <SidebarHeader>
            <WorkspaceButton name={name} color={current?.color} defaultOpen={open}>
              <WorkspaceSwitcher {...args} />
            </WorkspaceButton>
          </SidebarHeader>
        }
      >
        <SidebarContent>
          <SidebarGroup>
            <SidebarItem>Home</SidebarItem>
            <SidebarItem active>Tasks</SidebarItem>
            <SidebarItem>Projects</SidebarItem>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

/** Open from the sidebar's header, the button pressed while it is open. */
export const Open: Story = {
  render: (args) => <InSidebar {...args} name="SurveyMonkey" open />,
};

/** A long workspace name is cut short with "…" at the sidebar's width. */
export const LongName: Story = {
  render: (args) => <InSidebar {...args} name="Developer Platform Infrastructure" />,
};
