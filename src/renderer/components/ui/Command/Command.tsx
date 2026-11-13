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
  renderMenuIcon,
} from '../DropdownMenu';
import { Icon, type IconSource } from '../Icon';
import { Kbd } from '../Kbd';
import { ScrollArea } from '../ScrollArea';
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

export interface CommandInputProps extends Autocomplete.Input.Props {
  /** on the right of the row: the ⌘K search's `<Kbd variant="raised">Esc</Kbd>` */
  trailing?: ReactNode;
}

/**
 * The search row (Figma's `MenuSearch`): a search icon and the input, 36px over a
 * `border-strong` line; 52px with no line in `CommandDialog`.
 */
export function CommandInput({ className, trailing, ...props }: CommandInputProps) {
  return (
    <Autocomplete.InputGroup className={styles.inputGroup}>
      <Icon icon={Search} />
      <Autocomplete.Input className={mergeClassName(styles.input, className)} {...props} />
      {trailing}
    </Autocomplete.InputGroup>
  );
}

export function CommandList({ className, ...props }: Autocomplete.List.Props) {
  // a ScrollArea, whose scrollbar is drawn over the edge; the list itself grows to its items
  return (
    <ScrollArea className={styles.listArea}>
      <Autocomplete.List className={mergeClassName(styles.list, className)} {...props} />
    </ScrollArea>
  );
}

/**
 * Says how the search went to a screen reader, politely and unseen: "4 results". Keep it mounted
 * and change its children, so each change is announced.
 */
export function CommandStatus(props: Autocomplete.Status.Props) {
  return <Autocomplete.Status render={<VisuallyHidden render={<div />} />} {...props} />;
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
  /** content right after the label (a SourcePill) */
  trailing?: ReactNode;
  /** a second line under the label: a search result's snippet, 12px muted */
  description?: ReactNode;
  /** 12px `subtle-foreground` on the right: the project, "2h ago", "Due Jul 1" */
  meta?: ReactNode;
  /**
   * `result` is the ⌘K search's row: 36px, 10px gap, 8px padding, with a ↵ key while
   * highlighted; `default` is a 28px menu item
   */
  variant?: 'default' | 'result';
}

/** A result, drawn like a menu item, or as a search result (`variant="result"`). */
export function CommandItem({
  icon,
  shortcut,
  trailing,
  description,
  meta,
  variant = 'default',
  className,
  children,
  ...props
}: CommandItemProps) {
  if (variant === 'default' && description == null && meta == null) {
    return (
      <Autocomplete.Item className={mergeClassName(menuItemVariants(), className)} {...props}>
        {renderMenuIcon(icon)}
        <span className={menuStyles.itemLabel}>{children}</span>
        {trailing}
        {shortcut != null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
      </Autocomplete.Item>
    );
  }
  return (
    <Autocomplete.Item
      className={mergeClassName(
        cn(menuItemVariants(), styles.result, description != null && styles.twoLine),
        className,
      )}
      {...props}
    >
      {renderMenuIcon(icon)}
      <span className={styles.resultText}>
        <span className={styles.resultTitle}>
          <span className={menuStyles.itemLabel}>{children}</span>
          {trailing}
        </span>
        {description != null && <span className={styles.resultDescription}>{description}</span>}
      </span>
      {meta != null && <span className={styles.meta}>{meta}</span>}
      {shortcut != null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
      {variant === 'result' && (
        <Kbd variant="raised" className={styles.enter}>
          ↵
        </Kbd>
      )}
    </Autocomplete.Item>
  );
}

/**
 * The searched words in a result, in semibold `foreground-strong`:
 * `<CommandMatch text="Write PKCE migration guide" query="pkce" />`.
 */
export function CommandMatch({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const parts: ReactNode[] = [];
  const haystack = text.toLowerCase();
  let from = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className={styles.match}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
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
          {/* for a screen reader's own navigation; out of the tab order, as it is never seen
              (Esc closes) */}
          <Dialog.Close render={<VisuallyHidden render={<button type="button" tabIndex={-1} />} />}>
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

/** The ⌘K search's footer band: key hints ("↑↓ Navigate", "↵ Open", "Tab Change filter"). */
export function CommandFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

export interface CommandHintProps extends ComponentProps<'span'> {
  /** the key, drawn as a `Kbd` */
  keys: ReactNode;
}

export function CommandHint({ keys, className, children, ...props }: CommandHintProps) {
  return (
    <span className={cn(styles.hint, className)} {...props}>
      <Kbd variant="raised">{keys}</Kbd>
      {children}
    </span>
  );
}
