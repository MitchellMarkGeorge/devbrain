import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { ButtonGroup } from '../../ui/ButtonGroup';
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

function removeFilter(field: ListFilterField) {
  if (field.multiple) field.onChange([]);
  else field.onChange(undefined);
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

/**
 * A filter that is set, as a chip: its value opens the field's values, its × removes it. `small`
 * draws it 28px tall, for the chips' own row (`ListFilterChips`); `pill` draws it as one of the
 * app's pills there: 24px, fully round, 12px text.
 */
function FilterChip({
  field,
  folded,
  small,
  pill,
}: {
  field: ListFilterField;
  folded?: boolean;
  small?: boolean;
  pill?: boolean;
}) {
  const size = pill ? 'xs' : small ? 'sm' : undefined;
  return (
    <ButtonGroup
      aria-label={`${field.label} filter`}
      data-chip=""
      // a folded chip is unseen, and so out of the accessibility tree and the tab order
      aria-hidden={folded || undefined}
      className={cn(styles.chip, pill && styles.pill, folded && styles.folded)}
    >
      <Searchable field={field}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size={size}
                icon={field.icon}
                value={<FieldSummary field={field} className={styles.value} />}
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
        size={pill ? 'icon-xs' : small ? 'icon-sm' : 'icon'}
        icon={X}
        aria-label={`Remove ${field.label} filter`}
        className={pill || small ? styles.chipRemoveSmall : styles.chipRemove}
        onClick={() => removeFilter(field)}
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
   * An alternative being tried: `row` leaves the chips out of this row, for a `ListFilterChips`
   * under the toolbar to draw. The Filter button then never moves: it stays after Status, drawn
   * pressed while a filter is set, and its menu stays under the pointer as values are ticked.
   */
  chips?: 'inline' | 'row';
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
 * trailing button. All of them while they fit with the Filter button (`plainWidth`) after them; otherwise
 * as many as leave room for "Filter +N". Chips fold from the end.
 */
export function chipsThatFit(
  widths: number[],
  available: number,
  plainWidth: number,
  moreWidth = MORE_WIDTH,
): number {
  const all = widths.reduce((sum, width) => sum + width, 0);
  if (all + plainWidth <= available) return widths.length;
  let used = moreWidth;
  let fit = 0;
  for (const width of widths) {
    if (used + width > available) break;
    used += width;
    fit += 1;
  }
  return fit;
}

/**
 * `chipsThatFit` for the chips in `row`, in the room its "Clear" (if it is drawn) leaves. A row
 * that has not been laid out shows them all.
 */
function measure(row: HTMLElement, plainWidth: number, moreWidth = MORE_WIDTH): number {
  const chips = [...row.querySelectorAll<HTMLElement>('[data-chip]')];
  if (row.clientWidth === 0) return chips.length;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const clear = row.querySelector<HTMLElement>('[data-clear]');
  return chipsThatFit(
    chips.map((chip) => chip.offsetWidth + gap),
    row.clientWidth - (clear ? clear.offsetWidth + gap : 0),
    plainWidth,
    moreWidth,
  );
}

/**
 * A list's filters, on one row: a chip for each one that is set (its value opens the field's
 * values, its × removes it), then the Filter button, an outline icon button. The chips that don't
 * fit the row fold into the button, which then reads "Filter +2"; in a compact window they all do ("Filter 2"). A folded
 * chip stays in the row, unseen and out of its flow, so its width can always be read: how many
 * fit is counted from the page as it is, with nothing remembered. The menu
 * has an item for each field, showing what it is filtered to (so a folded filter is still one
 * click away) and opening its values in a submenu, with a search row for a field that asks for
 * one. A field holds one value (radio buttons), or with `multiple` several, meaning "any of these"
 * (checkboxes); picking a value never closes the menu. A `multiple` field's chip names up to two
 * ("High, Medium") and then counts ("High +2"), and unticking the last one removes the chip.
 *
 * While a filter is set, "Clear" sits at the row's end (before the toolbar's end group), where it
 * stays put as chips come and go. It is there with one filter too: beside the chip's × in a wide
 * window, and the only one-click way out in a compact one, where the chip is folded.
 */
export function ListFilters({ fields, compact, defaultOpen, chips, onClear }: ListFiltersProps) {
  if (chips === 'row')
    return <FilterMenuButton fields={fields} defaultOpen={defaultOpen} onClear={onClear} />;
  return (
    <InlineFilters fields={fields} compact={compact} defaultOpen={defaultOpen} onClear={onClear} />
  );
}

/** The Filter menu's items: a submenu per field, then "Clear filters" while one is set. */
function FilterMenuItems({ fields, onClear }: Pick<ListFiltersProps, 'fields' | 'onClear'>) {
  const anySet = fields.some((field) => valuesOf(field).length > 0);
  return (
    <DropdownMenuContent width="sm" align="start" aria-label="Filter">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Filter by</DropdownMenuLabel>
        {fields.map((field) => (
          <FieldSubmenu key={field.id} field={field} />
        ))}
      </DropdownMenuGroup>
      {anySet && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={CircleSlash} onClick={onClear}>
            Clear filters
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

/**
 * The Filter button alone, its chips drawn elsewhere (`chips="row"`): it stays where it is, and
 * "Clear" keeps its place at the row's end, before Display.
 */
function FilterMenuButton({
  fields,
  defaultOpen,
  onClear,
}: Pick<ListFiltersProps, 'fields' | 'defaultOpen' | 'onClear'>) {
  const anySet = fields.some((field) => valuesOf(field).length > 0);
  return (
    <div className={styles.filters}>
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger
          render={
            <IconButton
              variant="outline"
              icon={ListFilter}
              label="Filter"
              data-pressed={anySet ? '' : undefined}
            />
          }
        />
        <FilterMenuItems fields={fields} onClear={onClear} />
      </DropdownMenu>
      {anySet && (
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

export interface ListFilterChipsProps extends Pick<ListFiltersProps, 'fields'> {
  /**
   * `chip` (the default): small versions of the toolbar's chips, 28px with squared corners.
   * `pill`: the app's pill shape, 24px and fully round, like the pills on a task's row.
   */
  shape?: 'chip' | 'pill';
  /**
   * `card`: the row sits on a card of its own (a `muted` band with a `border` line, as wide as
   * the list), which sets the filters apart from the rows under them. None by default.
   */
  surface?: 'none' | 'card';
  className?: string;
}

// the room kept in the chips' row for its "+2" once chips are folded into it
const ROW_MORE_WIDTH = 48;

/** What a row's fit depends on: which chips there are and what they say. */
function chipsKeyOf(set: ListFilterField[]): string {
  return set
    .map((field) => {
      const { text, more } = filterSummary(field);
      return `${field.id}:${valuesOf(field).join(',')}:${text}:${more}`;
    })
    .join('|');
}

/**
 * An alternative being tried, with `ListFilters chips="row"`: the filters that are set, as a row
 * of their own under the toolbar. The chips are smaller (28px) and stay on one line: those that
 * don't fit fold into a "+2" at the row's end, whose menu holds their fields. With no filter set
 * the row is not drawn, so it takes no room. "Clear" stays in the toolbar.
 */
export function ListFilterChips({
  fields,
  shape = 'chip',
  surface = 'none',
  className,
}: ListFilterChipsProps) {
  const pill = shape === 'pill';
  const set = fields.filter((field) => valuesOf(field).length > 0);
  const line = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(set.length);
  const [lineWidth, setLineWidth] = useState(0);
  const chipsKey = chipsKeyOf(set);
  const drawn = set.length > 0;

  useLayoutEffect(() => {
    const element = line.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setLineWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [drawn]);

  useLayoutEffect(() => {
    if (line.current) setShown(measure(line.current, 0, ROW_MORE_WIDTH));
  }, [chipsKey, lineWidth, pill]);

  if (!drawn) return null;
  const folded = set.slice(shown);
  return (
    <div role="group" aria-label="Filters" className={cn(styles.chipRow, className)}>
      <div className={surface === 'card' ? styles.chipCard : undefined}>
        <div ref={line} className={styles.chipLine}>
          {set.map((field, index) => (
            <FilterChip key={field.id} field={field} small pill={pill} folded={index >= shown} />
          ))}
          {folded.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size={pill ? 'xs' : 'sm'}
                    aria-label={`${folded.length} more filters`}
                    className={cn(styles.rowMore, pill && styles.pillMore)}
                  >
                    +{folded.length}
                  </Button>
                }
              />
              <DropdownMenuContent width="sm" align="start" aria-label="More filters">
                {folded.map((field) => (
                  <FieldSubmenu key={field.id} field={field} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineFilters({ fields, compact, defaultOpen, onClear }: ListFiltersProps) {
  const set = fields.filter((field) => valuesOf(field).length > 0);
  const row = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // the Filter button's width, as last drawn with no chip folded
  const plainWidth = useRef(32);
  const [shown, setShown] = useState(set.length);
  // What the fit depends on: which chips there are and what they say, and the row's width. A
  // value's label can arrive after its chip (a project's name, once the projects load), and the
  // chip is wider for it, so the label is part of the key.
  const chipsKey = chipsKeyOf(set);
  const [rowWidth, setRowWidth] = useState(0);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!row.current) return;
    if (shown >= set.length && trigger.current) plainWidth.current = trigger.current.offsetWidth;
    setShown(measure(row.current, plainWidth.current));
    // `shown` is this effect's own result: measured again only when the chips or the row change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipsKey, rowWidth, compact]);

  const folded = compact ? set.length : Math.max(0, set.length - shown);
  return (
    <div ref={row} className={styles.filters}>
      {!compact &&
        set.map((field, index) => (
          <FilterChip key={field.id} field={field} folded={index >= shown} />
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
              <IconButton ref={trigger} variant="outline" icon={ListFilter} label="Filter" />
            )
          }
        />
        <FilterMenuItems fields={fields} onClear={onClear} />
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
