import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import styles from './HomeSection.module.css';

export interface HomeSectionProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  /** the header, a menu label: "Meetings", "Tasks", "Recent notes", "Get started" */
  title: ReactNode;
  /** the link at the right of the header: "All 6 tasks", "Calendar", "All notes" */
  link?: ReactNode;
  /** where the link goes; renders an `<a>` */
  href?: string;
  onLinkClick?: () => void;
  /** the line under the rows for what didn't fit: "3 more tasks today" */
  more?: ReactNode;
  /** the rows (at most three), or a row of three small `NoteCard`s */
  children: ReactNode;
}

/**
 * One of Home's sections (at most two show): a 12px menu-label header with an optional
 * "All … →" link, up to three rows, and an "N more …" line for the rest.
 */
export const HomeSection = forwardRef<HTMLElement, HomeSectionProps>(function HomeSection(
  { title, link, href, onLinkClick, more, className, children, ...props },
  ref,
) {
  const linkContent = (
    <>
      {link}
      <Icon icon={ArrowRight} size={12} />
    </>
  );
  return (
    <section ref={ref} className={cn(styles.section, className)} {...props}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {link != null &&
          (href ? (
            <a className={styles.link} href={href} onClick={onLinkClick}>
              {linkContent}
            </a>
          ) : (
            <button type="button" className={styles.link} onClick={onLinkClick}>
              {linkContent}
            </button>
          ))}
      </header>
      {children}
      {more != null && <p className={styles.more}>{more}</p>}
    </section>
  );
});

export type HomeCardsProps = ComponentPropsWithoutRef<'div'>;

/** Small `NoteCard`s three across, 12px apart: Recent notes when it is Home's first section. */
export const HomeCards = forwardRef<HTMLDivElement, HomeCardsProps>(function HomeCards(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(styles.cards, className)} {...props} />;
});
