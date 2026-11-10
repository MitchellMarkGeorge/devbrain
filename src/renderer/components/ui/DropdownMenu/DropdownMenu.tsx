import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Separator } from '@base-ui/react/separator';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronRight, Search } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { useFormatKeys } from '../../lib/platform';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { ScrollArea } from '../ScrollArea';
import styles from './DropdownMenu.module.css';

export { styles as menuStyles };

export const menuPopupVariants = cva(styles.popup, {
  variants: {
    /**
     * 224px menus, 200px for short ones (status, sort, filter), 240px for pickers with a search,
     * the trigger's width (Select) or the content's
     */
    width: {
      default: styles.widthDefault,
      sm: styles.widthSm,
      lg: styles.widthLg,
      trigger: styles.widthTrigger,
      auto: styles.widthAuto,
    },
  },
  defaultVariants: { width: 'default' },
});

export const menuItemVariants = cva(styles.item, {
  variants: {
    variant: { default: undefined, destructive: styles.destructive },
    inset: { true: styles.inset },
  },
  defaultVariants: { variant: 'default' },
});

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuSub = Menu.SubmenuRoot;

type PositionerProps = Pick<Menu.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset'>;

export interface DropdownMenuContentProps
  extends Menu.Popup.Props, PositionerProps, VariantProps<typeof menuPopupVariants> {}

/**
 * What a menu's surface scrolls: its items, in a ScrollArea whose thin scrollbar is drawn over the
 * edge. The surface caps its height (`menu-max-height`, or the room the window has); a picker's
 * search row stays pinned at the top while the rows scroll under it. DropdownMenu, ContextMenu,
 * Select and Command all draw their content in one.
 */
export function MenuScrollArea({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <ScrollArea className={cn(styles.scroll, className)} viewportClassName={styles.viewport}>
      {children}
    </ScrollArea>
  );
}

