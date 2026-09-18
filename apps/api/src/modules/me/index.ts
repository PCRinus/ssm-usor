import { createRouter } from '../../router';
import { getMe, updateProfile } from './handlers';
import { meRoute, updateProfileRoute } from './routes';

export const meRouter = createRouter()
  .openapi(meRoute, getMe)
  .openapi(updateProfileRoute, updateProfile);
