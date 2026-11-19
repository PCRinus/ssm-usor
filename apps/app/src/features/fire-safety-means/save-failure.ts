import { capitalized } from '@ssm-usor/contracts';

import { apiErrorBody, ApiHttpError } from '@/api/http';
import { commonFailure } from '@/lib/api-errors';

// `what` is the thing being saved, articulated: "echipamentul", "instalația".
export function saveFailure(
  cause: unknown,
  what: string
): { field?: 'workplaceId'; message: string } {
  const status = cause instanceof ApiHttpError ? cause.status : null;
  const body = apiErrorBody(cause);
  if (status === 400 && body?.issues?.some((issue) => issue.path === 'workplaceId')) {
    return {
      field: 'workplaceId',
      message: 'Locul de muncă a fost arhivat între timp. Alege altul.',
    };
  }
  if (status === 409) {
    return {
      message:
        body?.reason === 'client_is_lead'
          ? 'O ofertă nu are încă mijloace de apărare împotriva incendiilor.'
          : 'Clientul este arhivat; datele lui nu se mai schimbă.',
    };
  }
  if (status === 404) {
    return { message: `${capitalized(what)} nu mai există la acest client.` };
  }
  const common = commonFailure(cause);
  if (common) return { message: common };
  return { message: `Nu am putut salva ${what}. Verifică conexiunea și încearcă din nou.` };
}
