import { createRoute, z } from '@hono/zod-openapi';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  invitationAcceptedResponseSchema,
  invitationListResponseSchema,
  invitationLookupRequestSchema,
  invitationLookupResponseSchema,
  invitationSchema,
  joinWithInvitationRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import {
  authErrors,
  bearerSecurity,
  errorContent,
  ownerErrors,
  publicErrors,
} from '../../lib/openapi';

const invitationParams = z.object({ invitationId: z.uuid() });

const invitationContent = {
  'application/json': { schema: invitationSchema.meta({ id: 'InvitationResponse' }) },
};
const acceptedContent = {
  'application/json': {
    schema: invitationAcceptedResponseSchema.meta({ id: 'InvitationAcceptedResponse' }),
  },
};
const unavailable = {
  503: { description: 'A dependency is temporarily unavailable', content: errorContent },
};

// Owner side ------------------------------------------------------------------------

export const listInvitationsRoute = createRoute({
  method: 'get',
  path: '/organization/invitations',
  operationId: 'listInvitations',
  summary: "List the organization's pending invitations",
  description:
    'Owners only. Open and expired invitations, newest first; accepted and revoked ones are left out.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  responses: {
    200: {
      description: 'Pending invitations',
      content: {
        'application/json': {
          schema: invitationListResponseSchema.meta({ id: 'InvitationListResponse' }),
        },
      },
    },
    ...ownerErrors,
  },
});

export const createInvitationRoute = createRoute({
  method: 'post',
  path: '/organization/invitations',
  operationId: 'createInvitation',
  summary: 'Invite a person into the organization by email',
  description:
    'Owners only. Inviting an address that already has a pending invitation renews it and sends a fresh link. The response never says whether the address has an account.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createInvitationRequestSchema.meta({ id: 'CreateInvitationRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The invitation, with its email sent', content: invitationContent },
    400: { description: 'Invalid request body', content: errorContent },
    409: {
      description:
        'Already a member, too many open invitations, or an email was sent in the last 10 minutes; see `reason`',
      content: errorContent,
    },
    ...ownerErrors,
  },
});

export const resendInvitationRoute = createRoute({
  method: 'post',
  path: '/organization/invitations/{invitationId}/resend',
  operationId: 'resendInvitation',
  summary: 'Renew a pending invitation and email a fresh link',
  description: 'Owners only. The earlier link stops working.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: invitationParams },
  responses: {
    200: { description: 'The renewed invitation', content: invitationContent },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No pending invitation with this id', content: errorContent },
    409: { description: 'An email was sent in the last 10 minutes', content: errorContent },
    ...ownerErrors,
  },
});

export const revokeInvitationRoute = createRoute({
  method: 'post',
  path: '/organization/invitations/{invitationId}/revoke',
  operationId: 'revokeInvitation',
  summary: 'Revoke a pending invitation',
  description: 'Owners only. The emailed link stops working.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: invitationParams },
  responses: {
    204: { description: 'Revoked' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No pending invitation with this id', content: errorContent },
    ...ownerErrors,
  },
});

// Invitee side ----------------------------------------------------------------------

export const lookupInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/lookup',
  operationId: 'lookupInvitation',
  summary: 'Describe the invitation behind an emailed token',
  description:
    'Public, and changes nothing, so a mail scanner opening the link cannot accept. A POST keeps the token out of URLs.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: invitationLookupRequestSchema.meta({ id: 'InvitationLookupRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The invitation and whether its address already has an account',
      content: {
        'application/json': {
          schema: invitationLookupResponseSchema.meta({ id: 'InvitationLookupResponse' }),
        },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    404: { description: 'No invitation has this token', content: errorContent },
    ...unavailable,
    ...publicErrors,
  },
});

export const acceptInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/accept',
  operationId: 'acceptInvitation',
  summary: 'Create an account from an invitation and join the organization',
  description:
    'Public. For an address without an account; the token proves control of the mailbox, so the account is created confirmed. Sign in with the chosen password afterwards.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: acceptInvitationRequestSchema.meta({ id: 'AcceptInvitationRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The account exists and is a member', content: acceptedContent },
    400: { description: 'Invalid request body or a rejected password', content: errorContent },
    404: { description: 'No invitation has this token', content: errorContent },
    409: {
      description: 'The invitation is not open, or the address has an account; see `reason`',
      content: errorContent,
    },
    ...unavailable,
    ...publicErrors,
  },
});

export const joinWithInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/join',
  operationId: 'joinWithInvitation',
  summary: 'Join the organization with the signed-in account',
  description:
    'For an account without a membership whose confirmed email is the invited address. `fullName` is required only when the account has no profile.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: joinWithInvitationRequestSchema.meta({ id: 'JoinWithInvitationRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The account is now a member', content: acceptedContent },
    400: { description: 'Invalid request body, or a name is needed', content: errorContent },
    403: { description: 'The invitation was sent to a different address', content: errorContent },
    404: { description: 'No invitation has this token', content: errorContent },
    409: {
      description:
        'The invitation is not open, or the account already belongs to an organization; see `reason`',
      content: errorContent,
    },
    ...authErrors,
  },
});
