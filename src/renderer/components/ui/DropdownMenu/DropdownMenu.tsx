import type { ComponentProps, ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Separator } from '@base-ui/react/separator';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronRight } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { Icon, renderIcon, type IconSource } from '../Icon';
import styles from './DropdownMenu.module.css';

export { styles as menuStyles };

export const menuPopupVariants = cva(styles.popup, {
  variants: {
    /** 224px menus, 180px for short ones, the trigger's width (Select) or the content's */
    width: {
      default: styles.widthDefault,
      sm: styles.widthSm,
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

/** The menu's popup, portalled and positioned 4px from its trigger. */
export function DropdownMenuContent({
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  alignOffset,
  width,
  className,
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
        <Menu.Popup
          className={mergeClassName(menuPopupVariants({ width }), className)}
          {...props}
        />
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
  /** a 16px leading icon in `muted-foreground` */
  icon?: IconSource;
  /** a shortcut on the right: "⌘D", "#", "---" */
  shortcut?: ReactNode;
}

function ItemContent({ icon, shortcut, children }: ItemContentProps & { children?: ReactNode }) {
  return (
    <>
      {renderIcon(icon, 16)}
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </>
  );
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

/** An item that toggles, with a tick on the left while checked. */
export function DropdownMenuCheckboxItem({
  icon,
  shortcut,
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem
      className={mergeClassName(menuItemVariants({ inset: true }), className)}
      {...props}
    >
      <Menu.CheckboxItemIndicator className={styles.indicator}>
        <Icon icon={Check} />
      </Menu.CheckboxItemIndicator>
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
    </Menu.CheckboxItem>
  );
}

export interface DropdownMenuRadioItemProps extends Menu.RadioItem.Props, ItemContentProps {}

/** One choice of a `DropdownMenuRadioGroup`, ticked while chosen. */
export function DropdownMenuRadioItem({
  icon,
  shortcut,
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <Menu.RadioItem
      className={mergeClassName(menuItemVariants({ inset: true }), className)}
      {...props}
    >
      <Menu.RadioItemIndicator className={styles.indicator}>
        <Icon icon={Check} />
      </Menu.RadioItemIndicator>
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
    </Menu.RadioItem>
  );
}

export interface DropdownMenuSubTriggerProps extends Menu.SubmenuTrigger.Props {
  icon?: IconSource;
  inset?: boolean;
}

/** Opens a submenu ("Link to ›"), with a chevron on the right. */
export function DropdownMenuSubTrigger({
  icon,
  inset,
  className,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      className={mergeClassName(menuItemVariants({ inset }), className)}
      {...props}
    >
      {renderIcon(icon, 16)}
      <span className={styles.itemLabel}>{children}</span>
      <Icon icon={ChevronRight} className={styles.chevron} />
    </Menu.SubmenuTrigger>
  );
}

/** A group's 12px label ("Turn into"); put it inside a `DropdownMenuGroup`. */
export function DropdownMenuLabel({ className, ...props }: Menu.GroupLabel.Props) {
  return <Menu.GroupLabel className={mergeClassName(styles.label, className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: Separator.Props) {
  return <Separator className={mergeClassName(styles.separator, className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn(styles.shortcut, className)} {...props} />;
}
