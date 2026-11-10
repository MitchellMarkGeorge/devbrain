import type { Meta, StoryObj } from '@storybook/react-vite';
import { SetDueDateButton } from './SetDueDateButton';

const meta = {
  title: 'Entities/SetDueDateButton',
  component: SetDueDateButton,
  args: { onDueDateChange: () => {} },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SetDueDateButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The button, as a row or card shows it while pointed at */
export const Default: Story = {};

/** The picker it opens */
export const Open: Story = { args: { defaultOpen: true } };
