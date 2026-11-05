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
  variants: {
    withLink: { true: styles.withLink },
    /** `sm`: Home's small card, 86px, one line of title and one of preview */
    size: { default: undefined, sm: styles.sizeSm },
  },
  defaultVariants: { size: 'default' },
});

export interface NoteCardProps extends Omit<useRender.ComponentProps<'div'>, 'title'> {
  title: string;
  /** when it was edited: "2h ago" */
  updated: string;
  /** the note's first lines: three lines, two with a `link`, one at `sm` */
  preview: string;
  /** the note's project or event pill: the Notes card view only, never at `sm` */
  link?: ReactNode;
  /**
   * `default`: the Notes card view (144px, or 156px with a `link`). `sm`: Home's Recent notes
   * when it is the first section, three in a row (86px, no pill)
   */
  size?: 'default' | 'sm';
}

/**
 * A note as a card: the file icon and edit time, the title and a `muted-foreground` preview; the
 * time is `subtle-foreground`. Every card in a row has the same height (144px, or 156px with a
 * `link`), so lay them out in a `Grid minColumnWidth="240px"`. `size="sm"` is Home's 86px card,
 * one line each, three in a `HomeCards` row. Opens the note on click (`render={<a href=… />}`).
 */
export const NoteCard = forwardRef<HTMLDivElement, NoteCardProps>(function NoteCard(
  { title, updated, preview, link, size, render, ...props },
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
          noteCardVariants({ withLink: size !== 'sm' && link != null, size }),
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
            {link != null && size !== 'sm' && <div className={styles.link}>{link}</div>}
          </>
        ),
      },
      props,
    ),
  });
});
