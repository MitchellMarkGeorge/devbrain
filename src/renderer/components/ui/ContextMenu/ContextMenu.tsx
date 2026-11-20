import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { mergeClassName } from '../../lib/cn';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  menuPopupVariants,
  MenuScrollArea,
  menuStyles,
  type DropdownMenuContentProps,
} from '../DropdownMenu';

export const ContextMenu = BaseContextMenu.Root;

export interface ContextMenuTriggerProps extends BaseContextMenu.Trigger.Props {
  /**
   * The element that is the area, keeping its own layout: a list's region, a board, a row. It
   * must take a ref and spread its props onto its element.
   */
  render: NonNullable<BaseContextMenu.Trigger.Props['render']>;
}

/**
 * The area that opens the menu on right-click (or long press): a list, a board, a row. It draws no
 * element of its own: `render` is the area, `<ContextMenuTrigger render={<TaskRow … />} />`.
 */
export function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  return <BaseContextMenu.Trigger {...props} />;
}

export type ContextMenuContentProps = Omit<DropdownMenuContentProps, 'side' | 'sideOffset'>;

/** The menu, opened at the pointer. */
export function ContextMenuContent({
  align = 'start',
  alignOffset,
  width,
  className,
  children,
  ...props
}: ContextMenuContentProps) {
  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner
        align={align}
        alignOffset={alignOffset}
        className={menuStyles.positioner}
      >
        <BaseContextMenu.Popup
          className={mergeClassName(menuPopupVariants({ width }), className)}
          {...props}
        >
          <MenuScrollArea>{children}</MenuScrollArea>
        </BaseContextMenu.Popup>
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
}

// a context menu's items are the dropdown menu's
export const ContextMenuItem = DropdownMenuItem;
export const ContextMenuCheckboxItem = DropdownMenuCheckboxItem;
export const ContextMenuRadioGroup = DropdownMenuRadioGroup;
export const ContextMenuRadioItem = DropdownMenuRadioItem;
export const ContextMenuGroup = DropdownMenuGroup;
export const ContextMenuLabel = DropdownMenuLabel;
export const ContextMenuSeparator = DropdownMenuSeparator;
export const ContextMenuShortcut = DropdownMenuShortcut;
export const ContextMenuSub = DropdownMenuSub;
export const ContextMenuSubTrigger = DropdownMenuSubTrigger;
export const ContextMenuSubContent = DropdownMenuSubContent;
