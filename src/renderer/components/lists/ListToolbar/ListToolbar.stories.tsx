import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority } from '@common/types';
import { PageToolbar } from '../../shell/Page';
import { TooltipProvider } from '../../ui/Tooltip';
import {
  DemoToolbarEnd,
  DemoToolbarStart,
  type DemoToolbarEndProps,
  type DemoToolbarStartProps,
} from './fixtures';

/*
 * The list pages' toolbar: `ListStatusChip`, `ListFilters` and `ListDisplay` in a `PageToolbar`,
 * over sample choices (`fixtures.tsx`). Every control works.
 */

const meta = {
  title: 'Lists/ListToolbar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Toolbar({
  width = 1100,
  height = 80,
  start,
  end,
}: {
  width?: number;
  /** room under the row for an open menu */
  height?: number;
  start: DemoToolbarStartProps;
  end?: Partial<DemoToolbarEndProps>;
}) {
  return (
    <TooltipProvider>
      <div style={{ width, minHeight: height, paddingTop: 16, background: 'var(--background)' }}>
        <PageToolbar
          start={<DemoToolbarStart {...start} />}
          end={<DemoToolbarEnd list={start.list} compact={start.compact} {...end} />}
        />
      </div>
    </TooltipProvider>
  );
}

const FILTERED = { priority: [String(TaskPriority.HIGH)], source: 'external' };

/** Nothing filtered: the Status chip, and the Filter icon button and Display at the end. */
export const Tasks: Story = { render: () => <Toolbar start={{ list: 'tasks' }} /> };

/**
 * Two filters set: each is a chip after Status, its value opening the field's values and its ×
 * removing it. "Clear", at the row's end before the Filter button, removes both.
 */
export const Filtered: Story = {
  render: () => <Toolbar start={{ list: 'tasks', filters: FILTERED }} />,
};

/**
 * The Filter menu over fields that hold several values, "any of these": a field's item names two
 * ("High, Medium") and from three counts the rest ("Auth Overhaul +2"). In a field's submenu the
 * values are checkboxes (radio buttons for a field that holds one value, as Due and Source do)
 * and picking one leaves the menu open; "Any" unticks them all.
 */
export const SeveralValuesMenu: Story = {
  render: () => (
    <Toolbar
      height={640}
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
          project: ['Auth Overhaul', 'API Gateway v2', 'none'],
        },
      }}
      end={{ open: 'filter' }}
    />
  ),
};

/**
 * Three filters set, one holding two values: a chip each after Status, in the fields' order. A chip's value opens its field's values straight away; its × removes the filter.
 */
export const Chips: Story = {
  render: () => (
    <Toolbar
      height={320}
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
          due: 'week',
          project: ['Auth Overhaul', 'API Gateway v2'],
        },
      }}
    />
  ),
};

/** The Status chip's menu: the scopes, then each status alone. */
export const StatusMenu: Story = {
  render: () => <Toolbar height={360} start={{ list: 'tasks', open: 'status' }} />,
};

/** The Filter menu: an item for each field, showing what it is filtered to and opening its values. */
export const FilterMenu: Story = {
  render: () => (
    <Toolbar height={640} start={{ list: 'tasks', filters: FILTERED }} end={{ open: 'filter' }} />
  ),
};

/**
 * Every filter set, in a page too narrow for them: the row stays one line. The chips that fit are
 * drawn, and "+3" after them counts the rest; its menu has those fields.
 */
export const ManyFilters: Story = {
  render: () => (
    <Toolbar
      width={760}
      height={120}
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.NONE)],
          due: 'overdue',
          source: 'external',
          project: ['User Interface Revamp'],
        },
      }}
    />
  ),
};

/** Display: the layout, the grouping, and the sort with its direction. */
export const Display: Story = {
  render: () => <Toolbar height={260} start={{ list: 'tasks' }} end={{ open: true }} />,
};

/** The board orders and groups itself: Display names the layout and says why. */
export const Board: Story = {
  render: () => (
    <Toolbar
      height={200}
      start={{ list: 'tasks', status: 'all' }}
      end={{ layout: 'board', open: true }}
    />
  ),
};

/** A narrow window: Status and Display drop their values, which leaves the chips more room. */
export const Compact: Story = {
  render: () => <Toolbar width={640} start={{ list: 'tasks', filters: FILTERED, compact: true }} />,
};

/** Projects: one filter, so its menu has no search row; no grouping. */
export const Projects: Story = {
  render: () => <Toolbar start={{ list: 'projects' }} end={{ layout: 'cards' }} />,
};

/**
 * Notes have no status: their chip is the Type (All, or the standalone, task or event notes alone).
 * One filter is set: Clear is there too.
 */
export const Notes: Story = {
  render: () => <Toolbar start={{ list: 'notes', filters: { project: ['Auth Overhaul'] } }} />,
};

/** The filtered toolbar on the dark theme. */
export const FilteredDark: Story = {
  ...Filtered,
  name: 'Filtered — dark',
  globals: { theme: 'dark' },
};
