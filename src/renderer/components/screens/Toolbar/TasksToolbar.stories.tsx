import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, Group, Kanban, List, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ToggleGroup } from '../../ui/ToggleGroup';

/*
 * Figma: v2 Screens › Tasks › "Tasks (list)" toolbar (7155:6011, 1184px) and its compact window
 * "1 · Tasks list — toolbar values hidden" (7608:44196, 904px). A 46px strip: 24px sides, 12px
 * below, items 8px apart; Filter on the left, then Sort, the view switcher and New Task on the
 * right. A narrow window hides the toolbar buttons' values.
 */

function TasksToolbar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="toolbar"
      aria-label="Tasks"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 24px 12px',
        width: compact ? 904 : 1184,
        background: 'var(--background)',
      }}
    >
      <Button icon={ListFilter} value="Open" hideValue={compact}>
        Filter
      </Button>
      <div style={{ flex: 1 }} />
      <Button icon={ArrowUpDown} value="Priority" hideValue={compact}>
        Sort
      </Button>
      <ToggleGroup
        aria-label="View"
        items={[
          { value: 'list', icon: List },
          { value: 'group', icon: Group },
          { value: 'board', icon: Kanban },
        ]}
      />
      <Button icon={Plus}>New Task</Button>
    </div>
  );
}

const meta = {
  title: 'Screens/Toolbar/TasksToolbar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tasks (list): "Filter Open", "Sort Priority", the List / Group / Board switcher, New Task */
export const Wide: Story = { render: () => <TasksToolbar /> };

/** A compact window: the toolbar buttons keep their labels and drop their values */
export const Compact: Story = { render: () => <TasksToolbar compact /> };
