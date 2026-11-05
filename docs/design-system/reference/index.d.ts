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
/** A button that is only an icon; `label` is its accessible name and its tooltip. */
export interface IconButtonProps {
  icon: IconName | Node;
  label: string;
  /** default 32px, sm 28px (editor toolbar, selection bar), xs 24px (sidebar, panel headers) */
  size?: 'default' | 'sm' | 'xs';
  /** ghost by default */
  variant?: 'ghost' | 'default' | 'secondary' | 'outline' | 'destructive' | 'primary';
  /** muted rests in muted-foreground and lifts on hover */
  tone?: 'default' | 'muted';
  /** the label by default, other content, or false for none */
  tooltip?: boolean | Node;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** draws the tooltip open, for static pictures */
  tooltipOpen?: boolean;
  /** a toggle that is on (aria-pressed) */
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
  /** leads the pill, before the icon or bar, in subtle-foreground: "Linked to", "Due" */
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
  /** DevBrain addition: outline (sections, the default), default (segmented) or line */ variant?:
    | 'outline'
    | 'default'
    | 'line';
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
  /** float over the page (narrow windows); docked beside the page otherwise */
  overlay?: boolean;
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
  /** `parent`: a subtask's parent task (corner arrow, then its status icon) */
  type: 'project' | 'note' | 'task' | 'event' | 'parent';
  /** a project's icon or an event's bar: a swatch-* colour */ color?: string;
  prefix?: string;
  children: Node;
}
/** The pill rows under a task or project title (replaces the side Properties card). */
export interface ProviderLogoProps {
  provider?: 'linear' | 'github';
  size?: number;
}
/** A synced task's source and key as one pill: "[logo] ENG-124". */
export interface SourcePillProps {
  provider?: 'linear' | 'github';
  /** the 20px version on board cards */
  compact?: boolean;
  children: Node;
}
/** The preview card that opens on hovering an entity pill. */
export interface EntityHoverCardProps {
  type: 'project' | 'event' | 'note' | 'task' | 'source';
  title: string;
  /** a project's folder or an event's bar */ color?: string;
  /** the task's status (type task) */ status?: TaskStatus;
  provider?: 'linear' | 'github';
  /** status, priority and date pills */ pills?: Node;
  /** quiet 12px lines: due date, time, edited, sync */ meta?: Node[];
  /** a note's first lines, clamped to two */ preview?: string;
  progress?: { value: number; label: string };
  /** xs buttons: Join, Open in Linear, Copy URL */ actions?: Node;
}
export interface PropertyRowProps {
  /** status, priority, DateRange, project, progress: in that order */
  properties: Node[];
  /** links to other items: the Linear badge, event, parent task, pull request */
  links?: Node[];
  /** false for synced tasks, whose fields come from the provider */
  addable?: boolean;
  /** a quiet note ending the links line, e.g. "Synced 3 min ago" */
  note?: string;
}
export interface DateRangeProps {
  /** omit to show the due date with a "+ Start date" pill */
  start?: string;
  due: string;
}
export interface Task {
  title: string;
  status: TaskStatus;
  key?: string;
  /** where a synced task comes from; shown with its key in a SourcePill (default linear) */
  source?: 'linear' | 'github';
  /** a subtask's parent: shown as the parent pill after the title */
  parent?: string;
  subtasks?: [number, number];
  project?: string;
  projectColor?: string;
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
  /**
   * How the pills stack when the row runs out of room. 'auto' (the default) measures the row:
   * first the pills after the title, then both sides; the title shortens only after that.
   * 'none', 'right' and 'both' pin a level, for pictures of the row.
   */
  stack?: 'auto' | 'none' | 'right' | 'both';
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
  /** the tile's ground; defaults to the icon or bar colour at 15% (a `*-tint` token) */
  tint?: string;
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
export interface NoteCardProps {
  title: string;
  updated: string;
  preview: string;
  /** the note's project or event pill: the Notes card view */
  link?: Node;
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
