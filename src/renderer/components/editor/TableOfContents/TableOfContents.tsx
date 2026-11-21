import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './TableOfContents.module.css';

export interface TableOfContentsItem {
  id: string;
  label: string;
  /** 1 for the document's top headings; deeper ones indent, up to 3 */
  level: number;
}

export interface TableOfContentsProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'onSelect'> {
  items: readonly TableOfContentsItem[];
  /** the heading being read: its row is drawn in `foreground`, its rail marked */
  activeId?: string | null;
  onSelect: (id: string) => void;
}

/**
 * A document's headings, as a list to jump through: "Contents", then a row per heading, indented
 * by its level, on a rail that marks the one being read. See
 * docs/design-system/components/TableOfContents.md
 */
export const TableOfContents = forwardRef<HTMLElement, TableOfContentsProps>(
  function TableOfContents({ items, activeId, onSelect, className, ...props }, ref) {
    return (
      <nav ref={ref} aria-label="Contents" className={cn(styles.toc, className)} {...props}>
        <p className={styles.title} aria-hidden>
          Contents
        </p>
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.item}
                data-level={Math.min(Math.max(item.level, 1), 3)}
                data-active={item.id === activeId ? '' : undefined}
                aria-current={item.id === activeId ? 'location' : undefined}
                title={item.label}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    );
  },
);
