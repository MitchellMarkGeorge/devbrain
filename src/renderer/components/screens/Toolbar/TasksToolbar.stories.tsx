import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority } from '@common/types';
import { DemoToolbarEnd, DemoToolbarStart } from '../../lists/ListToolbar/fixtures';
import { PageToolbar } from '../../shell/Page';
import { TooltipProvider } from '../../ui/Tooltip';

/*
 * The tasks page's toolbar at the two window widths (1184px of page, and the compact window's
 * 904px): the Status chip and the Filter button (its badge counting the filters set) on the left, Display on
 * the right. A narrow window hides the buttons' values.
 */

function TasksToolbar({ compact = false }: { compact?: boolean }) {
  return (
    <TooltipProvider>
      <div style={{ width: compact ? 904 : 1184, background: 'var(--background)' }}>
        <PageToolbar
          start={
            <DemoToolbarStart
              list="tasks"
              compact={compact}
              filters={{ priority: [String(TaskPriority.HIGH)], source: 'external' }}
            />
          }
          end={<DemoToolbarEnd list="tasks" compact={compact} />}
        />
      </div>
    </TooltipProvider>
  );
}

const meta = {
  title: 'Screens/Toolbar/TasksToolbar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Status Open", the Filter button counting two filters, then "Display Priority" */
export const Wide: Story = { render: () => <TasksToolbar /> };

/** A compact window: Status and Display keep their names and drop their values */
export const Compact: Story = { render: () => <TasksToolbar compact /> };
