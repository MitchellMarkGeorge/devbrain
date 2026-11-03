import { useState, type ComponentProps, type ReactNode } from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { DayPicker, type DayPickerProps, type ChevronProps } from 'react-day-picker';
import { Icon, glyph } from './primitives';
import { ui, cx } from './styles';
import type { Swatch } from './types';

export interface ToggleGroupProps {
  items: { value: string; label?: string; icon?: string; iconColor?: string; disabled?: boolean }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  disabled?: boolean;
}
export function ToggleGroup({
  items,
  value,
  defaultValue,
  onValueChange,
  label = 'Choose view',
  variant = 'default',
  size = 'default',
  disabled,
}: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      aria-label={label}
      disabled={disabled}
      value={value === undefined ? undefined : [value]}
      defaultValue={[defaultValue ?? items[0]?.value].filter((x): x is string => !!x)}
      onValueChange={(values) => {
        if (values.length) onValueChange?.(values[0] as string);
      }}
      className={ui('db-toggle-group')}
      data-variant={variant}
      data-size={size}
    >
      {items.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          aria-label={item.label ? undefined : item.value}
          className={ui('db-toggle')}
        >
          {glyph(item.icon, 16, item.iconColor)}
          {item.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
export interface TabItem {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}
export interface TabsProps {
  items: (string | TabItem)[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: 'outline' | 'default' | 'line';
  label?: string;
}
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  variant = 'outline',
  label = 'Sections',
}: TabsProps) {
  const tabs = items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item,
  );
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue ?? tabs[0]?.value}
      onValueChange={(next) => onValueChange?.(String(next))}
    >
      <BaseTabs.List
        aria-label={label}
        className={ui('db-tabs-list', variant === 'line' && 'db-tabs-line')}
        data-variant={variant}
      >
        {tabs.map((tab) => (
          <BaseTabs.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={ui('db-tab')}
          >
            {tab.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {tabs.map(
        (tab) =>
          tab.content !== undefined && (
            <BaseTabs.Panel key={tab.value} value={tab.value} className={ui('tab-panel')}>
              {tab.content}
            </BaseTabs.Panel>
          ),
      )}
    </BaseTabs.Root>
  );
}
export const swatches: Swatch[] = ['red', 'amber', 'green', 'blue', 'indigo', 'pink'];
export function SwatchPicker({
  value,
  defaultValue = 'blue',
  onValueChange,
  label = 'Colour',
  disabled,
}: {
  value?: Swatch;
  defaultValue?: Swatch;
  onValueChange?: (value: Swatch) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      aria-label={label}
      disabled={disabled}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as Swatch)}
      className={ui('db-swatches')}
    >
      {swatches.map((swatch) => (
        <Radio.Root
          key={swatch}
          value={swatch}
          aria-label={swatch}
          className={ui('db-swatch')}
          style={{ background: `var(--swatch-${swatch})` }}
        >
          <Radio.Indicator>
            <Icon name="check" size={14} color="var(--neutral-950)" />
          </Radio.Indicator>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
export type CalendarProps = Omit<DayPickerProps, 'mode' | 'selected' | 'onSelect'> & {
  selected?: Date;
  defaultSelected?: Date;
  onSelect?: (date: Date | undefined) => void;
};
export function Calendar({
  selected,
  defaultSelected,
  onSelect,
  className,
  ...props
}: CalendarProps) {
  const [internal, setInternal] = useState(defaultSelected);
  return (
    <DayPicker
      {...props}
      mode="single"
      weekStartsOn={1}
      showOutsideDays
      selected={selected ?? internal}
      onSelect={(date) => {
        if (selected === undefined) setInternal(date);
        onSelect?.(date);
      }}
      className={cx(ui('calendar'), className)}
      classNames={{
        root: ui('calendar'),
        months: ui('calendar-months'),
        month_caption: ui('calendar-caption'),
        caption_label: ui('calendar-caption-label'),
        nav: ui('calendar-nav'),
        button_previous: ui('calendar-nav-button'),
        button_next: ui('calendar-nav-button'),
        month_grid: ui('calendar-grid'),
        weekday: ui('calendar-weekday'),
        day: ui('calendar-cell'),
        day_button: ui('calendar-day'),
        today: ui('calendar-today'),
        selected: ui('calendar-selected'),
        outside: ui('calendar-outside'),
        disabled: ui('calendar-disabled'),
      }}
      formatters={{
        formatWeekdayName: (date) => date.toLocaleDateString('en', { weekday: 'narrow' }),
      }}
      components={{
        Chevron: ({ orientation }: ChevronProps) => (
          <Icon name={orientation === 'left' ? 'chevron-left' : 'chevron-right'} size={14} />
        ),
      }}
    />
  );
}
export type NativeControlProps = ComponentProps<'input'>;
