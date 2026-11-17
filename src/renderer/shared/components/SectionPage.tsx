import { Page } from '@renderer/components';

/**
 * A detail page whose entity isn't loaded yet: only its section's name ("Tasks") in the title
 * bar's search field, and nothing under it. The entity's title and actions join it once it loads.
 */
export function SectionPage({ title }: { title: string }) {
  return <Page aria-busy title={title} />;
}
