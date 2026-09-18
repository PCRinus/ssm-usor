import { createRouter } from '../../router';
import { getMe, listMyInvitations, updateProfile } from './handlers';
import { listMyInvitationsRoute, meRoute, updateProfileRoute } from './routes';

export const meRouter = createRouter()
  .openapi(meRoute, getMe)
  .openapi(updateProfileRoute, updateProfile)
  .openapi(listMyInvitationsRoute, listMyInvitations);
