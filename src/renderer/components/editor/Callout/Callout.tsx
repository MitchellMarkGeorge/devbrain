import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../../ui/Icon';
import type { Swatch } from '../../types';
import styles from './Callout.module.css';

/** The five kinds, as GitHub's alerts name them (`> [!WARNING]`). */
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export const CALLOUT_KINDS: readonly {
  kind: CalloutKind;
  label: string;
  icon: IconSource;
  colour: Swatch;
}[] = [
  { kind: 'note', label: 'Note', icon: Info, colour: 'blue' },
  { kind: 'tip', label: 'Tip', icon: Lightbulb, colour: 'green' },
  { kind: 'important', label: 'Important', icon: MessageSquareWarning, colour: 'indigo' },
  { kind: 'warning', label: 'Warning', icon: TriangleAlert, colour: 'amber' },
  { kind: 'caution', label: 'Caution', icon: OctagonAlert, colour: 'red' },
];

export interface CalloutProps extends ComponentPropsWithoutRef<'div'> {
  kind: CalloutKind;
  /** makes the title a menu of the kinds, to change it in the editor */
  onKindChange?: (kind: CalloutKind) => void;
  /** where the body goes; the editor passes its own content element */
  children?: ReactNode;
}

/**
 * A note's callout (GitHub's alert): the quote's 2px bar in the kind's colour, then its icon and
 * title in that colour over the body. With `onKindChange` the title opens a menu of the kinds.
 */
export const Callout = forwardRef<HTMLDivElement, CalloutProps>(function Callout(
  { kind, onKindChange, className, children, ...props },
  ref,
) {
  const option = CALLOUT_KINDS.find((item) => item.kind === kind) ?? CALLOUT_KINDS[0];
  const title = (
    <>
      {renderIcon(option.icon, 16)}
      <span>{option.label}</span>
    </>
  );
  return (
    <div
      ref={ref}
      data-callout={option.kind}
      className={cn(styles.callout, className)}
      style={{ '--callout-colour': `var(--swatch-${option.colour})` } as CSSProperties}
      {...props}
    >
      {onKindChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(styles.title, styles.trigger)}
            contentEditable={false}
            aria-label={`${option.label} callout: change kind`}
          >
            {title}
            <Icon icon={ChevronDown} size={12} className={styles.chevron} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Callout</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={option.kind}
                onValueChange={(value) => onKindChange(value as CalloutKind)}
              >
                {CALLOUT_KINDS.map((item) => (
                  <DropdownMenuRadioItem key={item.kind} value={item.kind} icon={item.icon}>
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className={styles.title} contentEditable={false}>
          {title}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
});

/** The class of a callout's body, for an editor that renders the body element itself. */
export const calloutBodyClassName = styles.body;
