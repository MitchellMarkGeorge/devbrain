import { ExternalSourceId, IntegrationId } from '@common/ids';
import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../tasks/types';
import { ProjectStatus } from '../projects/types';
import {
  eventLinkMetadataSchema,
  eventResponseSchema,
  googleEventConfigSchema,
  googleEventCursorSchema,
  linearTaskConfigSchema,
  linearTaskCursorSchema,
  projectLinkMetadataSchema,
  taskLinkMetadataSchema,
} from './schema';

// the value lists live next to the types so the db schema, zod and later the UI share them
export const PROVIDERS = ['linear', 'google_calendar'] as const;
export const SOURCE_TYPES = ['tasks', 'events', 'version_control'] as const;
export const AUTH_TYPES = ['oauth', 'api_key'] as const;
export const INTEGRATION_STATUSES = ['connected', 'disabled', 'needs_reauth'] as const;
export const LINK_STATES = ['synced', 'detached', 'removed'] as const;

export type Provider = (typeof PROVIDERS)[number];
// version_control is reserved in the schema only; no provider serves it in v1
export type SourceType = (typeof SOURCE_TYPES)[number];
export type AuthType = (typeof AUTH_TYPES)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
// synced: provider-owned and read-only. detached: a local copy that remembers where it came
// from, ignored by sync. removed: left scope (archived, or hidden for events), restored if it returns
export type LinkState = (typeof LINK_STATES)[number];

// what the rest of the app sees of a connection: never the credentials
export interface Integration {
  id: IntegrationId;
  provider: Provider;
  authType: AuthType;
  accountLabel: string;
  status: IntegrationStatus;
  sources: ExternalSource[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalSource {
  id: ExternalSourceId;
  sourceType: SourceType;
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

// the `external` field on Task, Project and Event read models
export interface ExternalRef {
  provider: Provider;
  state: LinkState;
  key: string | null; // ENG-123
  url: string;
  statusLabel: string | null; // "In Review"
  priorityLabel: string | null; // "Urgent"
  lastSyncedAt: Date;
}

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

export type EventResponse = z.infer<typeof eventResponseSchema>;

export interface ExternalEvent {
  externalId: string; // "<calendarId>:<eventId>"; Google event ids are unique per calendar only
  calendarId: string;
  url: string;
  title: string;
  description: string | null; // Markdown, converted from HTML
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  timeZone: string | null; // IANA zone of the series
  location: string | null;
  recurrenceRule: string | null; // RFC 5545 lines joined with \n
  recurringEventExternalId: string | null; // set on a modified instance
  originalStartAt: Date | null; // the occurrence this instance replaces
  meetingUrl: string | null;
  color: string | null;
  response: EventResponse | null;
  cancelled: boolean;
  updatedAt: Date;
}

// JSON stored in external_sources.cursor and .config, validated with ./schema on read
export type LinearTaskCursor = z.infer<typeof linearTaskCursorSchema>;
export type GoogleEventCursor = z.infer<typeof googleEventCursorSchema>;
export type LinearTaskConfig = z.infer<typeof linearTaskConfigSchema>;
export type GoogleEventConfig = z.infer<typeof googleEventConfigSchema>;

// JSON stored in external_links.metadata, by entity type
export type TaskLinkMetadata = z.infer<typeof taskLinkMetadataSchema>;
export type ProjectLinkMetadata = z.infer<typeof projectLinkMetadataSchema>;
export type EventLinkMetadata = z.infer<typeof eventLinkMetadataSchema>;
export type LinkMetadata = TaskLinkMetadata | ProjectLinkMetadata | EventLinkMetadata;
