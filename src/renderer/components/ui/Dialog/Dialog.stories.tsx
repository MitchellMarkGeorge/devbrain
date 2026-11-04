import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Trash2 } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Button } from '../Button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 420, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// a stand-in field until the Input component lands
const fieldStyle = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--input)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--input-fill)',
  color: 'var(--foreground)',
};

export const CreateTask: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger render={<Button icon={Plus} />}>New Task</DialogTrigger>
      <DialogContent size="form">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>It goes to your inbox until you give it a project.</DialogDescription>
        </DialogHeader>
        <Stack gap="2">
          <Text weight="medium" render={<label htmlFor="task-name" />}>
            Name
          </Text>
          <input id="task-name" placeholder="Ship the onboarding flow" style={fieldStyle} />
        </Stack>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button>Create Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const CreateTaskOpen: Story = { ...CreateTask, args: { defaultOpen: true } };

function DeleteTask({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <AlertDialog defaultOpen={defaultOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" icon={Trash2} />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete task?</AlertDialogTitle>
          <AlertDialogDescription>
            “Ship the onboarding flow” and its 3 subtasks move to the trash. Its note stays,
            unlinked. You can restore them from the trash for 30 days.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />}>Delete Task</AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** An AlertDialog: no ×, and the destructive action says what happens to linked items. */
export const DeleteConfirmation: Story = { render: () => <DeleteTask /> };

export const DeleteConfirmationOpen: Story = { render: () => <DeleteTask defaultOpen /> };