/** The menu's popup, portalled and positioned 4px from its trigger. */
export function DropdownMenuContent({
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  alignOffset,
  width,
  className,
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={styles.positioner}
      >
        <Menu.Popup className={mergeClassName(menuPopupVariants({ width }), className)} {...props}>
          <MenuScrollArea>{children}</MenuScrollArea>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/** A submenu's popup: opens to the right of its trigger, aligned with the parent's padding. */
export function DropdownMenuSubContent({
  side = 'right',
  align = 'start',
  sideOffset = 0,
  alignOffset = -5,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      side={side}
      align={align}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      {...props}
    />
  );
}

interface ItemContentProps {
  /**
   * a 16px leading icon in `muted-foreground`: a Lucide icon, or a node such as a `StatusIcon`,
   * `PriorityIcon` or a project's coloured folder
   */
  icon?: IconSource;
  /** a shortcut on the right: "⌘D", "⇧2", "F", "↵" */
  shortcut?: ReactNode;
}

/**
 * A Lucide icon is drawn muted; a node (a `StatusIcon`, a coloured folder) keeps its own colour in
 * a 16px slot.
 */
export function renderMenuIcon(icon: IconSource | undefined): ReactNode {
  if (isValidElement(icon)) return <span className={styles.iconSlot}>{icon}</span>;
  return renderIcon(icon, 16);
}

function ItemContent({ icon, shortcut, children }: ItemContentProps & { children?: ReactNode }) {
  return (
    <>
      {renderMenuIcon(icon)}
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </>
  );
}

/** The tick on the right of a checked item; it stands in for the item's shortcut. */
function Tick() {
  return <Icon icon={Check} size={16} />;
}

export interface DropdownMenuItemProps
  extends Menu.Item.Props, ItemContentProps, VariantProps<typeof menuItemVariants> {}

/** A menu item: icon, label, shortcut. `destructive` items ("Move to trash") go last. */
export function DropdownMenuItem({
  icon,
  shortcut,
  variant,
  inset,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      data-variant={variant ?? 'default'}
      className={mergeClassName(menuItemVariants({ variant, inset }), className)}
      {...props}
    >
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
    </Menu.Item>
  );
}

export interface DropdownMenuCheckboxItemProps extends Menu.CheckboxItem.Props, ItemContentProps {}

/**
 * An item that toggles (a filter's values): icon, label, and a tick on the right while checked,
 * in place of its shortcut.
 */
export function DropdownMenuCheckboxItem({
  icon,
  shortcut,
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem className={mergeClassName(menuItemVariants(), className)} {...props}>
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
      <Menu.CheckboxItemIndicator className={styles.tick}>
        <Tick />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

export interface DropdownMenuRadioItemProps extends Menu.RadioItem.Props, ItemContentProps {}

/**
 * One choice of a `DropdownMenuRadioGroup` (sort by, group by, a status): ticked on the right
 * while chosen, in place of its shortcut.
 */
export function DropdownMenuRadioItem({
  icon,
  shortcut,
  closeOnClick = true,
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  // picking a value closes the menu, as an item does (Base UI keeps it open by default)
  return (
    <Menu.RadioItem
      closeOnClick={closeOnClick}
      className={mergeClassName(menuItemVariants(), className)}
      {...props}
    >
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
      <Menu.RadioItemIndicator className={styles.tick}>
        <Tick />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  );
}

export interface DropdownMenuSubTriggerProps extends Menu.SubmenuTrigger.Props {
  icon?: IconSource;
  inset?: boolean;
  /** the current value, muted before the chevron ("Status  2 ›" in a filter menu) */
  value?: ReactNode;
}

/** Opens a submenu ("Link to ›"), with a chevron on the right. */
export function DropdownMenuSubTrigger({
  icon,
  inset,
  value,
  className,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      className={mergeClassName(menuItemVariants({ inset }), className)}
      {...props}
    >
      {renderMenuIcon(icon)}
      <span className={styles.itemLabel}>{children}</span>
      {value != null && <span className={styles.value}>{value}</span>}
      <Icon icon={ChevronRight} className={styles.chevron} />
    </Menu.SubmenuTrigger>
  );
}

/** A group's 12px label ("Sort by", "Order"); put it inside a `DropdownMenuGroup`. */
export function DropdownMenuLabel({ className, ...props }: Menu.GroupLabel.Props) {
  return <Menu.GroupLabel className={mergeClassName(styles.label, className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: Separator.Props) {
  return <Separator className={mergeClassName(styles.separator, className)} {...props} />;
}

/**
 * Makes the menu (or submenu) it wraps filterable: wrap the `DropdownMenu` or `DropdownMenuSub`,
 * then put a `DropdownMenuSearch` and a `DropdownMenuList` of items in its popup.
 */
export const DropdownMenuFilter = Menu.FilterProvider;
/** The items a `DropdownMenuSearch` filters. */
export const DropdownMenuList = Menu.List;

export type DropdownMenuSearchProps = Menu.Input.Props;

/**
 * Figma's `MenuSearch`: a search row at the top of a picker menu (ProjectPicker), 36px over a
 * `border-strong` line, then 4px to the first item. Typing filters the `DropdownMenuList`'s
 * items by their text; ↑ ↓ and Enter still drive the menu. Needs a `DropdownMenuFilter`.
 */
export function DropdownMenuSearch({ className, ...props }: DropdownMenuSearchProps) {
  return (
    <div className={styles.search}>
      <Icon icon={Search} />
      <Menu.Input
        autoComplete="off"
        spellCheck={false}
        className={mergeClassName(styles.searchInput, className)}
        {...props}
      />
    </div>
  );
}

/** Shown in place of the list when the search matches nothing. */
export function DropdownMenuEmpty({ className, ...props }: Menu.Empty.Props) {
  return <Menu.Empty className={mergeClassName(styles.empty, className)} {...props} />;
}

/** An item's shortcut, written as on macOS: a text child reads "Ctrl+D" on Windows and Linux. */
export function DropdownMenuShortcut({ className, children, ...props }: ComponentProps<'span'>) {
  const formatKeys = useFormatKeys();
  return (
    <span className={cn(styles.shortcut, className)} {...props}>
      {typeof children === 'string' ? formatKeys(children) : children}
    </span>
  );
}
