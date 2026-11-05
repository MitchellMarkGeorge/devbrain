import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Folder } from 'lucide-react';
import { Breadcrumb } from './Breadcrumb';

const meta = {
  title: 'UI/Breadcrumb',
  component: Breadcrumb,
  args: {
    items: [
      { label: 'Projects', href: '#' },
      { label: 'Onboarding rewrite', icon: Folder, iconColor: 'var(--swatch-blue)' },
    ],
  },
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Note: Story = {
  args: {
    items: [
      { label: 'Notes', href: '#' },
      { label: 'Q3 roadmap', icon: FileText },
    ],
  },
};

export const ThreeLevels: Story = {
  args: {
    items: [
      { label: 'Projects', href: '#' },
      { label: 'Onboarding rewrite', href: '#' },
      { label: 'Ship the welcome screen', icon: FileText },
    ],
  },
};

/** In a narrow bar the middle items shorten first; the first and last keep their names */
export const Narrow: Story = {
  args: {
    items: [
      { label: 'Projects', href: '#' },
      { label: 'A project with a very long name indeed', href: '#' },
      { label: 'Write the migration guide for calendars', icon: FileText },
    ],
  },
  decorators: [(Story) => <div style={{ width: 360 }}>{Story()}</div>],
};
