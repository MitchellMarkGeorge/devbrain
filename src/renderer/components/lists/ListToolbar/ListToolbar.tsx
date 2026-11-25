import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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
}

/** A filter that is set: its value opens the field's values, × removes it. */
function FilterChip({ field }: { field: ListFilterField }) {
  const current = field.options.find((option) => option.value === field.value);
  return (
    <ButtonGroup aria-label={`${field.label} filter`}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" icon={field.icon} value={current?.label}>
              {field.label}
            </Button>
          }
        />
        <DropdownMenuContent width="sm" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={field.value ?? ''}
              onValueChange={(next: string) => field.onChange(next)}
            >
              <RadioItems options={field.options} />
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="icon"
        icon={X}
        aria-label={`Remove ${field.label} filter`}
        className={styles.remove}
        onClick={() => field.onChange(undefined)}
      />
    </ButtonGroup>
  );
}

// a menu this long gets a search row
const SEARCH_FROM = 9;

export interface ListFiltersProps {
  fields: ListFilterField[];
  /** a narrow window: the chips fold into one "Filter" button with a count */
  compact?: boolean;
  /** draws the menu open at first, for a picture of it */
  defaultOpen?: boolean;
  /** "Clear filters", at the menu's end while a filter is set */
  onClear: () => void;
}

/**
 * A list's filters: a chip for each one that is set, then "+ Filter", whose menu lists every
 * field's values (with a search row once there are many). A field holds one value: ticking
 * another replaces it, and unticking it removes the filter.
 */
export function ListFilters({ fields, compact, defaultOpen, onClear }: ListFiltersProps) {
  const set = fields.filter((field) => field.value !== undefined);
  const searchable = fields.reduce((n, field) => n + field.options.length, 0) >= SEARCH_FROM;
  const menu = (
    <DropdownMenuFilter>
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger
          render={
            compact ? (
              <Button
                variant="outline"
                icon={ListFilter}
                value={set.length > 0 ? String(set.length) : undefined}
              >
                Filter
              </Button>
            ) : (
              <Button variant="ghost" icon={Plus} className={styles.add}>
                Filter
              </Button>
            )
          }
        />
        <DropdownMenuContent width={searchable ? 'lg' : 'sm'} align="start" aria-label="Filter">
          {searchable && (
            <DropdownMenuSearch aria-label="Search filters" placeholder="Filter by…" />
          )}
          <DropdownMenuList>
            {fields.map((field) => (
              <DropdownMenuGroup key={field.id}>
                <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
                {field.options.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    icon={option.icon}
                    checked={field.value === option.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? option.value : undefined)
                    }
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuList>
          {searchable && <DropdownMenuEmpty>No filters match</DropdownMenuEmpty>}
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
    </DropdownMenuFilter>
  );
  return (
    <>
      {!compact && set.map((field) => <FilterChip key={field.id} field={field} />)}
      {menu}
    </>
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
