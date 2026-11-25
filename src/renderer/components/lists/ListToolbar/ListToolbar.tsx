import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import type { IconSource } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/Select';
import { ToggleGroup } from '../../ui/ToggleGroup';
import styles from './ListToolbar.module.css';

/** A choice in one of the toolbar's menus. */
export interface ListToolbarOption<Value extends string = string> {
  value: Value;
  label: string;
  icon?: IconSource;
}

function RadioItems<Value extends string>({ options }: { options: ListToolbarOption<Value>[] }) {
  return options.map((option) => (
    <DropdownMenuRadioItem key={option.value} value={option.value} icon={option.icon}>
      {option.label}
    </DropdownMenuRadioItem>
  ));
}

export interface ListStatusChipProps<Value extends string = string> {
  /** the chip's name; "Status" by default */
  label?: string;
  icon: IconSource;
  /** the scopes that span several statuses: Open, All */
  options: ListToolbarOption<Value>[];
  /** each status alone, under a separator */
  statuses?: ListToolbarOption<Value>[];
  value: Value;
  /** the value is not the page's default: a compact window, which hides the value, draws it pressed */
  active?: boolean;
  /** a narrow window: the chip keeps its name and drops its value */
  compact?: boolean;
  /** draws the menu open at first, for a picture of it */
  defaultOpen?: boolean;
  onChange: (value: Value) => void;
}

/**
 * The status a list shows, first in its toolbar: a chip that is always there (a list always has a
 * status scope, so it has no ×), opening the scopes and then each status alone.
 */
export function ListStatusChip<Value extends string = string>({
  label = 'Status',
  icon,
  options,
  statuses = [],
  value,
  active,
  compact,
  defaultOpen,
  onChange,
}: ListStatusChipProps<Value>) {
  const current = [...options, ...statuses].find((option) => option.value === value);
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            icon={icon}
            value={current?.label}
            hideValue={compact}
            active={active}
          >
            {label}
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next: string) => onChange(next as Value)}
          >
            <RadioItems options={options} />
            {statuses.length > 0 && <DropdownMenuSeparator />}
            <RadioItems options={statuses} />
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One thing a list can be filtered by, and the value it is filtered to (none: not filtering). */
export interface ListFilterField {
  id: string;
  label: string;
  icon: IconSource;
  options: ListToolbarOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /**
   * gives the field's submenu a search row with this placeholder ("Search projects…"): for a
   * field whose values are the user's own, and so may be many
   */
  search?: string;
}

/**
 * A field in the Filter menu: an item naming the field and the value it is filtered to, opening
 * its values as a choice of one, "Any" first (which removes the filter).
 */
