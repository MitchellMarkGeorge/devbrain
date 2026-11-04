import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ClipboardCopy,
  ExternalLink,
  FileText,
  FolderKanban,
  Link,
  Star,
  Trash2,
} from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Icon } from '../Icon';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './ContextMenu';

const meta = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-click the note row: the note's menu (no "…" button on the row). */
export const NoteRow: Story = {
  render: (args) => (
    <ContextMenu {...args}>
      <ContextMenuTrigger
        style={{
          width: 420,
          height: 48,
          padding: '0 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--row-selected)',
        }}
      >
        <Flex align="center" gap="2" style={{ height: '100%' }}>
          <Icon icon={FileText} style={{ color: 'var(--muted-foreground)' }} />
          <Text tone="strong">Q3 planning notes</Text>
          <Text size="xs" tone="subtle" style={{ marginLeft: 'auto' }}>
            Right-click me
          </Text>
        </Flex>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={ExternalLink} shortcut="↵">
          Open note
        </ContextMenuItem>
        <ContextMenuItem icon={Star} shortcut="F">
          Favorite
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={Link}>Change link</ContextMenuSubTrigger>
          <ContextMenuSubContent width="sm">
            <ContextMenuItem>Ship onboarding</ContextMenuItem>
            <ContextMenuItem>Mitchell / Jesse 1:1</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={FolderKanban}>Change project</ContextMenuSubTrigger>
          <ContextMenuSubContent width="sm">
            <ContextMenuItem>DevBrain app</ContextMenuItem>
            <ContextMenuItem>Website</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem icon={ClipboardCopy}>Copy as Markdown</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={Trash2} variant="destructive">
          Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
