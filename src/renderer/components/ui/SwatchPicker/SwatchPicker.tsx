import { forwardRef } from 'react';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { Check } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { mergeClassName } from '../../lib/cn';
import { Icon } from '../Icon';
import styles from './SwatchPicker.module.css';

/** The six colours users pick for workspaces, projects and calendars (`--swatch-*`). */
import { SWATCHES, type Swatch } from '../../types';

export { SWATCHES, type Swatch };

const SWATCH_LABELS: Record<Swatch, string> = {
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
  blue: 'Blue',
  indigo: 'Indigo',
  pink: 'Pink',
};

export const swatchVariants = cva(styles.swatch, {
  variants: {
    color: {
      red: styles.red,
      amber: styles.amber,
      green: styles.green,
      blue: styles.blue,
      indigo: styles.indigo,
      pink: styles.pink,
    },
  },
});

export interface SwatchPickerProps extends Omit<
  RadioGroup.Props<Swatch>,
  'value' | 'defaultValue' | 'onValueChange'
> {
  value?: Swatch;
  defaultValue?: Swatch;
  onValueChange?: (value: Swatch, details: RadioGroup.ChangeEventDetails) => void;
}

/** Picks a workspace, project or calendar colour from the six swatches. */
export const SwatchPicker = forwardRef<HTMLDivElement, SwatchPickerProps>(function SwatchPicker(
  { className, onValueChange, ...props },
  ref,
) {
  return (
    <RadioGroup<Swatch>
      ref={ref}
      data-slot="swatch-picker"
      aria-label="Colour"
      onValueChange={(value, details) => onValueChange?.(value, details)}
      className={mergeClassName(styles.group, className)}
      {...props}
    >
      {SWATCHES.map((swatch) => (
        <Radio.Root
          key={swatch}
          value={swatch}
          aria-label={SWATCH_LABELS[swatch]}
          className={swatchVariants({ color: swatch })}
        >
          <Radio.Indicator className={styles.indicator}>
            <Icon icon={Check} size={14} strokeWidth={3} />
          </Radio.Indicator>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
});
