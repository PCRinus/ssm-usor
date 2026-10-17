import { type PortalLanguage, portalLanguages } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { endTime, startTime } from 'hono/timing';

import type { Database } from '../database.types';
import { createDataClient, fromDatabaseError } from './db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

export interface Participation {
  participantId: string;
  organizationId: string;
  organizationName: string;
  clientId: string;
  clientName: string;
  kind: Database['public']['Enums']['participant_kind'];
  employeeId: string | null;
  fullName: string;
  noticeVersion: string | null;
  language: PortalLanguage | null;
}

// Accepting first links a first sign-in to its open invitations, so the person lands on the
// portal with nothing to do (ADR 022); the function is idempotent, so every request may call it.
export const requireParticipant = createMiddleware<ApiEnv>(async (c, next) => {
  const db = createDataClient(c);
  startTime(c, 'participations');
  const accepted = await db.rpc('accept_participant_invitations');
  if (accepted.error) throw fromDatabaseError(accepted.error, 'accept_participant_invitations');
  const { data, error } = await db.rpc('current_participations');
  endTime(c, 'participations');
  if (error) throw fromDatabaseError(error, 'current_participations');
  if (data.length === 0) {
    throw new ApiError('forbidden', 'This account is not a participant of any client.');
  }
  c.set(
    'participations',
    data.map((row) => ({
      participantId: row.participant_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      clientId: row.client_id,
      clientName: row.client_name,
      kind: row.kind,
      employeeId: row.employee_id,
      fullName: row.full_name,
      noticeVersion: row.notice_version,
      language: portalLanguages.find((language) => language === row.language) ?? null,
    }))
  );
  await next();
});

export function participationOf(c: Context<ApiEnv>, participantId: string): Participation {
  const participation = c
    .get('participations')
    .find((candidate) => candidate.participantId === participantId);
  if (!participation) throw new ApiError('not_found', 'This participation is not yours.');
  return participation;
}
