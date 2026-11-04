import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './Textarea';

const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  args: { placeholder: 'Add a description…', 'aria-label': 'Description' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'ghost'] },
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  decorators: [(Story) => <div style={{ width: 360 }}>{Story()}</div>],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
  args: {
    defaultValue:
      'Walk through the onboarding flow with Jesse, then file the gaps as tasks under the launch project.',
  },
};

/** The borderless description on task and note pages */
export const Ghost: Story = { args: { variant: 'ghost', placeholder: 'Add description…' } };

export const Invalid: Story = { args: { invalid: true } };
