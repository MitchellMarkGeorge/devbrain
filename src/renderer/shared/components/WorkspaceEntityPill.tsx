import { EditorEntityPill } from '@renderer/editor/EntityPillView';
import type { EntityLinkPillProps } from '@renderer/editor/types';
import { editorEntityRef, useEditorEntity, type EditorEntityRef } from '../hooks/use-editor-entity';

/**
 * An entity link in a page's editor (WorkspaceRichTextEditor's `entityPill`): the entity as the
 * open workspace holds it now, from React Query, drawn again when core reports it changed. A link
 * whose id is no id of its type names no entity, so it is drawn as missing without a query.
 */
export function WorkspaceEntityPill(props: EntityLinkPillProps) {
  const target = editorEntityRef(props.type, props.id);
  if (!target) return <EditorEntityPill {...props} entity={null} />;
  return <LoadedEntityPill {...props} target={target} />;
}

// the hook lives here, below the id check, so every render of it calls useQuery
function LoadedEntityPill({ target, ...props }: EntityLinkPillProps & { target: EditorEntityRef }) {
  const entity = useEditorEntity(target);
  return <EditorEntityPill {...props} entity={entity} />;
}
