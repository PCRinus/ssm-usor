import { createRoute } from '@hono/zod-openapi';
import {
  appliedLegalChangeListQuerySchema,
  appliedLegalChangeListResponseSchema,
  latestLegalCheckRunResponseSchema,
  legalActListResponseSchema,
  legalChangeDetailResponseSchema,
  openLegalChangeListResponseSchema,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

export const listLegalActsRoute = createRoute({
  method: 'get',
  path: '/legislation/acts',
  operationId: 'listLegalActs',
  summary: 'List the watched legal acts',
  description:
    'The acts the built-in templates cite, by name, with what the Portal Legislativ showed when last checked (ADR 017), the subject of each, the documents that cite it and its newest open legal change. The same for every organization; not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The watched acts',
      content: {
        'application/json': {
          schema: legalActListResponseSchema.meta({ id: 'LegalActListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});

const behindDescription =
  "`behind` counts the organization's documents of active clients still made from a template version older than the one that answers the change (a draft edited by hand included), in all and per document type with its set; regenerating those types, `POST /documents/behind/regenerate` for each, brings the change in.";

export const listOpenLegalChangesRoute = createRoute({
  method: 'get',
  path: '/legislation/changes/open',
  operationId: 'listOpenLegalChanges',
  summary: 'List the legal changes under review',
  description:
    'The open legal changes, newest consolidated form first, each with its act and subject, the outcome of the comparison (null while unassessed), the documents and units of the cited passages it touched, and every document type citing the act. The same for every organization; not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The open legal changes',
      content: {
        'application/json': {
          schema: openLegalChangeListResponseSchema.meta({ id: 'OpenLegalChangeListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const listAppliedLegalChangesRoute = createRoute({
  method: 'get',
  path: '/legislation/changes/applied',
  operationId: 'listAppliedLegalChanges',
  summary: 'List the legal changes applied in documents',
  description: `The legal changes a template version answers, newest consolidated form first, 20 a page by default; changes resolved with no impact are left out. Each with its act and subject, when it was applied, the note of the version that answered it first and every document type whose template it updated, with that version and its note. ${behindDescription}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: appliedLegalChangeListQuerySchema },
  responses: {
    200: {
      description: 'A page of applied legal changes',
      content: {
        'application/json': {
          schema: appliedLegalChangeListResponseSchema.meta({
            id: 'AppliedLegalChangeListResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const getLegalChangeRoute = createRoute({
  method: 'get',
  path: '/legislation/changes/{changeId}',
  operationId: 'getLegalChange',
  summary: 'Get a legal change',
  description: `One legal change: its act and subject, how it was resolved, the outcome of comparing it with the form the templates were verified against, the units it amended with each amending act's portal page, the cited passages it touched with the law's text before and after, every document type citing the act, and the template versions that answer it with their notes. ${behindDescription}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: z.object({ changeId: z.uuid() }) },
  responses: {
    200: {
      description: 'The legal change',
      content: {
        'application/json': {
          schema: legalChangeDetailResponseSchema.meta({ id: 'LegalChangeDetailResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such legal change', content: errorContent },
    ...membershipErrors,
  },
});

export const getLatestLegalCheckRunRoute = createRoute({
  method: 'get',
  path: '/legislation/runs/latest',
  operationId: 'getLatestLegalCheckRun',
  summary: 'Get the latest run of the legislation check',
  description:
    'The run of the daily check that started last, or null before the first. A run still "running" long after it started was cut off. The same for every organization.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The latest run, or null',
      content: {
        'application/json': {
          schema: latestLegalCheckRunResponseSchema.meta({ id: 'LatestLegalCheckRunResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});
