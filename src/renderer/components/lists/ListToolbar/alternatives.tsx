/**
 * Mock-ups of other ways to draw a list's filters, for comparing in stories. Not used by the app.
 *
 * - `fields`: every field is always in the toolbar, as Status is: a quiet button while it is not
 *   set, its value and an × once it is. There is no Filter button and no submenu.
 * - `tokens-row`: the Filter button stays in the toolbar; the filters that are set are flat tokens
 *   ("Priority is High ×") in a row of their own, with Clear after them.
 * - `tokens-inline`: one row, the Filter button first so it never moves, the flat tokens after it.
 * - `panel`: one "Filter 2" button and its menu; no filter is drawn in the row.
 */
import { ListFilter, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { ButtonGroup } from '../../ui/ButtonGroup';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
import {
  FieldSummary,
  FieldValues,
  FilterMenuItems,
  removeFilter,
  Searchable,
  valuesOf,
  type ListFilterField,
} from './ListToolbar';
import base from './ListToolbar.module.css';
import styles from './alternatives.module.css';

export const FILTER_MOCKS = ['fields', 'tokens-row', 'tokens-inline', 'panel'] as const;
export type FilterMock = (typeof FILTER_MOCKS)[number];

interface MockProps {
  variant: FilterMock;
  fields: ListFilterField[];
  onClear: () => void;
}

const isSet = (field: ListFilterField) => valuesOf(field).length > 0;

/** A field's own menu: its values, straight away. */
function FieldMenu({ field, trigger }: { field: ListFilterField; trigger: React.ReactElement }) {
  return (
    <Searchable field={field}>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent
          width={field.search === undefined ? 'sm' : 'lg'}
          align="start"
          aria-label={field.label}
        >
          <FieldValues field={field} />
        </DropdownMenuContent>
      </DropdownMenu>
    </Searchable>
  );
}

/** `fields`: a field that is always in the row; quiet until it is set, then its value and an ×. */
function FieldButton({ field }: { field: ListFilterField }) {
  const set = isSet(field);
  return (
    <ButtonGroup aria-label={`${field.label} filter`} className={base.chip}>
      <FieldMenu
        field={field}
        trigger={
          <Button
            variant="outline"
            icon={field.icon}
            value={set ? <FieldSummary field={field} className={base.value} /> : undefined}
            className={set ? undefined : styles.unset}
          >
            {field.label}
          </Button>
        }
      />
      {set && (
        <Button
          variant="outline"
          size="icon"
          icon={X}
          aria-label={`Remove ${field.label} filter`}
          className={base.chipRemove}
          onClick={() => removeFilter(field)}
        />
      )}
    </ButtonGroup>
  );
}

/** A filter that is set, as a flat token: "Priority is High, Medium ×", no outline. */
function Token({ field }: { field: ListFilterField }) {
  const verb = valuesOf(field).length > 1 ? 'is any of' : 'is';
  return (
    <ButtonGroup aria-label={`${field.label} filter`} className={cn(base.chip, styles.token)}>
      <FieldMenu
        field={field}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            icon={field.icon}
            value={<FieldSummary field={field} className={base.value} />}
          >
            {field.label} {verb}
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon-sm"
        icon={X}
        aria-label={`Remove ${field.label} filter`}
        className={styles.tokenRemove}
        onClick={() => removeFilter(field)}
      />
    </ButtonGroup>
  );
}

function Clear({ onClear, small }: { onClear: () => void; small?: boolean }) {
  return (
    <Button
      variant="ghost"
      size={small ? 'sm' : undefined}
      aria-label="Clear filters"
      className={small ? styles.clearSmall : base.clear}
      onClick={onClear}
    >
      Clear
    </Button>
  );
}

/** The variant's part of the toolbar's start, after Status. */
export function MockFilters({ variant, fields, onClear }: MockProps) {
  const set = fields.filter(isSet);
  const menu = (trigger: React.ReactElement) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <FilterMenuItems fields={fields} onClear={onClear} />
    </DropdownMenu>
  );
  const filterButton = (
    <IconButton
      variant="outline"
      icon={ListFilter}
      label="Filter"
      data-pressed={set.length > 0 ? '' : undefined}
    />
  );
  return (
    <div className={base.filters}>
      {variant === 'fields' && fields.map((field) => <FieldButton key={field.id} field={field} />)}
      {variant === 'tokens-row' && menu(filterButton)}
      {variant === 'tokens-inline' && (
        <>
          {menu(filterButton)}
          {set.map((field) => (
            <Token key={field.id} field={field} />
          ))}
        </>
      )}
      {variant === 'panel' &&
        menu(
          <Button
            variant="outline"
            icon={ListFilter}
            value={set.length > 0 ? String(set.length) : undefined}
          >
            Filter
          </Button>,
        )}
      {variant !== 'tokens-row' && set.length > 0 && <Clear onClear={onClear} />}
    </div>
  );
}

/** The variant's row under the toolbar: only `tokens-row` has one, while a filter is set. */
export function MockFilterRow({ variant, fields, onClear }: MockProps) {
  const set = fields.filter(isSet);
  if (variant !== 'tokens-row' || set.length === 0) return null;
  return (
    <div role="group" aria-label="Filters" className={styles.tokenRow}>
      {set.map((field) => (
        <Token key={field.id} field={field} />
      ))}
      <Clear onClear={onClear} small />
    </div>
  );
}
