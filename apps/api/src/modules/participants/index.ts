import { createRouter } from '../../router';
import {
  getEmployeeParticipant,
  inviteClientAdministrator,
  inviteEmployeeParticipant,
  listClientParticipants,
  resendParticipantInvitation,
  revokeClientParticipant,
  revokeParticipantInvitation,
} from './handlers';
import {
  getEmployeeParticipantRoute,
  inviteClientAdministratorRoute,
  inviteEmployeeParticipantRoute,
  listClientParticipantsRoute,
  resendParticipantInvitationRoute,
  revokeClientParticipantRoute,
  revokeParticipantInvitationRoute,
} from './routes';

export const participantsRouter = createRouter()
  .openapi(getEmployeeParticipantRoute, getEmployeeParticipant)
  .openapi(inviteEmployeeParticipantRoute, inviteEmployeeParticipant)
  .openapi(inviteClientAdministratorRoute, inviteClientAdministrator)
  .openapi(listClientParticipantsRoute, listClientParticipants)
  .openapi(resendParticipantInvitationRoute, resendParticipantInvitation)
  .openapi(revokeParticipantInvitationRoute, revokeParticipantInvitation)
  .openapi(revokeClientParticipantRoute, revokeClientParticipant);
