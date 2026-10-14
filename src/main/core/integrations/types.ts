import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../tasks/types';
import { ProjectStatus } from '../projects/types';
import { EventKind, EventResponse, EventStatus } from '../events/types';
import {
  eventLinkMetadataSchema,
  projectLinkMetadataSchema,
  taskLinkMetadataSchema,
} from './schema';

// Provider, SourceType, AuthType, IntegrationStatus, LinkState, Integration, ExternalSource and
// ExternalRef: the types the renderer will need, kept free of main-only imports
export * from './shared-types';

// Normalised items: what a provider adapter returns. Adapters map into these; SyncWriter only
// ever sees these.

export interface ExternalTask {
  externalId: string; // provider's stable id
  key: string | null; // "ENG-123"
  url: string;
  title: string;
  description: string | null; // Markdown
  status: TaskStatus; // already mapped
  priority: TaskPriority; // already mapped
  statusLabel: string | null; // "In Review"
  priorityLabel: string | null; // "Urgent"
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null; // set only when status is COMPLETED
  createdAt: Date;
  updatedAt: Date; // drives the unchanged check
  parentExternalId: string | null;
  parentKey: string | null; // kept for display when the parent is not mirrored
  parentTitle: string | null;
  projectExternalId: string | null;
  assignedToViewer: boolean; // false in a lookup result means "remove"
}

export interface ExternalProject {
  externalId: string;
  url: string;
  title: string;
  description: string | null;
  status: ProjectStatus; // already mapped
  statusLabel: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  color: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalEvent {
  externalId: string; // "<calendarId>:<eventId>"; Google event ids are unique per calendar only
  calendarId: string; // the provider's calendar id
  url: string;
  title: string;
  description: string | null; // Markdown, converted from HTML
  // instants; for an all-day event, its dates' local midnights
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  // set exactly when allDay is: YYYY-MM-DD, end exclusive
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null; // IANA zone the event, or its series, is in
  location: string | null;
  recurrenceRule: string | null; // RFC 5545 lines joined with \n, as the provider sent them
  recurringEventExternalId: string | null; // set on an occurrence of a series
  originalStartAt: Date | null; // the occurrence this one replaces
  meetingUrl: string | null;
  color: string | null; // the event's own colour; null means its calendar's
  status: EventStatus;
  response: EventResponse | null;
  kind: EventKind;
  cancelled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// a calendar the account can read, as the provider lists it
export interface ExternalCalendar {
  id: string;
  name: string;
  // the account's own calendar, selected when the source's calendars are first listed
  primary: boolean;
  color: string | null;
  timeZone: string | null;
}

// JSON stored in external_links.metadata, by entity type
export type TaskLinkMetadata = z.infer<typeof taskLinkMetadataSchema>;
export type ProjectLinkMetadata = z.infer<typeof projectLinkMetadataSchema>;
export type EventLinkMetadata = z.infer<typeof eventLinkMetadataSchema>;
export type LinkMetadata = TaskLinkMetadata | ProjectLinkMetadata | EventLinkMetadata;
