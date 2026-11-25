import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  Calendar,
  CircleCheck,
  FileText,
  Info,
  Link,
  ListCollapse,
  Minus,
  Table,
} from 'lucide-react';
import { DropdownMenuShortcut, menuStyles } from '../../ui/DropdownMenu';
import { renderIcon, type IconSource } from '../../ui/Icon';
import { BLOCK_TYPES, type BlockType } from '../TurnIntoMenu';
import {
  DEFAULT_TABLE_SIZE,
  TABLE_SIZE_LIMIT,
  TableSizePicker,
  type TableSize,
} from '../TableSizePicker';
import {
  resolveHighlighted,
  SuggestionMenu,
  type SuggestionGroup,
  type SuggestionMenuHandle,
  type SuggestionMenuProps,
} from './SuggestionMenu';
import styles from './SlashMenu.module.css';

/** What a slash command inserts: a block type, or one of DevBrain's own blocks. */
export type SlashCommand =
  | BlockType
  | 'task'
  | 'link-note'
  | 'link-task'
  | 'mention-event'
  | 'divider'
  | 'table'
  | 'collapsible'
  | 'callout';

export interface SlashItem {
  value: SlashCommand;
  label: string;
  icon: IconSource;
  /** its Markdown shortcut, on the right ("#", "-", "---") */
  shortcut?: string;
  /** other words that find it ("h1", "checkbox") */
  keywords?: string[];
  /** Table's size, when one was picked beside it */
  tableSize?: TableSize;
}

const block = (value: BlockType, keywords?: string[]): SlashItem => {
  const option = BLOCK_TYPES.find((type) => type.value === value)!;
  return {
    value,
    label: option.label,
    icon: option.icon,
    shortcut: option.markdown || undefined,
    keywords,
  };
};

/** The slash menu's commands, grouped as it shows them. */
export const SLASH_GROUPS: SuggestionGroup<SlashItem>[] = [
  {
    label: 'Basic blocks',
    items: [
      block('text', ['paragraph']),
      block('heading-1', ['h1', 'title']),
      block('heading-2', ['h2']),
      block('heading-3', ['h3']),
      block('code', ['snippet']),
      block('quote', ['blockquote']),
      {
        value: 'callout',
        label: 'Callout',
        icon: Info,
        keywords: ['alert', 'note', 'tip', 'important', 'warning', 'caution'],
      },
    ],
  },
  {
    label: 'Lists',
    items: [
      block('bulleted-list', ['ul', 'bullet']),
      block('numbered-list', ['ol', 'ordered']),
      block('todo-list', ['checkbox', 'checklist']),
    ],
  },
  {
    label: 'DevBrain',
    items: [
      { value: 'task', label: 'Task', icon: CircleCheck, keywords: ['todo'] },
      { value: 'link-note', label: 'Link to note', icon: FileText },
      { value: 'link-task', label: 'Link to task', icon: Link },
      { value: 'mention-event', label: 'Mention event', icon: Calendar, keywords: ['meeting'] },
    ],
  },
  {
    label: 'Others',
    items: [
      {
        value: 'divider',
        label: 'Divider',
        icon: Minus,
        shortcut: '---',
        keywords: ['rule', 'separator'],
      },
      { value: 'table', label: 'Table', icon: Table, keywords: ['grid', 'columns'] },
      {
        value: 'collapsible',
        label: 'Collapsible section',
        icon: ListCollapse,
        keywords: ['details', 'toggle', 'summary'],
      },
    ],
  },
];

/** The groups with only the items whose label or keywords contain `query`. */
export function filterSlashGroups(
  groups: SuggestionGroup<SlashItem>[],
  query: string,
): SuggestionGroup<SlashItem>[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some((word) => word.toLowerCase().startsWith(q)),
    ),
  }));
}

export interface SlashMenuProps extends Omit<
  SuggestionMenuProps<SlashItem>,
  'groups' | 'getKey' | 'renderItem'
> {
  /** what was typed after "/"; narrows the list */
  query?: string;
  /** the commands; `SLASH_GROUPS` by default */
  groups?: SuggestionGroup<SlashItem>[];
  handleRef?: Ref<SuggestionMenuHandle>;
}

/**
 * The editor's "/" menu, 260px wide under the caret: Basic blocks (with Callout), Lists, DevBrain
 * (Task, Link to note, Link to task, Mention event) and Others (Divider, Table, Collapsible
 * section), each with its Markdown shortcut. Typing after the "/" narrows it to the matching items;
 * the first match is highlighted.
 *
 * While Table is highlighted, a `TableSizePicker` opens beside the list. Pointing at it picks a
 * size; → moves the arrow keys into it (←, →, ↑ and ↓ then change the size, and ← past one column
 * gives them back to the list), and ↵ inserts a table of that size. ↵ on Table itself inserts 3 × 3.
 * The picked size comes back on the item, as `tableSize`.
 */
export function SlashMenu({
  query = '',
  groups = SLASH_GROUPS,
  handleRef,
  onSelect,
  ...props
}: SlashMenuProps) {
  const list = useRef<SuggestionMenuHandle>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [size, setSize] = useState<TableSize>(DEFAULT_TABLE_SIZE);
  const [sizing, setSizing] = useState(false);
  const visible = filterSlashGroups(groups, query);
  const tableItem = visible.flatMap((group) => group.items).find((item) => item.value === 'table');
  // the list's highlight is held here, so the picker shows in the same render as Table's highlight
  const keys = visible.flatMap((group) => group.items.map((item) => item.value));
  const showPicker = resolveHighlighted(keys, highlighted) === 'table' && tableItem !== undefined;

  const pickSize = (picked: TableSize) => {
    if (tableItem) onSelect?.({ ...tableItem, tableSize: picked });
  };

  useImperativeHandle(handleRef, () => ({
    onKeyDown(event) {
      if (showPicker && sizing) {
        const clamp = (n: number, max: number) => Math.max(1, Math.min(max, n));
        if (event.key === 'ArrowLeft' && size.cols === 1) {
          setSizing(false);
          return true;
        }
        const step: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        if (step[event.key]) {
          const [cols, rows] = step[event.key];
          setSize({
            cols: clamp(size.cols + cols, TABLE_SIZE_LIMIT.cols),
            rows: clamp(size.rows + rows, TABLE_SIZE_LIMIT.rows),
          });
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          pickSize(size);
          return true;
        }
      }
      if (showPicker && event.key === 'ArrowRight') {
        setSizing(true);
        return true;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') setSizing(false);
      return list.current?.onKeyDown(event) ?? false;
    },
  }));

  const menu = (
    <SuggestionMenu
      aria-label="Insert block"
      groups={visible}
      getKey={(item) => item.value}
      renderItem={(item) => (
        <>
          {renderIcon(item.icon, 16)}
          <span className={menuStyles.itemLabel}>{item.label}</span>
          {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
        </>
      )}
      handleRef={list}
      onSelect={onSelect}
      highlighted={highlighted}
      onHighlightedChange={setHighlighted}
      {...props}
    />
  );
  if (!showPicker) return menu;
  return (
    <div className={styles.withPicker}>
      {menu}
      <TableSizePicker
        value={size}
        keyboard={sizing}
        onValueChange={(next) => {
          setSize(next);
          setSizing(false);
        }}
        onSelect={pickSize}
      />
    </div>
  );
}
