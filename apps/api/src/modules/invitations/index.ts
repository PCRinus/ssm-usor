import { createRouter } from '../../router';
import {
  acceptInvitation,
  createInvitation,
  joinWithInvitation,
  listInvitations,
  lookupInvitation,
  resendInvitation,
  revokeInvitation,
} from './handlers';
import {
  acceptInvitationRoute,
  createInvitationRoute,
  joinWithInvitationRoute,
  listInvitationsRoute,
  lookupInvitationRoute,
  resendInvitationRoute,
  revokeInvitationRoute,
} from './routes';

export const invitationsRouter = createRouter()
  .openapi(listInvitationsRoute, listInvitations)
  .openapi(createInvitationRoute, createInvitation)
  .openapi(resendInvitationRoute, resendInvitation)
  .openapi(revokeInvitationRoute, revokeInvitation)
  .openapi(lookupInvitationRoute, lookupInvitation)
  .openapi(acceptInvitationRoute, acceptInvitation)
  .openapi(joinWithInvitationRoute, joinWithInvitation);
