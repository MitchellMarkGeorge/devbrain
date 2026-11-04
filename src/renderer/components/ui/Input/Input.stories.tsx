import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Input } from './Input';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { placeholder: 'Project name', 'aria-label': 'Project name' },
  argTypes: { invalid: { control: 'boolean' }, disabled: { control: 'boolean' } },
  decorators: [(Story) => <div style={{ width: 320 }}>{Story()}</div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <Stack gap="3">
      <Input placeholder="Project name" aria-label="Empty" />
      <Input defaultValue="DevBrain launch" aria-label="Filled" />
      <Input defaultValue="" placeholder="Required" invalid aria-label="Invalid" />
      <Input defaultValue="Read only for synced tasks" disabled aria-label="Disabled" />
    </Stack>
  ),
};

export const Invalid: Story = { args: { invalid: true, defaultValue: '' } };

export const Disabled: Story = { args: { disabled: true, defaultValue: 'ENG-124' } };
