import { forwardRef, type ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { mergeClassName } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import { Tooltip } from '../Tooltip';
import styles from './Button.module.css';

export const buttonVariants = cva(styles.button, {
  variants: {
    /**
     * `default` is DevBrain's quiet bordered button (shadcn's filled default is `primary`, which
     * DevBrain screens almost never need).
     */
    variant: {
      default: styles.default,
      primary: styles.primary,
      secondary: styles.secondary,
      outline: styles.outline,
      ghost: styles.ghost,
      destructive: styles.destructive,
      link: styles.link,
    },
    size: {
      default: undefined,
      sm: styles.sizeSm,
      lg: styles.sizeLg,
      xs: styles.sizeXs,
      icon: styles.sizeIcon,
      'icon-sm': styles.sizeIconSm,
      'icon-xs': styles.sizeIconXs,
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends Omit<BaseButton.Props, 'value'>, VariantProps<typeof buttonVariants> {
  /** leads the label: a Lucide icon (sized to the button) or a node */
  icon?: IconSource;
  trailingIcon?: IconSource;
  /**
   * a toolbar button's current choice, after the label: "Filter  Assigned to me". The label then
   * reads as a muted, regular-weight name (Figma's `ToolbarButton`).
   */
  value?: ReactNode;
  /**
   * hides `value` but keeps the label's toolbar look: the compact toolbar of a narrow window shows
   * just "Filter" and "Sort". The value moves to the button's tooltip, and stays readable to screen
   * readers.
   */
  hideValue?: boolean;
  /**
   * the choice in `value` is set away from its default (a filter is on). While `hideValue` hides
   * the value, the button draws pressed, so a compact toolbar still shows that a filter is on.
   */
  active?: boolean;
}

const SMALL_SIZES: ButtonSize[] = ['xs', 'icon-xs'];

/**
 * shadcn's Button on Base UI. Use `render` where shadcn uses `asChild`
 * (`<Menu.Trigger render={<Button />}>`), with `nativeButton={false}` for a non-button element.
 * Icon-only buttons need an `aria-label`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, trailingIcon, value, hideValue, active, className, children, ...props },
  ref,
) {
  const iconSize = SMALL_SIZES.includes(size ?? 'default') ? 12 : 16;
  const valueHidden = hideValue === true && value != null && value !== '';
  const button = (
    <BaseButton
      ref={ref}
      data-slot="button"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      data-pressed={valueHidden && active ? '' : undefined}
      className={mergeClassName(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {renderIcon(icon, iconSize)}
      {value != null ? (
        <>
          <span className={styles.label}>{children}</span>
          <span className={hideValue ? styles.hiddenValue : styles.value}>{value}</span>
        </>
      ) : (
        children
      )}
      {renderIcon(trailingIcon, iconSize)}
    </BaseButton>
  );
  if (!valueHidden) return button;
  return <Tooltip content={value}>{button}</Tooltip>;
});
