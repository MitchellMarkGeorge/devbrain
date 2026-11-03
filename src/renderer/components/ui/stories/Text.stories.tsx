import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, Text } from '..';

const meta = {
  title: 'Foundations/Text',
  component: Text,
  tags: ['autodocs'],
  args: { children: 'A quiet place for your work.' },
} satisfies Meta<typeof Text>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Roles: Story = {
  render: () => (
    <Stack gap={2}>
      <Text>Body text</Text>
      <Text variant="label">Label</Text>
      <Text variant="meta" tone="muted">
        Edited 2h ago
      </Text>
      <Text variant="code">{'const workspace = "DevBrain";'}</Text>
    </Stack>
  ),
};
