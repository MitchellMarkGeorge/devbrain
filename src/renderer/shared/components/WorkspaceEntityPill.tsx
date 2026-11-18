import { EditorEntityPill } from '@renderer/editor/EntityPillView';
import type { EntityLinkPillProps } from '@renderer/editor/types';
import { useEditorEntity } from '@renderer/editor/use-entity-resolver';

/**
 * An entity link in a page's editor (the host's `entityPill`, from `useEditorHost`): the entity as
 * the open workspace holds it now, from React Query, drawn again when core reports it changed.
 */
export function WorkspaceEntityPill(props: EntityLinkPillProps) {
  const entity = useEditorEntity(props.type, props.id);
  return <EditorEntityPill {...props} entity={entity} />;
}
