import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  args: {
    workspace: 'DevBrain',
    workspaceColor: 'indigo',
    active: 'Tasks',
    favorites: [{ label: 'DevBrain', icon: 'folder', color: 'indigo' }],
    recents: [
      { label: 'Design system', icon: 'file-text' },
      { label: 'Weekly planning', bar: 'blue' },
    ],
    onNavigate: fn(),
    onSearch: fn(),
    onCreate: fn(),
    workspaceActions: [
      { label: 'Switch workspace', icon: 'folder' },
      { label: 'New workspace', icon: 'plus' },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ height: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Collapsed: Story = { args: { defaultCollapsed: true } };
