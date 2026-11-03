import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Toast, useToast } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Overlays/Toast',
  component: Toast,
  tags: ['autodocs'],
  args: {
    title: 'Task moved to trash',
    description: 'You can restore it from Trash.',
    action: 'Undo',
    tone: 'success',
    onAction: fn(),
  },
} satisfies Meta<typeof Toast>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Warning: Story = {
  args: {
    tone: 'warning',
    title: 'Sync paused',
    description: 'Reconnect your account to continue.',
    action: 'Reconnect',
  },
};
export const Error: Story = {
  args: {
    tone: 'error',
    title: 'Unable to sync',
    description: 'Your local changes are saved.',
    action: 'Try Again',
  },
};
function ToastExample() {
  const toast = useToast();
  return (
    <Button
      onClick={() =>
        toast.add({
          title: 'Task moved to trash',
          type: 'success',
          actionProps: { children: 'Undo', onClick: fn() },
        })
      }
    >
      Show Toast
    </Button>
  );
}
export const Notifications: Story = { render: () => <ToastExample /> };
