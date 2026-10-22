import type { RouteHandler } from '@hono/zod-openapi';
import {
  type ClientParticipant,
  type ParticipantChannel,
  participantErrorReasons,
  type ParticipantInvitation,
  type ParticipantInvitationStatus,
  type ParticipantKind,
  type PortalLanguage,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import { type ApiEnv, portalOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { ensureParticipantAccount } from './account';
import { fromParticipantError } from './errors';
import type {
  getEmployeeParticipantRoute,
  inviteClientAdministratorRoute,
  inviteEmployeeParticipantRoute,
  listClientParticipantsRoute,
  resendParticipantInvitationRoute,
  revokeClientParticipantRoute,
  revokeParticipantInvitationRoute,
} from './routes';

// The database refuses a resend inside this window (PRT05); the response says when it opens.
const RESEND_AFTER_MS = 10 * 60 * 1000;

const invitationColumns =
  'id, organization_id, client_id, kind, employee_id, full_name, channel, address, last_sent_at, expires_at, accepted_at, revoked_at, created_at, employees!participant_invitations_employee_of_client(last_name, first_name)';

const participantColumns =
  'id, client_id, kind, employee_id, full_name, created_at, revoked_at, notice_version, language, employees!client_participants_employee_of_client(last_name, first_name), participant_invitations(channel, address, accepted_at)';

type EmployeeName = { last_name: string; first_name: string } | null;

interface InvitationRow {
  id: string;
  organization_id: string;
  client_id: string;
  kind: ParticipantKind;
  employee_id: string | null;
  full_name: string | null;
  channel: string;
  address: string;
  last_sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  employees: EmployeeName;
}

interface ParticipantRow {
  id: string;
  client_id: string;
  kind: ParticipantKind;
  employee_id: string | null;
  full_name: string | null;
  created_at: string;
  revoked_at: string | null;
  notice_version: string | null;
  language: string | null;
  employees: EmployeeName;
  participant_invitations: { channel: string; address: string; accepted_at: string | null }[];
}

const toIso = (value: string) => new Date(value).toISOString();

const nameOf = (employee: EmployeeName, fullName: string | null) =>
  employee ? `${employee.last_name} ${employee.first_name}` : (fullName ?? '');

function statusOf(row: InvitationRow): ParticipantInvitationStatus {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  return Date.parse(row.expires_at) <= Date.now() ? 'expired' : 'open';
}

function toInvitation(row: InvitationRow): ParticipantInvitation {
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind,
    employeeId: row.employee_id,
    fullName: nameOf(row.employees, row.full_name),
    channel: row.channel as ParticipantChannel,
    address: row.address,
    status: statusOf(row),
    lastSentAt: toIso(row.last_sent_at),
    resendableAt: new Date(Date.parse(row.last_sent_at) + RESEND_AFTER_MS).toISOString(),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
  };
}

function toParticipant(row: ParticipantRow): ClientParticipant {
  const invitation = row.participant_invitations.find((candidate) => candidate.accepted_at);
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind,
    employeeId: row.employee_id,
    fullName: nameOf(row.employees, row.full_name),
    channel: (invitation?.channel as ParticipantChannel | undefined) ?? null,
    address: invitation?.address ?? null,
    createdAt: toIso(row.created_at),
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    noticeVersion: row.notice_version,
    language: row.language as PortalLanguage | null,
  };
}

// The generated types take no null for these arguments, though the function reads null as
// "none"; leaving them out would make PostgREST look for a function without them.
const none = null as unknown as string;

function messenger(c: Context<ApiEnv>, channel: ParticipantChannel) {
  const service = channel === 'email' ? c.env.MAIL : c.env.SMS;
  if (!service) throw new ApiError('service_unavailable');
  return service;
}

async function loadInvitation(db: DataClient, invitationId: string) {
  const { data, error } = await db
    .from('participant_invitations')
    .select(invitationColumns)
    .eq('id', invitationId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'participant invitation');
  if (!data) throw new ApiError('not_found', 'The invitation does not exist.');
  return data as InvitationRow;
}

