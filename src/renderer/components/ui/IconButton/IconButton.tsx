import { forwardRef, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Button, type ButtonProps, type ButtonSize } from '../Button';
import type { IconSource } from '../Icon';
import { Tooltip, type TooltipProps } from '../Tooltip';
import { mergeClassName } from '../../lib/cn';
import styles from './IconButton.module.css';

export const iconButtonVariants = cva(styles.iconButton, {
  variants: {
    /** `muted` rests in `muted-foreground` and lifts to `foreground` on hover or while open */
    tone: { default: undefined, muted: styles.muted },
  },
  defaultVariants: { tone: 'default' },
});

const SIZES = { default: 'icon', sm: 'icon-sm', xs: 'icon-xs' } satisfies Record<
  string,
  ButtonSize
>;

export interface IconButtonProps
  extends
    Omit<ButtonProps, 'size' | 'icon' | 'trailingIcon' | 'value' | 'children' | 'aria-label'>,
    VariantProps<typeof iconButtonVariants> {
  /** the Lucide icon (`icon={X}`) or an icon node */
  icon: IconSource;
  /** what the button does ("Close", "More actions"): its accessible name and its tooltip */
  label: string;
  /** `default` 32px, `sm` 28px (editor toolbar, selection bar), `xs` 24px (sidebar, panel headers) */
  size?: keyof typeof SIZES;
  /**
   * The tooltip naming the button: its `label` by default, other content, or `false` for none
   * (when something nearby already names it).
   */
  tooltip?: boolean | ReactNode;
  tooltipSide?: TooltipProps['side'];
}

/**
 * A button that is only an icon. It always has a name: `label` is read out and shown in a tooltip.
 * `ghost` by default, as icon buttons are in toolbars, panel headers and rows. Use it as a Base UI
 * trigger through `render`: `<Menu.Trigger render={<IconButton icon={Ellipsis} label="More" />} />`.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    size = 'default',
    variant = 'ghost',
    tone,
    tooltip = true,
    tooltipSide,
    className,
    ...props
  },
  ref,
) {
  const button = (
    <Button
      ref={ref}
      variant={variant}
      size={SIZES[size]}
      icon={icon}
      aria-label={label}
      className={mergeClassName(iconButtonVariants({ tone }), className)}
      {...props}
    />
  );
  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip === true ? label : tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
