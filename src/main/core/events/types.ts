import { EventId } from '@common/ids';
import { Model } from '../shared/model';

export interface Event extends Model<EventId> {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean | null;
  location: string | null;
  // an RRULE string (RFC 5545), possibly multiple lines (RRULE/EXRULE/RDATE/
  // EXDATE joined with \n) — the same format both the FullCalendar RRULE
  // plugin and the Google Calendar API speak, so synced/local events share
  // one representation with no translation layer
  reccurrenceRule: string | null;
  meetingUrl: string | null;
  color: string | null;
}

export interface CreateEventOptions {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  location?: string;
  reccurrenceRule?: string;
  meetingUrl?: string;
  color?: string;
}

export interface UpdateEventOptions {
  title?: string;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  location?: string;
  // nullable so a recurring event can be turned back into a one-off
  reccurrenceRule?: string | null;
  meetingUrl?: string;
  color?: string;
}
