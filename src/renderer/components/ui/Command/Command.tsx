import type { ComponentProps, ReactNode } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import {
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  menuItemVariants,
  menuStyles,
} from '../DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { VisuallyHidden } from '../../layout/VisuallyHidden';
import styles from './Command.module.css';

export type CommandProps<ItemValue> = Autocomplete.Root.Props<ItemValue> & {
  /** classes for the surface around the list */
  className?: string;
  /** inside `CommandDialog`, which draws the surface itself */
  bare?: boolean;
};

/**
 * A searchable list of commands or items: the editor's slash menu, "Link to…", the project
 * picker, and ⌘K search inside `CommandDialog`. Pass `items` (flat, or groups of
 * `{ value, items }`) and render them with a function child of `CommandList`.
 * ```tsx
 * <Command items={groups}>
 *   <CommandInput placeholder="Link to…" />
 *   <CommandEmpty>No results</CommandEmpty>
 *   <CommandList>
 *     {(group) => (
 *       <CommandGroup key={group.value} items={group.items} label={group.value}>
 *         <CommandCollection>{(item) => <CommandItem key={item.value} value={item}>…</CommandItem>}</CommandCollection>
 *       </CommandGroup>
 *     )}
 *   </CommandList>
 * </Command>
 * ```
 */
export function Command<ItemValue>({ className, bare, ...props }: CommandProps<ItemValue>) {
  const Root = Autocomplete.Root as (props: Autocomplete.Root.Props<ItemValue>) => ReactNode;
  return (
    <div className={cn(styles.command, bare && styles.bare, className)}>
      <Root open inline autoHighlight="always" keepHighlight {...props} />
    </div>
  );
}

export type CommandInputProps = Autocomplete.Input.Props;

/** The search row: a search icon and the input. */
export function CommandInput({ className, ...props }: CommandInputProps) {
  return (
    <Autocomplete.InputGroup className={styles.inputGroup}>
      <Icon icon={Search} />
      <Autocomplete.Input className={mergeClassName(styles.input, className)} {...props} />
    </Autocomplete.InputGroup>
  );
}

export function CommandList({ className, ...props }: Autocomplete.List.Props) {
  return <Autocomplete.List className={mergeClassName(styles.list, className)} {...props} />;
}

/** Shown when nothing matches the search. */
export function CommandEmpty({ className, ...props }: Autocomplete.Empty.Props) {
  return <Autocomplete.Empty className={mergeClassName(styles.empty, className)} {...props} />;
}

export interface CommandGroupProps extends Autocomplete.Group.Props {
  /** the group's uppercase label ("Tasks") */
  label?: ReactNode;
  /** a result count beside the label; link groups such as "Go to" have none */
  count?: number;
}

export function CommandGroup({ label, count, className, children, ...props }: CommandGroupProps) {
  return (
    <Autocomplete.Group className={mergeClassName(styles.group, className)} {...props}>
      {label != null && <CommandGroupLabel count={count}>{label}</CommandGroupLabel>}
      {children}
    </Autocomplete.Group>
  );
}

export interface CommandGroupLabelProps extends Autocomplete.GroupLabel.Props {
  count?: number;
}

export function CommandGroupLabel({
  count,
  className,
  children,
  ...props
}: CommandGroupLabelProps) {
  return (
    <Autocomplete.GroupLabel className={mergeClassName(styles.groupLabel, className)} {...props}>
      {children}
      {count != null && <span className={styles.count}>{count}</span>}
    </Autocomplete.GroupLabel>
  );
}

/** Renders a group's items: `<CommandCollection>{(item) => <CommandItem …/>}</CommandCollection>` */
export const CommandCollection = Autocomplete.Collection;

export interface CommandItemProps extends Autocomplete.Item.Props {
  icon?: IconSource;
  shortcut?: ReactNode;
  /** content on the right before the shortcut (a SourcePill, a project pill) */
  trailing?: ReactNode;
}

/** A result, drawn like a menu item. */
export function CommandItem({
  icon,
  shortcut,
  trailing,
  className,
  children,
  ...props
}: CommandItemProps) {
  return (
    <Autocomplete.Item className={mergeClassName(menuItemVariants(), className)} {...props}>
      {renderIcon(icon, 16)}
      <span className={menuStyles.itemLabel}>{children}</span>
      {trailing}
      {shortcut != null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </Autocomplete.Item>
  );
}

export const CommandSeparator = DropdownMenuSeparator;

export interface CommandDialogProps extends Dialog.Root.Props {
  /** names the dialog for screen readers */
  label?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * ⌘K search: a `Command` in a dialog. Put a `bare` `Command` inside; open it with `open` /
 * `onOpenChange` (from ⌘K or a button).
 * The type filter (All / Tasks / Notes …) goes between the input and the list.
 */
export function CommandDialog({
  label = 'Search',
  className,
  children,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog.Root {...props}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={cn(styles.dialog, className)} aria-label={label}>
          {children}
          <Dialog.Close render={<VisuallyHidden render={<button type="button" />} />}>
            Close
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A row between the input and the list (the search type filter); no divider around it. */
export function CommandToolbar({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(styles.toolbar, className)} {...props} />;
}
