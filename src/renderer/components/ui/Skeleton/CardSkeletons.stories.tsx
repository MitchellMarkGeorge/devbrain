import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailSkeleton, NoteCardSkeleton } from './CardSkeletons';

const meta = {
  title: 'UI/Card skeletons',
  component: NoteCardSkeleton,
} satisfies Meta<typeof NoteCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoteCard: Story = {
  render: () => (
    <div style={{ width: 368 }}>
      <NoteCardSkeleton />
    </div>
  ),
};
export const Detail: Story = {
  render: () => (
    <div style={{ width: 720 }}>
      <DetailSkeleton />
    </div>
  ),
};
