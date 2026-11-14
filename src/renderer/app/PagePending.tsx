import { PageContent, Skeleton, Stack } from '@renderer/components';

/** A page entered for the first time whose loaders are slow: a few rows' skeleton. */
export function PagePending() {
  return (
    <PageContent aria-busy data-testid="page-pending">
      <Stack gap="3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} height={20} width={row % 2 ? '60%' : '80%'} />
        ))}
      </Stack>
    </PageContent>
  );
}
