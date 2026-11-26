import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './ButtonGroup.module.css';

export type ButtonGroupProps = useRender.ComponentProps<'div'>;

/**
 * Buttons joined into one control: the Settings split button ("Export as JSON ▾"), the calendar
 * stepper (← Today →) and a list toolbar's filter chip (its value and its ×). For a split button,
 * the chevron is a `<Menu.Trigger render={<Button />}>`. Give the group an `aria-label`. Its
 * controls are the children that carry a `data-slot`, as `Button` and `Input` do.
 */
export function ButtonGroup({ render, ...props }: ButtonGroupProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: styles.group,
        role: 'group',
        'data-slot': 'button-group',
      } as useRender.ElementProps<'div'>,
      props,
    ),
  });
}
