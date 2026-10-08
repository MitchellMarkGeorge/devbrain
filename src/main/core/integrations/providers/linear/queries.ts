import { CLOSED_STATE_TYPES } from './schema';

// What this adapter asks Linear for: the GraphQL documents, their field selections and the
// IssueFilter variables. A field added here also needs its response shape in ./schema.

const PROJECT_FIELDS = `
  id
  name
  description
  url
  status { type name }
  startDate
  targetDate
  color
  completedAt
  canceledAt
  createdAt
  updatedAt
`;

const ISSUE_FIELDS = `
  id
  identifier
  url
  title
  description
  priority
  priorityLabel
  dueDate
  startedAt
  completedAt
  canceledAt
  createdAt
  updatedAt
  archivedAt
  trashed
  state { name type }
  assignee { id }
  parent { id identifier title }
  project { ${PROJECT_FIELDS} }
`;

export const VIEWER_QUERY = `
  query Viewer {
    viewer { id name email organization { id name } }
  }
`;

// one page of the viewer's assigned issues; the filter differs between initial and incremental
export const ASSIGNED_ISSUES_QUERY = `
  query AssignedIssues($first: Int!, $after: String, $filter: IssueFilter) {
    viewer {
      id
      assignedIssues(
        first: $first
        after: $after
        orderBy: updatedAt
        includeArchived: true
        filter: $filter
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }
`;

export const ASSIGNED_ISSUE_IDS_QUERY = `
  query AssignedIssueIds($first: Int!, $after: String, $filter: IssueFilter) {
    viewer {
      assignedIssues(first: $first, after: $after, filter: $filter) {
        pageInfo { hasNextPage endCursor }
        nodes { id }
      }
    }
  }
`;

export const ISSUES_BY_ID_QUERY = `
  query IssuesById($first: Int!, $ids: [ID!]!) {
    viewer { id }
    issues(first: $first, includeArchived: true, filter: { id: { in: $ids } }) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

// filters, as IssueFilter variables

export function openIssuesFilter() {
  return { state: { type: { nin: CLOSED_STATE_TYPES } } };
}

// open at any age, or closed after `closedSince`
export function initialIssuesFilter(closedSince: string) {
  return {
    or: [
      openIssuesFilter(),
      { completedAt: { gt: closedSince } },
      { canceledAt: { gt: closedSince } },
    ],
  };
}

export function updatedIssuesFilter(updatedSince: string) {
  return { updatedAt: { gt: updatedSince } };
}
