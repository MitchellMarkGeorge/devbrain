import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import { resolveColor, type Swatch } from '../types';
import styles from './Badge.module.css';

export const badgeVariants = cva(styles.badge, {
  variants: {
    /**
     * `outline` is the DevBrain pill used everywhere (projects, status, dates, counts);
     * `default`, `secondary` and `destructive` (a red tint) are 20px filled tags, rarely needed.
     */
    variant: {
      outline: styles.outline,
      default: styles.default,
      secondary: styles.secondary,
      destructive: styles.destructive,
    },
  },
  defaultVariants: { variant: 'outline' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export interface BadgeProps
  extends Omit<useRender.ComponentProps<'span'>, 'prefix'>, VariantProps<typeof badgeVariants> {
  /** a 12px glyph before the label: a Lucide icon or a node (`<StatusIcon size={12} />`) */
  icon?: IconSource;
  /** the icon's colour, for a Lucide `icon` (a swatch name or a CSS colour) */
  iconColor?: Swatch | string;
  /** an event's calendar colour, drawn as a 3px bar before the label */
  barColor?: Swatch | string;
  /** quiet words that lead the pill, before its glyph: "Due", "Linked to" */
  prefix?: ReactNode;
  /** the label in `muted-foreground`: unset "+ Add …" pills */
  muted?: boolean;
  /**
   * renders a `button` (with hover and press states). A badge given `onClick` is one too. A badge
   * that opens a menu or popover is the trigger: `<Menu.Trigger render={<Badge interactive />}>`.
   */
  interactive?: boolean;
}

/**
 * shadcn's Badge as DevBrain's 24px pill. Labels truncate at 240px with "…": show the full name in
 * a Tooltip. Unset properties are muted "+ Add …" pills, never blanks.
 */
export const Badge = forwardRef<HTMLElement, BadgeProps>(function Badge(
  {
    variant,
    icon,
    iconColor,
    barColor,
    prefix,
    muted,
    interactive,
    render,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const isButton = interactive || props.onClick != null;
  const vars = {
    ...(iconColor && { '--badge-icon-color': resolveColor(iconColor) }),
    ...(barColor && { '--badge-bar-color': resolveColor(barColor) }),
  } as CSSProperties;
  return useRender({
    defaultTagName: isButton ? 'button' : 'span',
    render,
    ref,
    props: mergeProps<'span'>(
      {
        'data-slot': 'badge',
        'data-variant': variant ?? 'outline',
        className: cn(badgeVariants({ variant }), iconColor && styles.tinted, className),
        style: { ...vars, ...style },
        title: typeof children === 'string' ? children : undefined,
        ...(isButton && !render && { type: 'button' }),
        children: (
          <>
            {prefix != null && <span className={styles.prefix}>{prefix}</span>}
            {barColor && <span className={styles.bar} aria-hidden />}
            {renderIcon(icon, 12)}
            <span className={cn(styles.text, muted && styles.muted)}>{children}</span>
          </>
        ),
      } as useRender.ElementProps<'span'>,
      props,
    ),
  });
});
