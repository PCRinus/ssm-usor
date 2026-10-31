import { createRouter } from '../../router';
import {
  getEmployeeParticipant,
  inviteClientAdministrator,
  inviteEmployeeParticipant,
  inviteEmployeeParticipants,
  listClientParticipants,
  listImportPortalInvitees,
  resendParticipantInvitation,
  revokeClientParticipant,
  revokeParticipantInvitation,
} from './handlers';
import {
  getEmployeeParticipantRoute,
  inviteClientAdministratorRoute,
  inviteEmployeeParticipantRoute,
  inviteEmployeeParticipantsRoute,
  listClientParticipantsRoute,
  listImportPortalInviteesRoute,
  resendParticipantInvitationRoute,
  revokeClientParticipantRoute,
  revokeParticipantInvitationRoute,
} from './routes';

export const participantsRouter = createRouter()
  .openapi(getEmployeeParticipantRoute, getEmployeeParticipant)
  .openapi(inviteEmployeeParticipantRoute, inviteEmployeeParticipant)
  .openapi(inviteEmployeeParticipantsRoute, inviteEmployeeParticipants)
  .openapi(inviteClientAdministratorRoute, inviteClientAdministrator)
  .openapi(listClientParticipantsRoute, listClientParticipants)
  .openapi(listImportPortalInviteesRoute, listImportPortalInvitees)
  .openapi(resendParticipantInvitationRoute, resendParticipantInvitation)
  .openapi(revokeParticipantInvitationRoute, revokeParticipantInvitation)
  .openapi(revokeClientParticipantRoute, revokeClientParticipant);
