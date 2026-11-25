/**
 * A proposal, not the app's toolbar: one list toolbar for Tasks, Projects and Notes, drawn from a
 * definition of the page's scopes, filters, sorts, groupings and layouts.
 *
 *   [Open | All | Done]  [Priority High ×]  [+ Filter]            [Display ▾]  [+ New Task]
 *
 * The left side says which items are shown; the right side how they are drawn. Each filter that is
 * set is a chip of its own, taking several values; Sort, Group by and the view toggle share one
 * Display popover; the page's "New …" button is the only filled control.
 */
import type { CSSProperties } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleSlash,
  ListFilter,
  Plus,
  SlidersHorizontal,
  X,
  type LucideIcon,
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
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import type { IconSource } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/Select';
import { ToggleGroup } from '../../ui/ToggleGroup';

export interface ToolbarOption {
  value: string;
  label: string;
  icon?: IconSource;
}

export interface ToolbarFilterField {
  id: string;
  label: string;
  icon: LucideIcon;
  options: ToolbarOption[];
}

/** What a list page gives the toolbar: everything that differs between Tasks, Projects and Notes. */
export interface ListToolbarDef {
  /** "Task": the button reads "New Task" */
  noun: string;
  /** the segmented control at the start (Open / All / Done); none for a page without a status */
  scopes?: ToolbarOption[];
  fields: ToolbarFilterField[];
  sorts: ToolbarOption[];
  /** the groupings of the list layout, the first being "None"; none for a page that has no groups */
  groupBys?: ToolbarOption[];
  layouts: ToolbarOption[];
  /** a layout that orders and groups itself (the board): Display shows only the layout for it */
  fixedLayout?: string;
}

export interface ListToolbarState {
  scope: string;
  /** the chosen values of each filter field, by its id; a field with none is not filtering */
  filters: Record<string, string[]>;
  sort: string;
  dir: 'asc' | 'desc';
  groupBy: string;
  layout: string;
}

interface ToolbarProps {
  def: ListToolbarDef;
  state: ListToolbarState;
  onChange: (patch: Partial<ListToolbarState>) => void;
  /** a narrow window: the chips fold into one "Filter" button with a count */
  compact?: boolean;
}

function toggled(values: string[], value: string, on: boolean): string[] {
  return on ? [...values, value] : values.filter((v) => v !== value);
}

/** "High", "High, Medium", then "High +2" */
function chipValue(field: ToolbarFilterField, values: string[]): string {
  const labels = field.options.filter((o) => values.includes(o.value)).map((o) => o.label);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
}

function FieldItems({
  field,
  state,
  onChange,
}: {
  field: ToolbarFilterField;
  state: ListToolbarState;
  onChange: ToolbarProps['onChange'];
}) {
  const values = state.filters[field.id] ?? [];
  return field.options.map((option) => (
    <DropdownMenuCheckboxItem
      key={option.value}
      icon={option.icon}
      checked={values.includes(option.value)}
      onCheckedChange={(checked) =>
        onChange({
          filters: { ...state.filters, [field.id]: toggled(values, option.value, checked) },
        })
      }
    >
      {option.label}
    </DropdownMenuCheckboxItem>
  ));
}

/** One filter that is set: its values open a menu of the field's values, × removes it. */
function FilterChip({
  field,
  state,
  onChange,
}: {
  field: ToolbarFilterField;
  state: ListToolbarState;
  onChange: ToolbarProps['onChange'];
}) {
  const values = state.filters[field.id] ?? [];
  return (
    <ButtonGroup aria-label={`${field.label} filter`}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" icon={field.icon} value={chipValue(field, values)}>
              {field.label}
            </Button>
          }
        />
        <DropdownMenuContent width="sm" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
            <FieldItems field={field} state={state} onChange={onChange} />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="icon"
        icon={X}
        aria-label={`Remove ${field.label} filter`}
        style={{ width: 28, color: 'var(--muted-foreground)' }}
        onClick={() => onChange({ filters: { ...state.filters, [field.id]: [] } })}
      />
    </ButtonGroup>
  );
}

