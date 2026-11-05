import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import styles from './SectionHeading.module.css';

export interface SectionHeadingProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** "Today", "Projects", "Recent notes", "Today's schedule" */
  title: ReactNode;
  /** a quiet note after the title: "Tomorrow and later this week" */
  description?: ReactNode;
  /** the link at the right: "All tasks", "View calendar" */
  link?: ReactNode;
  /** where the link goes; renders an `<a>` */
  href?: string;
  onLinkClick?: () => void;
  /** the title's heading level (default 2) */
  level?: 2 | 3 | 4;
}

/**
 * A page section's heading (Home's Today, Projects and Recent notes): the title in 14px medium,
 * an optional quiet description, and a 12px "All …" link with an arrow at the right.
 */
export const SectionHeading = forwardRef<HTMLDivElement, SectionHeadingProps>(
  function SectionHeading(
    { title, description, link, href, onLinkClick, level = 2, className, ...props },
    ref,
  ) {
    const Heading = `h${level}` as const;
    const linkContent = (
      <>
        {link}
        <Icon icon={ArrowRight} size={12} />
      </>
    );
    return (
      <div ref={ref} className={cn(styles.heading, className)} {...props}>
        <Heading className={styles.title}>{title}</Heading>
        {description && <span className={styles.description}>{description}</span>}
        {link &&
          (href ? (
            <a className={styles.link} href={href} onClick={onLinkClick}>
              {linkContent}
            </a>
          ) : (
            <button type="button" className={styles.link} onClick={onLinkClick}>
              {linkContent}
            </button>
          ))}
      </div>
    );
  },
);
