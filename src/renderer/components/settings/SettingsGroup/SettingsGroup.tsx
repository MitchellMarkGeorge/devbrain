import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { cardVariants } from '../../ui/Card';
import styles from './SettingsGroup.module.css';

export interface SettingsRowData {
  label: ReactNode;
  description?: ReactNode;
  /** the current value in words, before the control: "Monday" */
  value?: ReactNode;
  /** a Switch, Select, ToggleGroup or Button */
  control?: ReactNode;
}

export interface SettingsRowProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>, SettingsRowData {}

/** One setting: its label and description on the left, its value and control on the right. */
export const SettingsRow = forwardRef<HTMLDivElement, SettingsRowProps>(function SettingsRow(
  { label, description, value, control, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.row, className)} {...props}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {description != null && <div className={styles.description}>{description}</div>}
      </div>
      {value != null && <span className={styles.value}>{value}</span>}
      {control != null && <div className={styles.control}>{control}</div>}
    </div>
  );
});

export interface SettingsGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** the rows as data; or pass `SettingsRow` children */
  rows?: SettingsRowData[];
}

/** A flat card of settings rows, divided by `border` lines. */
export const SettingsGroup = forwardRef<HTMLDivElement, SettingsGroupProps>(function SettingsGroup(
  { rows, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(cardVariants(), styles.group, className)} {...props}>
      {rows?.map((row, i) => (
        <SettingsRow key={i} {...row} />
      ))}
      {children}
    </div>
  );
});

export interface SettingsSectionProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** the section heading above the group: "Appearance" */
  title: ReactNode;
  description?: ReactNode;
}

/** A section heading over its settings group(s). */
export const SettingsSection = forwardRef<HTMLElement, SettingsSectionProps>(
  function SettingsSection({ title, description, className, children, ...props }, ref) {
    const headingId = useId();
    return (
      <section
        ref={ref}
        aria-labelledby={headingId}
        className={cn(styles.section, className)}
        {...props}
      >
        <div className={styles.sectionHeader}>
          <h2 id={headingId} className={styles.sectionTitle}>
            {title}
          </h2>
          {description != null && <p className={styles.sectionDescription}>{description}</p>}
        </div>
        {children}
      </section>
    );
  },
);
