import type { Meta, StoryObj } from '@storybook/react-vite';
import { TasksPage } from './TasksPage';

const meta = {
  title: 'Screens/Menus/Toolbar menus',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Status chip's menu: Open and All, then each status alone. */
export const StatusMenu: Story = {
  name: 'Tasks – status menu',
  render: () => <TasksPage open="status" />,
};

/** Filter: an item for each field, each opening its values in a submenu. */
export const FilterMenu: Story = {
  name: 'Tasks – filter menu',
  render: () => <TasksPage open="filter" />,
};

/** Display: the layout, the grouping, and the sort with its direction. */
export const DisplayOpen: Story = {
  name: 'Tasks – display',
  render: () => <TasksPage open="display" />,
};
