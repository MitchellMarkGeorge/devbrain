/**
 * DevBrain components: shadcn/ui (new-york-v4) on DevBrain tokens, plus DevBrain components.
 * window.DevBrain.<Name>. In the app these are shadcn's components on Base UI (@base-ui/react)
 * primitives; `render` replaces shadcn's `asChild`.
 */
type Node = React.ReactNode;
type IconName = string; // a Lucide icon name, e.g. 'folder', 'circle-check'
type TaskStatus = 'not-started' | 'in-progress' | 'completed' | 'overdue' | 'cancelled';
type Priority = 'high' | 'medium' | 'low';
type Health = 'on-track' | 'at-risk' | 'off-track' | 'not-started' | 'completed';
type Swatch = 'red' | 'amber' | 'green' | 'blue' | 'indigo' | 'pink';

// shadcn base
export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
}
export interface ButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  /** shadcn: default, sm, lg, icon. DevBrain additions: xs, icon-sm, icon-xs. */
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs' | 'icon-sm' | 'icon-xs';
  icon?: IconName | Node;
  trailingIcon?: IconName | Node;
  /** DevBrain Nova Lists: the current choice, shown after the label ("Filter  Assigned to me") */ value?: Node;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
  children?: Node;
}
export interface ButtonGroupProps {
  children: Node;
}
export interface BadgeProps {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  /** DevBrain additions on outline badges */
  icon?: IconName | Node;
  iconColor?: string;
  barColor?: string;
  prefix?: string;
  muted?: boolean;
  asButton?: boolean;
  onClick?: () => void;
  children: Node;
}
export interface ToggleGroupProps {
  items: { value: string; label?: string; icon?: IconName; iconColor?: string }[];
  defaultValue?: string;
  label?: string;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}
export interface TabsProps {
  items: string[];
  defaultValue?: string;
  /** DevBrain addition */ variant?: 'default' | 'line';
}
export interface InputProps {
  id?: string;
  placeholder?: string;
  defaultValue?: string;
  invalid?: boolean;
}
export interface TextareaProps {
  id?: string;
  placeholder?: string;
  defaultValue?: string;
}
export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: Node;
}
export interface CheckboxProps {
  defaultChecked?: boolean;
  label?: string;
}
export interface SwitchProps {
  defaultChecked?: boolean;
  label?: Node;
}
export interface MenuItem {
  heading?: string;
  separator?: boolean;
  icon?: IconName;
  label?: string;
  shortcut?: string;
  submenu?: boolean;
  checked?: boolean;
  destructive?: boolean;
  highlighted?: boolean;
}
export interface DropdownMenuProps {
  items: MenuItem[];
  width?: number;
}
export interface CommandProps {
  placeholder?: string;
  groups: { heading: string; items: { icon?: IconName; label: string; shortcut?: string }[] }[];
}
export interface TooltipProps {
  children: Node;
}
export interface DialogProps {
  title: string;
  description?: string;
  actionLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** AlertDialog */ alert?: boolean;
  children?: Node;
}
export interface SheetProps {
  title: string;
  description?: string;
  children?: Node;
}
export interface ToastProps {
  tone?: 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  action?: string;
}
export interface CardProps {
  title: Node;
  description?: Node;
  action?: Node;
  children?: Node;
}
export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
}
export interface ProgressProps {
  value: number;
}
export interface KbdProps {
  children: Node;
}
export interface BreadcrumbProps {
  items: string[];
  icon?: IconName | Node;
  iconColor?: string;
}
export interface SidebarProps {
  workspace?: string;
  workspaceColor?: Swatch;
  active?: string;
  recents?: SidebarEntry[];
  favorites?: SidebarEntry[];
}
export interface SidebarEntry {
  label: string;
  icon?: IconName;
  color?: string;
  bar?: string;
}
export interface CalendarProps {
  title?: string;
  today?: number;
  selected?: number;
  firstWeekday?: number;
  days?: number;
  prevMonthDays?: number;
}

// DevBrain
export interface StatusIconProps {
  status: TaskStatus;
  size?: number;
}
export interface PriorityIconProps {
  priority: Priority;
  size?: number;
}
export interface HealthIconProps {
  health: Health;
  size?: number;
}
export interface ProgressRingProps {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  color?: string;
}
export interface EntityPillProps {
  type: 'project' | 'note' | 'task' | 'event';
  color?: string;
  prefix?: string;
  children: Node;
}
export interface PropertyPanelProps {
  title?: string;
  fields: { label: string; values: Node[] }[];
}
export interface Task {
  title: string;
  status: TaskStatus;
  key?: string;
  parent?: string;
  subtasks?: [number, number];
  project?: string;
  event?: string;
  eventColor?: string;
  note?: string;
  priority: Priority;
  date?: string;
  dateTone?: 'today' | 'overdue';
  selected?: boolean;
}
export interface TaskRowProps {
  task: Task;
  selected?: boolean;
  joinPrev?: boolean;
  joinNext?: boolean;
  state?: 'hover' | 'focus';
  menuOpen?: boolean;
  subtask?: boolean;
  status?: TaskStatus;
  onSelect?: () => void;
  onStatusChange?: (s: TaskStatus) => void;
}
export interface TaskListProps {
  tasks: Task[];
  defaultSelected?: number[];
  states?: Record<number, 'hover' | 'focus'>;
  menuOpenAt?: number;
  subtasks?: boolean;
  selectionBar?: boolean;
  floatingBar?: boolean;
}
export interface StatusMenuProps {
  status: TaskStatus;
  onPick?: (s: TaskStatus) => void;
  floating?: boolean;
}
export interface SelectionBarProps {
  count: number;
  onClear?: () => void;
  floating?: boolean;
}
export interface BoardColumnProps {
  name: string;
  status: TaskStatus;
  count?: number;
  add?: boolean;
  children?: Node;
}
export interface BoardCardProps {
  task: Task;
  state?: 'hover' | 'focus';
}
export interface GroupHeadingProps {
  label: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  bar?: string;
  done?: number;
  total?: number;
  count?: number;
  collapsed?: boolean;
}
export interface EventRowProps {
  event: {
    title: string;
    time: string;
    repeats?: string;
    meeting?: boolean;
    relative: string;
    tone?: 'today' | 'overdue';
    color?: string;
  };
}
export interface ScheduleCardProps {
  title: string;
  time: string;
  duration?: string;
  soon?: string;
  color?: string;
  join?: boolean;
}
export interface NoteCardProps {
  title: string;
  updated: string;
  preview: string;
}
export interface WorkspaceTileProps {
  letter: string;
  color?: Swatch;
  size?: number;
}
export interface SwatchPickerProps {
  defaultValue?: Swatch;
}
export interface SettingsGroupProps {
  rows: { label: string; description?: string; value?: string; control?: Node }[];
}
export interface EventBlockProps {
  title: string;
  time: string;
  color?: string;
  meeting?: boolean;
  height?: number;
}
