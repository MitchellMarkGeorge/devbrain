import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
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
  /** the rows (at most three) in a `HomeRows`, or a row of three small `NoteCard`s */
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
  const titleId = useId();
  const linkContent = (
    <>
      {link}
      <Icon icon={ArrowRight} size={12} />
    </>
  );
  return (
    <section ref={ref} className={cn(styles.section, className)} {...props}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
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
      <SectionTitleContext.Provider value={titleId}>{children}</SectionTitleContext.Provider>
      {more != null && <p className={styles.more}>{more}</p>}
    </section>
  );
});

// the section's heading, which names its rows
const SectionTitleContext = createContext<string | undefined>(undefined);

export type HomeRowsProps = ComponentPropsWithoutRef<'div'>;

/**
 * The rows of a `HomeSection` (`HomeRow`s, compact `TaskRow`s): a grid named by the section's
 * heading, as a row needs one around it. Lays out as the section did, one row under another.
 */
export const HomeRows = forwardRef<HTMLDivElement, HomeRowsProps>(function HomeRows(
  { className, ...props },
  ref,
) {
  const titleId = useContext(SectionTitleContext);
  return (
    <div
      ref={ref}
      role="grid"
      aria-labelledby={titleId}
      className={cn(styles.rows, className)}
      {...props}
    />
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
