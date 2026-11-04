import type { Ref } from 'react';
import { Calendar, CircleCheck, FileText, Link, ListCollapse, Minus, Table } from 'lucide-react';
import { DropdownMenuShortcut, menuStyles } from '../DropdownMenu';
import { renderIcon, type IconSource } from '../Icon';
import { BLOCK_TYPES, type BlockType } from '../TurnIntoMenu';
import {
  SuggestionMenu,
  type SuggestionGroup,
  type SuggestionMenuHandle,
  type SuggestionMenuProps,
} from './SuggestionMenu';

/** What a slash command inserts: a block type, or one of DevBrain's own blocks. */
export type SlashCommand =
  | BlockType
  | 'task'
  | 'link-note'
  | 'link-task'
  | 'mention-event'
  | 'divider'
  | 'table'
  | 'collapsible';

export interface SlashItem {
  value: SlashCommand;
  label: string;
  icon: IconSource;
  /** its Markdown shortcut, on the right ("#", "-", "---") */
  shortcut?: string;
  /** other words that find it ("h1", "checkbox") */
  keywords?: string[];
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
      { value: 'table', label: 'Table', icon: Table },
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
 * The editor's "/" menu, 260px wide under the caret: Basic blocks, Lists, DevBrain (Task, Link to
 * note, Link to task, Mention event) and Others (Divider, Table, Collapsible section), each with its Markdown shortcut. Typing after
 * the "/" narrows it to the matching items; the first match is highlighted.
 */
export function SlashMenu({ query = '', groups = SLASH_GROUPS, ...props }: SlashMenuProps) {
  return (
    <SuggestionMenu
      aria-label="Insert block"
      groups={filterSlashGroups(groups, query)}
      getKey={(item) => item.value}
      renderItem={(item) => (
        <>
          {renderIcon(item.icon, 16)}
          <span className={menuStyles.itemLabel}>{item.label}</span>
          {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
        </>
      )}
      {...props}
    />
  );
}
