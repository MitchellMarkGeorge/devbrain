import { forwardRef, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { FileText } from 'lucide-react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cn } from '../../lib/cn';
import { cardVariants } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import styles from './NoteCard.module.css';

export const noteCardVariants = cva(styles.card, {
  variants: { withLink: { true: styles.withLink } },
});

export interface NoteCardProps extends Omit<useRender.ComponentProps<'div'>, 'title'> {
  title: string;
  /** when it was edited: "2h ago" */
  updated: string;
  /** the note's first lines; three lines on Home, two with a `link` */
  preview: string;
  /** the note's project or event pill: the Notes card view only, never on Home */
  link?: ReactNode;
}

/**
 * A note as a card: the file icon and edit time, the title and a `muted-foreground` preview; the time is `subtle-foreground`.
 * Every card in a row has the same height (144px, or 156px with a `link`), so lay them out in a
 * `Grid minColumnWidth="240px"`. Opens the note on click (`render={<a href=… />}` for a link).
 */
export const NoteCard = forwardRef<HTMLDivElement, NoteCardProps>(function NoteCard(
  { title, updated, preview, link, render, ...props },
  ref,
) {
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(
          cardVariants({ size: 'compact' }),
          noteCardVariants({ withLink: link != null }),
        ),
        tabIndex: 0,
        children: (
          <>
            <div className={styles.top}>
              <Icon icon={FileText} />
              <span>{updated}</span>
            </div>
            <div className={styles.title}>{title}</div>
            <div className={styles.preview}>{preview}</div>
            {link != null && <div className={styles.link}>{link}</div>}
          </>
        ),
      },
      props,
    ),
  });
});
