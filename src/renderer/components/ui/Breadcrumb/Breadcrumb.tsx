import {
  Fragment,
  type ComponentPropsWithoutRef,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon, renderIcon, type IconSource } from '../Icon';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** the entity icon (folder, file, status icon); shown on the current item */
  icon?: IconSource;
  iconColor?: string;
}

export interface BreadcrumbProps extends ComponentPropsWithoutRef<'nav'> {
  /** from the section to the current item; the last is the current page */
  items: (BreadcrumbItem | string)[];
}

/**
 * The top bar's trail: the section in `muted-foreground`, 14px chevrons, then the current item in
 * `foreground` with its 16px entity icon, all 6px apart. Middle items shorten first when space
 * runs out.
 */
export function Breadcrumb({ items, className, ...props }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className} {...props}>
      <ol className={styles.list}>
        {items.map((raw, i) => {
          const item = typeof raw === 'string' ? { label: raw } : raw;
          const current = i === items.length - 1;
          const content = (
            <>
              {renderIcon(item.icon, 16, item.iconColor)}
              <span className={styles.label}>{item.label}</span>
            </>
          );
          return (
            <Fragment key={i}>
              <li
                className={cn(styles.item, current && styles.page)}
                aria-current={current ? 'page' : undefined}
              >
                {!current && (item.href || item.onClick) ? (
                  <a className={styles.link} href={item.href} onClick={item.onClick}>
                    {content}
                  </a>
                ) : (
                  content
                )}
              </li>
              {!current && (
                <li role="presentation" aria-hidden className={styles.separator}>
                  <Icon icon={ChevronRight} size={14} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
