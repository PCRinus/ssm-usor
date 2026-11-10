import { clientContractFingerprints, clientContractHeader } from '@ssm-usor/contracts';
import { createMiddleware } from 'hono/factory';

import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Routes no generated client calls: a service's webhook, a link opened in a browser, the
// marketing site's form and the API's own docs. Every other route is checked (ADR 040).
export const contractExemptPaths = new Set([
  '/health',
  '/billing/stripe-webhook',
  '/hooks/supabase/send-email',
  '/hooks/supabase/send-sms',
  '/waitlist',
  '/waitlist/confirm',
  '/files/download',
  '/openapi.json',
  '/docs',
]);

// Until every open tab runs a build that sends the header, a request without one passes.
// Refusing it is ADR 040's step 6: set this to false.
const missingContractPasses = true;

function isCurrent(contract: string) {
  const [client, fingerprint, ...rest] = contract.split(':');
  if (rest.length || !client || !Object.hasOwn(clientContractFingerprints, client)) return false;
  return (
    clientContractFingerprints[client as keyof typeof clientContractFingerprints] === fingerprint
  );
}

export const checkClientContract = createMiddleware<ApiEnv>(async (c, next) => {
  if (c.req.method === 'OPTIONS' || contractExemptPaths.has(c.req.path)) return next();
  const contract = c.req.header(clientContractHeader);
  if (contract === undefined ? !missingContractPasses : !isCurrent(contract)) {
    throw new ApiError('client_outdated');
  }
  return next();
});