/** Every value of every field in one list, with a search row: type "high" or "auth" and tick it. */
function FilterMenu({
  def,
  state,
  onChange,
  trigger,
}: ToolbarProps & { trigger: React.ReactElement }) {
  const anySet = Object.values(state.filters).some((values) => values.length > 0);
  return (
    <DropdownMenuFilter>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="start" aria-label="Filter">
          <DropdownMenuSearch aria-label="Search filters" placeholder="Filter by…" />
          <DropdownMenuList>
            {def.fields.map((field) => (
              <DropdownMenuGroup key={field.id}>
                <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
                <FieldItems field={field} state={state} onChange={onChange} />
              </DropdownMenuGroup>
            ))}
          </DropdownMenuList>
          <DropdownMenuEmpty>No filters match</DropdownMenuEmpty>
          {anySet && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={CircleSlash} onClick={() => onChange({ filters: {} })}>
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
  );
}

/** Which items are shown: the scope, a chip per filter that is set, and "+ Filter". */
export function ListToolbarStart({ def, state, onChange, compact = false }: ToolbarProps) {
  const set = def.fields.filter((field) => (state.filters[field.id] ?? []).length > 0);
  return (
    <>
      {def.scopes && (
        <ToggleGroup
          aria-label="Show"
          value={state.scope}
          onValueChange={(scope) => onChange({ scope })}
          items={def.scopes}
        />
      )}
      {compact ? (
        <FilterMenu
          def={def}
          state={state}
          onChange={onChange}
          trigger={
            <Button
              variant="outline"
              icon={ListFilter}
              value={set.length > 0 ? String(set.length) : undefined}
            >
              Filter
            </Button>
          }
        />
      ) : (
        <>
          {set.map((field) => (
            <FilterChip key={field.id} field={field} state={state} onChange={onChange} />
          ))}
          <FilterMenu
            def={def}
            state={state}
            onChange={onChange}
            trigger={
              <Button variant="ghost" icon={Plus} style={{ color: 'var(--muted-foreground)' }}>
                Filter
              </Button>
            }
          />
        </>
      )}
    </>
  );
}

const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr',
  alignItems: 'center',
  gap: 8,
};
const rowLabel: CSSProperties = {
  color: 'var(--muted-foreground)',
  font: 'var(--font-weight-normal) 13px / var(--text-sm-leading) var(--font-sans)',
};

function OptionSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ToolbarOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(String(next))}>
      <SelectTrigger size="sm" aria-label={label} style={{ flex: 1, minWidth: 0 }} />
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} icon={option.icon}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How the items are drawn (Display: layout, grouping, sort and its direction), then "New …". */
export function ListToolbarEnd({ def, state, onChange, compact = false }: ToolbarProps) {
  const fixed = state.layout === def.fixedLayout;
  const layout = def.layouts.find((l) => l.value === state.layout);
  const sort = def.sorts.find((s) => s.value === state.sort);
  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              icon={SlidersHorizontal}
              // what orders the page: the sort, or the layout that orders itself
              value={fixed ? layout?.label : sort?.label}
              hideValue={compact}
            >
              Display
            </Button>
          }
        />
        <PopoverContent align="end" aria-label="Display">
          <div style={{ display: 'grid', gap: 10 }}>
            <ToggleGroup
              aria-label="Layout"
              value={state.layout}
              onValueChange={(next) => onChange({ layout: next })}
              items={def.layouts}
              style={{
                display: 'grid',
                gridAutoFlow: 'column',
                gridAutoColumns: '1fr',
                width: '100%',
              }}
            />
            {!fixed && def.groupBys && (
              <div style={row}>
                <span style={rowLabel}>Group by</span>
                <OptionSelect
                  label="Group by"
                  options={def.groupBys}
                  value={state.groupBy}
                  onChange={(groupBy) => onChange({ groupBy })}
                />
              </div>
            )}
            {!fixed && (
              <div style={row}>
                <span style={rowLabel}>Sort by</span>
                <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
                  <OptionSelect
                    label="Sort by"
                    options={def.sorts}
                    value={state.sort}
                    onChange={(next) => onChange({ sort: next })}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    icon={state.dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow}
                    aria-label={state.dir === 'asc' ? 'Ascending' : 'Descending'}
                    onClick={() => onChange({ dir: state.dir === 'asc' ? 'desc' : 'asc' })}
                  />
                </div>
              </div>
            )}
            {fixed && <span style={rowLabel}>The board groups tasks by status.</span>}
          </div>
        </PopoverContent>
      </Popover>
      <Button variant="primary" icon={Plus}>
        New {def.noun}
      </Button>
    </>
  );
}
