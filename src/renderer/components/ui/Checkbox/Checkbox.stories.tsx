import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Checkbox } from './Checkbox';

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
  args: { 'aria-label': 'Select task' },
  argTypes: {
    checked: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <Flex gap="4" align="center">
      <Checkbox aria-label="Unchecked" />
      <Checkbox aria-label="Checked" defaultChecked />
      <Checkbox aria-label="Some selected" indeterminate />
      <Checkbox aria-label="Disabled" disabled />
      <Checkbox aria-label="Disabled, checked" disabled defaultChecked />
    </Flex>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <Stack gap="3">
      <Checkbox defaultChecked>Show completed tasks</Checkbox>
      <Checkbox>Show subtasks in lists</Checkbox>
    </Stack>
  ),
};
