import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TableOfContents, type TableOfContentsItem } from './TableOfContents';

const ITEMS: TableOfContentsItem[] = [
  { id: 'context', label: 'Context', level: 1 },
  { id: 'goals', label: 'Goals', level: 2 },
  { id: 'non-goals', label: 'Non-goals', level: 2 },
  { id: 'design', label: 'Design', level: 1 },
  { id: 'storage', label: 'Storage and the migration that moves every existing row', level: 2 },
  { id: 'rollout', label: 'Rollout', level: 3 },
  { id: 'open-questions', label: 'Open questions', level: 1 },
];

const meta = {
  title: 'Editor/TableOfContents',
  component: TableOfContents,
  args: { items: ITEMS, activeId: 'storage', onSelect: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 'var(--outline-width)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TableOfContents>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A note's headings, the one being read marked on the rail; a long one is cut short */
export const Default: Story = {};

/** Choosing a heading marks it (the page scrolls to it) */
export const Interactive: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<string | null>('context');
    return <TableOfContents {...args} activeId={active} onSelect={setActive} />;
  },
};

/** Above the first heading: nothing marked yet */
export const NothingActive: Story = { args: { activeId: null } };
