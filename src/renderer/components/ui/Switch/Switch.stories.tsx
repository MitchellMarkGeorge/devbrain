import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Switch } from './Switch';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { children: 'Create another' },
  argTypes: { checked: { control: 'boolean' }, disabled: { control: 'boolean' } },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <Stack gap="3">
      <Switch>Off</Switch>
      <Switch defaultChecked>On</Switch>
      <Switch disabled>Disabled</Switch>
      <Switch disabled defaultChecked>
        Disabled, on
      </Switch>
      <Switch aria-label="Without a label" defaultChecked />
    </Stack>
  ),
};
