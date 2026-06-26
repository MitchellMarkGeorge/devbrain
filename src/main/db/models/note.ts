import { Archivable, Model } from './model';
import { EventId, NoteId, ProjectId, TaskId } from '../../../common/ids';

export interface Note extends Model<NoteId>, Archivable {
  title: string;
  preview: string | null;
  projectId: ProjectId | null;
  linkedEventId: EventId | null;
  linkedTaskId: TaskId | null;
}
