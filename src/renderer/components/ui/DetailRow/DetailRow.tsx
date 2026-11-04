import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './DetailRow.module.css';

/** The rows of a sheet's properties, 4px apart. */
export const DetailRows = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function DetailRows({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.rows, className)} {...props} />;
  },
);

export interface DetailRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the property's name ("Status", "Due date"), 88px wide in `muted-foreground` */
  label: ReactNode;
  /**
   * the value as pills (`EntityPill`, `DateRange`) that open their pickers. Several wrap, 6px
   * apart. An unset value is a muted "+ Add …" pill, never a blank.
   */
  children: ReactNode;
  /**
   * `horizontal`: the 88px label beside the value (sheets, the default). `vertical`: a 12px label
   * over the value, 8px apart (a card of properties: Figma's PropertyField and DateField).
   */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * A sheet's property row: an 88px muted label, then the value as pills that open their pickers.
 * At least 28px tall; the pills wrap onto more lines when there are many.
 */
export const DetailRow = forwardRef<HTMLDivElement, DetailRowProps>(function DetailRow(
  { label, children, orientation = 'horizontal', className, ...props },
  ref,
) {
  const id = useId();
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={id}
      data-orientation={orientation}
      className={cn(styles.row, className)}
      {...props}
    >
      <span id={id} className={styles.label}>
        {label}
      </span>
      <div className={styles.values}>{children}</div>
    </div>
  );
});

export interface ReadOnlyRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  label: ReactNode;
  /** the value's 14px glyph: a status or priority icon, a calendar, a folder */
  glyph?: IconSource;
  /** a Lucide `glyph`'s colour (`muted-foreground` by default); icon nodes keep their own */
  glyphColor?: string;
  /** the provider's own value as plain text ("In Review", "Urgent") */
  children: ReactNode;
}

/**
 * A synced item's property: the provider's value as plain text with its glyph. No pill, no hover,
 * nothing to click; edits happen in the provider. Pair it with the sheet's sync hint
 * ("Synced from Linear 3 min ago · Edit in Linear").
 */
export const ReadOnlyRow = forwardRef<HTMLDivElement, ReadOnlyRowProps>(function ReadOnlyRow(
  { label, glyph, glyphColor, children, className, ...props },
  ref,
) {
  const id = useId();
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={id}
      data-readonly=""
      className={cn(styles.row, className)}
      {...props}
    >
      <span id={id} className={styles.label}>
        {label}
      </span>
      <div className={styles.value}>
        {renderIcon(glyph, 14, glyphColor ?? 'var(--muted-foreground)')}
        <span className={styles.text}>{children}</span>
      </div>
    </div>
  );
});
