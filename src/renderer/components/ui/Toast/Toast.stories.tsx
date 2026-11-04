import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Button } from '../Button';
import { toast, toastManager, ToastProvider } from './Toast';

const meta = {
  title: 'Components/Toast',
  component: ToastProvider,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div style={{ minHeight: 420, padding: 24 }}>
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

const examples = {
  trash: () =>
    toast({
      title: 'Task moved to trash',
      description: '“Ship the onboarding flow” and 3 subtasks.',
      action: { label: 'Undo', onClick: () => undefined },
    }),
  success: () =>
    toast({ tone: 'success', title: 'Synced with Linear', description: '12 tasks updated.' }),
  warning: () =>
    toast({
      tone: 'warning',
      title: 'Calendar is read-only',
      description: 'Events from this calendar can’t be edited in DevBrain.',
    }),
  error: () =>
    toast({
      tone: 'error',
      title: 'Couldn’t sync with Linear',
      description: 'Check your connection and try again.',
      action: { label: 'Retry', onClick: () => undefined },
    }),
};

export const Playground: Story = {
  args: { children: null },
  render: () => (
    <Flex gap="2" wrap="wrap">
      <Button onClick={examples.trash}>Move to trash</Button>
      <Button onClick={examples.success}>Success</Button>
      <Button onClick={examples.warning}>Warning</Button>
      <Button onClick={examples.error}>Error</Button>
    </Flex>
  ),
};

function ShowOnMount({ show }: { show: () => string }) {
  useEffect(() => {
    // after the provider's own effect, which subscribes it to the manager
    let id: string | undefined;
    const timer = setTimeout(() => (id = show()));
    return () => {
      clearTimeout(timer);
      if (id) toastManager.close(id);
    };
  }, [show]);
  return null;
}

export const Undo: Story = {
  args: { children: null },
  render: () => <ShowOnMount show={examples.trash} />,
};
export const Success: Story = {
  args: { children: null },
  render: () => <ShowOnMount show={examples.success} />,
};
export const Error: Story = {
  args: { children: null },
  render: () => <ShowOnMount show={examples.error} />,
};
