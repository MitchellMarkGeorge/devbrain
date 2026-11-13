import type { Meta, StoryObj } from '@storybook/react-vite';
import { HintLabel } from './HintLabel';

const meta = {
  title: 'Shell/HintLabel',
  component: HintLabel,
  args: { label: 'as' },
} satisfies Meta<typeof HintLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `a` typed: the label's first key dims, the others still to type. */
export const Typed: Story = { args: { typed: 1 } };

/** One letter, while few targets are on screen. */
export const Single: Story = { args: { label: 'f' } };
