import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CircleX, RotateCw } from 'lucide-react';
import { Provider } from '@common/types';
import {
  Button,
  EmptyState,
  Heading,
  Kbd,
  Logomark,
  PageContent,
  Skeleton,
  Stack,
  Text,
  useFormat,
} from '@renderer/components';
import { usePlatform } from '@renderer/components/lib/platform';
import { trpc } from '@renderer/ipc';
import { keyLabels } from '@renderer/keyboard/keys';
import { HomeCapture } from './HomeCapture';
import { HomeSectionView } from './HomeSections';
import { useHomeData } from '../api/queries';
import { pausedIntegration, summarizeHome, type SummaryPart } from '../lib/summary';
import styles from './Home.module.css';

const PROVIDER_NAMES: Record<Provider, string> = {
  [Provider.GOOGLE_CALENDAR]: 'Google Calendar',
  [Provider.LINEAR]: 'Linear',
};

/**
 * Home (Figma 7254:8102 and its states; README, "Home"): the logomark, the greeting, the summary,
 * the capture box, the one section and the footer, in one centred column. The reads change only
 * when main reports a change; the clock re-renders it each minute (the countdowns, Join, finished
 * meetings dropping off), and at midnight the day's reads re-key.
 */
export function HomePage() {
  // the day keys the reads; the minute only re-renders
  const today = useFormat('day').now;
  const format = useFormat('minute');
  const workspace = useQuery(trpc.workspaces.current.queryOptions()).data;
  const home = useHomeData(today, format.now);
  const summary = useMemo(
    () => home.data && summarizeHome(home.data, format, workspace?.name ?? 'your workspace'),
    [home.data, format, workspace?.name],
  );

  return (
    <PageContent layout="home">
      <div className={styles.column}>
        <header className={styles.header}>
          <Logomark size="md" className={styles.logomark} />
          {summary ? (
            <>
              <Heading level={1}>{summary.greeting}</Heading>
              <Text tone="muted" align="center" className={styles.summary}>
                <Summary parts={summary.summary} />
              </Text>
            </>
          ) : (
            <>
              <Skeleton height={36} width={280} />
              <Skeleton height={20} width={420} className={styles.summary} />
            </>
          )}
        </header>
        <HomeCapture firstRun={summary?.isNew ?? false} />
        <div className={styles.section}>
          {home.isError ? (
            <EmptyState
              icon={CircleX}
              title="Home couldn’t be loaded"
              description="Something went wrong reading this workspace."
              action={
                <Button size="sm" onClick={home.retry}>
                  Retry
                </Button>
              }
            />
          ) : summary ? (
            summary.section && <HomeSectionView section={summary.section} />
          ) : (
            <Stack gap="3">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} height={20} width={row % 2 ? '60%' : '80%'} />
              ))}
            </Stack>
          )}
        </div>
        <HomeFooter />
      </div>
    </PageContent>
  );
}

/** The summary sentence, with its counts and names, overdue and good news set apart. */
function Summary({ parts }: { parts: readonly SummaryPart[] }) {
  return parts.map((part, index) =>
    typeof part === 'string' ? (
      part
    ) : part.tone === 'strong' ? (
      <Text key={index} tone="strong" weight="medium">
        {part.text}
      </Text>
    ) : (
      <Text key={index} tone={part.tone}>
        {part.text}
      </Text>
    ),
  );
}

/** "Press ⌘K to search", and "Google Calendar paused · Reconnect" when one needs signing in. */
function HomeFooter() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const integrations = useQuery(trpc.integrations.list.queryOptions()).data;
  const paused = integrations && pausedIntegration(integrations);
  const search = keyLabels('mod+k', usePlatform())[0];
  return (
    <Text size="xs" tone="subtle" className={styles.footer}>
      <span className={styles.search}>
        Press <Kbd>{search}</Kbd> to search.
      </span>
      {paused && (
        <>
          <span aria-hidden>·</span>
          <span>{PROVIDER_NAMES[paused.provider]} paused</span>
          <Button
            variant="ghost"
            size="xs"
            icon={RotateCw}
            onClick={() =>
              void navigate({ to: '/app/$workspaceId/integrations', params: { workspaceId } })
            }
          >
            Reconnect
          </Button>
        </>
      )}
    </Text>
  );
}
