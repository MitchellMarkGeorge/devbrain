import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import styles from './DetailSection.module.css';

export interface DetailSectionProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** "Subtasks", "Task note", "Linked tasks", "Event note", "Tasks" */
  title: ReactNode;
  /** a 12px glyph after the title: the subtasks' `ProgressRing` */
  glyph?: ReactNode;
  /** how many, after the title in `muted-foreground`: "3/4", 2 */
  count?: ReactNode;
  /** the heading's actions on the right: an xs "Add" button */
  action?: ReactNode;
  /** `sheet`: the content 4px under the heading (the default); `page`: 8px, on a detail page */
  spacing?: 'sheet' | 'page';
  /**
   * a chevron before the title folds the content away (a note's Tasks panel). Uncontrolled
   * through `defaultOpen` (open by default), or controlled with `open` and `onOpenChange`.
   */
  collapsible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A titled block of a sheet or a detail page: a 28px heading (title, glyph and count, then
 * actions on the right) over its content, 4px below it in a sheet and 8px on a page.
 */
export const DetailSection = forwardRef<HTMLElement, DetailSectionProps>(function DetailSection(
  {
    title,
    glyph,
    count,
    action,
    spacing = 'sheet',
    collapsible,
    open,
    defaultOpen = true,
    onOpenChange,
    className,
    children,
    ...props
  },
  ref,
) {
  const id = useId();
  const heading = (
    <h3 id={id} className={styles.title}>
      {title}
    </h3>
  );
  const rest = (
    <>
      {glyph}
      {count != null && <span className={styles.count}>{count}</span>}
      {action != null && <div className={styles.action}>{action}</div>}
    </>
  );
  const sectionProps = {
    ref,
    'aria-labelledby': id,
    'data-spacing': spacing,
    className: cn(styles.section, className),
    ...props,
  };
  if (!collapsible) {
    return (
      <section {...sectionProps}>
        <div className={styles.heading}>
          {heading}
          {rest}
        </div>
        {children}
      </section>
    );
  }
  return (
    <Collapsible.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
      render={<section {...sectionProps} />}
    >
      <div className={styles.heading}>
        <Collapsible.Trigger className={styles.trigger} aria-labelledby={id}>
          <Icon icon={ChevronDown} size={16} className={styles.chevron} />
          {heading}
        </Collapsible.Trigger>
        {rest}
      </div>
      <Collapsible.Panel className={styles.panel}>{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
});
