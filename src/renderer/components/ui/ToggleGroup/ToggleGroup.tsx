import { forwardRef, useState, type ReactNode } from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, mergeClassName } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './ToggleGroup.module.css';

export const toggleGroupVariants = cva(styles.group, {
  variants: {
    /** `default` is the segmented control; `outline` separate outlined buttons (page sections) */
    variant: { default: undefined, outline: styles.outline },
    size: { default: undefined, sm: styles.sizeSm },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ToggleGroupItemData {
  value: string;
  label?: ReactNode;
  icon?: IconSource;
  iconColor?: string;
  /** a result count after the label */
  count?: number;
}

export interface ToggleGroupProps
  extends
    Omit<BaseToggleGroup.Props<string>, 'value' | 'defaultValue' | 'onValueChange' | 'multiple'>,
    VariantProps<typeof toggleGroupVariants> {
  /** the chosen item; one item is always chosen */
  value?: string;
  /** the item chosen at first (defaults to the first of `items`) */
  defaultValue?: string;
  onValueChange?: (value: string, details: BaseToggleGroup.ChangeEventDetails) => void;
  /** the items, as data; or pass `ToggleGroupItem` children */
  items?: ToggleGroupItemData[];
}

/**
 * An immediate choice from a short set: calendar range, list/board view, settings values. One
 * item is always chosen. Name the group with `aria-label`. For page sections use `Tabs`.
 */
export const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps>(function ToggleGroup(
  { variant, size, value, defaultValue, onValueChange, items, className, children, ...props },
  ref,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? items?.[0]?.value);
  const current = value ?? uncontrolled;
  return (
    <BaseToggleGroup<string>
      ref={ref}
      data-slot="toggle-group"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      value={current != null ? [current] : []}
      onValueChange={(next, details) => {
        // a segmented control never ends up with nothing chosen
        const chosen = next[0];
        if (chosen == null) return;
        if (value === undefined) setUncontrolled(chosen);
        onValueChange?.(chosen, details);
      }}
      className={mergeClassName(toggleGroupVariants({ variant, size }), className)}
      {...props}
    >
      {items?.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          icon={item.icon}
          iconColor={item.iconColor}
          count={item.count}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
      {children}
    </BaseToggleGroup>
  );
});

export interface ToggleGroupItemProps extends Toggle.Props<string> {
  value: string;
  icon?: IconSource;
  iconColor?: string;
  count?: number;
}

/** One item of a `ToggleGroup`. Icon-only items are named by their `value` unless given an `aria-label`. */
export const ToggleGroupItem = forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  function ToggleGroupItem({ value, icon, iconColor, count, className, children, ...props }, ref) {
    const iconOnly = children == null || children === false;
    return (
      <Toggle<string>
        ref={ref}
        data-slot="toggle-group-item"
        value={value}
        aria-label={iconOnly ? value : undefined}
        className={mergeClassName(cn(styles.item, iconOnly && styles.iconOnly), className)}
        {...props}
      >
        {renderIcon(icon, 16, iconColor)}
        {children}
        {count != null && <span className={styles.count}>{count}</span>}
      </Toggle>
    );
  },
);
