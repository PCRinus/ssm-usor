import { createRoute, z } from '@hono/zod-openapi';
import {
  bulkEmployeeInvitationRequestSchema,
  bulkEmployeeInvitationResponseSchema,
  bulkInvitationLimit,
  clientAdministratorInvitationRequestSchema,
  clientParticipantsResponseSchema,
  employeeParticipantStateSchema,
  participantInvitationRequestSchema,
  participantInvitationSchema,
  portalInviteesResponseSchema,
} from '@ssm-usor/contracts';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const employeeParams = clientParams.extend({ employeeId: z.uuid() });
const invitationParams = z.object({ invitationId: z.uuid() });
const participantParams = z.object({ participantId: z.uuid() });

const invitationContent = {
  'application/json': {
    schema: participantInvitationSchema.meta({ id: 'ParticipantInvitationResponse' }),
  },
};

const conflicts = {
  description:
    "The person or the address is a participant or invited already, the address is not the employee's, a message was sent in the last 10 minutes, the invitation is closed, or the client is archived or a lead; see `reason`",
  content: errorContent,
};

const sending = {
  ...membershipErrors,
  // After the shared 503, which it replaces for these routes.
  503: {
    description:
      'The account or the message could not be prepared (reason `participant_account_unavailable` or `participant_message_not_sent`); the invitation is saved and can be resent 10 minutes after it',
    content: errorContent,
  },
};

export const getEmployeeParticipantRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/participant',
  operationId: 'getEmployeeParticipant',
  summary: "An employee's standing on the portal",
  description:
    'The active participant the employee is, or else the newest invitation neither accepted nor revoked, open or expired (ADR 022).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The participant or the invitation, at most one of the two',
      content: {
        'application/json': {
          schema: employeeParticipantStateSchema.meta({ id: 'EmployeeParticipantState' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'The employee does not exist under this client in the organization',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const inviteEmployeeParticipantRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employees/{employeeId}/participant-invitations',
  operationId: 'inviteEmployeeParticipant',
  summary: 'Invite an employee to the portal by email or SMS',
  description:
    "Every member invites. The address is the employee's own email or phone, as their record holds it. Inviting the same address again renews its invitation and resends the message. The account the person signs in with is created now, unconfirmed, or the address's existing account is reused; the response never says which.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: participantInvitationRequestSchema.meta({ id: 'ParticipantInvitationRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The invitation, with its message sent', content: invitationContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: {
      description: 'The client or the employee does not exist in the organization',
      content: errorContent,
    },
    409: conflicts,
    ...sending,
  },
});

export const inviteClientAdministratorRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/participant-invitations',
  operationId: 'inviteClientAdministrator',
  summary: 'Invite the client administrator to the portal by email or SMS',
  description:
    "The person who runs the safety records on the employer's side: an employee of the client (`employeeId`), whose name is read from their record, or a person named in `fullName`. The address is typed. Otherwise as inviting an employee.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: clientAdministratorInvitationRequestSchema.meta({
            id: 'ClientAdministratorInvitationRequest',
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The invitation, with its message sent', content: invitationContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: {
      description: 'The client or the employee does not exist in the organization',
      content: errorContent,
    },
    409: conflicts,
    ...sending,
  },
});

export const listImportPortalInviteesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/imports/{importId}/portal-invitees',
  operationId: 'listImportPortalInvitees',
  summary: 'The employees a confirmed employee import brought, with their standing on the portal',
  description:
    "Every employee a confirmed employee import of the client created or completed (ADR 032), the ones whose sheets it filed among the employee's files, by name: their email and phone as their row holds them, whether they are current, and whether they are a participant or hold an invitation neither accepted, revoked nor expired.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams.extend({ importId: z.uuid() }) },
  responses: {
    200: {
      description: 'The employees, by last and first name',
      content: {
        'application/json': {
          schema: portalInviteesResponseSchema.meta({ id: 'PortalInviteesResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'No confirmed employee import of this client has this id',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const inviteEmployeeParticipantsRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employee-participant-invitations',
  operationId: 'inviteEmployeeParticipants',
  summary: 'Invite several employees to the portal, each at an address typed for them',
  description: `Up to ${bulkInvitationLimit} employees, one after the other (ADR 032). An address with \`@\` goes by email, any other as a phone by SMS, normalized to E.164 with Romania as the default country. A typed address the employee's row does not hold is saved to it first, as editing the employee does. Each invitation is then the one \`inviteEmployeeParticipant\` sends, under the same rules. A former employee, a participant and an employee with an open invitation are skipped with nothing saved or sent. One result per row, in order: \`invited\`, \`skipped\` or \`failed\` with its \`reason\`; a row failing never stops the next. A failed message leaves the invitation saved, in \`invitation\`, for a resend 10 minutes after it.`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: bulkEmployeeInvitationRequestSchema.meta({
            id: 'BulkEmployeeInvitationRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'One result per invitation asked for',
      content: {
        'application/json': {
          schema: bulkEmployeeInvitationResponseSchema.meta({
            id: 'BulkEmployeeInvitationResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path or body', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    409: {
      description: 'The client is archived or a lead; see `reason`',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const listClientParticipantsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/participants',
  operationId: 'listClientParticipants',
  summary: "A client's participants and pending invitations",
  description:
    'The active participants, oldest first, and the invitations neither accepted nor revoked, open or expired, newest first.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'Participants and invitations',
      content: {
        'application/json': {
          schema: clientParticipantsResponseSchema.meta({ id: 'ClientParticipantsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    ...membershipErrors,
  },
});

export const resendParticipantInvitationRoute = createRoute({
  method: 'post',
  path: '/participant-invitations/{invitationId}/resend',
  operationId: 'resendParticipantInvitation',
  summary: 'Renew a participant invitation for 30 days and send its message again',
  description: 'At most one message per 10 minutes. An expired invitation can be resent.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: invitationParams },
  responses: {
    200: { description: 'The renewed invitation', content: invitationContent },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No invitation with this id', content: errorContent },
    409: conflicts,
    ...sending,
  },
});

export const revokeParticipantInvitationRoute = createRoute({
  method: 'post',
  path: '/participant-invitations/{invitationId}/revoke',
  operationId: 'revokeParticipantInvitation',
  summary: 'Revoke a participant invitation',
  description:
    'A code received at the address no longer makes the person a participant. The account stays.',
  security: bearerSecurity,
  middleware: [requireAuth, allowWhileReadOnly, requireMembership] as const,
  request: { params: invitationParams },
  responses: {
    204: { description: 'Revoked' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No pending invitation with this id', content: errorContent },
    ...membershipErrors,
  },
});

export const revokeClientParticipantRoute = createRoute({
  method: 'post',
  path: '/client-participants/{participantId}/revoke',
  operationId: 'revokeClientParticipant',
  summary: 'Revoke a participant',
  description:
    'The person no longer sees the client in the portal. Their records stay, and they can be invited again.',
  security: bearerSecurity,
  middleware: [requireAuth, allowWhileReadOnly, requireMembership] as const,
  request: { params: participantParams },
  responses: {
    204: { description: 'Revoked' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No active participant with this id', content: errorContent },
    ...membershipErrors,
  },
});
