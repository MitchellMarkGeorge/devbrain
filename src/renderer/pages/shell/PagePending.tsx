import { PageContent, Skeleton, Stack } from '../../components';

/** A page still loading, in the shell (AppLayout shows it while the router loads the next page). */
export function PagePending() {
  return (
    <PageContent layout="document" data-page="pending" aria-busy>
      <Stack gap="4">
        <Skeleton width={180} height={28} />
        <Skeleton width="60%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="70%" height={16} />
      </Stack>
    </PageContent>
  );
}
