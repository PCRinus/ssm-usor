import { createRouter } from '../../router';
import { getMe, getSupportIdentity, listMyInvitations, updateProfile } from './handlers';
import {
  listMyInvitationsRoute,
  meRoute,
  supportIdentityRoute,
  updateProfileRoute,
} from './routes';

export const meRouter = createRouter()
  .openapi(meRoute, getMe)
  .openapi(supportIdentityRoute, getSupportIdentity)
  .openapi(updateProfileRoute, updateProfile)
  .openapi(listMyInvitationsRoute, listMyInvitations);
