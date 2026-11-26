import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  SlidersHorizontal,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { IconButton } from '../../ui/IconButton';
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

interface ListFilterFieldBase {
  id: string;
  label: string;
  icon: IconSource;
  options: ListToolbarOption[];
  /**
   * gives the field's submenu a search row with this placeholder ("Search projects…"): for a
   * field whose values are the user's own, and so may be many
   */
  search?: string;
}

/** A field that holds one value (Due): its values are a choice of one. */
export interface ListSingleFilterField extends ListFilterFieldBase {
  multiple?: false;
  /** the value it is filtered to; none: not filtering */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/** A field that holds several values, meaning "any of these" (Priority): each ticks on its own. */
export interface ListMultiFilterField extends ListFilterFieldBase {
  multiple: true;
  /** the values it is filtered to; empty: not filtering */
  value: readonly string[];
  onChange: (value: string[]) => void;
}

/** One thing a list can be filtered by, and what it is filtered to. */
export type ListFilterField = ListSingleFilterField | ListMultiFilterField;

/** The values a field is filtered to: none, one, or for a `multiple` field several. */
function valuesOf(field: ListFilterField): readonly string[] {
  if (field.multiple) return field.value;
  return field.value === undefined ? [] : [field.value];
}

/**
 * What a field is filtered to, in words: one value's label ("High"), two side by side
 * ("High, Medium"), and from three the first with how many more ("High +2"). In the options'
 * order, whatever order they were ticked in.
 */
export function filterSummary(field: ListFilterField): { text: string; more: number } {
  const values = valuesOf(field);
  const labels = field.options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);
  if (values.length <= 2) return { text: labels.join(', '), more: 0 };
  return { text: labels[0] ?? '', more: values.length - 1 };
}

/** A field's summary, in a chip or a menu: the text is cut with "…" before "+2" is. */
function FieldSummary({ field, className }: { field: ListFilterField; className?: string }) {
  const { text, more } = filterSummary(field);
  return (
    <span className={cn(styles.summary, className)}>
      <span className={styles.summaryText}>{text}</span>
      {more > 0 && <span className={styles.more}> +{more}</span>}
    </span>
  );
}

/** `values` with `value` ticked or unticked, in the options' order (a value with no option last). */
function toggled(field: ListMultiFilterField, value: string, checked: boolean): string[] {
  const next = new Set(field.value);
  if (checked) next.add(value);
  else next.delete(value);
  const known = field.options.map((option) => option.value).filter((known) => next.has(known));
  return [...known, ...[...next].filter((other) => !known.includes(other))];
}

/**
 * A field's values, under a search row for a field that asks for one (the menu or submenu around
 * them must then be in a `DropdownMenuFilter`): radio buttons for a choice of one, checkboxes for
 * a `multiple` field. Each value draws its control, and neither kind closes the menu, so several
 * values, and then other fields, can be set in one visit. `any` puts "Any" first, which removes
 * the filter.
 */
