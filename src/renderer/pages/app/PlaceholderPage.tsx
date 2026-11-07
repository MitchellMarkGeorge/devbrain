import type { ReactNode } from 'react';
import { EmptyState, PageContent, Stack, Text } from '../../components';
import type { IconSource } from '../../components';

export interface PlaceholderRow {
  id: string;
  title: string;
}

/**
 * A page until its milestone builds it (docs/renderer/implementation-plan.md): its real data,
 * loaded by its route, as a plain list of titles, or its empty state.
 */
export function PlaceholderPage({
  icon,
  rows,
  empty,
  children,
}: {
  icon: IconSource;
  rows: PlaceholderRow[];
  /** "No tasks yet" */
  empty: string;
  children?: ReactNode;
}) {
  return (
    <PageContent data-testid="page">
      {children}
      {rows.length === 0 ? (
        <EmptyState icon={icon} title={empty} />
      ) : (
        <Stack gap="2" render={<ul />}>
          {rows.map((row) => (
            <Text key={row.id} render={<li />}>
              {row.title}
            </Text>
          ))}
        </Stack>
      )}
    </PageContent>
  );
}
