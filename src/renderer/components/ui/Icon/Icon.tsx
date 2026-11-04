import { isValidElement, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '../../lib/cn';
import styles from './Icon.module.css';

/** An icon a component can take: a Lucide icon (`Folder`) or any node (a `StatusIcon`). */
export type IconSource = LucideIcon | ReactNode;

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /** the Lucide icon, e.g. `Folder` from lucide-react */
  icon: LucideIcon;
  /** 16px in navigation, rows, buttons and menus; 12px in pills and xs buttons */
  size?: number;
  /** names the icon for screen readers; without it the icon is decorative */
  label?: string;
}

/** A Lucide icon at DevBrain's stroke (1.75) in `currentColor`. */
export function Icon({ icon: LucideComponent, size = 16, label, className, ...props }: IconProps) {
  return (
    <LucideComponent
      size={size}
      strokeWidth={1.75}
      className={cn(styles.icon, className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      {...props}
    />
  );
}

/** Renders an `IconSource` prop: a Lucide component at `size`, or a node as it is. */
export function renderIcon(icon: IconSource | undefined, size = 16, color?: string): ReactNode {
  if (icon == null || icon === false) return null;
  if (!isIconComponent(icon)) return icon as ReactNode;
  return <Icon icon={icon} size={size} color={color} />;
}

// a Lucide icon is a forwardRef component: an object with $$typeof that is not an element
function isIconComponent(icon: IconSource): icon is LucideIcon {
  if (typeof icon === 'function') return true;
  return (
    typeof icon === 'object' &&
    icon !== null &&
    !isValidElement(icon) &&
    !Array.isArray(icon) &&
    '$$typeof' in icon
  );
}
