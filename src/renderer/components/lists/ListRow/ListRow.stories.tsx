import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Folder } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../entities/EntityPill';
import { Icon } from '../../ui/Icon';
import { ListRow } from './ListRow';

const meta = {
  title: 'Lists/ListRow',
  component: ListRow,
  args: {
    icon: <Icon icon={FileText} size={16} />,
    title: 'PKCE design notes',
    excerpt: 'S256 challenge, 96-char verifier, 10-minute code TTL.',
    meta: '2h ago',
    onSelect: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: <EntityPill type="task">Write PKCE migration guide</EntityPill> },
};

/** Rest, hover (checkbox shows), selected, keyboard focus and muted. */
export const States: Story = {
  render: (args) => (
    <div>
      <ListRow {...args} />
      <ListRow {...args} state="hover" />
      <ListRow {...args} selected />
      <ListRow {...args} state="focus" />
      <ListRow {...args} muted />
    </div>
  ),
};

/** Buttons that show while the row is pointed at or focused, after the meta text. */
export const HoverActions: Story = {
  args: {
    icon: <Icon icon={Folder} size={16} />,
    title: 'AI Action Items',
    excerpt: undefined,
    meta: 'Trashed 1d ago',
    metaWidth: 88,
    state: 'hover',
    actions: (
      <>
        <Button variant="outline" size="xs">
          Restore
        </Button>
        <Button variant="destructive" size="xs">
          Delete
        </Button>
      </>
    ),
  },
};
