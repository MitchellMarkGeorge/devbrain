import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Stack } from '../Flex';
import { Text } from '../Text';
import { Inert } from './Inert';

const meta = {
  title: 'Layout/Inert',
  component: Inert,
  args: { when: true },
  render: (args) => (
    <Stack gap="3" style={{ width: 320 }}>
      <Text size="sm" tone="subtle">
        Toggle `when`: while inert, the field and button are shown but can&apos;t be focused,
        clicked or typed in.
      </Text>
      <Inert {...args} render={<Stack gap="2" />}>
        <Input placeholder="A title" aria-label="Title" />
        <Button>Save</Button>
      </Inert>
    </Stack>
  ),
} satisfies Meta<typeof Inert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
