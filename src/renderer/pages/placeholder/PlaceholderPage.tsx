import type { ReactNode } from 'react';
import { Heading, PageContent, Stack, Text } from '../../components';
import { PageTitle } from '../shell/page-header';

/**
 * A page still to build (docs/renderer/implementation-plan.md, milestones 3–10): its name, the
 * milestone that builds it, and the first rows its loader read, so the route, its data and a
 * workspace switch can be seen working before the page is.
 */
export function PlaceholderPage({
  path,
  title,
  milestone,
  rows,
  header = 'breadcrumb',
}: {
  // the route's path, as `data-page`: the page that is showing
  path: string;
  title: string;
  milestone: string;
  rows?: ReactNode[];
  // the page named in the header's breadcrumb, or an empty header (Home)
  header?: 'breadcrumb' | 'none';
}) {
  return (
    <PageContent layout="document" data-page={path}>
      <PageTitle title={header === 'breadcrumb' ? title : undefined} />
      <Stack gap="4">
        <Heading level={1}>{title}</Heading>
        <Text tone="muted">This page is built in {milestone}.</Text>
        {rows && rows.length > 0 && (
          <Stack gap="1" render={<ul />}>
            {rows.map((row, index) => (
              <Text key={index} render={<li />}>
                {row}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </PageContent>
  );
}
