import { offersNotInPlanReason } from '@ssm-usor/contracts';

import { apiErrorReason } from '@/api/http';
import { useMe } from '@/features/account/use-me';

// Until /me answers, everything shows as it would with offers: the API refuses what the plan
// does not include either way.
export function useOffersInPlan() {
  return useMe().data?.features?.offers !== false;
}

export const offersNotInPlanMessage =
  'Ofertele fac parte din planul Profesional. Pe planul Start le poți citi, descărca și transforma în clienți, dar nu le mai poți modifica.';

export function isOffersNotInPlanError(error: unknown) {
  return apiErrorReason(error) === offersNotInPlanReason;
}
