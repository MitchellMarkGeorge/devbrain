import { EventId } from '@common/ids';
import { Model } from './model';

export interface Event extends Model<EventId> {
  title: string;
  description: string | null;
  startAt: Date;
  endDate: Date;
  allDay: boolean | null;
  location: string | null;
  reccurrenceRule: string | null;
  meetingUrl: string | null;
  color: string | null;
}
