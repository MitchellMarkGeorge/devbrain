import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../ui/Button';
import { ButtonGroup } from '../../ui/ButtonGroup';
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
 * A field's values as a choice of one, under a search row for a field that asks for one (the menu
 * or submenu around them must then be in a `DropdownMenuFilter`). `any` puts "Any" first, which
 * removes the filter.
 */
function FieldValues({ field, any }: { field: ListFilterField; any?: boolean }) {
  const values = (
    <DropdownMenuRadioGroup
      value={field.value ?? ''}
      onValueChange={(next: string) => field.onChange(next === '' ? undefined : next)}
    >
      {any && (
        <DropdownMenuRadioItem value="" icon={CircleSlash}>
          Any
        </DropdownMenuRadioItem>
      )}
      <RadioItems options={field.options} />
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
 * A field in the Filter menu: an item naming the field and the value it is filtered to, opening
 * its values in a submenu, "Any" first.
 */
function FieldSubmenu({ field }: { field: ListFilterField }) {
  const current = field.options.find((option) => option.value === field.value);
  return (
    <Searchable field={field}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          icon={field.icon}
          value={current && <span className={styles.menuValue}>{current.label}</span>}
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

/** A filter that is set, as a chip: its value opens the field's values, its × removes it. */
function FilterChip({ field }: { field: ListFilterField }) {
  const current = field.options.find((option) => option.value === field.value);
  return (
    <ButtonGroup aria-label={`${field.label} filter`} data-chip="" className={styles.chip}>
      <Searchable field={field}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                icon={field.icon}
                value={<span className={styles.value}>{current?.label}</span>}
              >
                {field.label}
              </Button>
            }
          />
          <DropdownMenuContent
            width={field.search === undefined ? 'sm' : 'lg'}
            align="start"
            aria-label={field.label}
          >
            <FieldValues field={field} />
          </DropdownMenuContent>
        </DropdownMenu>
      </Searchable>
      <Button
        variant="outline"
        size="icon"
        icon={X}
        aria-label={`Remove ${field.label} filter`}
        className={styles.chipRemove}
        onClick={() => field.onChange(undefined)}
      />
    </ButtonGroup>
  );
}

export interface ListFiltersProps {
  fields: ListFilterField[];
  /** a narrow window: every chip folds into the "Filter" button, which counts them */
  compact?: boolean;
  /** draws the menu open at first, for a picture of it */
  defaultOpen?: boolean;
  /**
   * removes every filter: "Clear" at the row's end and "Clear filters" at the menu's end, while
   * any is set
   */
  onClear: () => void;
}

// the room kept for the trailing button once chips are folded into it: "Filter +2"
const MORE_WIDTH = 112;

/**
 * How many chips of these widths (each with the gap after it) fit in `available`, before the
 * trailing button. All of them while they fit with "+ Filter" (`plainWidth`) after them; otherwise
 * as many as leave room for "Filter +N". Chips fold from the end.
 */
export function chipsThatFit(widths: number[], available: number, plainWidth: number): number {
  const all = widths.reduce((sum, width) => sum + width, 0);
  if (all + plainWidth <= available) return widths.length;
  let used = MORE_WIDTH;
  let fit = 0;
  for (const width of widths) {
    if (used + width > available) break;
    used += width;
    fit += 1;
  }
  return fit;
}

/**
 * A list's filters, on one row: a chip for each one that is set (its value opens the field's
 * values, its × removes it), then "+ Filter". The chips that don't fit the row fold into the
 * button, which then reads "Filter +2"; in a compact window they all do ("Filter 2"). The menu
 * has an item for each field, showing the value it is filtered to (so a folded filter is still
 * one click away) and opening its values in a submenu, with a search row for a field that asks for
 * one. A field holds one value.
 *
 * While a filter is set, "Clear" sits at the row's end (before the toolbar's end group), where it
 * stays put as chips come and go. It is there with one filter too: beside the chip's × in a wide
 * window, and the only one-click way out in a compact one, where the chip is folded.
 */
export function ListFilters({ fields, compact, defaultOpen, onClear }: ListFiltersProps) {
  const set = fields.filter((field) => field.value !== undefined);
  const row = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Only the chips that fit are in the DOM. To know which do, each set of chips is drawn whole
  // once and measured before the browser paints (a layout effect), and the widths are kept: a
  // resize then needs no chip drawn to count again.
  const chipsKey = set.map((field) => `${field.id}:${field.value}`).join('|');
  // what was measured for the chips of `key`: each chip's width and "Clear"'s (with the gap after
  // it), and "+ Filter"'s
  const [measured, setMeasured] = useState({ key: '', chips: [] as number[], clear: 0, plain: 0 });
  const measuring = !compact && measured.key !== chipsKey;
  // the row's width, as the browser last laid it out; none before that
  const [rowWidth, setRowWidth] = useState(0);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element || !measuring) return;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    const widthOf = (selector: string) =>
      [...element.querySelectorAll<HTMLElement>(selector)].map((item) => item.offsetWidth + gap);
    setMeasured({
      key: chipsKey,
      chips: widthOf('[data-chip]'),
      clear: widthOf('[data-clear]')[0] ?? 0,
      plain: trigger.current?.offsetWidth ?? 0,
    });
  }, [chipsKey, measuring]);

  // a row that has not been laid out (no width) shows every chip
  const fit =
    measuring || rowWidth === 0
      ? set.length
      : chipsThatFit(measured.chips, rowWidth - measured.clear, measured.plain);
  const shown = compact ? [] : set.slice(0, fit);
  const folded = set.length - shown.length;
  return (
    <div ref={row} className={styles.filters}>
      {shown.map((field) => (
        <FilterChip key={field.id} field={field} />
      ))}
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger
          render={
            folded > 0 ? (
              <Button
                ref={trigger}
                variant="outline"
                icon={ListFilter}
                // every filter folded: how many are set; some: how many more than the chips shown
                value={folded === set.length ? String(folded) : `+${folded}`}
                active
              >
                Filter
              </Button>
            ) : (
              <Button ref={trigger} variant="ghost" icon={Plus} className={styles.add}>
                Filter
              </Button>
            )
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
      {set.length > 0 && (
        <Button
          variant="ghost"
          data-clear=""
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