function FieldSubmenu({ field }: { field: ListFilterField }) {
  const current = field.options.find((option) => option.value === field.value);
  const values = (
    <DropdownMenuRadioGroup
      value={field.value ?? ''}
      onValueChange={(next: string) => field.onChange(next === '' ? undefined : next)}
    >
      <DropdownMenuRadioItem value="" icon={CircleSlash}>
        Any
      </DropdownMenuRadioItem>
      <RadioItems options={field.options} />
    </DropdownMenuRadioGroup>
  );
  const submenu = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={field.icon} value={current?.label}>
        {field.label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent width={field.search === undefined ? 'sm' : 'lg'}>
        {field.search === undefined ? (
          values
        ) : (
          <>
            <DropdownMenuSearch aria-label={field.search} placeholder={field.search} />
            <DropdownMenuList>{values}</DropdownMenuList>
            <DropdownMenuEmpty>No matches</DropdownMenuEmpty>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
  // typing in the search row filters this submenu's values only
  if (field.search === undefined) return submenu;
  return <DropdownMenuFilter autoHighlight>{submenu}</DropdownMenuFilter>;
}

export interface ListFiltersProps {
  fields: ListFilterField[];
  /** a narrow window: the button keeps its name and drops its value */
  compact?: boolean;
  /** draws the menu open at first, for a picture of it */
  defaultOpen?: boolean;
  /** "Clear filters", at the menu's end while a filter is set */
  onClear: () => void;
}

/**
 * A list's filters, as one "Filter" button however many are set: it names the one filter that is
 * set ("Filter High") or counts them ("Filter 3"). Its menu has an item for each field, showing
 * the value it is filtered to and opening its values in a submenu (with a search row for a field
 * that asks for one). A field holds one value.
 */
export function ListFilters({ fields, compact, defaultOpen, onClear }: ListFiltersProps) {
  const set = fields.filter((field) => field.value !== undefined);
  const only = set.length === 1 ? set[0] : undefined;
  const value = only
    ? only.options.find((option) => option.value === only.value)?.label
    : set.length > 1
      ? String(set.length)
      : undefined;
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            icon={ListFilter}
            value={value === undefined ? undefined : <span className={styles.value}>{value}</span>}
            hideValue={compact}
            active={set.length > 0}
          >
            Filter
          </Button>
        }
      />
      <DropdownMenuContent width="sm" align="start" aria-label="Filter">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filter by</DropdownMenuLabel>
          {fields.map((field) => (
            <FieldSubmenu key={field.id} field={field} />
          ))}
        </DropdownMenuGroup>
        {set.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={CircleSlash} onClick={onClear}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface Choice<Value extends string> {
  options: ListToolbarOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}

export interface ListDisplayProps<
  Layout extends string = string,
  GroupBy extends string = string,
  Sort extends string = string,
> {
  /** the layouts, as a switch at the popover's top: List and Board, List and Cards */
  layout: Choice<Layout>;
  /** the groupings, the first being "None"; leave out for a list with no groups */
  groupBy?: Choice<GroupBy>;
  /** what the list is sorted by, and which way; leave out for a layout that orders itself */
  sort?: Choice<Sort> & { dir: 'asc' | 'desc'; onDirChange: (dir: 'asc' | 'desc') => void };
  /** a line under the layout switch, for a layout with nothing else to set (the board) */
  note?: string;
  /** a narrow window: the button keeps its name and drops its value */
  compact?: boolean;
  /** draws the popover open at first, for a picture of it */
  defaultOpen?: boolean;
}

function ChoiceSelect<Value extends string>({
  label,
  choice,
}: {
  label: string;
  choice: Choice<Value>;
}) {
  return (
    <Select
      items={choice.options}
      value={choice.value}
      onValueChange={(next) => choice.onChange(next as Value)}
    >
      <SelectTrigger size="sm" aria-label={label} className={styles.select} />
      <SelectContent>
        {choice.options.map((option) => (
          <SelectItem key={option.value} value={option.value} icon={option.icon}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * How a list is drawn, at its toolbar's end: one "Display" button opening the layout, the grouping
 * and the sort with its direction. The button's value is what orders the page: the sort, or the
 * layout when it orders itself.
 */
export function ListDisplay<
  Layout extends string = string,
  GroupBy extends string = string,
  Sort extends string = string,
>({ layout, groupBy, sort, note, compact, defaultOpen }: ListDisplayProps<Layout, GroupBy, Sort>) {
  const value = sort
    ? sort.options.find((option) => option.value === sort.value)?.label
    : layout.options.find((option) => option.value === layout.value)?.label;
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" icon={SlidersHorizontal} value={value} hideValue={compact}>
            Display
          </Button>
        }
      />
      <PopoverContent align="end" aria-label="Display">
        <div className={styles.display}>
          <ToggleGroup
            aria-label="Layout"
            value={layout.value}
            onValueChange={(next) => layout.onChange(next as Layout)}
            items={layout.options}
            className={styles.layouts}
          />
          {groupBy && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Group by</span>
              <ChoiceSelect label="Group by" choice={groupBy} />
            </div>
          )}
          {sort && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Sort by</span>
              <div className={styles.sort}>
                <ChoiceSelect label="Sort by" choice={sort} />
                <Button
                  variant="outline"
                  size="icon-sm"
                  icon={sort.dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow}
                  aria-label={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
                  onClick={() => sort.onDirChange(sort.dir === 'asc' ? 'desc' : 'asc')}
                />
              </div>
            </div>
          )}
          {note && <span className={styles.note}>{note}</span>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
