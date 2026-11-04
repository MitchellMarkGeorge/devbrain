import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import styles from './DocumentPage.module.css';

export const documentPageVariants = cva(styles.column, {
  variants: {
    /** `document`: 720px (`content-max-width`), tasks and notes. `settings`: 760px. */
    width: { document: styles.widthDocument, settings: styles.widthSettings },
  },
  defaultVariants: { width: 'document' },
});

export interface DocumentPageProps
  extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof documentPageVariants> {
  /** the top bar (breadcrumb, star, "…" menu); it spans the whole page, not the column */
  header?: ReactNode;
  /** classes for the centred column */
  columnClassName?: string;
}

/**
 * A document page (a task, a note, Settings): the header across the page, then the content in a
 * centred column capped at 720px that scrolls under it. On a wide window the margins grow and the
 * column keeps its width, so moving between a task and its note never shifts the text. Menus
 * anchored to the content move with the column.
 */
export const DocumentPage = forwardRef<HTMLDivElement, DocumentPageProps>(function DocumentPage(
  { header, width, columnClassName, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.page, className)} {...props}>
      {header}
      <div className={styles.scroll}>
        <div className={cn(documentPageVariants({ width }), columnClassName)}>{children}</div>
      </div>
    </div>
  );
});
