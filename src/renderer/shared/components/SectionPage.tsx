import { Breadcrumb, Page, PageHeader, type BreadcrumbItem } from '@renderer/components';

/**
 * A detail page whose entity isn't loaded yet: its header with only the section's crumb ("Tasks"),
 * and nothing under it. The page keeps its header, and the window its drag strip, from the first
 * frame; the entity's crumb and actions join it once it loads.
 */
export function SectionPage({ section }: { section: BreadcrumbItem }) {
  return (
    <Page
      aria-busy
      header={
        <PageHeader>
          <Breadcrumb items={[section]} />
        </PageHeader>
      }
    />
  );
}
