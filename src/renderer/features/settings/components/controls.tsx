import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Switch,
  ToggleGroup,
} from '@renderer/components';

export interface Option<V extends string> {
  value: V;
  label: string;
}

/** A setting picked from a list: the value's label in the trigger, the options in the popup. */
export function SettingSelect<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** names the control for screen readers: the row's label */
  label: string;
  value: V;
  options: readonly Option<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <Select
      items={options as Option<V>[]}
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next as V);
      }}
    >
      <SelectTrigger aria-label={label} />
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A setting with a few values side by side. */
export function SettingToggle<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly Option<V>[];
  onChange: (value: V) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as V)}
      items={options as Option<V>[]}
    />
  );
}

/** A setting that is on or off. */
export function SettingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />;
}
