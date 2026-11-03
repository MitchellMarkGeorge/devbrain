import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from '..';

const meta = {
  title: 'Controls/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  args: { 'aria-label': 'Description', placeholder: 'Add description…' },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Borderless: Story = { args: { variant: 'ghost' } };
