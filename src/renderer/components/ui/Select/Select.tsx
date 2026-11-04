import { Select as BaseSelect } from '@base-ui/react/select';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronsUpDown } from 'lucide-react';
import { mergeClassName } from '../../lib/cn';
import {
  DropdownMenuSeparator,
  menuItemVariants,
  menuPopupVariants,
  menuStyles,
  type DropdownMenuContentProps,
} from '../DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import styles from './Select.module.css';

/** Picks one value from a list (sort and option pickers). Pass `items` to label the value. */
export const Select = BaseSelect.Root;
export const SelectGroup = BaseSelect.Group;

export const selectTriggerVariants = cva(styles.trigger, {
  variants: { size: { default: undefined, sm: styles.sizeSm } },
  defaultVariants: { size: 'default' },
});

export interface SelectTriggerProps
  extends BaseSelect.Trigger.Props, VariantProps<typeof selectTriggerVariants> {
  placeholder?: string;
}

/** The field: the chosen value (or the placeholder) and an up-down chevron. */
export function SelectTrigger({
  size,
  placeholder,
  className,
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <BaseSelect.Trigger
      className={mergeClassName(selectTriggerVariants({ size }), className)}
      {...props}
    >
      {children ?? <BaseSelect.Value className={styles.value} placeholder={placeholder} />}
      <BaseSelect.Icon className={styles.icon}>
        <Icon icon={ChevronsUpDown} />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export const SelectValue = BaseSelect.Value;

export interface SelectContentProps
  extends
    BaseSelect.Popup.Props,
    Pick<DropdownMenuContentProps, 'side' | 'align' | 'sideOffset' | 'width'> {}

/** The list of choices, on the menu surface and at least as wide as the trigger. */
export function SelectContent({
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  width = 'trigger',
  className,
  children,
  ...props
}: SelectContentProps) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className={menuStyles.positioner}
      >
        <BaseSelect.Popup
          className={mergeClassName(menuPopupVariants({ width }), className)}
          {...props}
        >
          <BaseSelect.List className={styles.list}>{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export interface SelectItemProps extends BaseSelect.Item.Props {
  icon?: IconSource;
}

/** A choice, ticked while chosen. */
export function SelectItem({ icon, className, children, ...props }: SelectItemProps) {
  return (
    <BaseSelect.Item
      className={mergeClassName(menuItemVariants({ inset: true }), className)}
      {...props}
    >
      <BaseSelect.ItemIndicator className={menuStyles.indicator}>
        <Icon icon={Check} />
      </BaseSelect.ItemIndicator>
      {renderIcon(icon, 16)}
      <BaseSelect.ItemText className={menuStyles.itemLabel}>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}

export function SelectGroupLabel({ className, ...props }: BaseSelect.GroupLabel.Props) {
  return (
    <BaseSelect.GroupLabel className={mergeClassName(menuStyles.label, className)} {...props} />
  );
}

export const SelectSeparator = DropdownMenuSeparator;
