import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { Archivable, Model } from '../shared/model';

export interface Note extends Model<NoteId>, Archivable {
  title: string;
  preview: string | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedTaskId: TaskId | null;
}