// Runs after the database has saved the invitation and its send time, so a failure here
// leaves the row for a resend once the 10 minutes are over.
async function deliver(c: Context<ApiEnv>, admin: AdminClient, invitationId: string) {
  const db = createDataClient(c);
  const invitation = await loadInvitation(db, invitationId);
  const channel = invitation.channel as ParticipantChannel;
  const [client, organization] = await Promise.all([
    db.from('clients').select('legal_name').eq('id', invitation.client_id).single(),
    db.from('organizations').select('name').eq('id', invitation.organization_id).single(),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'participant invitation client');
  if (organization.error) {
    throw fromDatabaseError(organization.error, 'participant invitation organization');
  }

  await ensureParticipantAccount(admin, channel, invitation.address);

  const message = {
    to: invitation.address,
    clientName: client.data.legal_name,
    organizationName: organization.data.name,
    portalUrl: portalOrigin(c.env),
  };
  try {
    if (channel === 'email') await messenger(c, 'email').sendParticipantInvitation(message);
    else await messenger(c, 'sms').sendParticipantInvitation(message);
  } catch (error) {
    console.error(
      `Participant invitation ${channel} failed: ${error instanceof Error ? error.name : 'unknown'}`
    );
    throw new ApiError(
      'service_unavailable',
      'The invitation is saved, but its message could not be sent; resend it in 10 minutes.',
      undefined,
      participantErrorReasons.messageNotSent
    );
  }

  return toInvitation(invitation);
}

async function invite(
  c: Context<ApiEnv>,
  args: {
    clientId: string;
    kind: ParticipantKind;
    employeeId: string | null;
    fullName: string | null;
    channel: ParticipantChannel;
    address: string;
  }
) {
  messenger(c, args.channel);
  const admin = createAdminClient(c);
  const { data, error } = await createDataClient(c).rpc('create_participant_invitation', {
    p_client_id: args.clientId,
    p_kind: args.kind,
    p_employee_id: args.employeeId ?? none,
    p_full_name: args.fullName ?? none,
    p_channel: args.channel,
    p_address: args.address,
  });
  if (error) throw fromParticipantError(error, 'participant invitation create');
  return deliver(c, admin, data.id);
}

export const inviteEmployeeParticipant: RouteHandler<
  typeof inviteEmployeeParticipantRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { channel, address } = c.req.valid('json');
  const invitation = await invite(c, {
    clientId,
    kind: 'employee',
    employeeId,
    fullName: null,
    channel,
    address,
  });
  return c.json(invitation, 201);
};

export const inviteClientAdministrator: RouteHandler<
  typeof inviteClientAdministratorRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { channel, address, employeeId, fullName } = c.req.valid('json');
  const invitation = await invite(c, {
    clientId,
    kind: 'client_administrator',
    employeeId: employeeId ?? null,
    fullName: employeeId ? null : (fullName ?? null),
    channel,
    address,
  });
  return c.json(invitation, 201);
};

export const resendParticipantInvitation: RouteHandler<
  typeof resendParticipantInvitationRoute,
  ApiEnv
> = async (c) => {
  const { invitationId } = c.req.valid('param');
  const db = createDataClient(c);
  const found = await loadInvitation(db, invitationId);
  messenger(c, found.channel as ParticipantChannel);
  const admin = createAdminClient(c);
  const { error } = await db.rpc('resend_participant_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw fromParticipantError(error, 'participant invitation resend');
  return c.json(await deliver(c, admin, invitationId), 200);
};

export const revokeParticipantInvitation: RouteHandler<
  typeof revokeParticipantInvitationRoute,
  ApiEnv
> = async (c) => {
  const { invitationId } = c.req.valid('param');
  const { data: revoked, error } = await createDataClient(c).rpc('revoke_participant_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw fromParticipantError(error, 'participant invitation revoke');
  if (!revoked) throw new ApiError('not_found', 'The invitation does not exist or is closed.');
  return c.body(null, 204);
};

export const revokeClientParticipant: RouteHandler<
  typeof revokeClientParticipantRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { data: revoked, error } = await createDataClient(c).rpc('revoke_client_participant', {
    p_participant_id: participantId,
  });
  if (error) throw fromParticipantError(error, 'client participant revoke');
  if (!revoked) throw new ApiError('not_found', 'The participant does not exist or was revoked.');
  return c.body(null, 204);
};

export const getEmployeeParticipant: RouteHandler<
  typeof getEmployeeParticipantRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const db = createDataClient(c);
  const [employee, participant, invitation] = await Promise.all([
    db.from('employees').select('id').eq('id', employeeId).eq('client_id', clientId).maybeSingle(),
    db
      .from('client_participants')
      .select(participantColumns)
      .eq('client_id', clientId)
      .eq('employee_id', employeeId)
      .is('revoked_at', null)
      .maybeSingle(),
    db
      .from('participant_invitations')
      .select(invitationColumns)
      .eq('client_id', clientId)
      .eq('employee_id', employeeId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'participant employee');
  if (participant.error) throw fromDatabaseError(participant.error, 'employee participant');
  if (invitation.error) throw fromDatabaseError(invitation.error, 'employee invitation');
  if (!employee.data) {
    throw new ApiError('not_found', 'This employee does not exist under this client.');
  }
  return c.json(
    {
      participant: participant.data ? toParticipant(participant.data as ParticipantRow) : null,
      invitation:
        !participant.data && invitation.data
          ? toInvitation(invitation.data as InvitationRow)
          : null,
    },
    200
  );
};

export const listClientParticipants: RouteHandler<
  typeof listClientParticipantsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const [client, participants, invitations] = await Promise.all([
    db.from('clients').select('id').eq('id', clientId).maybeSingle(),
    db
      .from('client_participants')
      .select(participantColumns)
      .eq('client_id', clientId)
      .is('revoked_at', null)
      .order('created_at')
      .limit(500),
    db
      .from('participant_invitations')
      .select(invitationColumns)
      .eq('client_id', clientId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'participants client');
  if (participants.error) throw fromDatabaseError(participants.error, 'client participants');
  if (invitations.error) throw fromDatabaseError(invitations.error, 'client invitations');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  return c.json(
    {
      participants: (participants.data as ParticipantRow[]).map(toParticipant),
      invitations: (invitations.data as InvitationRow[]).map(toInvitation),
    },
    200
  );
};