function FieldValues({ field, any }: { field: ListFilterField; any?: boolean }) {
  const values = field.multiple ? (
    <DropdownMenuGroup>
      {any && (
        <DropdownMenuCheckboxItem
          indicator="control"
          icon={CircleSlash}
          checked={field.value.length === 0}
          onCheckedChange={() => field.onChange([])}
        >
          Any
        </DropdownMenuCheckboxItem>
      )}
      {field.options.map((option) => (
        <DropdownMenuCheckboxItem
          key={option.value}
          indicator="control"
          icon={option.icon}
          checked={field.value.includes(option.value)}
          onCheckedChange={(checked) => field.onChange(toggled(field, option.value, checked))}
        >
          {option.label}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuGroup>
  ) : (
    <DropdownMenuRadioGroup
      value={field.value ?? ''}
      onValueChange={(next: string) => field.onChange(next === '' ? undefined : next)}
    >
      {any && (
        <DropdownMenuRadioItem value="" icon={CircleSlash} indicator="control" closeOnClick={false}>
          Any
        </DropdownMenuRadioItem>
      )}
      {field.options.map((option) => (
        <DropdownMenuRadioItem
          key={option.value}
          value={option.value}
          icon={option.icon}
          indicator="control"
          closeOnClick={false}
        >
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
  if (field.search === undefined) return values;
  return (
    <>
      <DropdownMenuSearch aria-label={field.search} placeholder={field.search} />
      <DropdownMenuList>{values}</DropdownMenuList>
      <DropdownMenuEmpty>No matches</DropdownMenuEmpty>
    </>
  );
}

/** Makes the menu or submenu inside it searchable, for a field with a search row. */
function Searchable({ field, children }: { field: ListFilterField; children: ReactNode }) {
  // typing in the search row filters this field's values only
  if (field.search === undefined) return children;
  return <DropdownMenuFilter autoHighlight>{children}</DropdownMenuFilter>;
}

/**
 * A field in the Filter menu: an item naming the field and what it is filtered to, opening its
 * values in a submenu, "Any" first.
 */
function FieldSubmenu({ field }: { field: ListFilterField }) {
  const set = valuesOf(field).length > 0;
  return (
    <Searchable field={field}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          icon={field.icon}
          value={set ? <FieldSummary field={field} className={styles.menuValue} /> : undefined}
        >
          {field.label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent width={field.search === undefined ? 'sm' : 'lg'}>
          <FieldValues field={field} any />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </Searchable>
  );
}

/** The filters that are set, a line each, for the Filter button's tooltip. */
function FilterTooltip({ set }: { set: ListFilterField[] }) {
  return (
    <span className={styles.tooltip}>
      {set.map((field) => {
        const { text, more } = filterSummary(field);
        return (
          <span key={field.id}>
            {field.label}: {text}
            {more > 0 && ` +${more}`}
          </span>
        );
      })}
    </span>
  );
}

export interface ListFiltersProps {
  fields: ListFilterField[];
  /** draws the menu open at first, for a picture of it */
  defaultOpen?: boolean;
  /**
   * removes every filter: "Clear" at the row's end and "Clear filters" at the menu's end, while
   * any is set
   */
  onClear: () => void;
}

/**
 * A list's filters: one outline icon button, with a badge counting the filters that are set. Its
 * menu has an item for each field, showing what it is filtered to and opening its values in a
 * submenu, with a search row for a field that asks for one. A field holds one value (radio
 * buttons), or with `multiple` several, meaning "any of these" (checkboxes); picking a value never
 * closes the menu. The button never moves or changes size, so its menu stays under the pointer
 * while values are ticked. Its tooltip names the filters that are set.
 *
 * While a filter is set, "Clear" sits at the row's end (before the toolbar's end group).
 */
export function ListFilters({ fields, defaultOpen, onClear }: ListFiltersProps) {
  const set = fields.filter((field) => valuesOf(field).length > 0);
  const count = set.length;
  return (
    <div className={styles.filters}>
      <span className={styles.filterButton}>
        <DropdownMenu defaultOpen={defaultOpen}>
          <DropdownMenuTrigger
            render={
              <IconButton
                variant="outline"
                icon={ListFilter}
                label={count > 0 ? `Filter, ${count} set` : 'Filter'}
                tooltip={count > 0 ? <FilterTooltip set={set} /> : true}
              />
            }
          />
          <DropdownMenuContent width="sm" align="start" aria-label="Filter">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              {fields.map((field) => (
                <FieldSubmenu key={field.id} field={field} />
              ))}
            </DropdownMenuGroup>
            {count > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={CircleSlash} onClick={onClear}>
                  Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {count > 0 && (
          <span aria-hidden data-filter-count="" className={styles.badge}>
            {count}
          </span>
        )}
      </span>
      {count > 0 && (
        <Button
          variant="ghost"
          aria-label="Clear filters"
          className={styles.clear}
          onClick={onClear}
        >
          Clear
        </Button>
      )}
    </div>
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
