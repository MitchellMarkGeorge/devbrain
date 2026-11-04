import type { Editor, Range } from '@tiptap/core';
import {
  AtSign,
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Type,
} from 'lucide-react';
import { createSuggestionMenu } from './suggestion';
import type { SuggestionItem } from './SuggestionMenu';

/**
 * The slash menu: "/" at the start of a word opens the blocks to insert, grouped as Command.md
 * lists them. Typing filters by label or alias ("/h2", "/todo"). Media waits for attachments.
 */

interface SlashItem extends SuggestionItem {
  aliases: string[];
  run: (editor: Editor, range: Range) => void;
}

const icon = { size: 16, strokeWidth: 1.75 };

const SLASH_ITEMS: SlashItem[] = [
  {
    key: 'text',
    label: 'Text',
    group: 'Basic blocks',
    icon: <Type {...icon} />,
    aliases: ['paragraph', 'p'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map(
    (level): SlashItem => ({
      key: `heading-${level}`,
      label: `Heading ${level}`,
      group: 'Basic blocks',
      icon: [
        <Heading1 key={1} {...icon} />,
        <Heading2 key={2} {...icon} />,
        <Heading3 key={3} {...icon} />,
      ][level - 1],
      hint: '#'.repeat(level),
      aliases: [`h${level}`, 'title'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level }).run(),
    }),
  ),
  {
    key: 'quote',
    label: 'Quote',
    group: 'Basic blocks',
    icon: <Quote {...icon} />,
    hint: '>',
    aliases: ['blockquote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    key: 'code',
    label: 'Code block',
    group: 'Basic blocks',
    icon: <Code {...icon} />,
    hint: '```',
    aliases: ['snippet', 'pre'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    key: 'details',
    label: 'Collapsible section',
    group: 'Basic blocks',
    icon: <ChevronRight {...icon} />,
    aliases: ['details', 'toggle', 'collapse', 'summary'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setDetails().run(),
  },
  {
    key: 'divider',
    label: 'Divider',
    group: 'Basic blocks',
    icon: <Minus {...icon} />,
    hint: '---',
    aliases: ['hr', 'rule', 'separator'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    key: 'bullet-list',
    label: 'Bulleted list',
    group: 'List blocks',
    icon: <List {...icon} />,
    hint: '-',
    aliases: ['ul', 'unordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: 'ordered-list',
    label: 'Numbered list',
    group: 'List blocks',
    icon: <ListOrdered {...icon} />,
    hint: '1.',
    aliases: ['ol', 'ordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: 'task-list',
    label: 'To-do list',
    group: 'List blocks',
    icon: <ListChecks {...icon} />,
    hint: '[ ]',
    aliases: ['todo', 'checkbox', 'task'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: 'table',
    label: 'Table',
    group: 'Others',
    icon: <Table {...icon} />,
    aliases: ['grid'],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    key: 'link-to',
    label: 'Link to…',
    group: 'Others',
    icon: <AtSign {...icon} />,
    hint: '@',
    aliases: ['mention', 'task', 'project', 'note', 'event'],
    // opens the "@" menu in its place
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent('@').run(),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) || item.aliases.some((alias) => alias.startsWith(q)),
  );
}

export const SlashMenu = createSuggestionMenu<SlashItem>({
  name: 'slashMenu',
  char: '/',
  emptyLabel: 'No matching blocks',
  items: (query) => filterSlashItems(query),
  select: (editor, range, item) => item.run(editor, range),
});
