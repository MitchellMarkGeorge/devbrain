import { ProjectId } from '@common/ids';
import { Archivable, Completeable, Model } from '../shared/model';

export interface Project extends Model<ProjectId>, Archivable, Completeable {
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  color: string | null;
}
