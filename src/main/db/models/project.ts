import { Archivable, Completeable, Model } from './model';
import { ProjectId } from '../../../common/ids';

export interface Project extends Model<ProjectId>, Archivable, Completeable {
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date;
  color: string | null;
}
