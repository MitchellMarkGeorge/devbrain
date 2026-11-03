// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Button,
  Calendar,
  Checkbox,
  Command,
  Dialog,
  DropdownMenu,
  Field,
  Input,
  ProgressRing,
  RightClickMenu,
  Sheet,
  Sidebar,
  StatusMenu,
  SwatchPicker,
  Switch,
  Tabs,
  TaskList,
  Textarea,
  ToastProvider,
  useToast,
} from '..';
import type { Task } from '..';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.getAnimations = vi.fn().mockReturnValue([]);
});
afterEach(cleanup);
const tasks: Task[] = [
  { id: 'a', title: 'Build components', status: 'not-started', priority: 'high' },
  { id: 'b', title: 'Write stories', status: 'in-progress', priority: 'medium' },
];

describe('forms and controls', () => {
  it('associates field labels, validation and descriptions with the control', () => {
    render(
      <Field id="name" label="Task name" error="Enter a name" description="A short name">
        <Input id="name" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Task name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringContaining('A short name'));
    expect(screen.getByText('Enter a name')).toBeVisible();
  });
  it('labels and edits a textarea through Field', async () => {
    render(
      <Field id="description" label="Description">
        <Textarea id="description" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Description' });
    await userEvent.type(input, 'Keep the work in focus');
    expect(input).toHaveValue('Keep the work in focus');
  });
  it('toggles checkbox and switch with the keyboard and label', async () => {
    render(
      <>
        <Checkbox label="Select task" />
        <Switch label="Start at login" />
      </>,
    );
    await userEvent.click(screen.getByText('Select task'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    screen.getByRole('switch').focus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
  });
  it('supports radio keyboard navigation for swatches', async () => {
    const change = vi.fn();
    render(<SwatchPicker defaultValue="red" onValueChange={change} />);
    screen.getByRole('radio', { name: 'red' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'amber' })).toBeChecked();
    expect(change).toHaveBeenCalledWith('amber');
  });
  it('switches tab panels without activating disabled tabs', async () => {
    render(
      <Tabs
        items={[
          { value: 'one', label: 'Overview', content: 'Project overview' },
          { value: 'two', label: 'Unavailable', disabled: true },
          { value: 'three', label: 'Notes', content: 'Project notes' },
        ]}
      />,
    );
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Unavailable' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('tabpanel', { name: 'Notes' })).toHaveTextContent(
      'Project notes',
    );
  });
  it('selects a real date in the calendar', async () => {
    const select = vi.fn();
    render(<Calendar defaultMonth={new Date(2026, 10, 1)} onSelect={select} />);
    const day = screen.getAllByRole('button').find((button) => button.textContent === '12');
    await userEvent.click(day!);
    expect(select).toHaveBeenCalledWith(new Date(2026, 10, 12));
  });
});

describe('menus and overlays', () => {
  it('opens a menu, invokes an action and restores focus', async () => {
    const action = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[{ label: 'Duplicate', onClick: action }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(action).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('supports submenu and checkbox menu actions', async () => {
    const checked = vi.fn();
    const action = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { label: 'Show completed', checked: false, onCheckedChange: checked },
          { label: 'Link to', items: [{ label: 'Project', onClick: action }] },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show completed' }));
    expect(checked).toHaveBeenCalledWith(true, expect.anything());
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const submenu = await screen.findByRole('menuitem', { name: /Link to/ });
    submenu.focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Project' }));
    expect(action).toHaveBeenCalledOnce();
  });
  it('opens a right-click context menu', async () => {
    render(
      <RightClickMenu items={[{ label: 'Open note' }]}>
        <div>Note card</div>
      </RightClickMenu>,
    );
    await userEvent.pointer({ target: screen.getByText('Note card'), keys: '[MouseRight]' });
    expect(await screen.findByRole('menuitem', { name: 'Open note' })).toBeVisible();
  });
  it('traps dialog focus, supports escape and returns focus to its trigger', async () => {
    render(
      <Dialog title="New task" trigger={<Button>New Task</Button>} actionLabel="Create Task">
        <Input aria-label="Name" />
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'New Task' });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('keeps a failed asynchronous confirmation open and reports the error', async () => {
    render(
      <Dialog
        title="Delete task?"
        alert
        actionLabel="Delete"
        defaultOpen
        onAction={async () => {
          throw new Error('failed');
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be completed');
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });
  it('filters command groups and activates the highlighted result with Enter', async () => {
    const select = vi.fn();
    render(
      <Command
        groups={[
          {
            heading: 'Create',
            items: [{ label: 'New task', onSelect: select }, { label: 'New note' }],
          },
        ]}
      />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'task');
    expect(screen.queryByText('New note')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(select).toHaveBeenCalledOnce();
    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'xyz');
    expect(screen.getByText('No results found.')).toBeVisible();
  });
  it('changes a status with a numeric shortcut', async () => {
    const pick = vi.fn();
    render(<StatusMenu status="not-started" onPick={pick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    await screen.findByRole('menu', { name: 'Status' });
    await userEvent.keyboard('3');
    expect(pick).toHaveBeenCalledWith('completed');
  });
  it('docks a sheet in the layout and closes it', async () => {
    render(
      <Sheet title="Task details" overlay={false} defaultOpen>
        Details
      </Sheet>,
    );
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('displays a toast through the notification provider', async () => {
    function Example() {
      const manager = useToast();
      return (
        <Button onClick={() => manager.add({ title: 'Task saved', type: 'success' })}>Save</Button>
      );
    }
    render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Task saved')).toBeVisible();
    await userEvent.hover(screen.getByText('Task saved'));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Task saved')).not.toBeInTheDocument());
  });
});

describe('tasks and navigation', () => {
  it('moves focus, selects with X, updates status and clears selection', async () => {
    const change = vi.fn();
    const open = vi.fn();
    render(<TaskList tasks={tasks} onTaskChange={change} onOpenTask={open} />);
    const rows = screen.getAllByRole('row');
    rows[0].focus();
    await userEvent.keyboard('x{ArrowDown}x');
    expect(rows[1]).toHaveFocus();
    expect(rows.every((row) => row.getAttribute('aria-selected') === 'true')).toBe(true);
    const toolbar = screen.getByRole('toolbar');
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Completed/ }));
    expect(change).toHaveBeenCalledTimes(2);
    expect(change.mock.calls.every(([task]) => task.status === 'completed')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    rows[0].focus();
    await userEvent.keyboard('{Enter}');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'completed' }), 0);
  });
  it('opens the focused row status menu with S', async () => {
    const change = vi.fn();
    render(<TaskList tasks={tasks} onTaskChange={change} />);
    screen.getAllByRole('row')[0].focus();
    await userEvent.keyboard('s');
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /In progress/ }));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ status: 'in-progress' }), 0);
  });
  it('passes a complete date to the application when setting a bulk due date', async () => {
    const changed = vi.fn();
    render(<TaskList tasks={tasks} defaultSelected={[0]} onDueDateChange={changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Due date' }));
    await screen.findByRole('dialog');
    const day = screen.getAllByRole('button').find((button) => button.textContent === '12');
    await userEvent.click(day!);
    expect(changed).toHaveBeenCalledWith(expect.any(Date), [tasks[0]]);
    expect((changed.mock.calls[0][0] as Date).getFullYear()).toBe(new Date().getFullYear());
  });
  it('supports controlled selection without mutating task data', async () => {
    const selection = vi.fn();
    render(<TaskList tasks={tasks} selected={[0]} onSelectionChange={selection} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Write stories' }));
    expect(selection).toHaveBeenCalledWith([0, 1]);
    expect(tasks[0].status).toBe('not-started');
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'false');
  });
  it('navigates from a collapsed sidebar with accessible names', async () => {
    const navigate = vi.fn();
    render(<Sidebar defaultCollapsed onNavigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Tasks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('button', { name: 'Collapse Sidebar' })).toBeVisible();
  });
  it('handles empty and out-of-range progress without invalid geometry', () => {
    const { container } = render(
      <>
        <ProgressRing value={3} total={0} />
        <ProgressRing value={10} total={4} />
      </>,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
