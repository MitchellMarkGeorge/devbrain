import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoteCardSkeleton } from '../../ui/Skeleton';
import { CardGrid } from './CardGrid';

const meta = {
  title: 'Shell/CardGrid',
  component: CardGrid,
  decorators: [
    (Story) => (
      <div style={{ width: 816 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeColumns: Story = {
  render: () => (
    <CardGrid gap="md">
      {Array.from({ length: 5 }, (_, i) => (
        <NoteCardSkeleton key={i} />
      ))}
    </CardGrid>
  ),
};

/** Home: one row only; the rest are behind "All notes". */
export const SingleRow: Story = {
  render: () => (
    <CardGrid singleRow>
      {Array.from({ length: 5 }, (_, i) => (
        <NoteCardSkeleton key={i} />
      ))}
    </CardGrid>
  ),
};
