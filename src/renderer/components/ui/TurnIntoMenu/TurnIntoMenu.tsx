import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  Check,
  CircleCheck,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Type,
} from 'lucide-react';
import { mergeClassName } from '../../lib/cn';
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  menuItemVariants,
  menuStyles,
  type DropdownMenuContentProps,
} from '../DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import styles from './TurnIntoMenu.module.css';

/** A text block's type: what "Turn into" and the slash menu switch between. */
export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bulleted-list'
  | 'numbered-list'
  | 'todo-list'
  | 'code'
  | 'quote';

export interface BlockTypeOption {
  value: BlockType;
  label: string;
  icon: IconSource;
  /** the Markdown that makes it as you type ("#", "-", "```"), shown in the slash menu */
  markdown: string;
}

/** The block types in menu order. */
export const BLOCK_TYPES: readonly BlockTypeOption[] = [
  { value: 'text', label: 'Text', icon: Type, markdown: '' },
  { value: 'heading-1', label: 'Heading 1', icon: Heading1, markdown: '#' },
  { value: 'heading-2', label: 'Heading 2', icon: Heading2, markdown: '##' },
  { value: 'heading-3', label: 'Heading 3', icon: Heading3, markdown: '###' },
  { value: 'bulleted-list', label: 'Bulleted list', icon: List, markdown: '-' },
  { value: 'numbered-list', label: 'Numbered list', icon: ListOrdered, markdown: '1.' },
  { value: 'todo-list', label: 'To-do list', icon: ListTodo, markdown: '[ ]' },
  { value: 'code', label: 'Code', icon: Code, markdown: '```' },
  { value: 'quote', label: 'Quote', icon: Quote, markdown: '>' },
];

export interface TurnIntoMenuProps extends Omit<DropdownMenuContentProps, 'children'> {
  /** the selection's current block type: ticked on the right */
  value: BlockType;
  onValueChange?: (value: BlockType) => void;
  /** turns the block into a task; shown last, under a separator */
  onTurnIntoTask?: () => void;
  /** more items at the end */
  children?: ReactNode;
}

/**
 * The block types the selection can become, opened from the `FormatToolbar`'s block button:
 * "Turn into", then Text, the headings, the lists, Code and Quote, the current one ticked on the
 * right, then Task. Put it inside the `DropdownMenu` whose trigger is the block button.
 */
export function TurnIntoMenu({
  value,
  onValueChange,
  onTurnIntoTask,
  children,
  width = 'auto',
  className,
  ...props
}: TurnIntoMenuProps) {
  return (
    <DropdownMenuContent
      width={width}
      className={mergeClassName(styles.menu, className)}
      {...props}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel>Turn into</DropdownMenuLabel>
        <Menu.RadioGroup value={value} onValueChange={(next: BlockType) => onValueChange?.(next)}>
          {BLOCK_TYPES.map((option) => (
            <Menu.RadioItem key={option.value} value={option.value} className={menuItemVariants()}>
              {renderIcon(option.icon, 16)}
              <span className={menuStyles.itemLabel}>{option.label}</span>
              <Menu.RadioItemIndicator className={styles.tick}>
                <Icon icon={Check} size={16} />
              </Menu.RadioItemIndicator>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </DropdownMenuGroup>
      {onTurnIntoTask && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={CircleCheck} onClick={onTurnIntoTask}>
            Task
          </DropdownMenuItem>
        </>
      )}
      {children}
    </DropdownMenuContent>
  );
}
