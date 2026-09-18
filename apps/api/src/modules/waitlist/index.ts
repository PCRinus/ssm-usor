import { createRouter } from '../../router';
import { confirmWaitlist, subscribeToWaitlist } from './handlers';
import { confirmWaitlistRoute, subscribeToWaitlistRoute } from './routes';

export const waitlistRouter = createRouter()
  .openapi(subscribeToWaitlistRoute, subscribeToWaitlist)
  .openapi(confirmWaitlistRoute, confirmWaitlist);
