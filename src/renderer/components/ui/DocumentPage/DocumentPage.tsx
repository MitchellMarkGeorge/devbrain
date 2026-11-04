import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import styles from './DocumentPage.module.css';

/** The centred column: 720px (`content-max-width`) on every document page. */
export const documentPageVariants = cva(styles.column);

export interface DocumentPageProps extends ComponentPropsWithoutRef<'div'> {
  /** the top bar (breadcrumb, star, "…" menu); it spans the whole page, not the column */
  header?: ReactNode;
  /** classes for the centred column */
  columnClassName?: string;
}

/**
 * A document page (a task, a note, Settings, Integrations): the header across the page, then the content in a
 * centred column capped at 720px that scrolls under it. On a wide window the margins grow and the
 * column keeps its width, so moving between a task and its note never shifts the text. Menus
 * anchored to the content move with the column.
 */
export const DocumentPage = forwardRef<HTMLDivElement, DocumentPageProps>(function DocumentPage(
  { header, columnClassName, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.page, className)} {...props}>
      {header}
      <div className={styles.scroll}>
        <div className={cn(documentPageVariants(), columnClassName)}>{children}</div>
      </div>
    </div>
  );
});
