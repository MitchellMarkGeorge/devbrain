import type { ReactElement, ReactNode } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { mergeClassName } from '../../lib/cn';
import { Kbd } from '../Kbd';
import styles from './Tooltip.module.css';

/** Shares the open delay between tooltips: wrap the app (or a toolbar) once. */
export function TooltipProvider({ delay = 400, ...props }: BaseTooltip.Provider.Props) {
  return <BaseTooltip.Provider delay={delay} {...props} />;
}

export const TooltipRoot = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;

export interface TooltipContentProps extends BaseTooltip.Popup.Props {
  side?: BaseTooltip.Positioner.Props['side'];
  align?: BaseTooltip.Positioner.Props['align'];
  sideOffset?: number;
}

/** The tooltip's popup, portalled and positioned next to its trigger. */
export function TooltipContent({
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className,
  ...props
}: TooltipContentProps) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={styles.positioner}
      >
        <BaseTooltip.Popup className={mergeClassName(styles.popup, className)} {...props} />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}

export interface TooltipProps extends Omit<BaseTooltip.Root.Props, 'children'> {
  /** what the tooltip says: an icon button's name, or a truncated name in full */
  content: ReactNode;
  /** the element it describes; rendered as the trigger */
  children: ReactElement;
  /** the action's key, after the text in a `Kbd`: "G T" */
  shortcut?: ReactNode;
  side?: TooltipContentProps['side'];
  align?: TooltipContentProps['align'];
}

/**
 * Names an icon-only button or shows a truncated name in full; never the only place for an
 * action. `<Tooltip content="Favorite"><Button size="icon" icon={Star} aria-label="Favorite" /></Tooltip>`
 */
export function Tooltip({ content, shortcut, children, side, align, ...props }: TooltipProps) {
  return (
    <BaseTooltip.Root {...props}>
      <BaseTooltip.Trigger render={children} />
      <TooltipContent side={side} align={align}>
        {content}
        {shortcut != null && <Kbd className={styles.kbd}>{shortcut}</Kbd>}
      </TooltipContent>
    </BaseTooltip.Root>
  );
}
